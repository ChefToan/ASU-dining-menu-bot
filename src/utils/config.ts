import { DiningHallId, MealPeriodId } from '../commands/type/menu';

export const DINING_HALLS = {
    barrett: {
        name: "Barrett",
        id: DiningHallId.Barrett
    },
    manzy: {
        name: "Manzi",
        id: DiningHallId.Manzi
    },
    hassy: {
        name: "Hassay",
        id: DiningHallId.Hassay
    },
    tooker: {
        name: "Tooker",
        id: DiningHallId.Tooker
    },
    mu: {
        name: "MU",
        id: DiningHallId.MU
    },
    hida: {
        name: "HIDA",
        id: DiningHallId.HIDA
    }
};

// Keep this for reference, but we'll now dynamically fetch periods
export const MEAL_PERIODS = {
    breakfast: {
        name: "Breakfast",
        id: MealPeriodId.Breakfast
    },
    lunch: {
        name: "Lunch",
        id: MealPeriodId.Lunch
    },
    light_lunch: {
        name: "Light Lunch",
        id: MealPeriodId.LightLunch
    },
    dinner: {
        name: "Dinner",
        id: MealPeriodId.Dinner
    },
    brunch: {
        name: "Brunch",
        id: MealPeriodId.Brunch
    }
};

// Cache configuration
export const CACHE_CONFIG = {
    // Default TTL (Time-to-live) for cache entries in milliseconds
    DEFAULT_TTL: 4 * 60 * 60 * 1000, // 4 hours (reduced from 24)

    // Whether to auto-clean expired cache entries periodically
    AUTO_CLEAN: true,

    // Interval for auto-cleaning in milliseconds (every 30 minutes)
    CLEAN_INTERVAL: 30 * 60 * 1000
};

// Menu command configuration
export const MENU_CONFIG = {
    // Dining hall choices for the slash command
    DINING_HALL_CHOICES: [
        { name: 'Barrett', value: 'barrett' },
        { name: 'Manzy', value: 'manzy' },
        { name: 'Hassy', value: 'hassy' },
        { name: 'Tooker', value: 'tooker' },
        { name: 'MU (Pitchforks)', value: 'mu' },
        { name: 'HIDA', value: 'hida' }
    ],

    // Collector timeouts
    INTERACTION_TIMEOUT: 10 * 60 * 1000, // 10 minutes

    // Button limits
    MAX_BUTTONS_PER_ROW: 5,

    // Messages
    MESSAGES: {
        LOADING: 'Refreshing menu...',
        NO_MENU_AVAILABLE: 'No menu available for {diningHall} on {date}.',
        NO_PERIODS_AVAILABLE: 'No meal periods available for {diningHall} on {date}.',
        NO_STATION_ITEMS: 'No menu items available for {diningHall} {period} on {date}.',
        PERIOD_UNAVAILABLE: 'Selected period is no longer available.',
        STATION_UNAVAILABLE: 'No items available at this station.',
        INVALID_DATE_FORMAT: 'Invalid date format. Please use MM/DD/YYYY format.',
        INVALID_STATION_FORMAT: 'Invalid station selection format.',
        API_ERROR: 'Unable to fetch menu data at this time. Please try again later.',
        REFRESH_ERROR: 'An error occurred when refreshing the menu. Please use the /menu command again.',
        UNEXPECTED_ERROR: 'An unexpected error occurred. Please try again later.',
        PROCESSING_ERROR: 'There was an issue processing your request.',
        COMMUNICATION_ERROR: 'All communication attempts failed'
    },

    // Display names mapping
    DISPLAY_NAMES: {
        mu: 'Pitchforks'
    },

    // Date format configuration
    DATE_REGEX: /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/
};
