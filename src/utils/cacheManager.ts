import cache from './cache';
import { CACHE_CONFIG } from '../config';

/**
 * Set up periodic cache cleaning
 */
export function setupCacheCleaner(): NodeJS.Timeout | null {
    if (!CACHE_CONFIG.AUTO_CLEAN) {
        console.log('Automatic cache cleaning is disabled');
        return null;
    }

    console.log(`Setting up cache cleaner with interval: ${CACHE_CONFIG.CLEAN_INTERVAL}ms (${(CACHE_CONFIG.CLEAN_INTERVAL / (1000 * 60 * 60)).toFixed(2)} hours)`);

    const interval = setInterval(() => {
        const sizeBefore = cache.size();
        cache.cleanExpired();
        const sizeAfter = cache.size();

        console.log(`Cache cleaner ran: removed ${sizeBefore - sizeAfter} expired entries. Current size: ${sizeAfter}`);
    }, CACHE_CONFIG.CLEAN_INTERVAL);

    return interval;
}

/**
 * Stop the cache cleaner
 */
export function stopCacheCleaner(interval: NodeJS.Timeout | null): void {
    if (interval) {
        clearInterval(interval);
        console.log('Cache cleaner stopped');
    }
}