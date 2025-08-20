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


export const data = new SlashCommandBuilder()
    .setName('podrun')
    .setDescription('Organize a podrun to the pod!')
    .addIntegerOption(option =>
        option.setName('minutes')
            .setDescription('Minutes from now until the podrun starts (1-120)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(120)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        const minutes = interaction.options.get('minutes')?.value as number;
        const creator = interaction.user;
        const channelId = interaction.channelId!;
        const guildId = interaction.guildId!;

        // Check if there's already an active podrun in this channel
        const existingPodrunKey = `${guildId}-${channelId}`;
        if (await podrunService.podrunExists(existingPodrunKey)) {
            await interaction.reply({
                content: 'There\'s already an active podrun in this channel! Wait for it to finish before starting a new one.',
                ephemeral: true
            });
            return;
        }

        // Calculate the run time using user's local timezone
        const startTime = new Date();
        const runTime = new Date(startTime.getTime() + minutes * 60000);

        // Get user's timezone offset (Discord doesn't provide this directly, so we'll use a smart default)
        // We'll use the server's timezone but format it in a user-friendly way
        const timeString = runTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Phoenix' // Arizona time (ASU is in Arizona)
        }).toLowerCase();

        // Create the embed message
        const embedDescription = `**Podrun at ${timeString}**\n\nReact with a thumbs up to this message, if you would like to podrun`;

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

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: minutes * 60000
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            const userId = buttonInteraction.user.id;
            const user = buttonInteraction.user;

            if (buttonInteraction.customId === 'podrun_yes') {
                await podrunService.addParticipant(podrunId, userId, user.username, 'podrunner');
            } else if (buttonInteraction.customId === 'podrun_no') {
                await podrunService.addParticipant(podrunId, userId, user.username, 'hater');
            } else if (buttonInteraction.customId === 'podrun_cancel') {
                // Only the creator can cancel
                if (userId === creator.id) {
                    await podrunService.cancelPodrun(existingPodrunKey);

                    await buttonInteraction.reply({
                        content: 'Podrun has been cancelled.',
                        ephemeral: true
                    });

                    // Stop the collector
                    collector.stop('cancelled');

                    // Delete the original message
                    await message.delete();

                    return;
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
        });

        // Set timeout for when the podrun starts
        podrunService.setTimeout(existingPodrunKey, async () => {
            // Get current podrun data to check if cancelled
            const podrunData = await podrunService.getPodrun(existingPodrunKey);
            
            // If podrun doesn't exist or was cancelled, don't send messages
            if (!podrunData || podrunData.status !== 'active') {
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

            // Stop the collector
            collector.stop();
        }, minutes * 60000);

        // Handle collector end (in case it ends before the timeout)
        collector.on('end', () => {
            // Cleanup is now handled by the podrunService
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