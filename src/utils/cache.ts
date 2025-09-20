import { CACHE_CONFIG } from './config';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class Cache {
    private store = new Map<string, CacheEntry<any>>();
    private cleanupInterval?: NodeJS.Timeout;

    constructor() {
        if (CACHE_CONFIG.AUTO_CLEAN) {
            this.startAutoClean();
        }
    }

    generateKey(params: Record<string, any>): string {
        const sortedKeys = Object.keys(params).sort();
        const keyParts = sortedKeys.map(key => `${key}=${params[key]}`);
        return keyParts.join('&');
    }

    set<T>(key: string, data: T, ttl: number = CACHE_CONFIG.DEFAULT_TTL): void {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl
        };
        this.store.set(key, entry);
    }

    get<T>(key: string): T | null {
        const entry = this.store.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.store.delete(key);
            return null;
        }

        return entry.data;
    }

    delete(key: string): boolean {
        return this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    size(): number {
        return this.store.size;
    }

    private startAutoClean(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, CACHE_CONFIG.CLEAN_INTERVAL);
    }

    private cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        for (const [key, entry] of this.store.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.store.delete(key));

        if (keysToDelete.length > 0) {
            console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`);
        }
    }

    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clear();
    }
}

const cache = new Cache();
export default cache;
