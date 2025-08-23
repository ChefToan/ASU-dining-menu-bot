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
    StringSelectMenuBuilder,
    StringSelectMenuInteraction
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

interface EventState {
    eventKey: string;
    creator: User;
    mealType: string;
    mealTime: Date;
    diningHall?: string;
    attendees: Set<string>;
    declined: Set<string>;
    messageId?: string;
    timeoutId?: NodeJS.Timeout;
}

export class BaseDiningCommand {
    protected config: MealConfig;
    private static eventCache = new Map<string, EventState>();

    constructor(config: MealConfig) {
        this.config = config;
    }

    createSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.config.mealType)
            .setDescription(`Organize a ${this.config.name.toLowerCase()} meetup at a dining hall!`)
            .addStringOption(option =>
                option.setName('time')
                    .setDescription(`What time for ${this.config.name.toLowerCase()} (e.g., "12:30pm", "1:00", "13:15")`)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('dining_hall')
                    .setDescription('Which dining hall to meet at (optional - will be prompted if not provided)')
                    .setRequired(false)
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

            // Parse date and time
            const { success, error, mealTime } = await this.parseDateTime(dateInput, timeInput);
            if (!success) {
                await interaction.reply({ content: error, ephemeral: true });
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
            if (mealTime! <= diningEventService.getMSTNow()) {
                await interaction.reply({
                    content: 'The specified time has already passed. Please choose a future time.',
                    ephemeral: true
                });
                return;
            }

            // Create event key
            const eventKey = `${guildId}-${channelId}-${this.config.mealType}-${mealTime!.toDateString()}`;
            
            // Check for existing event in cache first
            if (BaseDiningCommand.eventCache.has(eventKey)) {
                await interaction.reply({
                    content: `There's already an active ${this.config.name.toLowerCase()} event in this channel for that day!`,
                    ephemeral: true
                });
                return;
            }

            // Create event in database
            const eventId = await diningEventService.createDiningEvent(
                eventKey, creator, guildId, channelId, this.config.mealType,
                diningHallOption || 'unspecified', diningEventService.getMSTNow(), mealTime!
            );

            if (!eventId) {
                await interaction.reply({
                    content: `Failed to create ${this.config.name.toLowerCase()} event. Please try again.`,
                    ephemeral: true
                });
                return;
            }

            // Create event state in cache
            const eventState: EventState = {
                eventKey,
                creator,
                mealType: this.config.mealType,
                mealTime: mealTime!,
                diningHall: diningHallOption,
                attendees: new Set([creator.id]),
                declined: new Set()
            };

            BaseDiningCommand.eventCache.set(eventKey, eventState);

            await this.createEvent(interaction, eventState);

        } catch (error) {
            await this.handleError(interaction, error);
        }
    }

    private async createEvent(interaction: CommandInteraction, eventState: EventState): Promise<void> {
        const { embed, buttons } = this.buildEventMessage(eventState, eventState.creator.id);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });

        const message = await interaction.fetchReply();
        eventState.messageId = message.id;

        // Set up timeout for meal time
        const now = diningEventService.getMSTNow();
        const timeoutDuration = Math.min(Math.max(eventState.mealTime.getTime() - now.getTime(), 1000), 24 * 60 * 60 * 1000);

        eventState.timeoutId = setTimeout(async () => {
            await this.handleMealTimeReached(interaction, eventState);
        }, timeoutDuration);

        // Set up button collector
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: timeoutDuration
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            await this.handleButtonClick(buttonInteraction, eventState, interaction);
        });

        collector.on('end', () => {
            if (eventState.timeoutId) {
                clearTimeout(eventState.timeoutId);
            }
        });
    }

    private async handleButtonClick(
        buttonInteraction: ButtonInteraction,
        eventState: EventState,
        originalInteraction: CommandInteraction
    ): Promise<void> {
        const userId = buttonInteraction.user.id;
        const customId = buttonInteraction.customId;

        try {
            if (customId === `${this.config.mealType}_yes`) {
                // Ensure user is only in one state
                eventState.attendees.add(userId);
                eventState.declined.delete(userId);
                console.log(`User ${userId} set to attending. Attendees: ${Array.from(eventState.attendees)}, Declined: ${Array.from(eventState.declined)}`);
                
                await diningEventService.addParticipant(
                    await this.getEventId(eventState.eventKey), userId, buttonInteraction.user.username, 'attendee'
                );

            } else if (customId === `${this.config.mealType}_no`) {
                // Ensure user is only in one state
                eventState.declined.add(userId);
                eventState.attendees.delete(userId);
                console.log(`User ${userId} set to declined. Attendees: ${Array.from(eventState.attendees)}, Declined: ${Array.from(eventState.declined)}`);
                
                await diningEventService.addParticipant(
                    await this.getEventId(eventState.eventKey), userId, buttonInteraction.user.username, 'declined'
                );

            } else if (customId === `${this.config.mealType}_select_hall`) {
                if (userId !== eventState.creator.id) {
                    await buttonInteraction.reply({
                        content: 'Only the event creator can select the dining hall.',
                        ephemeral: true
                    });
                    return;
                }

                // Just show dining hall selection - don't change attendance status

                await this.showDiningHallSelection(buttonInteraction, eventState, originalInteraction);
                return;

            } else if (customId === `${this.config.mealType}_cancel`) {
                if (userId !== eventState.creator.id) {
                    await buttonInteraction.reply({
                        content: `Only the event creator can cancel this ${this.config.name.toLowerCase()} event.`,
                        ephemeral: true
                    });
                    return;
                }

                await this.cancelEvent(buttonInteraction, eventState);
                return;
            }

            // Update message with new state - always build buttons for the creator's perspective
            const { embed, buttons } = this.buildEventMessage(eventState, eventState.creator.id);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

            await buttonInteraction.update({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error handling button click:', error);
            if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                await buttonInteraction.reply({
                    content: 'An error occurred processing your request. Please try again.',
                    ephemeral: true
                });
            }
        }
    }

    private async showDiningHallSelection(
        interaction: ButtonInteraction,
        eventState: EventState,
        originalInteraction: CommandInteraction
    ): Promise<void> {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${this.config.mealType}_hall_select`)
            .setPlaceholder('Choose a dining hall...')
            .addOptions([
                { label: 'Barrett', value: 'barrett', description: 'Barrett Dining Hall' },
                { label: 'Manzi', value: 'manzi', description: 'Manzi Dining Hall' },
                { label: 'Hassay', value: 'hassay', description: 'Hassay Dining Hall' },
                { label: 'Tooker', value: 'tooker', description: 'Tooker House Dining' },
                { label: 'MU (Pitchforks)', value: 'mu', description: 'Memorial Union (Pitchforks)' },
                { label: 'HIDA', value: 'hida', description: 'HIDA Dining Hall' }
            ]);

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.update({
            embeds: [this.buildEventMessage(eventState, eventState.creator.id).embed],
            components: [selectRow]
        });

        const selectCollector = interaction.message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000
        });

        selectCollector.on('collect', async (selectInteraction: StringSelectMenuInteraction) => {
            if (selectInteraction.user.id !== eventState.creator.id) {
                await selectInteraction.reply({
                    content: 'Only the event creator can select the dining hall.',
                    ephemeral: true
                });
                return;
            }

            eventState.diningHall = selectInteraction.values[0];
            
            // Update database
            await this.updateEventDiningHall(eventState.eventKey, eventState.diningHall);

            const { embed, buttons } = this.buildEventMessage(eventState, eventState.creator.id);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

            await selectInteraction.update({
                embeds: [embed],
                components: [row]
            });
        });

        selectCollector.on('end', async (_, reason) => {
            if (reason === 'time') {
                const { embed, buttons } = this.buildEventMessage(eventState, eventState.creator.id);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
                
                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }
        });
    }

    private buildEventMessage(eventState: EventState, currentUserId: string): { embed: EmbedBuilder, buttons: ButtonBuilder[] } {
        const mstMealTime = diningEventService.toMST(eventState.mealTime);
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

        // Build title based on dining hall selection
        let titleText: string;
        if (eventState.diningHall && eventState.diningHall !== 'unspecified') {
            const diningHall = DINING_HALLS[eventState.diningHall as keyof typeof DINING_HALLS];
            titleText = `**${this.config.name} @ ${diningHall.name} at ${timeString}**`;
        } else {
            titleText = `**${this.config.name} at ${timeString}**`;
        }

        const embed = new EmbedBuilder()
            .setColor(this.config.color)
            .setDescription(`${titleText}\n(${dateString})\n\n${this.config.description}`)
            .addFields(
                {
                    name: `${this.config.emoji} Attending`,
                    value: eventState.attendees.size > 0 
                        ? Array.from(eventState.attendees).map(userId => `<@${userId}>`).join('\n')
                        : '\u200B',
                    inline: true
                },
                {
                    name: '❌ Can\'t Make It',
                    value: eventState.declined.size > 0
                        ? Array.from(eventState.declined).map(userId => `<@${userId}>`).join('\n')
                        : '\u200B',
                    inline: true
                }
            );

        // Build buttons based on current user and state
        const buttons = [
            new ButtonBuilder()
                .setCustomId(`${this.config.mealType}_yes`)
                .setEmoji(this.config.emoji)
                .setLabel('Attending')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`${this.config.mealType}_no`)
                .setEmoji('❌')
                .setLabel('Erm, Naur')
                .setStyle(ButtonStyle.Secondary)
        ];

        // Only show "Select Dining Hall" button to creator and only if no hall is selected
        if (currentUserId === eventState.creator.id && (!eventState.diningHall || eventState.diningHall === 'unspecified')) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`${this.config.mealType}_select_hall`)
                    .setEmoji('🍽️')
                    .setLabel('Choose Dining Hall')
                    .setStyle(ButtonStyle.Success)
            );
        }

        buttons.push(
            new ButtonBuilder()
                .setCustomId(`${this.config.mealType}_cancel`)
                .setLabel('Cancel Event')
                .setStyle(ButtonStyle.Danger)
        );

        return { embed, buttons };
    }

    private async cancelEvent(interaction: ButtonInteraction, eventState: EventState): Promise<void> {
        await diningEventService.cancelDiningEvent(eventState.eventKey);
        
        if (eventState.timeoutId) {
            clearTimeout(eventState.timeoutId);
        }
        
        BaseDiningCommand.eventCache.delete(eventState.eventKey);

        await interaction.update({
            content: `${this.config.name} event has been cancelled.`,
            embeds: [],
            components: []
        });

        setTimeout(async () => {
            try {
                await interaction.message.delete();
            } catch (error) {
                console.warn('Could not delete cancelled event message:', error);
            }
        }, 3000);
    }

    private async handleMealTimeReached(interaction: CommandInteraction, eventState: EventState): Promise<void> {
        const channel = interaction.channel as TextChannel;
        
        try {
            const diningHall = eventState.diningHall && eventState.diningHall !== 'unspecified'
                ? DINING_HALLS[eventState.diningHall as keyof typeof DINING_HALLS]
                : { name: 'a dining hall' };

            if (eventState.attendees.size <= 1) {
                await channel.send(`Womp womp, nobody wanted to get ${this.config.name.toLowerCase()} with <@${eventState.creator.id}> at ${diningHall.name}. Event cancelled!`);
            } else {
                const attendeesList = Array.from(eventState.attendees).map(userId => `<@${userId}>`).join(' ');
                await channel.send(`${this.config.name} time at ${diningHall.name}! ${attendeesList}`);
            }
        } catch (error) {
            console.error('Error sending meal time notification:', error);
        }

        // Clean up
        await diningEventService.completeDiningEvent(eventState.eventKey);
        BaseDiningCommand.eventCache.delete(eventState.eventKey);

        try {
            const message = await interaction.fetchReply();
            await message.delete();
        } catch (error) {
            console.warn('Could not delete completed event message:', error);
        }
    }

    private async parseDateTime(dateInput: string | undefined, timeInput: string): Promise<{
        success: boolean;
        error?: string;
        mealTime?: Date;
    }> {
        try {
            const targetDate = diningEventService.parseDate(dateInput);
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

    private async getEventId(eventKey: string): Promise<number> {
        // Quick database lookup for event ID
        const { data } = await (await import('../../services/database')).db.getClient()
            .from('dining_events')
            .select('id')
            .eq('event_key', eventKey)
            .eq('status', 'active')
            .single();
        
        return data?.id || 0;
    }

    private async updateEventDiningHall(eventKey: string, diningHall: string): Promise<void> {
        try {
            const { db } = await import('../../services/database');
            await db.getClient()
                .from('dining_events')
                .update({ dining_hall: diningHall })
                .eq('event_key', eventKey)
                .eq('status', 'active');
        } catch (error) {
            console.error('Error updating event dining hall:', error);
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
        // Clear all timeouts and cache for this meal type
        for (const [eventKey, eventState] of BaseDiningCommand.eventCache.entries()) {
            if (eventState.mealType === this.config.mealType) {
                if (eventState.timeoutId) {
                    clearTimeout(eventState.timeoutId);
                }
                BaseDiningCommand.eventCache.delete(eventKey);
            }
        }
        diningEventService.cleanup();
    }
}