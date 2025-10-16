import { ButtonInteraction } from 'discord.js';
import { fetchMenu } from '../utils/api';
import { DINING_HALLS } from '../utils/config';
import {
    parsePeriods,
    createPeriodButtons,
    getDiningHallDisplayName,
    formatDateForDisplay,
    formatMessage,
    createMainEmbed
} from '../utils/menuHelpers';
import { MENU_CONFIG } from '../utils/config';

// Import the setupInteractionHandlers function from menuCommand
import { setupInteractionHandlers } from '../commands/food/menuCommand';

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

            // Recreate the exact same UI as the original menu command (no refresh button initially)
            // This mimics how /menu initializes
            const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
            const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
            const periodButtons = createPeriodButtons(availablePeriods);

            if (canEditReply) {
                await interaction.editReply({
                    embeds: [mainEmbed],
                    components: periodButtons
                });

                // Add a small delay before setting up handlers to prevent mobile race conditions
                await new Promise(resolve => setTimeout(resolve, 100));

                // Set up interaction handling exactly like the initial /menu command
                await setupInteractionHandlers(
                    interaction,
                    diningHall,
                    diningHallOption,
                    formattedDate,
                    displayName,
                    formattedDisplayDate,
                    availablePeriods,
                    mainEmbed,
                    periodButtons
                );

                console.log('[PersistentRefresh] Successfully refreshed menu with full interaction handling');
            } else {
                // Create new message when token is expired
                const channel = interaction.channel;
                if (channel && 'send' in channel) {
                    const newMessage = await channel.send({
                        embeds: [mainEmbed],
                        components: periodButtons
                    });

                    // Create a fake interaction for the new message
                    const fakeInteraction = {
                        ...interaction,
                        fetchReply: () => Promise.resolve(newMessage),
                        replied: false,
                        deferred: false
                    } as ButtonInteraction;

                    await setupInteractionHandlers(
                        fakeInteraction,
                        diningHall,
                        diningHallOption,
                        formattedDate,
                        displayName,
                        formattedDisplayDate,
                        availablePeriods,
                        mainEmbed,
                        periodButtons
                    );

                    console.log('[PersistentRefresh] Successfully created new menu message');
                    return;
                }
            }

        } catch (error) {
            console.error('Error in persistent refresh:', error);
            // Don't try to send error messages for expired tokens since they'll fail anyway
        }
    }

}
