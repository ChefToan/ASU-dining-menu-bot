// In-memory cache util

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class Cache {
    private cache: Map<string, CacheEntry<any>>;
    private defaultTtl: number; // Time-to-live in milliseconds

    constructor(defaultTtl: number = 30 * 60 * 1000) { // Default 30 minutes
        this.cache = new Map();
        this.defaultTtl = defaultTtl;
    }

    /**
     * Generate a cache key from parameters
     */
    generateKey(params: Record<string, any>): string {
        return Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
    }

    /**
     * Get an item from the cache
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > this.defaultTtl) {
            // Cache entry has expired
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set an item in the cache
     */
    set<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    /**
     * Clear all items from the cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get the size of the cache
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Clean expired entries from the cache
     */
    cleanExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.defaultTtl) {
                this.cache.delete(key);
            }
        }
    }
}

// Create a singleton instance for global cache usage
const cacheInstance = new Cache();

export default cacheInstance;