// src/commands/menu.ts
import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType
} from 'discord.js';
import { fetchMenu, organizeMenuByStation, getStationNames } from '../utils/api';
import { DINING_HALLS, MEAL_PERIODS } from '../config';

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
    )
    .addStringOption(option =>
        option.setName('period')
            .setDescription('The meal period to get the menu for')
            .setRequired(true)
            .addChoices(
                { name: 'Breakfast', value: 'breakfast' },
                { name: 'Lunch', value: 'lunch' },
                { name: 'Light Lunch', value: 'light_lunch' },
                { name: 'Dinner', value: 'dinner' },
                { name: 'Brunch (Weekends only)', value: 'brunch' }
            )
    );

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const diningHallOption = interaction.options.get('dining_hall')?.value as string;
        const periodOption = interaction.options.get('period')?.value as string;

        const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
        const period = MEAL_PERIODS[periodOption as keyof typeof MEAL_PERIODS];

        // Get current date in MM/DD/YYYY format
        const today = new Date();
        const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

        // Check if brunch is selected on a weekday
        if (periodOption === 'brunch' && today.getDay() !== 0 && today.getDay() !== 6) {
            await interaction.editReply('Brunch is only available on weekends (Saturday and Sunday).');
            return;
        }

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

        // Get time range text based on period
        const timeRange = period.name === 'Breakfast' ? '7:00am to 10:30am' :
            period.name === 'Lunch' ? '11:00am to 2:30pm' :
                period.name === 'Light Lunch' ? '2:30pm to 4:30pm' :
                    period.name === 'Dinner' ? '3:30pm to 06:00pm' :
                        '9:00am to 2:00pm';

        try {
            const menuData = await fetchMenu({
                mode: 'Daily',
                locationId: diningHall.id,
                date: formattedDate,
                periodId: period.id
            });

            if (!menuData.Menu || !menuData.Menu.MenuStations || !menuData.Menu.MenuProducts) {
                await interaction.editReply(`No menu available for ${displayName} ${period.name} today.`);
                return;
            }

            const stationMap = organizeMenuByStation(menuData);
            const stationNames = getStationNames(menuData);

            // Filter out empty stations
            const nonEmptyStations = Array.from(stationNames.entries())
                .filter(([stationId]) => (stationMap.get(stationId) || []).length > 0);

            if (nonEmptyStations.length === 0) {
                await interaction.editReply(`No menu items available for ${displayName} ${period.name} today.`);
                return;
            }

            // Function to render a specific station
            const renderStation = (stationId: string, stationName: string) => {
                const stationItems = stationMap.get(stationId) || [];
                let description = '';

                if (stationItems.length > 0) {
                    description += `\n**${stationName}**\n`;
                    for (const item of stationItems) {
                        description += `• ${item.MarketingName}\n`;
                    }
                } else {
                    description += `\n**${stationName}**\nNo items available at this station.`;
                }

                return description;
            };

            // Create the main embed with just the header text - no menu items initially
            const mainEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`${displayName}`)
                .setDescription(`Here are the menu options for ${period.name} at ${displayName} from ${timeRange}\n\n` +
                    `*Please use the dropdown menu below to view stations.*`);

            // Create select menu for stations
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('station_select')
                .setPlaceholder('Select a station to view items');

            // Add options for each station
            for (const [stationId, stationName] of nonEmptyStations) {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(stationName)
                        .setValue(stationId)
                );
            }

            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(selectMenu);

            // Send the initial message with the main embed and dropdown
            const response = await interaction.editReply({
                embeds: [mainEmbed],
                components: [row]
            }).catch(error => {
                console.error('Error sending menu:', error);
                interaction.followUp({
                    content: 'There was an issue displaying the menu.',
                    ephemeral: true
                }).catch(() => { /* Ignore errors */ });
                return null;
            });

            if (!response) return;

            // Create collector for dropdown menu interactions
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (selectInteraction) => {
                const selectedValue = selectInteraction.values[0];
                const stationName = stationNames.get(selectedValue) || 'Unknown Station';

                // Add spacing between title and content
                const updatedDescription = `Here are the menu options for ${period.name} at ${displayName} from ${timeRange}\n\n${renderStation(selectedValue, stationName)}`;

                const updatedEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`${displayName}`)
                    .setDescription(updatedDescription);

                await selectInteraction.update({
                    embeds: [updatedEmbed],
                    components: [row]
                }).catch(error => {
                    console.error('Error updating menu:', error);
                });
            });

            collector.on('end', () => {
                // When collector expires, remove the dropdown but keep the content
                const finalEmbed = EmbedBuilder.from(mainEmbed);

                interaction.editReply({
                    embeds: [finalEmbed],
                    components: []
                }).catch(() => {
                    // Ignore any errors that occur when trying to remove components
                    console.log('Could not update to remove components after timeout');
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