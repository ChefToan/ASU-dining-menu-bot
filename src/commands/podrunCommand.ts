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

// Store active podruns
const activePodruns = new Map<string, {
    creator: User;
    podrunners: Map<string, User>;
    haters: Map<string, User>;
    timeout: NodeJS.Timeout;
    startTime: Date;
    runTime: Date;
}>();

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
        const channelId = interaction.channelId;
        const guildId = interaction.guildId;

        // Check if there's already an active podrun in this channel
        const existingPodrunKey = `${guildId}-${channelId}`;
        if (activePodruns.has(existingPodrunKey)) {
            await interaction.reply({
                content: 'There\'s already an active podrun in this channel! Wait for it to finish before starting a new one.',
                ephemeral: true
            });
            return;
        }

        // Calculate the run time
        const startTime = new Date();
        const runTime = new Date(startTime.getTime() + minutes * 60000);

        // Format the time for display (12:44am format)
        const timeString = runTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
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

        // Initialize tracking
        const podrunners = new Map<string, User>();
        const haters = new Map<string, User>();

        // Add creator to podrunners
        podrunners.set(creator.id, creator);

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: minutes * 60000
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            const userId = buttonInteraction.user.id;
            const user = buttonInteraction.user;

            if (buttonInteraction.customId === 'podrun_yes') {
                // Remove from haters if they were there
                haters.delete(userId);
                // Add to podrunners
                podrunners.set(userId, user);
            } else if (buttonInteraction.customId === 'podrun_no') {
                // Remove from podrunners if they were there
                podrunners.delete(userId);
                // Add to haters
                haters.set(userId, user);
            } else if (buttonInteraction.customId === 'podrun_cancel') {
                // Only the creator can cancel
                if (userId === creator.id) {
                    await buttonInteraction.reply({
                        content: 'Podrun has been cancelled.',
                        ephemeral: true
                    });

                    // Stop the collector
                    collector.stop('cancelled');

                    // Remove from active podruns
                    activePodruns.delete(existingPodrunKey);

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

                    return;
                } else {
                    await buttonInteraction.reply({
                        content: 'You cannot cancel this podrun.',
                        ephemeral: true
                    });
                    return;
                }
            }

            // Update the embed
            const podrunnersText = podrunners.size > 0
                ? Array.from(podrunners.values()).map(u => `<@${u.id}>`).join('\n')
                : '\u200B';

            const hatersText = haters.size > 0
                ? Array.from(haters.values()).map(u => `<@${u.id}>`).join('\n')
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
        const timeout = setTimeout(async () => {
            // Remove from active podruns
            activePodruns.delete(existingPodrunKey);

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

            if (podrunners.size === 1) {
                // Only the creator, send cancellation message
                await channel.send(`Womp womp, nobody wanted to podrun with <@${creator.id}>. Podrun has been cancelled`);
            } else {
                // Multiple people joined, send podrun time message
                const runnersList = Array.from(podrunners.values()).map(u => `<@${u.id}>`).join(' ');
                await channel.send(`It's podrun time! ${runnersList}`);
            }

            // Stop the collector
            collector.stop();
        }, minutes * 60000);

        // Store the active podrun
        activePodruns.set(existingPodrunKey, {
            creator,
            podrunners,
            haters,
            timeout,
            startTime,
            runTime
        });

        // Handle collector end (in case it ends before the timeout)
        collector.on('end', () => {
            // Clean up if needed
            if (activePodruns.has(existingPodrunKey)) {
                activePodruns.delete(existingPodrunKey);
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
    for (const [key, podrun] of activePodruns.entries()) {
        clearTimeout(podrun.timeout);
        activePodruns.delete(key);
    }
}