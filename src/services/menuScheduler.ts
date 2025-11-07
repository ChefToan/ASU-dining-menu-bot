import { menuService } from './menuService';

export class MenuScheduler {
    private preloadInterval?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;

    // Preload every 12 hours starting at 12am Arizona time
    private static readonly PRELOAD_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours

    // Cleanup every 2 hours for more aggressive expired entry cleanup
    private static readonly CLEANUP_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours

    /**
     * Start the menu refresh scheduler aligned to 12am Arizona time
     */
    async start(): Promise<void> {
        console.log('[MenuScheduler] Starting menu refresh scheduler aligned to 12am Arizona time...');

        // Calculate time until next 12am or 12pm Arizona time
        const timeUntilNextRefresh = this.calculateTimeUntilNextRefresh();

        console.log(`[MenuScheduler] Next refresh in ${Math.round(timeUntilNextRefresh / 1000 / 60)} minutes`);

        // Always run initial preload on startup to ensure cache is up to date
        console.log('[MenuScheduler] Running initial preload to ensure cache is up to date...');
        try {
            await this.runPreload();
            console.log('[MenuScheduler] ✅ Initial preload completed successfully');
        } catch (error) {
            console.error('[MenuScheduler] ⚠️ Initial preload failed:', error);
            console.log('[MenuScheduler] Bot will continue, but cache may be incomplete until next scheduled refresh');
        }

        // Schedule first aligned refresh
        const initialTimeout = setTimeout(() => {
            this.runPreload();

            // After first aligned refresh, schedule regular 12-hour intervals
            this.preloadInterval = setInterval(() => {
                this.runPreload();
            }, MenuScheduler.PRELOAD_INTERVAL);

            console.log('[MenuScheduler] Aligned to 12am/12pm Arizona time - refreshing every 12 hours');
        }, timeUntilNextRefresh);

        // Schedule cache cleanup every 2 hours
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, MenuScheduler.CLEANUP_INTERVAL);

        // Run initial cleanup
        await this.runCleanup().catch(error => {
            console.warn('[MenuScheduler] Initial cleanup failed:', error);
        });

        const nextRefreshTime = new Date(Date.now() + timeUntilNextRefresh);
        const arizonaTimeStr = nextRefreshTime.toLocaleString('en-US', {
            timeZone: 'America/Phoenix',
            hour12: true,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        console.log(`[MenuScheduler] Scheduler started - next refresh at ${arizonaTimeStr} Arizona time`);
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

            // Clean up menu cache entries
            const deletedCacheCount = await menuService.cleanupCache();

            if (deletedCacheCount > 0) {
                console.log(`[MenuScheduler] Cleaned up ${deletedCacheCount} expired cache entries`);
            } else {
                console.log('[MenuScheduler] No expired cache entries to clean up');
            }

        } catch (error) {
            console.error('[MenuScheduler] Error during scheduled cleanup:', error);
        }
    }

    /**
     * Calculate time until next 12am or 12pm Arizona time
     */
    private calculateTimeUntilNextRefresh(): number {
        const now = new Date();

        // Get current Arizona date/time components
        const arizonaDateStr = now.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"}); // YYYY-MM-DD
        const arizonaTimeStr = now.toLocaleTimeString("en-GB", {timeZone: "America/Phoenix", hour12: false}); // HH:MM:SS

        const [year, month, day] = arizonaDateStr.split('-').map(num => parseInt(num, 10));
        const [hour, minute, second] = arizonaTimeStr.split(':').map(num => parseInt(num, 10));

        // Determine next refresh time (12am or 12pm Arizona time)
        let nextRefreshYear = year;
        let nextRefreshMonth = month;
        let nextRefreshDay = day;
        let nextRefreshHour: number;

        if (hour < 12) {
            // Before noon, next refresh is at 12pm (noon) today
            nextRefreshHour = 12;
        } else {
            // After noon, next refresh is at 12am tomorrow
            nextRefreshHour = 0;
            // Move to next day
            const nextDay = new Date(year, month - 1, day + 1);
            nextRefreshYear = nextDay.getFullYear();
            nextRefreshMonth = nextDay.getMonth() + 1;
            nextRefreshDay = nextDay.getDate();
        }

        // Create next refresh time as Arizona timezone ISO string
        const nextRefreshIsoString = `${nextRefreshYear}-${nextRefreshMonth.toString().padStart(2, '0')}-${nextRefreshDay.toString().padStart(2, '0')}T${nextRefreshHour.toString().padStart(2, '0')}:00:00.000-07:00`;
        const nextRefreshTime = new Date(nextRefreshIsoString);

        const timeUntilRefresh = nextRefreshTime.getTime() - now.getTime();

        return Math.max(timeUntilRefresh, 60000); // At least 1 minute
    }

    /**
     * Get next preload time
     */
    getNextPreloadTime(): Date {
        const timeUntilNext = this.calculateTimeUntilNextRefresh();
        return new Date(Date.now() + timeUntilNext);
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
