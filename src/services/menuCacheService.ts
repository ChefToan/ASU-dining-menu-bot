import { db } from './database';
import { MenuResponse } from '../commands/type/menu';

export interface CacheEntry {
    cache_key: string;
    data: any;
    expires_at: string;
    created_at?: string;
}

export class MenuCacheService {
    // Cache menu data for 6 hours
    private static readonly CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    /**
     * Generate a consistent cache key for menu requests
     */
    static generateCacheKey(locationId: string, date: string, periodId?: string): string {
        // Normalize the date format to ensure consistency
        const normalizedDate = this.normalizeDateFormat(date);

        const keyParts = [`loc_${locationId}`, `date_${normalizedDate}`];
        if (periodId && periodId.trim() !== "") {
            keyParts.push(`period_${periodId}`);
        }

        const cacheKey = `menu_${keyParts.join('_')}`;
        console.log(`[MenuCache] Generated cache key: ${cacheKey} (from: locationId=${locationId}, date=${date}, periodId=${periodId || 'none'})`);

        return cacheKey;
    }

    /**
     * Normalize date format to M/D/YYYY (removes leading zeros)
     */
    private static normalizeDateFormat(date: string): string {
        if (!date || !date.includes('/')) {
            return date;
        }

        const parts = date.split('/');
        if (parts.length !== 3) {
            return date;
        }

        // Parse and reformat to remove leading zeros: MM/DD/YYYY -> M/D/YYYY
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        return `${month}/${day}/${year}`;
    }

    /**
     * Get cached menu data from Supabase
     */
    static async get(cacheKey: string): Promise<MenuResponse | null> {
        try {
            console.log(`[MenuCache] Attempting to get cache for key: ${cacheKey}`);

            // Test database connection first
            const startTime = Date.now();

            // Get all cache entries for this key (expired and non-expired)
            const { data: allEntries, error } = await db.getClient()
                .from('cache_entries')
                .select('data, expires_at')
                .eq('cache_key', cacheKey);

            const queryTime = Date.now() - startTime;

            if (queryTime > 2000) { // Warn if query takes more than 2 seconds
                console.warn(`[MenuCache] Slow database query for ${cacheKey}: ${queryTime}ms`);
            }

            if (error) {
                console.error(`[MenuCache] Database error getting cache for ${cacheKey}:`, error);
                console.error(`[MenuCache] Error details:`, {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                return null;
            }

            if (!allEntries || allEntries.length === 0) {
                console.log(`[MenuCache] No cache entries found for key: ${cacheKey}`);
                return null;
            }

            const now = new Date();
            let validEntry = null;
            const expiredEntries = [];

            // Check each entry and separate valid from expired
            for (const entry of allEntries) {
                const expiresAt = new Date(entry.expires_at);
                if (expiresAt > now) {
                    validEntry = entry;
                } else {
                    expiredEntries.push(entry);
                }
            }

            // Clean up expired entries immediately
            if (expiredEntries.length > 0) {
                const cleanupResult = await db.getClient()
                    .from('cache_entries')
                    .delete()
                    .eq('cache_key', cacheKey)
                    .lt('expires_at', now.toISOString());

                if (cleanupResult.error) {
                    console.warn(`[MenuCache] Failed to cleanup expired entries for ${cacheKey}:`, cleanupResult.error);
                } else {
                    console.log(`[MenuCache] Cleaned up ${expiredEntries.length} expired entries for key: ${cacheKey}`);
                }
            }

            if (validEntry) {
                console.log(`[MenuCache] Cache HIT for key: ${cacheKey} (expires: ${validEntry.expires_at})`);
                return validEntry.data as MenuResponse;
            }

            console.log(`[MenuCache] Cache MISS for key: ${cacheKey} - no valid entries found`);
            return null;
        } catch (error) {
            console.error('[MenuCache] Error retrieving from cache:', error);
            return null;
        }
    }

    /**
     * Store menu data in Supabase cache
     */
    static async set(cacheKey: string, menuData: MenuResponse): Promise<boolean> {
        try {
            const expiresAt = new Date(Date.now() + this.CACHE_TTL).toISOString();
            console.log(`[MenuCache] Attempting to set cache for key: ${cacheKey}, expires: ${expiresAt}`);

            // Validate menu data before storing
            if (!menuData || (typeof menuData === 'object' && Object.keys(menuData).length === 0)) {
                console.warn(`[MenuCache] Empty or invalid menu data for key: ${cacheKey}, skipping cache set`);
                return false;
            }

            // Use upsert to insert or update in one operation
            const { error, data } = await db.getClient()
                .from('cache_entries')
                .upsert({
                    cache_key: cacheKey,
                    data: menuData,
                    expires_at: expiresAt
                }, {
                    onConflict: 'cache_key'
                })
                .select('id, cache_key');

            if (error) {
                console.error(`[MenuCache] Error storing in cache for key ${cacheKey}:`, error);
                // Also log the error details for debugging
                console.error(`[MenuCache] Error details:`, {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                return false;
            }

            if (!data || data.length === 0) {
                console.error(`[MenuCache] Cache SET failed - no data returned for key: ${cacheKey}`);
                return false;
            }

            console.log(`[MenuCache] Cache SET successful for key: ${cacheKey}, expires: ${expiresAt}, id: ${data[0]?.id}`);
            return true;
        } catch (error) {
            console.error(`[MenuCache] Exception while storing in cache for key ${cacheKey}:`, error);
            return false;
        }
    }

    /**
     * Delete specific cache entry
     */
    static async delete(cacheKey: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .eq('cache_key', cacheKey);

            return !error;
        } catch (error) {
            console.error('[MenuCache] Error deleting cache entry:', error);
            return false;
        }
    }

    /**
     * Clean up expired cache entries
     */
    static async cleanupExpired(): Promise<number> {
        try {
            // Get current time with some buffer to avoid timezone issues
            const now = new Date();
            const cutoffTime = new Date(now.getTime() - 60000).toISOString(); // 1 minute buffer

            // First, get count of entries to be deleted for logging
            const { count } = await db.getClient()
                .from('cache_entries')
                .select('*', { count: 'exact', head: true })
                .like('cache_key', 'menu_%')
                .lt('expires_at', cutoffTime);

            if (!count || count === 0) {
                console.log('[MenuCache] No expired cache entries to clean up');
                return 0;
            }

            // Delete expired entries
            const { data: deletedEntries, error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .like('cache_key', 'menu_%')
                .lt('expires_at', cutoffTime)
                .select('cache_key');

            if (error) {
                console.error('[MenuCache] Error during cleanup:', error);
                return 0;
            }

            const deletedCount = deletedEntries?.length || 0;
            console.log(`[MenuCache] Cleaned up ${deletedCount} expired cache entries (cutoff: ${cutoffTime})`);

            return deletedCount;
        } catch (error) {
            console.error('[MenuCache] Error during cleanup:', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    static async getStats(): Promise<{total: number, expired: number}> {
        try {
            const now = new Date().toISOString();

            const [totalResult, expiredResult] = await Promise.all([
                db.getClient()
                    .from('cache_entries')
                    .select('*', { count: 'exact', head: true })
                    .like('cache_key', 'menu_%'),

                db.getClient()
                    .from('cache_entries')
                    .select('*', { count: 'exact', head: true })
                    .like('cache_key', 'menu_%')
                    .lt('expires_at', now)
            ]);

            return {
                total: totalResult.count || 0,
                expired: expiredResult.count || 0
            };
        } catch (error) {
            console.error('[MenuCache] Error getting stats:', error);
            return { total: 0, expired: 0 };
        }
    }

    /**
     * Clear all menu cache entries
     */
    static async clearAll(): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .like('cache_key', 'menu_%');

            if (error) {
                console.error('[MenuCache] Error clearing all cache:', error);
                return false;
            }

            console.log('[MenuCache] All menu cache entries cleared');
            return true;
        } catch (error) {
            console.error('[MenuCache] Error clearing all cache:', error);
            return false;
        }
    }
}

export const menuCacheService = MenuCacheService;
