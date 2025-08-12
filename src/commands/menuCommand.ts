import {
    SlashCommandBuilder,
    CommandInteraction,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../utils/api';
import { DINING_HALLS, MENU_CONFIG } from '../utils/config';
import { MenuResponse, MenuItem } from './type/menu';
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
} from '../utils/menuHelpers';

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

        // Set up interaction handling
        await setupInteractionHandlers(
            interaction,
            diningHall,
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
    interaction: CommandInteraction,
    diningHall: any,
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
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === 'refresh_menu') {
            await handleRefresh(buttonInteraction, mainEmbed, periodButtons);
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
        handleCollectorEnd(interaction);
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

// Handle refresh button
async function handleRefresh(buttonInteraction: ButtonInteraction, mainEmbed: any, periodButtons: any[]) {
    await buttonInteraction.editReply({
        embeds: [mainEmbed],
        components: periodButtons
    });
}

// Handle collector end
function handleCollectorEnd(interaction: CommandInteraction) {
    try {
        if (interaction.replied || interaction.deferred) {
            const refreshRow = createRefreshButton();
            interaction.editReply({ components: [refreshRow] })
                .catch(error => console.error('Error adding refresh button:', error));
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