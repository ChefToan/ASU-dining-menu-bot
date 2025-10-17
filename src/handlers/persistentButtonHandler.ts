import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../utils/api';
import { DINING_HALLS } from '../utils/config';
import {
    parsePeriods,
    createPeriodButtons,
    createStationButtons,
    createRefreshButton,
    getDiningHallDisplayName,
    formatDateForDisplay,
    formatMessage,
    createMainEmbed,
    createStationSelectionEmbed
} from '../utils/menuHelpers';
import { MENU_CONFIG } from '../utils/config';

/**
 * Simplified persistent button handler
 */
export class PersistentButtonHandler {

    /**
     * Handle refresh button clicks - creates a completely new menu embed
     */
    static async handleRefreshButton(interaction: ButtonInteraction): Promise<void> {
        try {
            // Try to defer the interaction, but handle expired tokens gracefully
            let canEditReply = true;
            try {
                await interaction.deferUpdate();
            } catch (error: any) {
                // Handle expired interaction token (15 minute limit)
                if (error.code === 10062) {
                    console.log('[PersistentRefresh] Interaction token expired, will create new message');
                    canEditReply = false;
                } else {
                    console.error('[PersistentRefresh] Error deferring interaction:', error);
                    throw error; // Re-throw unexpected errors
                }
            }

            // Parse dining hall and date from custom ID
            // Format: refresh_menu_{diningHall}_{date}
            const customId = interaction.customId;
            let diningHallOption: string;
            let formattedDate: string;

            if (customId.startsWith('refresh_menu_')) {
                const parts = customId.split('_');
                if (parts.length >= 4) {
                    diningHallOption = parts[2]; // dining hall
                    formattedDate = parts[3]; // date
                } else {
                    if (canEditReply) {
                        await interaction.followUp({
                            content: 'Invalid refresh button. Please use the /menu command again.',
                            ephemeral: true
                        });
                    }
                    return;
                }
            } else {
                // Fallback for old persistent_refresh_menu buttons
                if (canEditReply) {
                    await interaction.followUp({
                        content: 'This menu session has expired. Please use the /menu command again.',
                        ephemeral: true
                    });
                }
                return;
            }

            const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
            if (!diningHall) {
                if (canEditReply) {
                    await interaction.followUp({
                        content: 'Invalid dining hall configuration. Please use the /menu command again.',
                        ephemeral: true
                    });
                }
                return;
            }

            const displayName = getDiningHallDisplayName(diningHallOption, diningHall.name);
            const formattedDisplayDate = formatDateForDisplay(new Date(formattedDate));

            console.log(`[PersistentRefresh] Refreshing menu for ${diningHallOption} on ${formattedDate}`);

            // Fetch fresh menu data (always from API to ensure freshness)
            const menuData = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: formattedDate,
                periodId: ""
            });

            if (!menuData.Menu?.MenuPeriods?.length) {
                const errorMsg = formatMessage(MENU_CONFIG.MESSAGES.NO_MENU_AVAILABLE, {
                    diningHall: displayName,
                    date: formattedDate
                });

                if (canEditReply) {
                    await interaction.editReply({
                        content: errorMsg,
                        embeds: [],
                        components: []
                    });
                } else {
                    // Create new message when token is expired
                    const channel = interaction.channel;
                    if (channel && 'send' in channel) {
                        await channel.send({
                            content: errorMsg
                        });
                    }
                }
                return;
            }

            // Recreate the menu with period buttons on the SAME message
            // No collectors needed - buttons encode context in their IDs
            const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
            const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
            // Pass dining hall and date so buttons can be handled globally
            const periodButtons = createPeriodButtons(availablePeriods, diningHallOption, formattedDate);

            // Update the existing message with fresh period buttons
            if (canEditReply) {
                // First clear all components to force mobile clients to re-render
                await interaction.editReply({
                    components: []
                });

                // Small delay to ensure mobile clients process the clear
                await new Promise(resolve => setTimeout(resolve, 50));

                // Then set the new components
                await interaction.editReply({
                    embeds: [mainEmbed],
                    components: periodButtons
                });
                console.log('[PersistentRefresh] Successfully refreshed menu on same message');
            } else {
                // If token expired, create new message
                const channel = interaction.channel;
                if (channel && 'send' in channel) {
                    await channel.send({
                        embeds: [mainEmbed],
                        components: periodButtons
                    });
                    console.log('[PersistentRefresh] Created new message due to expired token');
                }
            }

        } catch (error) {
            console.error('Error in persistent refresh:', error);
            // Don't try to send error messages for expired tokens since they'll fail anyway
        }
    }

    /**
     * Handle persistent period button clicks (after menu refresh)
     * Format: period_{diningHall}_{date}_{periodId}
     */
    static async handlePeriodButton(interaction: ButtonInteraction): Promise<void> {
        try {
            await interaction.deferUpdate();

            // Parse button ID: period_{diningHall}_{date}_{periodId}
            const parts = interaction.customId.split('_');
            if (parts.length < 4) {
                console.error('[PersistentPeriod] Invalid button ID format');
                return;
            }

            const diningHallOption = parts[1];
            const formattedDate = parts[2];
            const periodId = parts[3];

            const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
            if (!diningHall) {
                await interaction.followUp({
                    content: 'Invalid dining hall configuration.',
                    ephemeral: true
                });
                return;
            }

            const displayName = getDiningHallDisplayName(diningHallOption, diningHall.name);
            const formattedDisplayDate = formatDateForDisplay(new Date(formattedDate));

            // Fetch menu for selected period
            const menuData = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: formattedDate,
                periodId: periodId
            });

            if (!menuData.Menu?.MenuStations || !menuData.Menu?.MenuProducts) {
                await interaction.followUp({
                    content: MENU_CONFIG.MESSAGES.NO_MENU_AVAILABLE,
                    ephemeral: true
                });
                return;
            }

            // Get available periods and find selected one
            const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods || []);
            const selectedPeriod = availablePeriods.find(p => p.id === periodId);

            if (!selectedPeriod) {
                await interaction.followUp({
                    content: MENU_CONFIG.MESSAGES.PERIOD_UNAVAILABLE,
                    ephemeral: true
                });
                return;
            }

            // Organize stations
            const stationMap = organizeMenuByStation(menuData);
            const stationNames = getStationNames(menuData);
            const nonEmptyStations = Array.from(stationNames.entries())
                .filter(([stationId]) => (stationMap.get(stationId) || []).length > 0);

            if (nonEmptyStations.length === 0) {
                await interaction.followUp({
                    content: formatMessage(MENU_CONFIG.MESSAGES.NO_STATION_ITEMS, {
                        diningHall: displayName,
                        period: selectedPeriod.name,
                        date: formattedDisplayDate
                    }),
                    ephemeral: true
                });
                return;
            }

            // Create UI
            const [month, day, year] = formattedDate.split('/').map(num => parseInt(num, 10));
            const dateObj = new Date(year, month - 1, day);
            const stationSelectionEmbed = createStationSelectionEmbed(displayName, formattedDisplayDate, selectedPeriod, dateObj);
            // Pass full context so station buttons are persistent
            const stationButtons = createStationButtons(nonEmptyStations, periodId, undefined, diningHallOption, formattedDate);

            // Add back and refresh buttons
            const backButton = new ButtonBuilder()
                .setCustomId(`back_to_periods_${diningHallOption}_${formattedDate}`)
                .setLabel('Back to Periods')
                .setStyle(ButtonStyle.Danger);

            const refreshRow = createRefreshButton(diningHallOption, formattedDate);
            const navigationRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton, refreshRow.components[0]);

            const allComponents = [...stationButtons, navigationRow];

            await interaction.editReply({
                embeds: [stationSelectionEmbed],
                components: allComponents
            });

            console.log('[PersistentPeriod] Successfully showed station selection');

        } catch (error) {
            console.error('Error in persistent period handler:', error);
        }
    }

}
