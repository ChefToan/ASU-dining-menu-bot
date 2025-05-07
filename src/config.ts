import { DiningHallId, MealPeriodId } from './types/menu';

export const DINING_HALLS = {
    barrett: {
        name: "Barrett",
        id: DiningHallId.Barrett
    },
    manzi: {
        name: "Manzi",
        id: DiningHallId.Manzi
    },
    hassay: {
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
    DEFAULT_TTL: 24 * 60 * 60 * 1000, // 30 minutes

    // Whether to auto-clean expired cache entries periodically
    AUTO_CLEAN: true,

    // Interval for auto-cleaning in milliseconds (every hour)
    CLEAN_INTERVAL: 60 * 60 * 1000
};