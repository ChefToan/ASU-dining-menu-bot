import { DiningHallId, MealPeriodId } from './types/menu';

export const DINING_HALLS = {
    barrett: {
        name: "Barrett",
        id: DiningHallId.Barrett
    },
    manzy: { // Changed from manzi to manzy
        name: "Manzy", // Changed from Manzi to Manzy
        id: DiningHallId.Manzy // Changed to match enum name
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
        name: "Pitchforks", // Changed from MU to Pitchforks for better clarity
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