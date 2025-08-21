import axios from 'axios';
import { MenuApiParams, MenuResponse } from '../commands/type/menu';
import { menuCacheService } from './menuCacheService';
import { DINING_HALLS } from '../utils/config';

const ASU_MENU_API_URL = 'https://asu.campusdish.com/api/menu/GetMenus';

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
        try {
            // Generate cache key
            const cacheKey = menuCacheService.generateCacheKey(
                params.locationId,
                params.date,
                params.periodId
            );

            // Try to get from cache first
            const cachedData = await menuCacheService.get(cacheKey);
            if (cachedData) {
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

            // Retry logic for API calls with exponential backoff
            let response;
            let lastError;
            const maxRetries = 3; // Increased retries
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    response = await axios.get(ASU_MENU_API_URL, { 
                        params: queryParams,
                        timeout: 30000, // Increased to 30 second timeout
                        headers: {
                            'User-Agent': 'ASU-Dining-Bot/1.0',
                            'Accept': 'application/json',
                            'Accept-Encoding': 'gzip, deflate'
                        }
                    });
                    // Success - record it and break
                    circuitBreaker.recordSuccess();
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt < maxRetries) {
                        // Exponential backoff: 3s, 9s, 27s
                        const delay = 3000 * Math.pow(3, attempt);
                        console.log(`[MenuService] API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
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

            // Cache the successful response
            await menuCacheService.set(cacheKey, response.data);

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
        
        const today = new Date();
        const dateString = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
        
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

            // Small delay between general and period requests
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Preload common meal periods
            const commonPeriods = ["980", "981", "3080", "982"]; // Breakfast, Lunch, Light Lunch, Dinner
            for (const periodId of commonPeriods) {
                try {
                    await this.preloadMenuForHall(hallConfig.id, dateString, periodId);
                    successCount++;
                } catch (error) {
                    failureCount++;
                    const errorMsg = `${hallKey} (period ${periodId})`;
                    failures.push(errorMsg);
                    console.error(`[MenuService] Failed to preload ${hallKey} period ${periodId}:`, error);
                }

                // Delay between period requests to avoid overwhelming API
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Longer delay between dining halls
            if (Object.keys(DINING_HALLS).indexOf(hallKey) < Object.keys(DINING_HALLS).length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000));
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