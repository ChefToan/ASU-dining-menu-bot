import {
    SlashCommandBuilder,
    CommandInteraction,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../../utils/api';
import { DINING_HALLS, MENU_CONFIG } from '../../utils/config';
import { MenuResponse, MenuItem } from '../type/menu';
import { menuCommandContextService } from '../../services/menuCommandContextService';
import { menuCacheService } from '../../services/menuCacheService';
import {
    Period,
    parsePeriods,
    createPeriodButtons,
    createStationButtons,
    createRefreshButton,
    getDiningHallDisplayName,
    formatDateForDisplay,
    formatDateForAPI,
    formatMessage,
    createMainEmbed,
    createStationSelectionEmbed,
    createStationMenuEmbed
} from '../../utils/menuHelpers';

export const data = new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Get the dining menu for ASU campus dining halls')
    .addStringOption(option =>
        option.setName('dining_hall')
            .setDescription('The dining hall to get the menu for')
            .setRequired(true)
            .addChoices(...MENU_CONFIG.DINING_HALL_CHOICES)
    )
    .addStringOption(option =>
        option.setName('date')
            .setDescription('Date in MM/DD/YYYY format (default: today)')
            .setRequired(false)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const diningHallOption = interaction.options.get('dining_hall')?.value as string;
        const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
        const dateOption = interaction.options.get('date')?.value as string;

        // Format dates and dining hall display name
        const { formattedDate, displayDate } = formatDateForAPI(dateOption);
        const displayName = getDiningHallDisplayName(diningHallOption, diningHall.name);
        const formattedDisplayDate = formatDateForDisplay(displayDate);

        // Fetch initial menu data to get available periods
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
            await interaction.editReply(errorMsg);
            return;
        }

        // Parse periods and create UI
        const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
        const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
        const periodButtons = createPeriodButtons(availablePeriods);

        await interaction.editReply({
            embeds: [mainEmbed],
            components: periodButtons
        });

        // Store context for persistent refresh functionality
        const message = await interaction.fetchReply();
        await menuCommandContextService.storeContext(
            message.id,
            diningHallOption,
            formattedDate,
            interaction.guildId || '',
            interaction.channelId || '',
            interaction.user.id
        );

        // Set up interaction handling
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

    } catch (error) {
        await handleError(interaction, error);
    }
}

// Set up interaction handlers for the menu command
async function setupInteractionHandlers(
    interaction: CommandInteraction | ButtonInteraction,
    diningHall: any,
    diningHallOption: string,
    formattedDate: string,
    displayName: string,
    formattedDisplayDate: string,
    availablePeriods: Period[],
    mainEmbed: any,
    periodButtons: any[]
) {
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: MENU_CONFIG.INTERACTION_TIMEOUT
    });

    let currentPeriodId: string | null = null;
    let currentPeriodMenuData: MenuResponse | null = null;

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        try {
            await buttonInteraction.deferUpdate();
        } catch (error: any) {
            // Handle expired interaction token (15 minute limit)
            if (error.code === 10062) {
                console.log('[MenuCommand] Interaction token expired, handling gracefully');
                // For expired tokens, we can't defer, but we can still process the interaction
                // The handler functions will need to use followUp or reply instead of editReply
            } else {
                console.error('[MenuCommand] Error deferring interaction:', error);
                return;
            }
        }

        if (buttonInteraction.customId === 'refresh_menu') {
            await handleContextualRefresh(buttonInteraction);
        } else if (buttonInteraction.customId.startsWith('period_')) {
            await handlePeriodSelection(
                buttonInteraction, 
                diningHall, 
                formattedDate, 
                displayName, 
                formattedDisplayDate, 
                availablePeriods,
                currentPeriodId,
                currentPeriodMenuData
            );
        } else if (buttonInteraction.customId.startsWith('station_')) {
            await handleStationSelection(
                buttonInteraction, 
                diningHall, 
                formattedDate, 
                displayName, 
                formattedDisplayDate, 
                availablePeriods,
                currentPeriodId,
                currentPeriodMenuData
            );
        } else if (buttonInteraction.customId === 'back_to_periods') {
            await buttonInteraction.editReply({
                embeds: [mainEmbed],
                components: periodButtons
            });
        }
    });

    collector.on('end', () => {
        handleCollectorEnd(interaction, diningHall, displayName, formattedDisplayDate);
    });
}

// Handle period selection
async function handlePeriodSelection(
    buttonInteraction: ButtonInteraction,
    diningHall: any,
    formattedDate: string,
    displayName: string,
    formattedDisplayDate: string,
    availablePeriods: Period[],
    currentPeriodId: string | null,
    currentPeriodMenuData: MenuResponse | null
) {
    const selectedPeriodId = buttonInteraction.customId.replace('period_', '');
    const selectedPeriod = availablePeriods.find(p => p.id === selectedPeriodId);

    if (!selectedPeriod) {
        await buttonInteraction.followUp({
            content: MENU_CONFIG.MESSAGES.PERIOD_UNAVAILABLE,
            ephemeral: true
        });
        return;
    }

    const periodMenuData = await fetchMenu({
        mode: 'Daily',
        locationId: diningHall.id,
        date: formattedDate,
        periodId: selectedPeriodId
    });

    if (!periodMenuData.Menu?.MenuStations || !periodMenuData.Menu?.MenuProducts) {
        const errorMsg = formatMessage(MENU_CONFIG.MESSAGES.NO_MENU_AVAILABLE, {
            diningHall: displayName,
            date: formattedDisplayDate
        });
        await buttonInteraction.followUp({
            content: errorMsg,
            ephemeral: true
        });
        return;
    }

    const stationMap = organizeMenuByStation(periodMenuData);
    const stationNames = getStationNames(periodMenuData);
    const nonEmptyStations = Array.from(stationNames.entries())
        .filter(([stationId]) => (stationMap.get(stationId) || []).length > 0);

    if (nonEmptyStations.length === 0) {
        const errorMsg = formatMessage(MENU_CONFIG.MESSAGES.NO_STATION_ITEMS, {
            diningHall: displayName,
            period: selectedPeriod.name,
            date: formattedDisplayDate
        });
        await buttonInteraction.followUp({
            content: errorMsg,
            ephemeral: true
        });
        return;
    }

    const stationSelectionEmbed = createStationSelectionEmbed(displayName, formattedDisplayDate, selectedPeriod);
    const stationButtons = createStationButtons(nonEmptyStations, selectedPeriodId);

    await buttonInteraction.editReply({
        embeds: [stationSelectionEmbed],
        components: stationButtons
    });
}

// Handle station selection
async function handleStationSelection(
    buttonInteraction: ButtonInteraction,
    diningHall: any,
    formattedDate: string,
    displayName: string,
    formattedDisplayDate: string,
    availablePeriods: Period[],
    currentPeriodId: string | null,
    currentPeriodMenuData: MenuResponse | null
) {
    const parts = buttonInteraction.customId.split('_');
    if (parts.length < 3) {
        await buttonInteraction.followUp({
            content: MENU_CONFIG.MESSAGES.INVALID_STATION_FORMAT,
            ephemeral: true
        });
        return;
    }

    const periodId = parts[1];
    const stationId = parts[2];
    const selectedPeriod = availablePeriods.find(p => p.id === periodId);

    if (!selectedPeriod) {
        await buttonInteraction.followUp({
            content: MENU_CONFIG.MESSAGES.PERIOD_UNAVAILABLE,
            ephemeral: true
        });
        return;
    }

    let periodMenuData = currentPeriodMenuData;
    if (!periodMenuData || currentPeriodId !== periodId) {
        periodMenuData = await fetchMenu({
            mode: 'Daily',
            locationId: diningHall.id,
            date: formattedDate,
            periodId: periodId
        });
    }

    if (!periodMenuData.Menu?.MenuStations || !periodMenuData.Menu?.MenuProducts) {
        const errorMsg = formatMessage(MENU_CONFIG.MESSAGES.NO_MENU_AVAILABLE, {
            diningHall: displayName,
            date: formattedDisplayDate
        });
        await buttonInteraction.followUp({
            content: errorMsg,
            ephemeral: true
        });
        return;
    }

    const stationMap = organizeMenuByStation(periodMenuData);
    const stationNames = getStationNames(periodMenuData);
    const stationName = stationNames.get(stationId) || 'Unknown Station';
    const stationItems = stationMap.get(stationId) || [];

    let stationContent = '';
    if (stationItems.length > 0) {
        stationItems.forEach((item: MenuItem) => {
            stationContent += `• ${item.MarketingName}\n`;
        });
    } else {
        stationContent = MENU_CONFIG.MESSAGES.STATION_UNAVAILABLE;
    }

    const stationMenuEmbed = createStationMenuEmbed(
        displayName, 
        formattedDisplayDate, 
        selectedPeriod, 
        stationName, 
        stationContent
    );

    const nonEmptyStations = Array.from(stationNames.entries())
        .filter(([sId]) => (stationMap.get(sId) || []).length > 0);
    const stationButtons = createStationButtons(nonEmptyStations, periodId, stationId);

    await buttonInteraction.editReply({
        embeds: [stationMenuEmbed],
        components: stationButtons
    });
}

// Handle context-aware refresh button
async function handleContextualRefresh(buttonInteraction: ButtonInteraction) {
    try {
        // Get the original command context from database
        const context = await menuCommandContextService.getContext(buttonInteraction.message.id);
        
        if (!context) {
            await buttonInteraction.followUp({
                content: 'This menu session has expired. Please use the /menu command again.',
                ephemeral: true
            });
            return;
        }

        const diningHall = DINING_HALLS[context.dining_hall as keyof typeof DINING_HALLS];
        if (!diningHall) {
            await buttonInteraction.followUp({
                content: 'Invalid dining hall configuration. Please use the /menu command again.',
                ephemeral: true
            });
            return;
        }

        const displayName = getDiningHallDisplayName(context.dining_hall, diningHall.name);
        const formattedDisplayDate = formatDateForDisplay(new Date(context.original_date));

        // Determine if we should use cache or API based on date
        const shouldUseCache = menuCommandContextService.shouldUseCache(context.original_date);
        let menuData: MenuResponse;

        console.log(`[ContextualRefresh] Refreshing menu for ${context.dining_hall} on ${context.original_date}, useCache: ${shouldUseCache}`);

        if (shouldUseCache) {
            // Try cache first for today's data
            const cacheKey = menuCacheService.generateCacheKey(diningHall.id, context.original_date);
            const cachedData = await menuCacheService.get(cacheKey);
            
            if (cachedData) {
                menuData = cachedData;
                console.log('[ContextualRefresh] Using cached data');
            } else {
                // Cache miss, fetch from API and cache it
                menuData = await fetchMenu({
                    mode: 'Daily',
                    locationId: diningHall.id,
                    date: context.original_date,
                    periodId: ""
                });
                await menuCacheService.set(cacheKey, menuData);
                console.log('[ContextualRefresh] Fetched fresh data and cached it');
            }
        } else {
            // Past dates: fetch directly from API (no caching)
            menuData = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: context.original_date,
                periodId: ""
            });
            console.log('[ContextualRefresh] Fetched fresh data from API (past date)');
        }

        if (!menuData.Menu?.MenuPeriods?.length) {
            const errorMsg = formatMessage(MENU_CONFIG.MESSAGES.NO_MENU_AVAILABLE, {
                diningHall: displayName,
                date: context.original_date
            });
            await buttonInteraction.editReply({
                content: errorMsg,
                embeds: [],
                components: []
            });
            return;
        }

        // Recreate the exact same UI with fresh data
        const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
        const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
        const periodButtons = createPeriodButtons(availablePeriods);

        try {
            // Try to edit the reply first
            await buttonInteraction.editReply({
                embeds: [mainEmbed],
                components: periodButtons
            });
        } catch (error: any) {
            // If editing fails due to expired token, create a new message
            if (error.code === 10062 || error.code === 50027) { // Unknown interaction or Invalid Webhook Token
                console.log('[ContextualRefresh] Token expired, creating new message');
                
                const channel = buttonInteraction.channel;
                if (channel && 'send' in channel) {
                    const newMessage = await channel.send({
                        embeds: [mainEmbed],
                        components: periodButtons
                    });
                
                    if (newMessage) {
                        // Update context to point to new message
                        await menuCommandContextService.updateMessageId(buttonInteraction.message.id, newMessage.id);
                        console.log(`[ContextualRefresh] Created new message ${newMessage.id} and updated context`);
                    }
                }
                return;
            } else {
                throw error; // Re-throw unexpected errors
            }
        }

        // Update context with new message ID (the edited reply maintains the same message ID)
        // So we don't need to update the context

        // Set up new interaction handling with regenerated buttons
        await setupInteractionHandlers(
            buttonInteraction,
            diningHall,
            context.dining_hall,
            context.original_date,
            displayName,
            formattedDisplayDate,
            availablePeriods,
            mainEmbed,
            periodButtons
        );

    } catch (error) {
        console.error('Error in contextual refresh:', error);
        await buttonInteraction.followUp({
            content: 'Failed to refresh menu. Please try the /menu command again.',
            ephemeral: true
        });
    }
}

// Handle refresh button (legacy - kept for compatibility)
async function handleRefresh(
    buttonInteraction: ButtonInteraction, 
    diningHall: any,
    displayName: string,
    formattedDisplayDate: string
) {
    try {
        // Re-fetch menu data with current date to get updated periods
        const { formattedDate } = formatDateForAPI();
        
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
            await buttonInteraction.editReply({
                content: errorMsg,
                embeds: [],
                components: []
            });
            return;
        }

        // Parse updated periods and recreate UI
        const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
        const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
        const periodButtons = createPeriodButtons(availablePeriods);

        await buttonInteraction.editReply({
            embeds: [mainEmbed],
            components: periodButtons
        });

        // Note: Legacy refresh doesn't have context, so we pass empty string for diningHallOption
        // This path should rarely be used now that we have contextual refresh
        await setupInteractionHandlers(
            buttonInteraction,
            diningHall,
            '', // Legacy refresh doesn't know the original dining hall option
            formattedDate,
            displayName,
            formattedDisplayDate,
            availablePeriods,
            mainEmbed,
            periodButtons
        );
    } catch (error) {
        console.error('Error refreshing menu:', error);
        await buttonInteraction.followUp({
            content: 'Failed to refresh menu. Please try again.',
            ephemeral: true
        });
    }
}

// Handle collector end
async function handleCollectorEnd(
    interaction: CommandInteraction | ButtonInteraction,
    diningHall: any,
    displayName: string,
    formattedDisplayDate: string
) {
    try {
        if (interaction.replied || interaction.deferred) {
            const refreshRow = createRefreshButton();
            await interaction.editReply({ components: [refreshRow] })
                .catch(error => console.error('Error adding refresh button:', error));
            
            // Set up a new collector specifically for the refresh button
            const message = await interaction.fetchReply();
            const refreshCollector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: MENU_CONFIG.REFRESH_TIMEOUT,
                filter: (buttonInteraction) => buttonInteraction.customId === 'refresh_menu'
            });

            refreshCollector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                try {
                    await buttonInteraction.deferUpdate();
                } catch (error: any) {
                    // Handle expired interaction token (15 minute limit)
                    if (error.code === 10062) {
                        console.log('[RefreshCollector] Interaction token expired, handling gracefully');
                        // Continue processing even if defer fails
                    } else {
                        console.error('[RefreshCollector] Error deferring interaction:', error);
                        return;
                    }
                }
                await handleContextualRefresh(buttonInteraction);
            });

            refreshCollector.on('end', () => {
                // Remove all components when refresh timeout expires
                // Only attempt if within Discord's 15-minute interaction token limit
                const timeSinceInteraction = Date.now() - (interaction.createdTimestamp || 0);
                const fifteenMinutes = 15 * 60 * 1000;
                
                if (timeSinceInteraction < fifteenMinutes) {
                    interaction.editReply({ components: [] })
                        .catch(error => {
                            // Silently handle token expiry errors as they're expected
                            if (error.code !== 50027) {
                                console.error('Error removing components:', error);
                            }
                        });
                }
            });
        }
    } catch (error) {
        console.error('Error in collector end handler:', error);
    }
}

// Error handling
async function handleError(interaction: CommandInteraction, error: any) {
    console.error('Error in menu command:', error);

    const errorMessage = error.message === MENU_CONFIG.MESSAGES.INVALID_DATE_FORMAT 
        ? error.message 
        : MENU_CONFIG.MESSAGES.UNEXPECTED_ERROR;

    try {
        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply({
                content: errorMessage,
                ephemeral: true
            });
        }
    } catch (replyError) {
        console.error('Error sending error response:', replyError);
        try {
            await interaction.followUp({
                content: MENU_CONFIG.MESSAGES.PROCESSING_ERROR,
                ephemeral: true
            });
        } catch {
            console.error(MENU_CONFIG.MESSAGES.COMMUNICATION_ERROR);
        }
    }
}