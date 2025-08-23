import { db } from './database';
import { User } from 'discord.js';

export interface DiningEventData {
    id?: number;
    eventKey: string;
    creator: User;
    guildId: string;
    channelId: string;
    messageId?: string;
    mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner' | 'brunch';
    diningHall: string;
    startTime: Date;
    mealTime: Date;
    status: 'active' | 'completed' | 'cancelled';
    attendees: Map<string, User>;
    declined: Map<string, User>;
}

export interface DiningEventParticipant {
    userId: string;
    username: string;
    participantType: 'attendee' | 'declined';
}

export class DiningEventService {
    // Store active timeout references
    private timeouts = new Map<string, NodeJS.Timeout>();

    async createDiningEvent(
        eventKey: string,
        creator: User,
        guildId: string,
        channelId: string,
        mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner' | 'brunch',
        diningHall: string,
        startTime: Date,
        mealTime: Date,
        messageId?: string
    ): Promise<number | null> {
        try {
            // First, clean up any expired events with the same key
            await this.cleanupExpiredEvents(eventKey);

            const { data, error } = await db.getClient()
                .from('dining_events')
                .insert({
                    event_key: eventKey,
                    creator_id: creator.id,
                    guild_id: guildId,
                    channel_id: channelId,
                    message_id: messageId,
                    meal_type: mealType,
                    dining_hall: diningHall,
                    start_time: startTime.toISOString(),
                    meal_time: mealTime.toISOString(),
                    status: 'active'
                })
                .select('id')
                .single();

            if (error) throw error;

            // Add creator as initial attendee
            await this.addParticipant(data.id, creator.id, creator.username, 'attendee');

            return data.id;
        } catch (error) {
            const { errorHandler } = await import('../utils/errorHandler');
            errorHandler.handleServiceError(error, 'diningEventService.createDiningEvent');
            return null;
        }
    }

    async getDiningEvent(eventKey: string): Promise<DiningEventData | null> {
        try {
            const { data: event, error: eventError } = await db.getClient()
                .from('dining_events')
                .select('*')
                .eq('event_key', eventKey)
                .eq('status', 'active')
                .single();

            if (eventError || !event) return null;

            // Get participants
            const { data: participants, error: participantsError } = await db.getClient()
                .from('dining_event_participants')
                .select('*')
                .eq('dining_event_id', event.id);

            if (participantsError) {
                console.error('Error fetching participants:', participantsError);
                return null;
            }

            const attendees = new Map<string, User>();
            const declined = new Map<string, User>();

            participants?.forEach(p => {
                const user = {
                    id: p.user_id,
                    username: p.username || 'Unknown'
                } as User;

                if (p.participant_type === 'attendee') {
                    attendees.set(p.user_id, user);
                } else {
                    declined.set(p.user_id, user);
                }
            });

            return {
                id: event.id,
                eventKey: event.event_key,
                creator: { id: event.creator_id } as User,
                guildId: event.guild_id,
                channelId: event.channel_id,
                messageId: event.message_id || undefined,
                mealType: event.meal_type,
                diningHall: event.dining_hall,
                startTime: new Date(event.start_time),
                mealTime: new Date(event.meal_time),
                status: event.status,
                attendees,
                declined
            };
        } catch (error) {
            console.error('Error getting dining event:', error);
            return null;
        }
    }

    async updateDiningEventMessage(eventKey: string, messageId: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('dining_events')
                .update({ message_id: messageId })
                .eq('event_key', eventKey)
                .eq('status', 'active');

            return !error;
        } catch (error) {
            console.error('Error updating dining event message:', error);
            return false;
        }
    }

    async addParticipant(eventId: number, userId: string, username: string, type: 'attendee' | 'declined'): Promise<boolean> {
        try {
            // Remove existing participation (if any)
            await db.getClient()
                .from('dining_event_participants')
                .delete()
                .eq('dining_event_id', eventId)
                .eq('user_id', userId);

            // Add new participation
            const { error } = await db.getClient()
                .from('dining_event_participants')
                .insert({
                    dining_event_id: eventId,
                    user_id: userId,
                    username: username,
                    participant_type: type
                });

            return !error;
        } catch (error) {
            console.error('Error adding participant:', error);
            return false;
        }
    }

    async removeParticipant(eventId: number, userId: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('dining_event_participants')
                .delete()
                .eq('dining_event_id', eventId)
                .eq('user_id', userId);

            return !error;
        } catch (error) {
            console.error('Error removing participant:', error);
            return false;
        }
    }

    async cancelDiningEvent(eventKey: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('dining_events')
                .update({ status: 'cancelled' })
                .eq('event_key', eventKey)
                .eq('status', 'active');

            // Clear timeout if exists
            const timeout = this.timeouts.get(eventKey);
            if (timeout) {
                clearTimeout(timeout);
                this.timeouts.delete(eventKey);
            }

            // Delete the cancelled event after a short delay to allow for immediate recreation
            if (!error) {
                setTimeout(async () => {
                    await db.getClient()
                        .from('dining_events')
                        .delete()
                        .eq('event_key', eventKey)
                        .eq('status', 'cancelled');
                }, 5000); // 5 second delay
            }

            return !error;
        } catch (error) {
            console.error('Error cancelling dining event:', error);
            return false;
        }
    }

    async completeDiningEvent(eventKey: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('dining_events')
                .update({ status: 'completed' })
                .eq('event_key', eventKey)
                .eq('status', 'active');

            // Clear timeout if exists
            const timeout = this.timeouts.get(eventKey);
            if (timeout) {
                clearTimeout(timeout);
                this.timeouts.delete(eventKey);
            }

            // Delete the completed event after a short delay to allow for immediate recreation
            if (!error) {
                setTimeout(async () => {
                    await db.getClient()
                        .from('dining_events')
                        .delete()
                        .eq('event_key', eventKey)
                        .eq('status', 'completed');
                }, 5000); // 5 second delay
            }

            return !error;
        } catch (error) {
            console.error('Error completing dining event:', error);
            return false;
        }
    }

    async diningEventExists(eventKey: string): Promise<boolean> {
        try {
            const { data, error } = await db.getClient()
                .from('dining_events')
                .select('id')
                .eq('event_key', eventKey)
                .eq('status', 'active')
                .limit(1);

            return !error && data && data.length > 0;
        } catch (error) {
            console.error('Error checking if dining event exists:', error);
            return false;
        }
    }

    async cleanupExpiredEvents(eventKey?: string): Promise<boolean> {
        try {
            const now = new Date();
            
            // First, delete any cancelled or completed events with the same event_key (if specified)
            if (eventKey) {
                await db.getClient()
                    .from('dining_events')
                    .delete()
                    .eq('event_key', eventKey)
                    .in('status', ['cancelled', 'completed']);
            }

            // Then mark expired active events as completed
            let query = db.getClient()
                .from('dining_events')
                .update({ status: 'completed' })
                .lt('meal_time', now.toISOString())
                .eq('status', 'active');

            // If specific event key provided, only clean up that one
            if (eventKey) {
                query = query.eq('event_key', eventKey);
            }

            const { error } = await query;

            if (error) {
                console.error('Error cleaning up expired dining events:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error cleaning up expired dining events:', error);
            return false;
        }
    }

    // Timeout management for in-memory operations
    setTimeout(eventKey: string, callback: () => void, ms: number): void {
        const timeout = setTimeout(callback, ms);
        this.timeouts.set(eventKey, timeout);
    }

    clearTimeout(eventKey: string): void {
        const timeout = this.timeouts.get(eventKey);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(eventKey);
        }
    }

    cleanup(): void {
        // Clear all timeouts
        for (const [key, timeout] of this.timeouts.entries()) {
            clearTimeout(timeout);
            this.timeouts.delete(key);
        }
    }

    // Helper method to parse date from string (MM/DD/YYYY format)
    parseDate(dateStr?: string): Date {
        if (!dateStr) {
            return new Date(); // Return today if no date provided
        }

        // Validate date format MM/DD/YYYY
        const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!dateMatch) {
            throw new Error('Invalid date format. Please use MM/DD/YYYY format.');
        }

        const [, month, day, year] = dateMatch;
        const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        // Validate that the date is valid
        if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date. Please provide a valid date.');
        }

        return parsedDate;
    }

    // Helper method to parse time from string (12hr or 24hr format) and apply to specific date
    parseTime(timeStr: string, baseDate: Date = new Date()): Date | null {
        try {
            const time = timeStr.toLowerCase().trim();
            
            // Handle 12-hour format (e.g., "2:30pm", "11:00 am")
            const twelveHourMatch = time.match(/^(\d{1,2}):?(\d{0,2})\s*(am|pm)$/);
            if (twelveHourMatch) {
                let [, hourStr, minuteStr, period] = twelveHourMatch;
                let hour = parseInt(hourStr);
                const minute = parseInt(minuteStr || '0');
                
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
                
                // Create date specifically in Phoenix timezone
                return this.createPhoenixDate(baseDate, hour, minute);
            }
            
            // Handle 24-hour format (e.g., "14:30", "09:00")
            const twentyFourHourMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (twentyFourHourMatch) {
                const [, hourStr, minuteStr] = twentyFourHourMatch;
                const hour = parseInt(hourStr);
                const minute = parseInt(minuteStr);
                
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    // Create date specifically in Phoenix timezone
                    return this.createPhoenixDate(baseDate, hour, minute);
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    // Helper method to create a date in Phoenix timezone
    private createPhoenixDate(baseDate: Date, hour: number, minute: number): Date {
        // Get the date components in Phoenix timezone
        const phoenixDateStr = baseDate.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"}); // YYYY-MM-DD format
        const phoenixTimeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        
        // Create ISO string for Phoenix timezone
        const isoString = `${phoenixDateStr}T${phoenixTimeStr}.000-07:00`; // MST is UTC-7
        
        return new Date(isoString);
    }

    // Helper method to convert any date to MST (GMT-7)
    toMST(date: Date): Date {
        // Get the date/time components in Phoenix timezone
        const phoenixDateStr = date.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"});
        const phoenixTimeStr = date.toLocaleTimeString("en-GB", {timeZone: "America/Phoenix", hour12: false});
        
        // Create ISO string for Phoenix timezone (MST is UTC-7)
        const isoString = `${phoenixDateStr}T${phoenixTimeStr}.000-07:00`;
        
        return new Date(isoString);
    }

    // Helper method to get current MST time
    getMSTNow(): Date {
        return this.toMST(new Date());
    }

    // Validate if time is within meal period
    isValidMealTime(mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner' | 'brunch', timeDate: Date): boolean {
        // Get the time components in Phoenix timezone
        const phoenixDate = new Date(timeDate.toLocaleString("en-US", {timeZone: "America/Phoenix"}));
        const hour = phoenixDate.getHours();
        const minute = phoenixDate.getMinutes();
        const dayOfWeek = phoenixDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const timeInMinutes = hour * 60 + minute;

        switch (mealType) {
            case 'breakfast':
                // Mon-Fri 7:00AM - 11:00AM
                // if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                //     return timeInMinutes >= 7 * 60 && timeInMinutes < 11 * 60;
                // }
                // return false;
                return true;

            case 'brunch':
                // Sat-Sun 10:00AM - 2:00PM
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    return timeInMinutes >= 10 * 60 && timeInMinutes < 14 * 60;
                }
                return false;

            case 'lunch':
                // Mon-Fri 11:00AM - 2:00PM
                if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    return timeInMinutes >= 11 * 60 && timeInMinutes < 14 * 60;
                }
                return false;

            case 'light_lunch':
                // Mon-Sun 2:00PM - 4:30PM
                return timeInMinutes >= 14 * 60 && timeInMinutes < 16.5 * 60;

            case 'dinner':
                // Mon-Thu 4:30PM - 9:00PM
                // Fri-Sat 4:30PM - 7:00PM  
                // Sun 4:30PM - 8:00PM
                if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Monday-Thursday
                    return timeInMinutes >= 16.5 * 60 && timeInMinutes <= 21 * 60;
                } else if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday-Saturday
                    return timeInMinutes >= 16.5 * 60 && timeInMinutes <= 19 * 60;
                } else { // Sunday
                    return timeInMinutes >= 16.5 * 60 && timeInMinutes <= 20 * 60;
                }

            default:
                return false;
        }
    }

    // Get meal time validation error message
    getMealTimeErrorMessage(mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner' | 'brunch', timeInput: string): string {
        switch (mealType) {
            case 'breakfast':
            case 'brunch':
                return `Invalid time "${timeInput}". Brunch is only available Saturday-Sunday from 10:00 AM to 2:00 PM.`;
            case 'lunch':
                return `Invalid time "${timeInput}". Lunch is only available Monday-Friday from 11:00 AM to 2:00 PM.`;
            case 'light_lunch':
                return `Invalid time "${timeInput}". Light lunch is available Monday-Sunday from 2:00 PM to 4:30 PM.`;
            case 'dinner':
                return `Invalid time "${timeInput}". Dinner is available Monday-Thursday 4:30 PM-9:00 PM, Friday-Saturday 4:30 PM-7:00 PM, Sunday 4:30 PM-8:00 PM.`;
            default:
                return 'Invalid meal type.';
        }
    }
}

export const diningEventService = new DiningEventService();