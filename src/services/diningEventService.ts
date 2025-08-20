import { db } from './database';
import { User } from 'discord.js';

export interface DiningEventData {
    id?: number;
    eventKey: string;
    creator: User;
    guildId: string;
    channelId: string;
    messageId?: string;
    mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner';
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
        mealType: 'breakfast' | 'lunch' | 'light_lunch' | 'dinner',
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
            console.error('Error creating dining event:', error);
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
            const nowMST = this.getMSTDate();
            let query = db.getClient()
                .from('dining_events')
                .update({ status: 'completed' })
                .lt('meal_time', nowMST.toISOString())
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

    // Helper method to get current MST time
    private getMSTDate(): Date {
        const now = new Date();
        // Convert to MST (UTC-7)
        const mstOffset = -7 * 60; // MST is UTC-7
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const mst = new Date(utc + (mstOffset * 60000));
        return mst;
    }

    // Helper method to convert any date to MST
    private toMST(date: Date): Date {
        const mstOffset = -7 * 60; // MST is UTC-7
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const mst = new Date(utc + (mstOffset * 60000));
        return mst;
    }

    // Helper method to parse time from string (12hr or 24hr format) in MST
    parseTime(timeStr: string, baseDate: Date = new Date()): Date | null {
        try {
            const time = timeStr.toLowerCase().trim();
            
            // Use MST base date
            const mstBaseDate = this.toMST(baseDate);
            
            // Handle 12-hour format (e.g., "2:30pm", "11:00 am")
            const twelveHourMatch = time.match(/^(\d{1,2}):?(\d{0,2})\s*(am|pm)$/);
            if (twelveHourMatch) {
                let [, hourStr, minuteStr, period] = twelveHourMatch;
                let hour = parseInt(hourStr);
                const minute = parseInt(minuteStr || '0');
                
                if (period === 'pm' && hour !== 12) hour += 12;
                if (period === 'am' && hour === 12) hour = 0;
                
                const result = new Date(mstBaseDate);
                result.setHours(hour, minute, 0, 0);
                return result;
            }
            
            // Handle 24-hour format (e.g., "14:30", "09:00")
            const twentyFourHourMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (twentyFourHourMatch) {
                const [, hourStr, minuteStr] = twentyFourHourMatch;
                const hour = parseInt(hourStr);
                const minute = parseInt(minuteStr);
                
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    const result = new Date(mstBaseDate);
                    result.setHours(hour, minute, 0, 0);
                    return result;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
}

export const diningEventService = new DiningEventService();