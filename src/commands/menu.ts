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
import { searchDishImage } from '../utils/ImageSearch'; // New image search utility
import { DINING_HALLS } from '../config';
import {MenuItem, MenuPeriod, MenuResponse} from '../types/menu';

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
                { name: 'Manzy', value: 'manzy' },
                { name: 'Hassay', value: 'hassay' },
                { name: 'Tooker', value: 'tooker' },
                { name: 'Pitchforks', value: 'mu' }
            )
    )
    .addStringOption(option =>
        option.setName('date')
            .setDescription('Date in MM/DD/YYYY format (defaults to today)')
            .setRequired(false)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const diningHallOption = interaction.options.get('dining_hall')?.value as string;
        const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
        const dateOption = interaction.options.get('date')?.value as string;

        // Get current date and format it
        const today = new Date();
        let targetDate = new Date(today);
        let dateDisplayStr = "today";

        // Handle date option if provided
        if (dateOption) {
            // Validate custom date format MM/DD/YYYY
            const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/(20\d{2})$/;
            if (!dateRegex.test(dateOption)) {
                await interaction.editReply('Invalid date format. Please use MM/DD/YYYY format.');
                return;
            }

            const [month, day, year] = dateOption.split('/').map(part => parseInt(part, 10));
            const customDate = new Date(year, month - 1, day);

            // Validate if the date is within the next 7 days
            const maxDate = new Date(today);
            maxDate.setDate(today.getDate() + 7);

            if (customDate < today || customDate > maxDate) {
                await interaction.editReply('Date must be between today and 7 days from now.');
                return;
            }

            targetDate = customDate;
            dateDisplayStr = dateOption;
        }

        // Format the date in MM/DD/YYYY format
        const formattedDate = `${targetDate.getMonth() + 1}/${targetDate.getDate()}/${targetDate.getFullYear()}`;

        // Format dining hall name according to new specifications
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

            if (!menuData.Menu || !menuData.Menu.MenuPeriods || menuData.Menu.MenuPeriods.length === 0) {
                await interaction.editReply(`No menu available for ${displayName} ${dateDisplayStr}.`);
                return;
            }

            // Get available periods
            const availablePeriods: Period[] = menuData.Menu.MenuPeriods
                .map((period: MenuPeriod) => {
                    // Get time range based on UTC times
                    const startTime = new Date(period.UtcMealPeriodStartTime);
                    const endTime = new Date(period.UtcMealPeriodEndTime);

                    // Format times to readable format with MST timezone
                    const formatTime = (date: Date) => {
                        return date.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'America/Phoenix' // MST timezone
                        });
                    };

                    const timeRange = `${formatTime(startTime)} to ${formatTime(endTime)}`;

                    return {
                        id: period.PeriodId,
                        name: period.Name,
                        timeRange
                    };
                });

            if (availablePeriods.length === 0) {
                await interaction.editReply(`No meal periods available for ${displayName} ${dateDisplayStr}.`);
                return;
            }

            // Create initial embed
            const mainEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`${displayName} Menu`)
                .setDescription(`Please select a meal period for ${displayName} ${dateDisplayStr}.`);

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
                            content: `No menu available for ${displayName} ${selectedPeriod.name} ${dateDisplayStr}.`,
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
                            content: `No menu items available for ${displayName} ${selectedPeriod.name} ${dateDisplayStr}.`,
                            ephemeral: true
                        });
                        return;
                    }

                    // Create station selection embed
                    const stationSelectionEmbed = new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setTitle(`${displayName}`)
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
                            content: `No menu available for ${displayName} ${selectedPeriod.name} ${dateDisplayStr}.`,
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
                        // Add all menu items to content
                        stationItems.forEach(item => {
                            stationContent += `• ${item.MarketingName}\n`;
                        });

                        // Create embed without image
                        const stationMenuEmbed = new EmbedBuilder()
                            .setColor(Colors.Blue)
                            .setTitle(`${displayName}`)
                            .setDescription(`Here are the menu options for **${selectedPeriod.name}** at **${displayName}** from **${selectedPeriod.timeRange}**\n\n` +
                                `**${stationName}**\n${stationContent}`);

                        // Get all stations for this period
                        const nonEmptyStations = Array.from(stationNames.entries())
                            .filter(([sId]) => (stationMap.get(sId) || []).length > 0);

                        // Create the station buttons
                        const stationButtons = createStationButtons(nonEmptyStations, periodId, stationId);

                        // Only try to load an image for small menus (3 or fewer items)
                        if (stationItems.length <= 3) {
                            // First display without image
                            await buttonInteraction.editReply({
                                embeds: [stationMenuEmbed],
                                components: stationButtons
                            });

                            // Try to load an image in the background
                            try {
                                // Only fetch image for small menus
                                const mainDish = identifyMainDish(stationItems);
                                let imageUrl = '';

                                if (mainDish) {
                                    imageUrl = await searchDishImage(`${mainDish.MarketingName}`);
                                } else {
                                    // Use first item if no main dish identified
                                    imageUrl = await searchDishImage(`${stationItems[0].MarketingName}`);
                                }

                                // Only update with image if we got a real one (not placeholder)
                                if (imageUrl && !imageUrl.includes('placeholder.com')) {
                                    // Update embed with the image now that it's loaded
                                    stationMenuEmbed.setImage(imageUrl);

                                    await buttonInteraction.editReply({
                                        embeds: [stationMenuEmbed],
                                        components: stationButtons
                                    });
                                }
                            } catch (error) {
                                console.error('Error fetching image:', error);
                                // Continue without an image if there's an error
                            }
                        } else {
                            // For larger menus, just display without image
                            await buttonInteraction.editReply({
                                embeds: [stationMenuEmbed],
                                components: stationButtons
                            });
                        }
                    } else {
                        stationContent = 'No items available at this station.';

                        const stationMenuEmbed = new EmbedBuilder()
                            .setColor(Colors.Blue)
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
                    // Use Success style (green) for active station, Primary (blue) for others
                    .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Primary)
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

// Helper function to identify the main dish in a list of menu items
function identifyMainDish(items: MenuItem[]): MenuItem | null {
    if (!items || items.length === 0) {
        return null;
    }

    // If there's only one item, it's the main dish
    if (items.length === 1) {
        return items[0];
    }

    // Keywords that typically indicate main dishes
    const mainDishKeywords = [
        'entrée', 'entree', 'main', 'special', 'signature', 'chef',
        'featured', 'specialty', 'house', 'grill', 'roast', 'baked',
        'steak', 'chicken', 'fish', 'burger', 'sandwich', 'pizza',
        'pasta', 'bowl', 'plate', 'combo', 'meal', 'platter'
    ];

    // Side dish or accompaniment keywords
    const sideDishKeywords = [
        'side', 'sauce', 'dressing', 'topping', 'garnish', 'condiment',
        'dip', 'spread', 'chips', 'fries', 'salad', 'soup', 'roll',
        'bread', 'biscuit', 'muffin', 'dessert', 'cookie', 'brownie',
        'cake', 'pastry', 'fruit', 'vegetable'
    ];

    // Score each item based on keywords and name length
    // (main dishes often have longer, more descriptive names)
    const scoredItems = items.map(item => {
        let score = 0;
        const lowerName = item.MarketingName.toLowerCase();

        // Check for main dish keywords
        mainDishKeywords.forEach(keyword => {
            if (lowerName.includes(keyword.toLowerCase())) {
                score += 2;
            }
        });

        // Penalize for side dish keywords
        sideDishKeywords.forEach(keyword => {
            if (lowerName.includes(keyword.toLowerCase())) {
                score -= 1;
            }
        });

        // Slightly favor items with longer names (often main dishes)
        score += item.MarketingName.length / 50;

        return { item, score };
    });

    // Sort by score and get the highest
    scoredItems.sort((a, b) => b.score - a.score);

    // If the highest score is positive, return that item
    if (scoredItems[0].score > 0) {
        return scoredItems[0].item;
    }

    // If we couldn't confidently identify a main dish, return null
    return null;
}