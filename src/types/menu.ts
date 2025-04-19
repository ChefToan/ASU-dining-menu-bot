export interface MenuApiParams {
    mode: string;
    locationId: string;
    date: string;
    periodId: string;
}

export interface MenuItem {
    ProductId: string;
    MarketingName: string;
    ShortDescription?: string;
}

export interface MenuStation {
    StationId: string;
    Name: string;
}

export interface MenuPeriod {
    PeriodId: string;
    Name: string;
    IsActive: boolean;
    UtcMealPeriodStartTime: string;
    UtcMealPeriodEndTime: string;
}

export interface MenuResponse {
    Menu?: {
        MenuStations?: MenuStation[];
        MenuProducts?: Array<{
            StationId: string;
            Product: MenuItem;
        }>;
        MenuPeriods?: MenuPeriod[];
    };
    Location?: {
        Name: string;
    };
    SelectedPeriodName?: string;
}

// Mapping of dining hall names to their IDs
export enum DiningHallId {
    Barrett = "4295",
    Manzi = "4294",
    Hassay = "3360",
    Tooker = "10585",
    MU = "4293"
}

// Mapping of meal period names to their IDs
export enum MealPeriodId {
    Breakfast = "980",
    Lunch = "981",
    LightLunch = "3080",
    Dinner = "982",
    Brunch = "983"
}