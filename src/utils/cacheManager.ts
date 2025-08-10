import { cacheService } from '../services/cacheService';
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

    const interval = setInterval(async () => {
        try {
            const removedCount = await cacheService.cleanExpired();
            const stats = await cacheService.getStats();
            
            console.log(`Cache cleaner ran: removed ${removedCount} expired entries. Active: ${stats.activeEntries}, Total: ${stats.totalEntries}`);
        } catch (error) {
            console.error('Error running cache cleaner:', error);
        }
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