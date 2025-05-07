import axios from 'axios';
import { MenuApiParams, MenuResponse, MenuItem } from '../types/menu';
import cache from './cache';

const API_URL = 'https://asu.campusdish.com/api/menu/GetMenus';

export async function fetchMenu(params: MenuApiParams): Promise<MenuResponse> {
    try {
        // Create a new object for query parameters
        const queryParams: Record<string, string> = {};

        // Only add non-empty parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== "") {
                queryParams[key] = value;
            }
        });

        // Generate a cache key from the query parameters
        const cacheKey = cache.generateKey(queryParams);

        // Check if the data is in the cache
        const cachedData = cache.get<MenuResponse>(cacheKey);
        if (cachedData) {
            console.log(`Cache hit for ${cacheKey}`);
            return cachedData;
        }

        console.log(`Cache miss for ${cacheKey}, fetching from API...`);
        // If not in cache, fetch from API
        const response = await axios.get(API_URL, { params: queryParams });
        const menuData = response.data;

        // Store in cache
        cache.set(cacheKey, menuData);

        return menuData;
    } catch (error) {
        console.error('Error fetching menu:', error);
        throw error;
    }
}

// Organize menu items by station
export function organizeMenuByStation(menuData: MenuResponse): Map<string, MenuItem[]> {
    const stationMap = new Map<string, MenuItem[]>();

    // If MenuProducts and MenuStations exist
    if (menuData.Menu?.MenuProducts && menuData.Menu.MenuStations) {
        // First create empty arrays for each station
        menuData.Menu.MenuStations.forEach(station => {
            stationMap.set(station.StationId, []);
        });

        // Then assign products to their stations
        menuData.Menu.MenuProducts.forEach(productWrapper => {
            const stationId = productWrapper.StationId;
            const product = productWrapper.Product;

            if (stationMap.has(stationId)) {
                stationMap.get(stationId)!.push(product);
            }
        });
    }

    return stationMap;
}

// Get the names of stations
export function getStationNames(menuData: MenuResponse): Map<string, string> {
    const stationNames = new Map<string, string>();

    if (menuData.Menu?.MenuStations) {
        menuData.Menu.MenuStations.forEach(station => {
            stationNames.set(station.StationId, station.Name);
        });
    }

    return stationNames;
}

// Clear the cache (for testing or forced refreshes)
export function clearMenuCache(): void {
    cache.clear();
    console.log('Menu cache cleared');
}

// Get cache stats (for debugging)
export function getCacheStats(): { size: number } {
    return {
        size: cache.size()
    };
}