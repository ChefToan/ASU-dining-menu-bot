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
            const { data, error } = await db.getClient()
                .from('cache_entries')
                .select('data, expires_at')
                .eq('cache_key', cacheKey)
                .gt('expires_at', new Date().toISOString()) // Only get non-expired entries
                .single();

            if (error || !data) {
                return null;
            }

            console.log(`[MenuCache] Cache HIT for key: ${cacheKey}`);
            return data.data as MenuResponse;
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
            const { data: deletedEntries, error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .lt('expires_at', new Date().toISOString())
                .select('cache_key');

            if (error) {
                console.error('[MenuCache] Error during cleanup:', error);
                return 0;
            }

            const deletedCount = deletedEntries?.length || 0;
            if (deletedCount > 0) {
                console.log(`[MenuCache] Cleaned up ${deletedCount} expired cache entries`);
            }
            
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