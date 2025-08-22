import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Colors
} from 'discord.js';
import { MenuPeriod } from '../commands/type/menu';
import { MENU_CONFIG } from './config';

// Helper function to get standard dining hours for meal periods
export function getStandardMealHours(periodName: string): string {
    const normalizedName = periodName.toLowerCase();
    
    if (normalizedName.includes('breakfast')) {
        return '(7:00 AM - 11:00 AM)';
    } else if (normalizedName.includes('brunch')) {
        return '(10:00 AM - 2:00 PM)';
    } else if (normalizedName.includes('lunch') && !normalizedName.includes('light')) {
        return '(11:00 AM - 2:00 PM)';
    } else if (normalizedName.includes('light lunch') || normalizedName.includes('light-lunch')) {
        return '(2:00 PM - 4:30 PM)';
    } else if (normalizedName.includes('dinner')) {
        return '(4:30 PM - 9:00 PM)';
    } else if (normalizedName.includes('late night')) {
        return '(Currently Closed)';
    } else {
        // For any unrecognized meal periods, show general availability
        return '(See dining hall for hours)';
    }
}

// Define a Period interface for use in our code
export interface Period {
    id: string;
    name: string;
}

// Helper function to parse periods from API response
export function parsePeriods(apiPeriods: MenuPeriod[]): Period[] {
    return apiPeriods.map((period: MenuPeriod) => {
        return {
            id: period.PeriodId,
            name: period.Name
        };
    });
}

// Helper function to create period selection buttons
export function createPeriodButtons(periods: Period[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Create rows with up to 5 buttons each
    for (let i = 0; i < periods.length; i += MENU_CONFIG.MAX_BUTTONS_PER_ROW) {
        const row = new ActionRowBuilder<ButtonBuilder>();

        for (let j = i; j < i + MENU_CONFIG.MAX_BUTTONS_PER_ROW && j < periods.length; j++) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`period_${periods[j].id}`)
                    .setLabel(periods[j].name)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        rows.push(row);
    }

    return rows;
}

// Helper function to create station selection buttons
export function createStationButtons(
    stations: [string, string][], 
    periodId?: string, 
    activeStationId?: string
): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Create rows with up to 5 buttons each
    for (let i = 0; i < stations.length; i += MENU_CONFIG.MAX_BUTTONS_PER_ROW) {
        const row = new ActionRowBuilder<ButtonBuilder>();

        for (let j = i; j < i + MENU_CONFIG.MAX_BUTTONS_PER_ROW && j < stations.length; j++) {
            const [stationId, stationName] = stations[j];

            // Make sure we have a periodId, and include it in the customId
            const customId = periodId
                ? `station_${periodId}_${stationId}`
                : `station_unknown_${stationId}`;

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(stationName)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        rows.push(row);
    }

    // Add a back button to return to period selection if we're showing stations
    if (stations.length > 0) {
        const backRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('back_to_periods')
                    .setLabel('Back to Periods')
                    .setStyle(ButtonStyle.Danger)
            );
        rows.push(backRow);
    }

    return rows;
}

// Helper function to create refresh button
export function createRefreshButton(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('refresh_menu')
                .setLabel('Refresh Menu')
                .setStyle(ButtonStyle.Secondary)
        );
}

// Helper function to get display name for dining hall
export function getDiningHallDisplayName(diningHallOption: string, diningHallName: string): string {
    let displayName: string;
    if (diningHallOption === 'mu') {
        displayName = MENU_CONFIG.DISPLAY_NAMES.mu;
    } else {
        displayName = diningHallName;
    }
    return displayName + ' Dining Hall';
}

// Helper function to format date for display
export function formatDateForDisplay(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${month}/${day}/${year} (${weekday})`;
}

// Helper function to get current date components in Arizona MST timezone
function getArizonaDateComponents(): { month: number, day: number, year: number } {
    // Get current date in Arizona timezone directly as components
    const now = new Date();
    const arizonaDateStr = now.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"}); // YYYY-MM-DD format
    const [year, month, day] = arizonaDateStr.split('-').map(num => parseInt(num, 10));
    
    return { month, day, year };
}

// Helper function to format date for API
export function formatDateForAPI(date?: string): { formattedDate: string, displayDate: Date } {
    let formattedDate: string;
    let displayDate: Date;

    if (date) {
        // Validate date format
        if (!MENU_CONFIG.DATE_REGEX.test(date)) {
            throw new Error(MENU_CONFIG.MESSAGES.INVALID_DATE_FORMAT);
        }
        formattedDate = date;
        const [month, day, year] = date.split('/').map(num => parseInt(num, 10));
        displayDate = new Date(year, month - 1, day);
    } else {
        // Get current date in Arizona MST timezone
        const { month, day, year } = getArizonaDateComponents();
        displayDate = new Date(year, month - 1, day);
        formattedDate = `${month}/${day}/${year}`;
    }

    return { formattedDate, displayDate };
}

// Helper function to format message with placeholders
export function formatMessage(template: string, replacements: Record<string, string>): string {
    let message = template;
    for (const [key, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return message;
}

// Helper function to create main embed
export function createMainEmbed(displayName: string, formattedDisplayDate: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${displayName} Menu - ${formattedDisplayDate}`)
        .setDescription('Please select a meal period');
}

// Helper function to create station selection embed
export function createStationSelectionEmbed(
    displayName: string, 
    formattedDisplayDate: string, 
    period: Period
): EmbedBuilder {
    const standardHours = getStandardMealHours(period.name);
    let description = `Here are the menu options for **${period.name}** ${standardHours}`;
    description += `\n\nPlease select a station to view available items.`;

    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${displayName} - ${formattedDisplayDate}`)
        .setDescription(description);
}

// Helper function to create station menu embed
export function createStationMenuEmbed(
    displayName: string,
    formattedDisplayDate: string,
    period: Period,
    stationName: string,
    stationContent: string
): EmbedBuilder {
    const standardHours = getStandardMealHours(period.name);
    let description = `Here are the menu options for **${period.name}** ${standardHours}`;
    description += `\n\n**${stationName}**\n${stationContent}`;

    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`${displayName} - ${formattedDisplayDate}`)
        .setDescription(description);
}