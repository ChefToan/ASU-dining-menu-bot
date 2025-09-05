import { ButtonInteraction } from 'discord.js';
import { fetchMenu } from '../utils/api';
import { DINING_HALLS } from '../utils/config';
import {
    parsePeriods,
    createPeriodButtons,
    createRefreshButton,
    getDiningHallDisplayName,
    formatDateForDisplay,
    formatMessage,
    createMainEmbed
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
            await interaction.deferUpdate();

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
                    await interaction.followUp({
                        content: 'Invalid refresh button. Please use the /menu command again.',
                        ephemeral: true
                    });
                    return;
                }
            } else {
                // Fallback for old persistent_refresh_menu buttons
                await interaction.followUp({
                    content: 'This menu session has expired. Please use the /menu command again.',
                    ephemeral: true
                });
                return;
            }

            const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
            if (!diningHall) {
                await interaction.followUp({
                    content: 'Invalid dining hall configuration. Please use the /menu command again.',
                    ephemeral: true
                });
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
                await interaction.editReply({
                    content: errorMsg,
                    embeds: [],
                    components: []
                });
                return;
            }

            // Recreate the exact same UI as the original menu command
            const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
            const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
            const periodButtons = createPeriodButtons(availablePeriods);
            
            // Add persistent refresh button to the period buttons
            const refreshButton = createRefreshButton(diningHallOption, formattedDate);
            const allComponents = [...periodButtons, refreshButton];

            await interaction.editReply({
                embeds: [mainEmbed],
                components: allComponents
            });

            console.log('[PersistentRefresh] Successfully refreshed menu');

        } catch (error) {
            console.error('Error in persistent refresh:', error);
            try {
                await interaction.followUp({
                    content: 'Failed to refresh menu. Please try the /menu command again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Could not send error message:', replyError);
            }
        }
    }

}