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