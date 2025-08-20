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

// Time parsing utility function
export function parseTime(timeStr: string | undefined): { timeString: string, isValid: boolean } {
    // Handle undefined or empty time strings
    if (!timeStr) {
        return { timeString: "Time unavailable", isValid: false };
    }

    try {
        // Format is like "2025-04-22 13:00:00Z"
        const parts = timeStr.split(' ');
        if (parts.length < 2) {
            return { timeString: "Invalid format", isValid: false };
        }

        const timeParts = parts[1].split(':');
        if (timeParts.length < 2) {
            return { timeString: "Invalid time format", isValid: false };
        }

        let hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);

        if (isNaN(hours) || isNaN(minutes)) {
            return { timeString: "Invalid time", isValid: false };
        }

        // Convert from UTC to MST (UTC-7) - Arizona time
        hours = (hours - 7 + 24) % 24;

        // Format the time string with AM/PM
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12-hour format

        return {
            timeString: `${hours}:${minutes.toString().padStart(2, '0')} ${period}`,
            isValid: true
        };
    } catch (error) {
        console.error("Error parsing time:", timeStr, error);
        return { timeString: "Time processing error", isValid: false };
    }
}

// Format time range utility
export function formatTimeRange(startTime: string | undefined, endTime: string | undefined): { timeRange: string, hasValidTime: boolean } {
    const startTimeResult = parseTime(startTime);
    const endTimeResult = parseTime(endTime);
    const timeRange = `${startTimeResult.timeString} to ${endTimeResult.timeString}`;
    const hasValidTime = startTimeResult.isValid && endTimeResult.isValid;
    
    return { timeRange, hasValidTime };
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