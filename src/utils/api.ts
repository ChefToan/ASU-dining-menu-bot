import { MenuApiParams, MenuResponse, MenuItem } from '../commands/type/menu';
import { menuService } from '../services/menuService';

// Re-export for backward compatibility
export async function fetchMenu(params: MenuApiParams): Promise<MenuResponse> {
    return await menuService.fetchMenu(params);
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
export async function clearMenuCache(): Promise<void> {
    const { menuService } = await import('../services/menuService');
    await menuService.clearCache();
    console.log('Menu cache cleared');
}

// Get cache stats (for debugging)
export async function getCacheStats(): Promise<{ total: number, expired: number }> {
    const { menuService } = await import('../services/menuService');
    return await menuService.getCacheStats();
}
