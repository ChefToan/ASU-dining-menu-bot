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
    hasValidTime: boolean; // Flag to track if time data is valid
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
                { name: 'MU (Pitchforks)', value: 'mu' }
            )
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

        // Check for date option
        const dateOption = interaction.options.get('date')?.value as string;
        let formattedDate: string;
        let displayDate: Date;

        if (dateOption) {
            // Validate date format (MM/DD/YYYY)
            const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
            if (!dateRegex.test(dateOption)) {
                await interaction.editReply('Invalid date format. Please use MM/DD/YYYY format.');
                return;
            }
            formattedDate = dateOption;
            const [month, day, year] = dateOption.split('/').map(num => parseInt(num, 10));
            displayDate = new Date(year, month - 1, day);
        } else {
            // Get current date in MM/DD/YYYY format
            displayDate = new Date();
            formattedDate = `${displayDate.getMonth() + 1}/${displayDate.getDate()}/${displayDate.getFullYear()}`;
        }

        // Format dining hall name according to specifications
        let displayName: string;
        if (diningHallOption === 'mu') {
            displayName = 'Pitchforks';
        } else {
            displayName = diningHall.name;
        }
        displayName += ' Dining Hall';

        try {
            // Fetch menu data for any period just to get the available periods
            const menuData: MenuResponse = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: formattedDate,
                periodId: "" // Empty to get all periods
            });

            if (!menuData.Menu || !Array.isArray(menuData.Menu.MenuPeriods) || menuData.Menu.MenuPeriods.length === 0) {
                await interaction.editReply(`No menu available for ${displayName} on ${formattedDate}.`);
                return;
            }

            // Get available periods
            const availablePeriods: Period[] = menuData.Menu.MenuPeriods
                .map((period: MenuPeriod) => {
                    // Parse the UTC time strings to extract hours and minutes
                    const parseTime = (timeStr: string | undefined): { timeString: string, isValid: boolean } => {
                        // Handle undefined or empty time strings
                        if (!timeStr) {
                            return { timeString: "Time unavailable", isValid: false };
                        }

                        try {
                            // Format is like "2025-04-22 13:00:00Z"
                            const parts = timeStr.split(' ');
                            if (parts.length < 2) {
                                return { timeString: "Invalid format", isValid: false };
                            }

                            const timeParts = parts[1].split(':');
                            if (timeParts.length < 2) {
                                return { timeString: "Invalid time format", isValid: false };
                            }

                            let hours = parseInt(timeParts[0], 10);
                            const minutes = parseInt(timeParts[1], 10);

                            if (isNaN(hours) || isNaN(minutes)) {
                                return { timeString: "Invalid time", isValid: false };
                            }

                            // Convert from UTC to Mountain Time (UTC-6)
                            hours = (hours - 6 + 24) % 24;

                            // Format the time string with AM/PM
                            const period = hours >= 12 ? 'PM' : 'AM';
                            hours = hours % 12;
                            hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12-hour format

                            return {
                                timeString: `${hours}:${minutes.toString().padStart(2, '0')} ${period}`,
                                isValid: true
                            };
                        } catch (error) {
                            console.error("Error parsing time:", timeStr, error);
                            return { timeString: "Time processing error", isValid: false };
                        }
                    };

                    const startTimeResult = parseTime(period.UtcMealPeriodStartTime);
                    const endTimeResult = parseTime(period.UtcMealPeriodEndTime);
                    const timeRange = `${startTimeResult.timeString} to ${endTimeResult.timeString}`;

                    // Only consider time valid if both start and end times are valid
                    const hasValidTime = startTimeResult.isValid && endTimeResult.isValid;

                    return {
                        id: period.PeriodId,
                        name: period.Name,
                        timeRange,
                        hasValidTime
                    };
                });

            if (availablePeriods.length === 0) {
                await interaction.editReply(`No meal periods available for ${displayName} on ${formattedDate}.`);
                return;
            }

            // Format the date for display
            const month = (displayDate.getMonth() + 1).toString().padStart(2, '0');
            const day = displayDate.getDate().toString().padStart(2, '0');
            const year = displayDate.getFullYear();
            const weekday = displayDate.toLocaleDateString('en-US', { weekday: 'short' });
            const formattedDisplayDate = `${month}/${day}/${year} (${weekday})`;

            // Create initial embed
            const mainEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`${displayName} Menu - ${formattedDisplayDate}`)
                .setDescription(`Please select a meal period`);

            // Create buttons for period selection
            const periodButtons = createPeriodButtons(availablePeriods);

            await interaction.editReply({
                embeds: [mainEmbed],
                components: periodButtons
            });

            // Create collector for period selection without a timeout
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 10 * 60 * 1000 // 10 minutes
            });

            // Store current state to track the active period
            let currentPeriodId: string | null = null;
            let currentPeriodMenuData: MenuResponse | null = null;

            collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
                await buttonInteraction.deferUpdate();

                // Handle refresh button
                if (buttonInteraction.customId === 'refresh_menu') {
                    await buttonInteraction.editReply({
                        embeds: [mainEmbed],
                        components: periodButtons
                    });
                    return;
                }

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
                            content: `No menu available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
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
                            content: `No menu items available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
                            ephemeral: true
                        });
                        return;
                    }

                    // Create description based on whether time is valid
                    let description = `Here are the menu options for **${selectedPeriod.name}** at **${displayName}**`;
                    if (selectedPeriod.hasValidTime) {
                        description += ` from **${selectedPeriod.timeRange}**`;
                    }
                    description += `\n\nPlease select a station to view available items.`;

                    // Create station selection embed
                    const stationSelectionEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setTitle(`${displayName} - ${formattedDisplayDate}`)
                        .setDescription(description);

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
                            content: `No menu available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
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

                    // Create description based on whether time is valid
                    let description = `Here are the menu options for **${selectedPeriod.name}** at **${displayName}**`;
                    if (selectedPeriod.hasValidTime) {
                        description += ` from **${selectedPeriod.timeRange}**`;
                    }
                    description += `\n\n**${stationName}**\n${stationContent}`;

                    const stationMenuEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setTitle(`${displayName} - ${formattedDisplayDate}`)
                        .setDescription(description);

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

            // Modified collector end handler with improved refresh button functionality
            collector.on('end', () => {
                // Check if the interaction is still valid before attempting to modify components
                try {
                    if (interaction.replied || interaction.deferred) {
                        // Create a refresh button
                        const refreshRow = new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('refresh_menu')
                                    .setLabel('Refresh Menu')
                                    .setStyle(ButtonStyle.Secondary)
                            );

                        // Update the message with the refresh button
                        interaction.editReply({ components: [refreshRow] })
                            .then(refreshedMessage => {
                                // Create a new collector specifically for the refresh button
                                const refreshCollector = refreshedMessage.createMessageComponentCollector({
                                    componentType: ComponentType.Button,
                                    filter: i => i.customId === 'refresh_menu',
                                    time: 60 * 60 * 1000 // 1 hour timeout
                                });

                                refreshCollector.on('collect', async (buttonInteraction) => {
                                    // When refresh button is clicked, display a message and execute the command again
                                    // First, acknowledge the interaction
                                    await buttonInteraction.deferUpdate();

                                    // Display a loading message
                                    await buttonInteraction.editReply({
                                        content: "Refreshing menu...",
                                        components: [],
                                        embeds: []
                                    });

                                    try {
                                        // Re-create the initial embed
                                        const mainEmbed = new EmbedBuilder()
                                            .setColor(Colors.Blue)
                                            .setTitle(`${displayName} Menu - ${formattedDisplayDate}`)
                                            .setDescription(`Please select a meal period`);

                                        // Fetch menu data again to ensure it's fresh
                                        const refreshedMenuData: MenuResponse = await fetchMenu({
                                            mode: 'Daily',
                                            locationId: diningHall.id,
                                            date: formattedDate,
                                            periodId: "" // Empty to get all periods
                                        });

                                        if (!refreshedMenuData.Menu || !Array.isArray(refreshedMenuData.Menu.MenuPeriods) || refreshedMenuData.Menu.MenuPeriods.length === 0) {
                                            await buttonInteraction.editReply({
                                                content: `No menu available for ${displayName} on ${formattedDate}.`,
                                                components: [],
                                                embeds: []
                                            });
                                            return;
                                        }

                                        // Get updated available periods (same logic as before)
                                        const updatedPeriods = refreshedMenuData.Menu.MenuPeriods
                                            .map((period: MenuPeriod) => {
                                                // Reuse the same period parsing logic from before
                                                // Parse the UTC time strings to extract hours and minutes
                                                const parseTime = (timeStr: string | undefined): { timeString: string, isValid: boolean } => {
                                                    // Handle undefined or empty time strings
                                                    if (!timeStr) {
                                                        return { timeString: "Time unavailable", isValid: false };
                                                    }

                                                    try {
                                                        // Format is like "2025-04-22 13:00:00Z"
                                                        const parts = timeStr.split(' ');
                                                        if (parts.length < 2) {
                                                            return { timeString: "Invalid format", isValid: false };
                                                        }

                                                        const timeParts = parts[1].split(':');
                                                        if (timeParts.length < 2) {
                                                            return { timeString: "Invalid time format", isValid: false };
                                                        }

                                                        let hours = parseInt(timeParts[0], 10);
                                                        const minutes = parseInt(timeParts[1], 10);

                                                        if (isNaN(hours) || isNaN(minutes)) {
                                                            return { timeString: "Invalid time", isValid: false };
                                                        }

                                                        // Convert from UTC to Mountain Time (UTC-6)
                                                        hours = (hours - 6 + 24) % 24;

                                                        // Format the time string with AM/PM
                                                        const period = hours >= 12 ? 'PM' : 'AM';
                                                        hours = hours % 12;
                                                        hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12-hour format

                                                        return {
                                                            timeString: `${hours}:${minutes.toString().padStart(2, '0')} ${period}`,
                                                            isValid: true
                                                        };
                                                    } catch (error) {
                                                        console.error("Error parsing time:", timeStr, error);
                                                        return { timeString: "Time processing error", isValid: false };
                                                    }
                                                };

                                                const startTimeResult = parseTime(period.UtcMealPeriodStartTime);
                                                const endTimeResult = parseTime(period.UtcMealPeriodEndTime);
                                                const timeRange = `${startTimeResult.timeString} to ${endTimeResult.timeString}`;

                                                // Only consider time valid if both start and end times are valid
                                                const hasValidTime = startTimeResult.isValid && endTimeResult.isValid;

                                                return {
                                                    id: period.PeriodId,
                                                    name: period.Name,
                                                    timeRange,
                                                    hasValidTime
                                                };
                                            });

                                        // Create buttons for period selection
                                        const updatedPeriodButtons = createPeriodButtons(updatedPeriods);

                                        // Update the message with the refreshed periods
                                        await buttonInteraction.editReply({
                                            content: null,
                                            embeds: [mainEmbed],
                                            components: updatedPeriodButtons
                                        });

                                        // Create a new collector for the refreshed menu
                                        const newCollector = refreshedMessage.createMessageComponentCollector({
                                            componentType: ComponentType.Button,
                                            time: 10 * 60 * 1000 // 10 minutes
                                        });

                                        // Reset state variables
                                        let currentPeriodId: string | null = null;
                                        let currentPeriodMenuData: MenuResponse | null = null;

                                        // Handle button interactions the same way as the original collector
                                        newCollector.on('collect', async (newButtonInteraction) => {
                                            await newButtonInteraction.deferUpdate();

                                            // Handle refresh button
                                            if (newButtonInteraction.customId === 'refresh_menu') {
                                                await newButtonInteraction.editReply({
                                                    embeds: [mainEmbed],
                                                    components: updatedPeriodButtons
                                                });
                                                return;
                                            }

                                            // Handle period selection
                                            if (newButtonInteraction.customId.startsWith('period_')) {
                                                const selectedPeriodId = newButtonInteraction.customId.replace('period_', '');
                                                const selectedPeriod = updatedPeriods.find((p) => p.id === selectedPeriodId);

                                                if (!selectedPeriod) {
                                                    await newButtonInteraction.followUp({
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
                                                    await newButtonInteraction.followUp({
                                                        content: `No menu available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
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
                                                    await newButtonInteraction.followUp({
                                                        content: `No menu items available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
                                                        ephemeral: true
                                                    });
                                                    return;
                                                }

                                                // Create description based on whether time is valid
                                                let description = `Here are the menu options for **${selectedPeriod.name}** at **${displayName}**`;
                                                if (selectedPeriod.hasValidTime) {
                                                    description += ` from **${selectedPeriod.timeRange}**`;
                                                }
                                                description += `\n\nPlease select a station to view available items.`;

                                                // Create station selection embed
                                                const stationSelectionEmbed = new EmbedBuilder()
                                                    .setColor(Colors.Blue)
                                                    .setTitle(`${displayName} - ${formattedDisplayDate}`)
                                                    .setDescription(description);

                                                // Create buttons for station selection - using the selectedPeriodId
                                                const stationButtons = createStationButtons(nonEmptyStations, selectedPeriodId);

                                                await newButtonInteraction.editReply({
                                                    embeds: [stationSelectionEmbed],
                                                    components: stationButtons
                                                });
                                            }
                                            // Handle station selection
                                            else if (newButtonInteraction.customId.startsWith('station_')) {
                                                // Extract just the station ID from the button ID
                                                // Format is station_periodId_stationId
                                                const parts = newButtonInteraction.customId.split('_');
                                                if (parts.length < 3) {
                                                    await newButtonInteraction.followUp({
                                                        content: 'Invalid station selection format.',
                                                        ephemeral: true
                                                    });
                                                    return;
                                                }

                                                const periodId = parts[1];
                                                const stationId = parts[2];

                                                const selectedPeriod = updatedPeriods.find((p) => p.id === periodId);
                                                if (!selectedPeriod) {
                                                    await newButtonInteraction.followUp({
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
                                                    await newButtonInteraction.followUp({
                                                        content: `No menu available for ${displayName} ${selectedPeriod.name} on ${formattedDisplayDate}.`,
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

                                                // Create description based on whether time is valid
                                                let description = `Here are the menu options for **${selectedPeriod.name}** at **${displayName}**`;
                                                if (selectedPeriod.hasValidTime) {
                                                    description += ` from **${selectedPeriod.timeRange}**`;
                                                }
                                                description += `\n\n**${stationName}**\n${stationContent}`;

                                                const stationMenuEmbed = new EmbedBuilder()
                                                    .setColor(Colors.Blue)
                                                    .setTitle(`${displayName} - ${formattedDisplayDate}`)
                                                    .setDescription(description);

                                                // Get all stations for this period
                                                const nonEmptyStations = Array.from(stationNames.entries())
                                                    .filter(([sId]) => (stationMap.get(sId) || []).length > 0);

                                                // Recreate the station buttons with the current station highlighted
                                                const stationButtons = createStationButtons(nonEmptyStations, periodId, stationId);

                                                await newButtonInteraction.editReply({
                                                    embeds: [stationMenuEmbed],
                                                    components: stationButtons
                                                });
                                            }
                                            // Handle back to period selection
                                            else if (newButtonInteraction.customId === 'back_to_periods') {
                                                await newButtonInteraction.editReply({
                                                    embeds: [mainEmbed],
                                                    components: updatedPeriodButtons
                                                });
                                            }
                                        });

                                        // Add another refresh button when the new collector times out
                                        newCollector.on('end', () => {
                                            try {
                                                if (buttonInteraction.replied || buttonInteraction.deferred) {
                                                    buttonInteraction.editReply({ components: [refreshRow] })
                                                        .catch(error => console.error('Error adding refresh button after new collector end:', error));
                                                }
                                            } catch (error) {
                                                console.error('Error in new collector end handler:', error);
                                            }
                                        });

                                    } catch (error) {
                                        console.error('Error handling refresh button:', error);
                                        await buttonInteraction.editReply({
                                            content: "An error occurred when refreshing the menu. Please use the /menu command again.",
                                            components: [],
                                            embeds: []
                                        });
                                    }
                                });
                            })
                            .catch((error) => {
                                console.error('Could not add refresh button after collector end:', error);
                            });
                    }
                } catch (error) {
                    console.error('Error in collector end handler:', error);
                }
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