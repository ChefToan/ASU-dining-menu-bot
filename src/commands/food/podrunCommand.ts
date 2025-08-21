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
import { podrunService } from '../../services/podrunService';
import { diningEventService } from '../../services/diningEventService';


export const data = new SlashCommandBuilder()
    .setName('podrun')
    .setDescription('Organize a podrun to the pod!')
    .addStringOption(option =>
        option.setName('time')
            .setDescription('What time for the podrun (e.g., "6:30pm", "18:00", "19:15")')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('date')
            .setDescription('Date for podrun in MM/DD/YYYY format (optional, defaults to today)')
            .setRequired(false)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        const dateInput = interaction.options.get('date')?.value as string;
        const timeInput = interaction.options.get('time')?.value as string;
        const creator = interaction.user;
        const channelId = interaction.channelId!;
        const guildId = interaction.guildId!;

        // Parse the date (defaults to today if not provided)
        let targetDate: Date;
        try {
            targetDate = diningEventService.parseDate(dateInput);
        } catch (error) {
            await interaction.reply({
                content: (error as Error).message,
                ephemeral: true
            });
            return;
        }

        // Parse the time and apply to the target date
        const runTime = diningEventService.parseTime(timeInput, targetDate);
        
        if (!runTime) {
            await interaction.reply({
                content: 'Invalid time format. Please use formats like "6:30pm", "18:00", or "19:15".',
                ephemeral: true
            });
            return;
        }

        // Check if the podrun time is in the past
        const nowMST = diningEventService.getMSTNow();
        if (runTime <= nowMST) {
            await interaction.reply({
                content: 'The specified time has already passed. Please choose a future time.',
                ephemeral: true
            });
            return;
        }

        // Check if there's already an active podrun in this channel for the same day
        const dateKey = runTime.toISOString().split('T')[0]; // YYYY-MM-DD format
        const existingPodrunKey = `${guildId}-${channelId}-${dateKey}`;
        if (await podrunService.podrunExists(existingPodrunKey)) {
            await interaction.reply({
                content: 'There\'s already an active podrun in this channel for that day! Wait for it to finish before starting a new one.',
                ephemeral: true
            });
            return;
        }

        // Calculate the run time and start time
        const startTime = new Date();
        
        // Format the time and date for display in MST
        const mstRunTime = diningEventService.toMST(runTime);
        const timeString = mstRunTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Phoenix'
        }).toLowerCase();

        const dateString = mstRunTime.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Phoenix'
        });

        // Create the embed message
        const embedDescription = `**Podrun at ${timeString}**\n(${dateString})\n\nReact with a thumbs up to this message, if you would like to podrun`;

        // Create the initial embed
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription(embedDescription)
            .addFields(
                {
                    name: 'Podrunners',
                    value: `<@${creator.id}>`,
                    inline: true
                },
                {
                    name: 'Haters',
                    value: '\u200B', // Empty field
                    inline: true
                }
            );

        // Create buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('podrun_yes')
                    .setEmoji('👍')
                    .setLabel('Attending')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('podrun_no')
                    .setEmoji('👎')
                    .setLabel('Erm, Naur')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('podrun_cancel')
                    .setLabel('Cancel Podrun')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send the message with the note about who used the command
        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        // Create podrun in database
        const podrunId = await podrunService.createPodrun(
            existingPodrunKey,
            creator,
            guildId,
            channelId,
            startTime,
            runTime,
            message.id as string
        );

        if (!podrunId) {
            await interaction.editReply({
                content: 'Failed to create podrun. Please try again.',
                components: []
            });
            return;
        }

        // Calculate timeout duration until the podrun time
        const timeoutDuration = runTime.getTime() - startTime.getTime();

        // Create collector for button interactions (no automatic timeout - we handle it manually)
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            try {
                console.log(`[Podrun] Collector received button interaction: ${buttonInteraction.customId}`);
                const userId = buttonInteraction.user.id;
                const user = buttonInteraction.user;

            if (buttonInteraction.customId === 'podrun_yes') {
                await podrunService.addParticipant(podrunId, userId, user.username, 'podrunner');
            } else if (buttonInteraction.customId === 'podrun_no') {
                await podrunService.addParticipant(podrunId, userId, user.username, 'hater');
            } else if (buttonInteraction.customId === 'podrun_cancel') {
                // Only the creator can cancel
                if (userId === creator.id) {
                    try {
                        // Cancel podrun in database
                        await podrunService.cancelPodrun(existingPodrunKey);

                        // Update the message to show cancellation, then delete it
                        await buttonInteraction.update({
                            content: 'Podrun has been cancelled.',
                            embeds: [],
                            components: []
                        });

                        // Stop the collector (this will trigger the cleanup and clear the timeout)
                        collector.stop('cancelled_by_creator');

                        // Delete the message after a short delay
                        setTimeout(async () => {
                            try {
                                await buttonInteraction.message.delete();
                                console.log(`[Podrun] Cancelled event message deleted`);
                            } catch (error) {
                                console.warn('Could not delete cancelled podrun message:', error);
                            }
                        }, 3000); // 3 second delay

                        return;
                    } catch (error) {
                        console.error(`[Podrun] Error cancelling podrun:`, error);
                        await buttonInteraction.reply({
                            content: 'Error cancelling podrun. Please try again.',
                            ephemeral: true
                        });
                        return;
                    }
                } else {
                    await buttonInteraction.reply({
                        content: 'You cannot cancel this podrun.',
                        ephemeral: true
                    });
                    return;
                }
            }

            // Get updated podrun data
            const podrunData = await podrunService.getPodrun(existingPodrunKey);
            if (!podrunData) return;

            // Update the embed
            const podrunnersText = podrunData.podrunners.size > 0
                ? Array.from(podrunData.podrunners.values()).map(u => `<@${u.id}>`).join('\n')
                : '\u200B';

            const hatersText = podrunData.haters.size > 0
                ? Array.from(podrunData.haters.values()).map(u => `<@${u.id}>`).join('\n')
                : '\u200B';

            const updatedEmbed = EmbedBuilder.from(embed)
                .setFields(
                    {
                        name: 'Podrunners',
                        value: podrunnersText || '\u200B',
                        inline: true
                    },
                    {
                        name: 'Haters',
                        value: hatersText || '\u200B',
                        inline: true
                    }
                );

            await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [row]
            });
            } catch (error) {
                console.error(`[Podrun] Error in collector button handler:`, error);
                try {
                    if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                        await buttonInteraction.reply({
                            content: 'An error occurred processing your request. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    console.error(`[Podrun] Could not send error reply:`, replyError);
                }
            }
        });

        // Set timeout for when the podrun starts using Node.js setTimeout directly
        console.log(`[Podrun] Creating timeout with duration: ${timeoutDuration}ms`);
        
        const timeoutId = setTimeout(async () => {
            try {
                console.log(`[Podrun] Timeout reached! Triggering podrun time notification.`);
                
                // Get current podrun data to check if cancelled
                const podrunData = await podrunService.getPodrun(existingPodrunKey);
                
                // If podrun doesn't exist or was cancelled, don't send messages
                if (!podrunData || podrunData.status !== 'active') {
                    console.log(`[Podrun] Podrun not found or not active: ${podrunData?.status}`);
                    collector.stop('podrun_cancelled_or_expired');
                    return;
                }
                
                // Disable buttons
                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('podrun_yes')
                            .setEmoji('👍')
                            .setLabel('Attending')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('podrun_no')
                            .setEmoji('👎')
                            .setLabel('Erm, Naur')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('podrun_cancel')
                            .setLabel('Cancel Podrun')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );

                // Update the original message to disable buttons
                await message.edit({
                    components: [disabledRow]
                });

                // Check if anyone besides the creator joined
                const channel = interaction.channel as TextChannel;

                if (podrunData.podrunners.size === 1) {
                    // Only the creator, send cancellation message
                    await channel.send(`Womp womp, nobody wanted to podrun with <@${creator.id}>. Podrun has been cancelled`);
                } else {
                    // Multiple people joined, send podrun time message
                    const runnersList = Array.from(podrunData.podrunners.values()).map(u => `<@${u.id}>`).join(' ');
                    await channel.send(`It's podrun time! ${runnersList}`);
                }

                // Mark podrun as completed
                await podrunService.completePodrun(existingPodrunKey);

                // Delete the embed message after completion
                try {
                    await message.delete();
                    console.log(`[Podrun] Event message deleted after completion`);
                } catch (deleteError) {
                    console.warn(`[Podrun] Could not delete completed event message:`, deleteError);
                }

                // Stop the collector
                collector.stop('podrun_time_reached');
            } catch (error) {
                console.error(`[Podrun] Error in timeout callback:`, error);
                collector.stop('timeout_error');
            }
        }, timeoutDuration);

        console.log(`[Podrun] Timeout ID created: ${timeoutId}`);

        // Cleanup on collector end
        collector.on('end', (collected: any, reason: string) => {
            console.log(`[Podrun] Collector ended with reason: "${reason}", collected: ${collected?.size || 'unknown'} interactions`);
            // Clear timeout if collector ends early
            if (reason !== 'podrun_time_reached') {
                console.log(`[Podrun] Clearing timeout due to early collector end`);
                clearTimeout(timeoutId);
            }
        });


    } catch (error) {
        console.error('Error executing podrun command:', error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: 'There was an error organizing the podrun. Please try again!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'There was an error organizing the podrun. Please try again!',
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
    // Clear all active podrun timeouts
    podrunService.cleanup();
}