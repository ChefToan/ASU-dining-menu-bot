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
        const keyParts = [`loc_${locationId}`, `date_${date}`];
        if (periodId) {
            keyParts.push(`period_${periodId}`);
        }
        return `menu_${keyParts.join('_')}`;
    }

    /**
     * Get cached menu data from Supabase
     */
    static async get(cacheKey: string): Promise<MenuResponse | null> {
        try {
            // Get all cache entries for this key (expired and non-expired)
            const { data: allEntries, error } = await db.getClient()
                .from('cache_entries')
                .select('data, expires_at')
                .eq('cache_key', cacheKey);

            if (error || !allEntries || allEntries.length === 0) {
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
                await db.getClient()
                    .from('cache_entries')
                    .delete()
                    .eq('cache_key', cacheKey)
                    .lt('expires_at', now.toISOString());
                console.log(`[MenuCache] Cleaned up ${expiredEntries.length} expired entries for key: ${cacheKey}`);
            }

            if (validEntry) {
                console.log(`[MenuCache] Cache HIT for key: ${cacheKey}`);
                return validEntry.data as MenuResponse;
            }

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
            
            // Try to insert first, if conflict then update
            const { error: insertError } = await db.getClient()
                .from('cache_entries')
                .insert({
                    cache_key: cacheKey,
                    data: menuData,
                    expires_at: expiresAt
                });

            let error = insertError;
            
            // If insert failed due to duplicate key, update existing record
            if (insertError && insertError.code === '23505') {
                const { error: updateError } = await db.getClient()
                    .from('cache_entries')
                    .update({
                        data: menuData,
                        expires_at: expiresAt
                    })
                    .eq('cache_key', cacheKey);
                error = updateError;
            }

            if (error) {
                console.error('[MenuCache] Error storing in cache:', error);
                return false;
            }

            console.log(`[MenuCache] Cache SET for key: ${cacheKey}, expires: ${expiresAt}`);
            return true;
        } catch (error) {
            console.error('[MenuCache] Error storing in cache:', error);
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