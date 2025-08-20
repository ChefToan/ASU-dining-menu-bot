import { menuService } from './menuService';

export class MenuScheduler {
    private preloadInterval?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;
    
    // Preload every 6 hours
    private static readonly PRELOAD_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    
    // Cleanup every 24 hours
    private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * Start the menu refresh scheduler
     */
    start(): void {
        console.log('[MenuScheduler] Starting menu refresh scheduler...');
        
        // Initial preload on startup
        this.runPreload();
        
        // Schedule regular preloads every 6 hours
        this.preloadInterval = setInterval(() => {
            this.runPreload();
        }, MenuScheduler.PRELOAD_INTERVAL);

        // Schedule cache cleanup every 24 hours
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, MenuScheduler.CLEANUP_INTERVAL);

        console.log('[MenuScheduler] Scheduler started - preloading every 6 hours, cleanup every 24 hours');
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.preloadInterval) {
            clearInterval(this.preloadInterval);
            this.preloadInterval = undefined;
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        
        console.log('[MenuScheduler] Scheduler stopped');
    }

    /**
     * Manually trigger menu preload
     */
    async runPreload(): Promise<void> {
        try {
            console.log('[MenuScheduler] Running scheduled menu preload...');
            const startTime = Date.now();
            
            await menuService.preloadTodaysMenus();
            
            const duration = Date.now() - startTime;
            console.log(`[MenuScheduler] Menu preload completed in ${duration}ms`);
            
            // Log cache stats
            const stats = await menuService.getCacheStats();
            console.log(`[MenuScheduler] Cache stats: ${stats.total} total entries, ${stats.expired} expired`);
            
        } catch (error) {
            console.error('[MenuScheduler] Error during scheduled preload:', error);
        }
    }

    /**
     * Manually trigger cache cleanup
     */
    async runCleanup(): Promise<void> {
        try {
            console.log('[MenuScheduler] Running scheduled cache cleanup...');
            
            const deletedCount = await menuService.cleanupCache();
            
            if (deletedCount > 0) {
                console.log(`[MenuScheduler] Cleaned up ${deletedCount} expired cache entries`);
            } else {
                console.log('[MenuScheduler] No expired cache entries to clean up');
            }
            
        } catch (error) {
            console.error('[MenuScheduler] Error during scheduled cleanup:', error);
        }
    }

    /**
     * Get next preload time
     */
    getNextPreloadTime(): Date {
        return new Date(Date.now() + MenuScheduler.PRELOAD_INTERVAL);
    }

    /**
     * Get next cleanup time
     */
    getNextCleanupTime(): Date {
        return new Date(Date.now() + MenuScheduler.CLEANUP_INTERVAL);
    }

    /**
     * Check if scheduler is running
     */
    isRunning(): boolean {
        return this.preloadInterval !== undefined || this.cleanupInterval !== undefined;
    }
}

export const menuScheduler = new MenuScheduler();