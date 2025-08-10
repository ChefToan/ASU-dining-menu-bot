import { db } from './database';

export class CacheService {
    async get<T>(key: string): Promise<T | null> {
        try {
            const { data, error } = await db.getClient()
                .from('cache_entries')
                .select('data, expires_at')
                .eq('cache_key', key)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (error || !data) return null;

            return data.data as T;
        } catch (error) {
            console.error('Error getting cache entry:', error);
            return null;
        }
    }

    async set<T>(key: string, value: T, ttlMs: number = 30 * 60 * 1000): Promise<boolean> {
        try {
            const expiresAt = new Date(Date.now() + ttlMs).toISOString();

            // Upsert the cache entry
            const { error } = await db.getClient()
                .from('cache_entries')
                .upsert({
                    cache_key: key,
                    data: value,
                    expires_at: expiresAt
                }, {
                    onConflict: 'cache_key'
                });

            return !error;
        } catch (error) {
            console.error('Error setting cache entry:', error);
            return false;
        }
    }

    async delete(key: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .eq('cache_key', key);

            return !error;
        } catch (error) {
            console.error('Error deleting cache entry:', error);
            return false;
        }
    }

    async clear(): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('cache_entries')
                .delete()
                .neq('id', 0); // Delete all entries

            return !error;
        } catch (error) {
            console.error('Error clearing cache:', error);
            return false;
        }
    }

    async cleanExpired(): Promise<number> {
        try {
            return await db.cleanExpiredCache();
        } catch (error) {
            console.error('Error cleaning expired cache:', error);
            return 0;
        }
    }

    async getStats(): Promise<{
        totalEntries: number;
        expiredEntries: number;
        activeEntries: number;
    }> {
        try {
            const now = new Date().toISOString();

            const [totalResult, expiredResult] = await Promise.all([
                db.getClient()
                    .from('cache_entries')
                    .select('id', { count: 'exact', head: true }),
                db.getClient()
                    .from('cache_entries')
                    .select('id', { count: 'exact', head: true })
                    .lt('expires_at', now)
            ]);

            const totalEntries = totalResult.count || 0;
            const expiredEntries = expiredResult.count || 0;
            const activeEntries = totalEntries - expiredEntries;

            return {
                totalEntries,
                expiredEntries,
                activeEntries
            };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return {
                totalEntries: 0,
                expiredEntries: 0,
                activeEntries: 0
            };
        }
    }
}

export const cacheService = new CacheService();