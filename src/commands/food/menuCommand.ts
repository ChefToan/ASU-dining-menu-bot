import {
    SlashCommandBuilder,
    CommandInteraction,
    ComponentType,
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../../utils/api';
import { DINING_HALLS, MENU_CONFIG } from '../../utils/config';
import { MenuResponse, MenuItem } from '../type/menu';
import { menuCacheService } from '../../services/menuCacheService';
import {
    Period,
    parsePeriods,
    createPeriodButtons,
    createStationButtons,
    createStationDropdown,
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

        // Parse periods and create UI (no refresh button initially)
        const availablePeriods = parsePeriods(menuData.Menu.MenuPeriods);
        const mainEmbed = createMainEmbed(displayName, formattedDisplayDate);
        const periodButtons = createPeriodButtons(availablePeriods);

        await interaction.editReply({
            embeds: [mainEmbed],
            components: periodButtons
        });

        // Context is now embedded in the refresh button custom ID

        // Set up interaction handling for temporary buttons (period/station selection)
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
export async function setupInteractionHandlers(
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
        time: MENU_CONFIG.INTERACTION_TIMEOUT
    });

    let currentPeriodId: string | null = null;
    let currentPeriodMenuData: MenuResponse | null = null;

    collector.on('collect', async (componentInteraction) => {
        try {
            await componentInteraction.deferUpdate();
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

        // Handle button interactions
        if (componentInteraction.isButton()) {
            const buttonInteraction = componentInteraction;
            
            if (buttonInteraction.customId === 'persistent_refresh_menu') {
                // Skip - handled by global persistent button handler
                return;
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
            } else if (buttonInteraction.customId === 'back_to_periods') {
                await buttonInteraction.editReply({
                    embeds: [mainEmbed],
                    components: periodButtons
                });
            }
        }
        
        // Handle dropdown interactions
        else if (componentInteraction.isStringSelectMenu()) {
            const selectInteraction = componentInteraction;
            
            if (selectInteraction.customId.startsWith('station_select_')) {
                await handleStationDropdownSelection(
                    selectInteraction,
                    diningHall,
                    formattedDate,
                    displayName,
                    formattedDisplayDate,
                    availablePeriods,
                    currentPeriodId,
                    currentPeriodMenuData
                );
            }
        }
    });

    collector.on('end', () => {
        handleCollectorEnd(interaction, diningHall, diningHallOption, formattedDate, displayName, formattedDisplayDate);
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
    
    // Create station dropdown instead of buttons
    const stationDropdown = createStationDropdown(stationMap, stationNames, selectedPeriodId);
    
    // Create back button and refresh button row
    const navigationButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_periods')
                .setLabel('Back to Periods')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('persistent_refresh_menu')
                .setLabel('🔄 Refresh Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    await buttonInteraction.editReply({
        embeds: [stationSelectionEmbed],
        components: [stationDropdown, navigationButtons]
    });
}

// Handle station dropdown selection
async function handleStationDropdownSelection(
    selectInteraction: any,
    diningHall: any,
    formattedDate: string,
    displayName: string,
    formattedDisplayDate: string,
    availablePeriods: any[],
    currentPeriodId: string | null,
    currentPeriodMenuData: any | null
) {
    const selectedValue = selectInteraction.values[0];
    
    // Skip default option
    if (selectedValue === 'default') {
        return;
    }

    const parts = selectedValue.split('_');
    if (parts.length < 2) {
        await selectInteraction.followUp({
            content: MENU_CONFIG.MESSAGES.INVALID_STATION_FORMAT,
            ephemeral: true
        });
        return;
    }

    const periodId = parts[0];
    const stationId = parts[1];
    const selectedPeriod = availablePeriods.find(p => p.id === periodId);

    if (!selectedPeriod) {
        await selectInteraction.followUp({
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
        await selectInteraction.followUp({
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

    // Create station dropdown with current station selected
    const stationDropdown = createStationDropdown(stationMap, stationNames, periodId);
    
    // Create back button and refresh button row  
    const navigationButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_periods')
                .setLabel('Back to Periods')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('persistent_refresh_menu')
                .setLabel('🔄 Refresh Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    await selectInteraction.editReply({
        embeds: [stationMenuEmbed],
        components: [stationDropdown, navigationButtons]
    });
}

// Handle station selection (legacy - kept for compatibility)
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
    
    // Create station dropdown with current station selected
    const stationDropdown = createStationDropdown(stationMap, stationNames, periodId);
    
    // Create back button and refresh button row  
    const navigationButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_to_periods')
                .setLabel('Back to Periods')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('persistent_refresh_menu')
                .setLabel('🔄 Refresh Menu')
                .setStyle(ButtonStyle.Secondary)
        );

    await buttonInteraction.editReply({
        embeds: [stationMenuEmbed],
        components: [stationDropdown, navigationButtons]
    });
}



// Handle collector end
async function handleCollectorEnd(
    interaction: CommandInteraction | ButtonInteraction,
    diningHall: any,
    diningHallOption: string,
    formattedDate: string,
    displayName: string,
    formattedDisplayDate: string
) {
    try {
        if (interaction.replied || interaction.deferred) {
            const refreshRow = createRefreshButton(diningHallOption, formattedDate);
            await interaction.editReply({ components: [refreshRow] })
                .catch(error => console.error('Error adding refresh button:', error));
            
            // Set up a new collector specifically for the refresh button
            const message = await interaction.fetchReply();
            const refreshCollector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: MENU_CONFIG.REFRESH_TIMEOUT,
                filter: (buttonInteraction) => buttonInteraction.customId === 'persistent_refresh_menu' || 
                                             buttonInteraction.customId.startsWith('refresh_menu_')
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
                // Skip - handled by global persistent button handler
                return;
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