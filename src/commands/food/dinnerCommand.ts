import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction,
    TextChannel,
    User
} from 'discord.js';
import { diningEventService } from '../../services/diningEventService';
import { DINING_HALLS } from '../../utils/config';

export const data = new SlashCommandBuilder()
    .setName('dinner')
    .setDescription('Organize a dinner meetup at a dining hall!')
    .addStringOption(option =>
        option.setName('dining_hall')
            .setDescription('Which dining hall to meet at')
            .setRequired(true)
            .addChoices(
                { name: 'Barrett', value: 'barrett' },
                { name: 'Manzi', value: 'manzi' },
                { name: 'Hassay', value: 'hassay' },
                { name: 'Tooker', value: 'tooker' },
                { name: 'MU (Pitchforks)', value: 'mu' },
                { name: 'HIDA', value: 'hida' }
            )
    )
    .addStringOption(option =>
        option.setName('time')
            .setDescription('What time for dinner (e.g., "6:30pm", "18:00", "19:15")')
            .setRequired(true)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        const diningHallOption = interaction.options.get('dining_hall')?.value as string;
        const timeInput = interaction.options.get('time')?.value as string;
        const creator = interaction.user;
        const channelId = interaction.channelId!;
        const guildId = interaction.guildId!;

        // Validate dining hall
        const diningHall = DINING_HALLS[diningHallOption as keyof typeof DINING_HALLS];
        if (!diningHall) {
            await interaction.reply({
                content: 'Invalid dining hall selected.',
                ephemeral: true
            });
            return;
        }

        // Parse the time
        const currentDate = new Date();
        const mealTime = diningEventService.parseTime(timeInput, currentDate);
        
        if (!mealTime) {
            await interaction.reply({
                content: 'Invalid time format. Please use formats like "6:30pm", "18:00", or "19:15".',
                ephemeral: true
            });
            return;
        }

        // If the time is in the past today, assume it's for tomorrow
        if (mealTime <= currentDate) {
            mealTime.setDate(mealTime.getDate() + 1);
        }

        // Check if there's already an active dinner event in this channel for the same day
        const eventKey = `${guildId}-${channelId}-dinner-${mealTime.toDateString()}`;
        if (await diningEventService.diningEventExists(eventKey)) {
            await interaction.reply({
                content: 'There\'s already an active dinner event in this channel for that day! Wait for it to finish before starting a new one.',
                ephemeral: true
            });
            return;
        }

        // Format the time for display
        const timeString = mealTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Phoenix' // Arizona time (ASU is in Arizona)
        }).toLowerCase();

        const dateString = mealTime.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Phoenix'
        });

        // Create the embed message
        const embedDescription = `**Dinner at ${diningHall.name} on ${dateString} at ${timeString}**\n\nJoin us for dinner! React to let us know if you're coming.`;

        // Create the initial embed
        const embed = new EmbedBuilder()
            .setColor(Colors.Purple)
            .setDescription(embedDescription)
            .addFields(
                {
                    name: '🍴 Attending',
                    value: `<@${creator.id}>`,
                    inline: true
                },
                {
                    name: '❌ Can\'t Make It',
                    value: '\u200B', // Empty field
                    inline: true
                }
            );

        // Create buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('dinner_yes')
                    .setEmoji('🍴')
                    .setLabel('I\'m In!')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('dinner_no')
                    .setEmoji('❌')
                    .setLabel('Can\'t Make It')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('dinner_cancel')
                    .setLabel('Cancel Event')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send the message
        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        // Create dining event in database
        const startTime = new Date();
        const eventId = await diningEventService.createDiningEvent(
            eventKey,
            creator,
            guildId,
            channelId,
            'dinner',
            diningHallOption,
            startTime,
            mealTime,
            message.id as string
        );

        if (!eventId) {
            await interaction.editReply({
                content: 'Failed to create dinner event. Please try again.',
                components: []
            });
            return;
        }

        // Calculate timeout duration until the meal time
        const timeoutDuration = mealTime.getTime() - startTime.getTime();

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: timeoutDuration
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            const userId = buttonInteraction.user.id;
            const user = buttonInteraction.user;

            if (buttonInteraction.customId === 'dinner_yes') {
                await diningEventService.addParticipant(eventId, userId, user.username, 'attendee');
            } else if (buttonInteraction.customId === 'dinner_no') {
                await diningEventService.addParticipant(eventId, userId, user.username, 'declined');
            } else if (buttonInteraction.customId === 'dinner_cancel') {
                // Only the creator can cancel
                if (userId === creator.id) {
                    await diningEventService.cancelDiningEvent(eventKey);

                    await buttonInteraction.reply({
                        content: 'Dinner event has been cancelled.',
                        ephemeral: true
                    });

                    // Stop the collector
                    collector.stop('cancelled');

                    // Delete the original message
                    await message.delete();

                    return;
                } else {
                    await buttonInteraction.reply({
                        content: 'You cannot cancel this dinner event.',
                        ephemeral: true
                    });
                    return;
                }
            }

            // Get updated event data
            const eventData = await diningEventService.getDiningEvent(eventKey);
            if (!eventData) return;

            // Update the embed
            const attendeesText = eventData.attendees.size > 0
                ? Array.from(eventData.attendees.values()).map(u => `<@${u.id}>`).join('\n')
                : '\u200B';

            const declinedText = eventData.declined.size > 0
                ? Array.from(eventData.declined.values()).map(u => `<@${u.id}>`).join('\n')
                : '\u200B';

            const updatedEmbed = EmbedBuilder.from(embed)
                .setFields(
                    {
                        name: '🍴 Attending',
                        value: attendeesText || '\u200B',
                        inline: true
                    },
                    {
                        name: '❌ Can\'t Make It',
                        value: declinedText || '\u200B',
                        inline: true
                    }
                );

            await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [row]
            });
        });

        // Set timeout for when the dinner time arrives
        diningEventService.setTimeout(eventKey, async () => {
            // Get current event data to check if cancelled
            const eventData = await diningEventService.getDiningEvent(eventKey);
            
            // If event doesn't exist or was cancelled, don't send messages
            if (!eventData || eventData.status !== 'active') {
                return;
            }

            // Disable buttons
            const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('dinner_yes')
                        .setEmoji('🍴')
                        .setLabel('I\'m In!')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('dinner_no')
                        .setEmoji('❌')
                        .setLabel('Can\'t Make It')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('dinner_cancel')
                        .setLabel('Cancel Event')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

            // Update the original message to disable buttons
            await message.edit({
                components: [disabledRow]
            });

            // Check if anyone besides the creator joined
            const channel = interaction.channel as TextChannel;

            if (eventData.attendees.size === 1) {
                // Only the creator, send cancellation message
                await channel.send(`No one else wanted to join <@${creator.id}> for dinner at ${diningHall.name}. Event cancelled! 🍕`);
            } else {
                // Multiple people joined, send dinner time message
                const attendeesList = Array.from(eventData.attendees.values()).map(u => `<@${u.id}>`).join(' ');
                await channel.send(`🍴 Dinner time at ${diningHall.name}! ${attendeesList} - enjoy your meal! 🍕`);
            }

            // Mark event as completed
            await diningEventService.completeDiningEvent(eventKey);

            // Stop the collector
            collector.stop();
        }, timeoutDuration);

        // Handle collector end (in case it ends before the timeout)
        collector.on('end', () => {
            // Cleanup is now handled by the diningEventService
        });

    } catch (error) {
        console.error('Error executing dinner command:', error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: 'There was an error organizing the dinner event. Please try again!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error organizing the dinner event. Please try again!',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Could not send error message:', replyError);
        }
    }
}

// Clean up function for when the bot shuts down
export function cleanup() {
    // Clear all active dining event timeouts
    diningEventService.cleanup();
}