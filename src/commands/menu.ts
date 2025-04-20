import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../utils/api';
import { DINING_HALLS } from '../config';
import { MenuPeriod, MenuResponse } from '../types/menu';

// Define a Period interface for use in our code
interface Period {
    id: string;
    name: string;
    timeRange: string;
}

export const data = new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Get the dining menu for ASU campus dining halls')
    .addStringOption(option =>
        option.setName('dining_hall')
            .setDescription('The dining hall to get the menu for')
            .setRequired(true)
            .addChoices(
                { name: 'Barrett', value: 'barrett' },
                { name: 'Manzi', value: 'manzi' },
                { name: 'Hassay', value: 'hassay' },
                { name: 'Tooker', value: 'tooker' },
                { name: 'MU', value: 'mu' }
            )
    );

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const diningHallOption = interaction.options.get('dining_hall')?.value as string;
        const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];

        // Get current date in MM/DD/YYYY format
        const today = new Date();
        const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        // Format dining hall name according to specifications
        let displayName: string;
        if (diningHallOption === 'mu') {
            displayName = 'Pitchforks';
        } else if (diningHallOption === 'tooker' || diningHallOption === 'barrett' || diningHallOption === 'manzi') {
            displayName = `${diningHall.name} House`;
        } else {
            displayName = diningHall.name;
        }
        displayName += ' Dining';

        try {
            // Fetch menu data for any period just to get the available periods
            const menuData: MenuResponse = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: formattedDate,
                periodId: "" // Empty to get all periods
            });

            if (!menuData.Menu || !menuData.Menu.MenuPeriods || menuData.Menu.MenuPeriods.length === 0) {
                await interaction.editReply(`No menu available for ${displayName} today.`);
                return;
            }

            // Get available periods
            const availablePeriods: Period[] = menuData.Menu.MenuPeriods
                .map((period: MenuPeriod) => {
                    // Get time range based on UTC times
                    const startTime = new Date(period.UtcMealPeriodStartTime);
                    const endTime = new Date(period.UtcMealPeriodEndTime);

                    // Convert UTC to MST (UTC-7)
                    startTime.setHours(startTime.getHours() - 7);
                    endTime.setHours(endTime.getHours() - 7);

                    // Format times to readable format
                    const formatTime = (date: Date) => {
                        const hours = date.getHours();
                        const minutes = date.getMinutes();
                        const ampm = hours >= 12 ? 'pm' : 'am';
                        const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
                        const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
                        return `${formattedHours}:${formattedMinutes}${ampm}`;
                    };

                    const timeRange = `${formatTime(startTime)} to ${formatTime(endTime)}`;

                    return {
                        id: period.PeriodId,
                        name: period.Name,
                        timeRange
                    };
                });

            if (availablePeriods.length === 0) {
                await interaction.editReply(`No meal periods available for ${displayName} today.`);
                return;
            }

            // Create initial embed
            const mainEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`${displayName} Menu`)
                .setDescription(`Please select a meal period for **${displayName}**.`);

            // Create buttons for period selection
            const periodButtons = createPeriodButtons(availablePeriods);

            await interaction.editReply({
                embeds: [mainEmbed],
                components: periodButtons
            });

            // Create collector for period selection (no timeout)
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button
            });

            // Store current state to track the active period
            let currentPeriodId: string | null = null;
            let currentPeriodMenuData: MenuResponse | null = null;

            collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                await buttonInteraction.deferUpdate();

                // Handle period selection
                if (buttonInteraction.customId.startsWith('period_')) {
                    const selectedPeriodId = buttonInteraction.customId.replace('period_', '');
                    const selectedPeriod = availablePeriods.find((p: Period) => p.id === selectedPeriodId);

                    if (!selectedPeriod) {
                        await buttonInteraction.followUp({
                            content: 'Selected period is no longer available.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Fetch menu data for the selected period
                    const periodMenuData = await fetchMenu({
                        mode: 'Daily',
                        locationId: diningHall.id,
                        date: formattedDate,
                        periodId: selectedPeriodId
                    });

                    // Store the current period data for later use
                    currentPeriodId = selectedPeriodId;
                    currentPeriodMenuData = periodMenuData;

                    if (!periodMenuData.Menu || !periodMenuData.Menu.MenuStations || !periodMenuData.Menu.MenuProducts) {
                        await buttonInteraction.followUp({
                            content: `No menu available for ${displayName} ${selectedPeriod.name} today.`,
                            ephemeral: true
                        });
                        return;
                    }

                    const stationMap = organizeMenuByStation(periodMenuData);
                    const stationNames = getStationNames(periodMenuData);

                    // Filter out empty stations
                    const nonEmptyStations = Array.from(stationNames.entries())
                        .filter(([stationId]) => (stationMap.get(stationId) || []).length > 0);

                    if (nonEmptyStations.length === 0) {
                        await buttonInteraction.followUp({
                            content: `No menu items available for ${displayName} ${selectedPeriod.name} today.`,
                            ephemeral: true
                        });
                        return;
                    }

                    // Create station selection embed
                    const stationSelectionEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        // .setTitle(`${displayName} - ${selectedPeriod.name}`)
                        .setTitle(`${displayName} `)
                        .setDescription(`Here are the menu options for **${selectedPeriod.name}** at **${displayName}** from **${selectedPeriod.timeRange}**\n\n` +
                            `Please select a station to view available items.`);

                    // Create buttons for station selection - using the selectedPeriodId
                    const stationButtons = createStationButtons(nonEmptyStations, selectedPeriodId);

                    await buttonInteraction.editReply({
                        embeds: [stationSelectionEmbed],
                        components: stationButtons
                    });
                }
                // Handle station selection
                else if (buttonInteraction.customId.startsWith('station_')) {
                    // Extract just the station ID from the button ID
                    // Format is station_periodId_stationId
                    const parts = buttonInteraction.customId.split('_');
                    if (parts.length < 3) {
                        await buttonInteraction.followUp({
                            content: 'Invalid station selection format.',
                            ephemeral: true
                        });
                        return;
                    }

                    const periodId = parts[1];
                    const stationId = parts[2];

                    const selectedPeriod = availablePeriods.find((p: Period) => p.id === periodId);
                    if (!selectedPeriod) {
                        await buttonInteraction.followUp({
                            content: 'Selected period is no longer available.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Check if we already have the current period menu data
                    let periodMenuData = currentPeriodMenuData;
                    if (!periodMenuData || currentPeriodId !== periodId) {
                        // If not, fetch it again
                        periodMenuData = await fetchMenu({
                            mode: 'Daily',
                            locationId: diningHall.id,
                            date: formattedDate,
                            periodId: periodId
                        });

                        // Update the current state
                        currentPeriodId = periodId;
                        currentPeriodMenuData = periodMenuData;
                    }

                    if (!periodMenuData.Menu || !periodMenuData.Menu.MenuStations || !periodMenuData.Menu.MenuProducts) {
                        await buttonInteraction.followUp({
                            content: `No menu available for ${displayName} ${selectedPeriod.name} today.`,
                            ephemeral: true
                        });
                        return;
                    }

                    const stationMap = organizeMenuByStation(periodMenuData);
                    const stationNames = getStationNames(periodMenuData);
                    const stationName = stationNames.get(stationId) || 'Unknown Station';

                    // Get menu items for this station
                    const stationItems = stationMap.get(stationId) || [];

                    // Update the main embed with the station items
                    let stationContent = '';
                    if (stationItems.length > 0) {
                        stationItems.forEach(item => {
                            stationContent += `• ${item.MarketingName}\n`;
                        });
                    } else {
                        stationContent = 'No items available at this station.';
                    }

                    const stationMenuEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        // .setTitle(`${displayName} - ${selectedPeriod.name} - ${stationName}`)
                        .setTitle(`${displayName}`)
                        .setDescription(`Here are the menu options for **${selectedPeriod.name}** at **${displayName}** from **${selectedPeriod.timeRange}**\n\n` +
                            `**${stationName}**\n${stationContent}`);

                    // Get all stations for this period
                    const nonEmptyStations = Array.from(stationNames.entries())
                        .filter(([sId]) => (stationMap.get(sId) || []).length > 0);

                    // Recreate the station buttons with the current station highlighted
                    const stationButtons = createStationButtons(nonEmptyStations, periodId, stationId);

                    await buttonInteraction.editReply({
                        embeds: [stationMenuEmbed],
                        components: stationButtons
                    });
                }
                // Handle back to period selection
                else if (buttonInteraction.customId === 'back_to_periods') {
                    await buttonInteraction.editReply({
                        embeds: [mainEmbed],
                        components: periodButtons
                    });
                }
            });

            // Keep the end handler in case the collector stops for other reasons
            collector.on('end', () => {
                // Only runs if the collector is stopped for some reason
                // (like bot restart or manual stop)
                interaction.editReply({
                    components: []
                }).catch(() => {
                    console.log('Could not remove components after collector end');
                });
            });

        } catch (error) {
            console.error('Error fetching menu data:', error);

            try {
                await interaction.editReply('Unable to fetch menu data at this time. Please try again later.');
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
                try {
                    await interaction.followUp({
                        content: 'There was an issue processing your request.',
                        ephemeral: true
                    });
                } catch {
                    console.error('All communication attempts failed');
                }
            }
        }

    } catch (error) {
        console.error('Unhandled error in menu command:', error);

        try {
            if (interaction.deferred) {
                await interaction.editReply('An unexpected error occurred. Please try again later.');
            } else {
                await interaction.reply({
                    content: 'An unexpected error occurred. Please try again later.',
                    ephemeral: true
                });
            }
        } catch {
            console.error('Could not send error response to user');
        }
    }
}

// Helper function to create period selection buttons
function createPeriodButtons(periods: Period[]) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Create rows with up to 5 buttons each
    for (let i = 0; i < periods.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>();

        for (let j = i; j < i + 5 && j < periods.length; j++) {
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
function createStationButtons(stations: [string, string][], periodId?: string, activeStationId?: string) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Create rows with up to 5 buttons each
    for (let i = 0; i < stations.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>();

        for (let j = i; j < i + 5 && j < stations.length; j++) {
            const [stationId, stationName] = stations[j];

            // Make sure we have a periodId, and include it in the customId
            const customId = periodId
                ? `station_${periodId}_${stationId}`
                : `station_unknown_${stationId}`;

            // Determine if this is the active station
            const isActive = stationId === activeStationId;

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(stationName)
                    // Always use Primary style (blue) for station buttons
                    .setStyle(ButtonStyle.Primary)
            );
        }

        rows.push(row);
    }

    // Add a back button to return to period selection if we're showing stations
    if (stations.length > 0) {
        // Create a new row for the back button
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