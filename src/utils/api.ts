import axios from 'axios';
import { MenuApiParams, MenuResponse, MenuItem } from '../types/menu';

const API_URL = 'https://asu.campusdish.com/api/menu/GetMenus';

export async function fetchMenu(params: MenuApiParams): Promise<MenuResponse> {
    try {
        const response = await axios.get(API_URL, { params });
        return response.data;
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