import axios from 'axios';
import { MenuApiParams, MenuResponse } from '../commands/type/menu';
import { menuCacheService } from './menuCacheService';
import { DINING_HALLS } from '../utils/config';

const ASU_MENU_API_URL = 'https://asu.campusdish.com/api/menu/GetMenus';

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

            // If not in cache, fetch from ASU API
            console.log(`[MenuService] Cache MISS for ${cacheKey}, fetching from ASU API...`);
            
            // Create clean query parameters
            const queryParams: Record<string, string> = {};
            Object.entries(params).forEach(([key, value]) => {
                if (value !== "") {
                    queryParams[key] = value;
                }
            });

            // Retry logic for API calls
            let response;
            let lastError;
            const maxRetries = 2;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    response = await axios.get(ASU_MENU_API_URL, { 
                        params: queryParams,
                        timeout: 15000 // 15 second timeout
                    });
                    break; // Success, exit retry loop
                } catch (error) {
                    lastError = error;
                    if (attempt < maxRetries) {
                        console.log(`[MenuService] API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in 2s...`);
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                    }
                }
            }
            
            if (!response) {
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
        
        const today = new Date();
        const dateString = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
        
        const preloadPromises: Promise<void>[] = [];

        // Preload for each dining hall
        for (const [hallKey, hallConfig] of Object.entries(DINING_HALLS)) {
            // Preload general menu (no specific period)
            preloadPromises.push(
                this.preloadMenuForHall(hallConfig.id, dateString, "")
                    .catch(error => {
                        console.error(`[MenuService] Failed to preload general menu for ${hallKey}:`, error);
                    })
            );

            // Preload common meal periods
            const commonPeriods = ["980", "981", "3080", "982"]; // Breakfast, Lunch, Light Lunch, Dinner
            for (const periodId of commonPeriods) {
                preloadPromises.push(
                    this.preloadMenuForHall(hallConfig.id, dateString, periodId)
                        .catch(error => {
                            console.error(`[MenuService] Failed to preload ${hallKey} period ${periodId}:`, error);
                        })
                );
            }
        }

        // Wait for all preloads to complete with some staggering to avoid overwhelming API
        const batchSize = 3; // Process 3 requests at a time
        for (let i = 0; i < preloadPromises.length; i += batchSize) {
            const batch = preloadPromises.slice(i, i + batchSize);
            await Promise.allSettled(batch);
            
            // Small delay between batches to be respectful to ASU's API
            if (i + batchSize < preloadPromises.length) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
            }
        }
        
        console.log('[MenuService] Menu preload completed');
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
}

export const menuService = MenuService;