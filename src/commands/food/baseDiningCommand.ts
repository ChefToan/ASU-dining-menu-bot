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
    User,
    InteractionCollector
} from 'discord.js';
import { diningEventService } from '../../services/diningEventService';
import { DINING_HALLS } from '../../utils/config';

export interface MealConfig {
    name: string;
    emoji: string;
    color: number;
    description: string;
    cancelEmoji: string;
    mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner' | 'brunch';
}

export class BaseDiningCommand {
    protected config: MealConfig;

    constructor(config: MealConfig) {
        this.config = config;
    }

    createSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.config.mealType)
            .setDescription(`Organize a ${this.config.name.toLowerCase()} meetup at a dining hall!`)
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
                    .setDescription(`What time for ${this.config.name.toLowerCase()} (e.g., "12:30pm", "1:00", "13:15")`)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('date')
                    .setDescription(`Date for ${this.config.name.toLowerCase()} in MM/DD/YYYY format (optional, defaults to today)`)
                    .setRequired(false)
            );
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        try {
            const diningHallOption = interaction.options.get('dining_hall')?.value as string;
            const dateInput = interaction.options.get('date')?.value as string;
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

            // Parse date and time
            const { success, error, mealTime } = await this.parseDateTime(dateInput, timeInput);
            if (!success) {
                await interaction.reply({
                    content: error,
                    ephemeral: true
                });
                return;
            }

            // Validate meal time
            if (!diningEventService.isValidMealTime(this.config.mealType, mealTime!)) {
                await interaction.reply({
                    content: diningEventService.getMealTimeErrorMessage(this.config.mealType, timeInput),
                    ephemeral: true
                });
                return;
            }

            // Check if time is in the past
            const nowMST = diningEventService.getMSTNow();
            if (mealTime! <= nowMST) {
                await interaction.reply({
                    content: 'The specified time has already passed. Please choose a future time.',
                    ephemeral: true
                });
                return;
            }

            // Check for existing event
            const eventKey = `${guildId}-${channelId}-${this.config.mealType}-${mealTime!.toDateString()}`;
            if (await diningEventService.diningEventExists(eventKey)) {
                await interaction.reply({
                    content: `There's already an active ${this.config.name.toLowerCase()} event in this channel for that day! Wait for it to finish before starting a new one.`,
                    ephemeral: true
                });
                return;
            }

            // Create and send the event
            await this.createAndSendEvent(interaction, diningHall, diningHallOption, mealTime!, eventKey, creator, guildId, channelId);

        } catch (error) {
            await this.handleError(interaction, error);
        }
    }

    private async parseDateTime(dateInput: string | undefined, timeInput: string): Promise<{
        success: boolean;
        error?: string;
        mealTime?: Date;
    }> {
        try {
            // Parse the date (defaults to today if not provided)
            const targetDate = diningEventService.parseDate(dateInput);
            
            // Parse the time and apply to the target date
            const mealTime = diningEventService.parseTime(timeInput, targetDate);
            
            if (!mealTime) {
                return {
                    success: false,
                    error: `Invalid time format. Please use formats like "12:30pm", "1:00", or "13:15".`
                };
            }

            return { success: true, mealTime };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    private async createAndSendEvent(
        interaction: CommandInteraction,
        diningHall: any,
        diningHallOption: string,
        mealTime: Date,
        eventKey: string,
        creator: User,
        guildId: string,
        channelId: string
    ): Promise<void> {
        // Format time and date for display
        const mstMealTime = diningEventService.toMST(mealTime);
        const timeString = mstMealTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Phoenix'
        }).toLowerCase();

        const dateString = mstMealTime.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'America/Phoenix'
        });

        // Create embed
        const embed = new EmbedBuilder()
            .setColor(this.config.color)
            .setDescription(`**${this.config.name} at ${diningHall.name} at ${timeString}**\n(${dateString})\n\n${this.config.description}`)
            .addFields(
                {
                    name: `${this.config.emoji} Attending`,
                    value: `<@${creator.id}>`,
                    inline: true
                },
                {
                    name: '❌ Can\'t Make It',
                    value: '\u200B',
                    inline: true
                }
            );

        // Create buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_yes`)
                    .setEmoji(this.config.emoji)
                    .setLabel('I\'m In!')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_no`)
                    .setEmoji('❌')
                    .setLabel('Can\'t Make It')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_cancel`)
                    .setLabel('Cancel Event')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send message
        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        // Create event in database
        const startTime = diningEventService.getMSTNow();
        const eventId = await diningEventService.createDiningEvent(
            eventKey,
            creator,
            guildId,
            channelId,
            this.config.mealType,
            diningHallOption,
            startTime,
            mealTime,
            message.id as string
        );

        if (!eventId) {
            await interaction.editReply({
                content: `Failed to create ${this.config.name.toLowerCase()} event. Please try again.`,
                components: []
            });
            return;
        }

        // Set up event handlers
        await this.setupEventHandlers(interaction, message, eventId, eventKey, creator, diningHall, mealTime, startTime, embed, row);
    }

    private async setupEventHandlers(
        interaction: CommandInteraction,
        message: any,
        eventId: number,
        eventKey: string,
        creator: User,
        diningHall: any,
        mealTime: Date,
        startTime: Date,
        embed: EmbedBuilder,
        row: ActionRowBuilder<ButtonBuilder>
    ): Promise<void> {
        // Ensure both dates are in the same timezone context for accurate calculation
        const now = diningEventService.getMSTNow();
        const rawDuration = mealTime.getTime() - now.getTime();
        const timeoutDuration = Math.min(Math.max(rawDuration, 1000), 24 * 60 * 60 * 1000); // Min 1 second, Max 24 hours
        
        console.log(`[${this.config.name}] Setting up timeout - Now: ${now.toISOString()}, Meal Time: ${mealTime.toISOString()}`);
        console.log(`[${this.config.name}] Raw duration: ${rawDuration}ms, Final duration: ${timeoutDuration}ms (${Math.round(timeoutDuration / 1000 / 60)} minutes)`);
        
        if (rawDuration <= 0) {
            console.warn(`[${this.config.name}] WARNING: Meal time is in the past! Raw duration: ${rawDuration}ms`);
        }

        // Create collector without automatic timeout (we handle timeout manually)
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            try {
                console.log(`[${this.config.name}] Collector received button interaction: ${buttonInteraction.customId}`);
                await this.handleButtonInteraction(buttonInteraction, eventId, eventKey, creator, embed, row, collector);
            } catch (error) {
                console.error(`[${this.config.name}] Error in collector button handler:`, error);
                try {
                    if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                        await buttonInteraction.reply({
                            content: 'An error occurred processing your request. Please try again.',
                            ephemeral: true
                        });
                    }
                } catch (replyError) {
                    console.error(`[${this.config.name}] Could not send error reply:`, replyError);
                }
            }
        });

        // Set timeout for meal time using Node.js setTimeout directly
        console.log(`[${this.config.name}] Creating timeout with duration: ${timeoutDuration}ms`);
        
        const timeoutId = setTimeout(async () => {
            try {
                console.log(`[${this.config.name}] Timeout reached! Triggering meal time notification.`);
                await this.handleMealTimeReached(interaction, eventKey, creator, diningHall, message);
                collector.stop('meal_time_reached');
            } catch (error) {
                console.error(`[${this.config.name}] Error in timeout callback:`, error);
                collector.stop('timeout_error');
            }
        }, timeoutDuration);
        
        // Add a test timeout to verify setTimeout is working
        setTimeout(() => {
            console.log(`[${this.config.name}] Test timeout fired after 5 seconds - setTimeout mechanism is working`);
        }, 5000);
        
        console.log(`[${this.config.name}] Timeout ID created: ${timeoutId}`);

        // Cleanup on collector end
        collector.on('end', (collected: any, reason: string) => {
            console.log(`[${this.config.name}] Collector ended with reason: "${reason}", collected: ${collected?.size || 'unknown'} interactions`);
            // Clear timeout if collector ends early
            if (reason !== 'meal_time_reached') {
                console.log(`[${this.config.name}] Clearing timeout due to early collector end`);
                clearTimeout(timeoutId);
            }
        });
    }

    private async handleButtonInteraction(
        buttonInteraction: ButtonInteraction,
        eventId: number,
        eventKey: string,
        creator: User,
        embed: EmbedBuilder,
        row: ActionRowBuilder<ButtonBuilder>,
        collector: InteractionCollector<ButtonInteraction>
    ): Promise<void> {
        try {
            const userId = buttonInteraction.user.id;
            const user = buttonInteraction.user;
            
            console.log(`[${this.config.name}] Button interaction: ${buttonInteraction.customId} by user ${userId}`);

        if (buttonInteraction.customId === `${this.config.mealType}_yes`) {
            console.log(`[${this.config.name}] Adding user ${userId} as attendee to event ${eventId}`);
            const success = await diningEventService.addParticipant(eventId, userId, user.username, 'attendee');
            console.log(`[${this.config.name}] Add participant result:`, success);
        } else if (buttonInteraction.customId === `${this.config.mealType}_no`) {
            console.log(`[${this.config.name}] Adding user ${userId} as declined to event ${eventId}`);
            const success = await diningEventService.addParticipant(eventId, userId, user.username, 'declined');
            console.log(`[${this.config.name}] Add participant result:`, success);
        } else if (buttonInteraction.customId === `${this.config.mealType}_cancel`) {
            // Get event data to verify creator
            const eventData = await diningEventService.getDiningEvent(eventKey);
            if (!eventData) {
                await buttonInteraction.reply({
                    content: 'Event not found.',
                    ephemeral: true
                });
                return;
            }

            console.log(`[${this.config.name}] Cancel attempt - User ID: "${userId}", Creator ID: "${eventData.creator.id}", Type check: ${typeof userId} vs ${typeof eventData.creator.id}`);
            
            if (userId === eventData.creator.id || userId === eventData.creator.id.toString()) {
                await diningEventService.cancelDiningEvent(eventKey);
                
                // Update the message to show cancellation, then delete it
                await buttonInteraction.update({
                    content: `${this.config.name} event has been cancelled.`,
                    embeds: [],
                    components: []
                });
                
                // Stop the collector
                collector.stop('cancelled_by_creator');
                
                // Delete the message after a short delay
                setTimeout(async () => {
                    try {
                        await buttonInteraction.message.delete();
                    } catch (error) {
                        console.warn('Could not delete cancelled event message:', error);
                    }
                }, 3000); // 3 second delay
                
                return;
            } else {
                await buttonInteraction.reply({
                    content: `Only the event creator can cancel this ${this.config.name.toLowerCase()} event.`,
                    ephemeral: true
                });
                return;
            }
        }

        // Update embed with new participation data
        console.log(`[${this.config.name}] Retrieving event data for embed update`);
        const eventData = await diningEventService.getDiningEvent(eventKey);
        if (!eventData) {
            console.error(`[${this.config.name}] No event data found for key: ${eventKey}`);
            return;
        }

        console.log(`[${this.config.name}] Event data retrieved - Attendees: ${eventData.attendees.size}, Declined: ${eventData.declined.size}`);
        
        const attendeesText = eventData.attendees.size > 0
            ? Array.from(eventData.attendees.keys()).map(userId => `<@${userId}>`).join('\n')
            : '\u200B';

        const declinedText = eventData.declined.size > 0
            ? Array.from(eventData.declined.keys()).map(userId => `<@${userId}>`).join('\n')
            : '\u200B';
            
        console.log(`[${this.config.name}] Attendees text: "${attendeesText}", Declined text: "${declinedText}"`);

        const updatedEmbed = EmbedBuilder.from(embed)
            .setFields(
                {
                    name: `${this.config.emoji} Attending`,
                    value: attendeesText,
                    inline: true
                },
                {
                    name: '❌ Can\'t Make It',
                    value: declinedText,
                    inline: true
                }
            );

            console.log(`[${this.config.name}] Updating interaction with new embed...`);
            await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [row]
            });
            
            console.log(`[${this.config.name}] Successfully updated embed for ${buttonInteraction.customId}`);
        } catch (error) {
            console.error(`Error handling button interaction for ${this.config.name}:`, error);
            try {
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({
                        content: 'There was an error processing your request. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Could not send error response:', replyError);
            }
        }
    }

    private async handleMealTimeReached(
        interaction: CommandInteraction,
        eventKey: string,
        creator: User,
        diningHall: any,
        message: any
    ): Promise<void> {
        console.log(`[${this.config.name}] handleMealTimeReached called for eventKey: ${eventKey}`);
        
        const eventData = await diningEventService.getDiningEvent(eventKey);
        
        if (!eventData || eventData.status !== 'active') {
            console.log(`[${this.config.name}] Event not found or not active:`, eventData?.status);
            return;
        }
        
        console.log(`[${this.config.name}] Event data retrieved, attendees:`, eventData.attendees.size);

        // Disable buttons
        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_yes`)
                    .setEmoji(this.config.emoji)
                    .setLabel('I\'m In!')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_no`)
                    .setEmoji('❌')
                    .setLabel('Can\'t Make It')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_cancel`)
                    .setLabel('Cancel Event')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

        await message.edit({ components: [disabledRow] });

        const channel = interaction.channel as TextChannel;

        try {
            console.log(`[${this.config.name}] Event reached meal time. Attendees: ${eventData.attendees.size}`);
            
            if (eventData.attendees.size <= 1) {
                // Only the creator or no one
                await channel.send(`No one else wanted to join <@${creator.id}> for ${this.config.name.toLowerCase()} at ${diningHall.name}. Event cancelled! ${this.config.cancelEmoji}`);
            } else {
                // Multiple attendees - ping them all
                const attendeesList = Array.from(eventData.attendees.keys())
                    .filter(userId => userId && userId.trim()) // Filter out empty user IDs
                    .map(userId => `<@${userId}>`)
                    .join(' ');
                
                console.log(`[${this.config.name}] Generated attendees list from ${eventData.attendees.size} attendees: "${attendeesList}"`);
                console.log(`[${this.config.name}] Attendees Map:`, Array.from(eventData.attendees.entries()));
                
                await channel.send(`${this.config.name} time at ${diningHall.name}! ${attendeesList}`);
            }
        } catch (error) {
            console.error('Error sending meal time notification:', error);
            // Try to send a basic notification without pings
            try {
                await channel.send(`${this.config.emoji} ${this.config.name} time at ${diningHall.name}! Enjoy your meal! ${this.config.cancelEmoji}`);
            } catch (fallbackError) {
                console.error('Failed to send fallback meal notification:', fallbackError);
            }
        }

        // Mark event as completed in database
        await diningEventService.completeDiningEvent(eventKey);
        
        // Update the message to show completion and delete after delay
        try {
            await message.edit({
                content: `${this.config.emoji} ${this.config.name} event has ended. Thanks for participating!`,
                embeds: [],
                components: []
            });
            
            // Delete the message after a delay
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`[${this.config.name}] Event message deleted after completion`);
                } catch (deleteError) {
                    console.warn(`[${this.config.name}] Could not delete completed event message:`, deleteError);
                }
            }, 10000); // 10 second delay to let people see the completion message
            
        } catch (editError) {
            console.warn(`[${this.config.name}] Could not edit message on completion:`, editError);
        }
    }

    private async handleError(interaction: CommandInteraction, error: any): Promise<void> {
        console.error(`Error executing ${this.config.name.toLowerCase()} command:`, error);

        try {
            const errorMessage = `There was an error organizing the ${this.config.name.toLowerCase()} event. Please try again!`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Could not send error message:', replyError);
        }
    }

    cleanup(): void {
        diningEventService.cleanup();
    }
}