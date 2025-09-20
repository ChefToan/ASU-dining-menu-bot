import axios from 'axios';
import { MenuApiParams, MenuResponse } from '../commands/type/menu';
import { menuCacheService } from './menuCacheService';
import { DINING_HALLS } from '../utils/config';
import { env } from '../utils/env';

const ASU_MENU_API_URL = env.getOptional('ASU_MENU_API_URL') || 'https://asu.campusdish.com/api/menu/GetMenus';

// Create optimized axios instance with connection pooling
const apiClient = axios.create({
    baseURL: ASU_MENU_API_URL,
    timeout: 10000,
    headers: {
        'User-Agent': 'ASU-Dining-Bot/1.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
    },
    // Enable HTTP keep-alive for connection reuse
    httpAgent: new (require('http').Agent)({ keepAlive: true, maxSockets: 5 }),
    httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 5 })
});

// Circuit breaker state
class CircuitBreaker {
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold = 5;
    private readonly recoveryTimeoutMs = 300000; // 5 minutes

    canMakeRequest(): boolean {
        if (this.failureCount < this.failureThreshold) {
            return true;
        }

        const now = Date.now();
        if (now - this.lastFailureTime >= this.recoveryTimeoutMs) {
            this.reset();
            return true;
        }

        return false;
    }

    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();
    }

    recordSuccess(): void {
        this.failureCount = 0;
    }

    reset(): void {
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }

    getState(): { failureCount: number; canMakeRequest: boolean } {
        return {
            failureCount: this.failureCount,
            canMakeRequest: this.canMakeRequest()
        };
    }
}

const circuitBreaker = new CircuitBreaker();

export class MenuService {
    /**
     * Fetch menu with Supabase caching
     */
    static async fetchMenu(params: MenuApiParams): Promise<MenuResponse> {
        const startTime = Date.now();

        try {
            // Generate cache key
            const cacheKey = menuCacheService.generateCacheKey(
                params.locationId,
                params.date,
                params.periodId
            );

            // Try to get from cache first
            console.log(`[MenuService] Attempting to fetch menu for: locationId=${params.locationId}, date=${params.date}, periodId=${params.periodId || 'none'}`);
            const cachedData = await menuCacheService.get(cacheKey);
            if (cachedData) {
                const cacheTime = Date.now() - startTime;
                console.log(`[MenuService] Cache HIT - returning cached data for ${cacheKey} (${cacheTime}ms)`);
                return cachedData;
            }

            // Check circuit breaker before making API call
            if (!circuitBreaker.canMakeRequest()) {
                const state = circuitBreaker.getState();
                console.warn(`[MenuService] Circuit breaker is OPEN (${state.failureCount} failures). Skipping API call for ${cacheKey}`);
                throw new Error('Service temporarily unavailable due to repeated failures');
            }

            // If not in cache, fetch from ASU API
            console.log(`[MenuService] Cache MISS for ${cacheKey}, fetching from ASU API...`);

            // Create clean query parameters
            const queryParams: Record<string, string> = {};
            Object.entries(params).forEach(([key, value]) => {
                if (value !== "") {
                    queryParams[key] = value;
                }
            });

            // Optimized retry logic with faster timeouts and backoff
            let response;
            let lastError;
            const maxRetries = 2; // Reduced retries for speed

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const apiStartTime = Date.now();
                    response = await apiClient.get('', {
                        params: queryParams
                    });
                    const apiTime = Date.now() - apiStartTime;
                    console.log(`[MenuService] API call successful for ${cacheKey} (${apiTime}ms, attempt ${attempt + 1})`);

                    // Success - record it and break
                    circuitBreaker.recordSuccess();
                    break;
                } catch (error) {
                    lastError = error;
                    const apiTime = Date.now() - startTime;
                    if (attempt < maxRetries) {
                        // Faster backoff: 1s, 2s
                        const delay = 1000 * (attempt + 1);
                        console.log(`[MenuService] API call failed for ${cacheKey} (${apiTime}ms, attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error(`[MenuService] All API attempts failed for ${cacheKey}:`, error);
                    }
                }
            }

            if (!response) {
                // Record failure in circuit breaker
                circuitBreaker.recordFailure();
                throw lastError || new Error('All retry attempts failed');
            }

            // Validate response
            if (!response.data) {
                throw new Error('Empty response from ASU API');
            }

            // Cache the successful response and verify it was stored
            const cacheStored = await menuCacheService.set(cacheKey, response.data);
            if (!cacheStored) {
                console.warn(`[MenuService] Failed to cache data for ${cacheKey} - cache may be unavailable`);
            } else {
                console.log(`[MenuService] Successfully cached data for ${cacheKey}`);
            }

            const totalTime = Date.now() - startTime;
            console.log(`[MenuService] Completed fetch for ${cacheKey} in ${totalTime}ms`);
            return response.data;
        } catch (error) {
            console.error('[MenuService] Error fetching menu:', error);
            throw error;
        }
    }

    /**
     * Preload/refresh menu data for all dining halls for today
     * This should be called every 6 hours via cron job
     */
    static async preloadTodaysMenus(): Promise<void> {
        console.log('[MenuService] Starting menu preload for all dining halls...');
        const startTime = Date.now();

        // Check circuit breaker before starting
        const cbState = circuitBreaker.getState();
        if (!cbState.canMakeRequest) {
            console.warn(`[MenuService] Circuit breaker is OPEN. Preload aborted. Failure count: ${cbState.failureCount}`);
            return;
        }

        // Get current date in Arizona timezone
        const today = new Date();
        const arizonaDateStr = today.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"}); // YYYY-MM-DD format
        const [year, month, day] = arizonaDateStr.split('-').map(num => parseInt(num, 10));
        const dateString = `${month}/${day}/${year}`;

        console.log(`[MenuService] Using Arizona date for preload: ${dateString} (Arizona time: ${today.toLocaleString('en-US', {timeZone: 'America/Phoenix'})})`);

        let successCount = 0;
        let failureCount = 0;
        const failures: string[] = [];

        // Preload for each dining hall
        for (const [hallKey, hallConfig] of Object.entries(DINING_HALLS)) {
            // Check circuit breaker between halls
            if (!circuitBreaker.canMakeRequest()) {
                console.warn(`[MenuService] Circuit breaker opened during preload. Stopping early.`);
                break;
            }

            // Preload general menu (no specific period)
            try {
                await this.preloadMenuForHall(hallConfig.id, dateString, "");
                successCount++;
            } catch (error) {
                failureCount++;
                const errorMsg = `${hallKey} (general)`;
                failures.push(errorMsg);
                console.error(`[MenuService] Failed to preload general menu for ${hallKey}:`, error);
            }

            // Reduced delay between general and period requests
            await new Promise(resolve => setTimeout(resolve, 300));

            // Preload common meal periods with parallel processing
            const commonPeriods = ["980", "981", "3080", "982"]; // Breakfast, Lunch, Light Lunch, Dinner

            // Process periods in parallel for faster loading
            const periodPromises = commonPeriods.map(async (periodId) => {
                try {
                    await this.preloadMenuForHall(hallConfig.id, dateString, periodId);
                    return { success: true, hallKey, periodId };
                } catch (error) {
                    console.error(`[MenuService] Failed to preload ${hallKey} period ${periodId}:`, error);
                    return { success: false, hallKey, periodId, error };
                }
            });

            // Wait for all periods to complete
            const periodResults = await Promise.allSettled(periodPromises);

            // Count results
            periodResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        successCount++;
                    } else {
                        failureCount++;
                        const errorMsg = `${hallKey} (period ${commonPeriods[index]})`;
                        failures.push(errorMsg);
                    }
                } else {
                    failureCount++;
                    const errorMsg = `${hallKey} (period ${commonPeriods[index]})`;
                    failures.push(errorMsg);
                }
            });

            // Reduced delay between dining halls
            if (Object.keys(DINING_HALLS).indexOf(hallKey) < Object.keys(DINING_HALLS).length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);

        console.log(`[MenuService] Menu preload completed in ${duration}s`);
        console.log(`[MenuService] Results: ${successCount} succeeded, ${failureCount} failed`);

        if (failures.length > 0) {
            console.log(`[MenuService] Failed preloads: ${failures.join(', ')}`);
        }

        const finalCbState = circuitBreaker.getState();
        console.log(`[MenuService] Circuit breaker state: ${finalCbState.failureCount} failures, can make requests: ${finalCbState.canMakeRequest}`);
    }

    /**
     * Preload menu for a specific hall and period
     */
    private static async preloadMenuForHall(locationId: string, date: string, periodId: string): Promise<void> {
        try {
            await this.fetchMenu({
                mode: 'Daily',
                locationId,
                date,
                periodId
            });
        } catch (error) {
            // Log but don't throw - we want other preloads to continue
            console.warn(`[MenuService] Preload failed for location ${locationId}, period ${periodId}:`, error);
        }
    }

    /**
     * Get menu cache statistics
     */
    static async getCacheStats(): Promise<{total: number, expired: number}> {
        return await menuCacheService.getStats();
    }

    /**
     * Clean up expired cache entries
     */
    static async cleanupCache(): Promise<number> {
        return await menuCacheService.cleanupExpired();
    }

    /**
     * Clear all menu cache (useful for debugging)
     */
    static async clearCache(): Promise<boolean> {
        return await menuCacheService.clearAll();
    }

    /**
     * Get circuit breaker status
     */
    static getCircuitBreakerStatus(): { failureCount: number; canMakeRequest: boolean } {
        return circuitBreaker.getState();
    }

    /**
     * Reset circuit breaker (for manual recovery)
     */
    static resetCircuitBreaker(): void {
        circuitBreaker.reset();
        console.log('[MenuService] Circuit breaker has been manually reset');
    }
}

export const menuService = MenuService;
