import { db } from './database';
import { User } from 'discord.js';

export interface PodrunData {
    id?: number;
    podrunKey: string;
    creator: User;
    guildId: string;
    channelId: string;
    messageId?: string;
    startTime: Date;
    runTime: Date;
    status: 'active' | 'completed' | 'cancelled';
    podrunners: Map<string, User>;
    haters: Map<string, User>;
}

export interface PodrunParticipant {
    userId: string;
    username: string;
    participantType: 'podrunner' | 'hater';
}

export class PodrunService {
    // Store active timeout references (still needed for cleanup)
    private timeouts = new Map<string, NodeJS.Timeout>();

    async createPodrun(
        podrunKey: string,
        creator: User,
        guildId: string,
        channelId: string,
        startTime: Date,
        runTime: Date,
        messageId?: string
    ): Promise<number | null> {
        try {
            // First, clean up any old podruns with the same key
            await this.cleanupOldPodruns(podrunKey);

            const { data, error } = await db.getClient()
                .from('podruns')
                .insert({
                    podrun_key: podrunKey,
                    creator_id: creator.id,
                    guild_id: guildId,
                    channel_id: channelId,
                    message_id: messageId,
                    start_time: startTime.toISOString(),
                    run_time: runTime.toISOString(),
                    status: 'active'
                })
                .select('id')
                .single();

            if (error) throw error;

            // Add creator as initial podrunner
            await this.addParticipant(data.id, creator.id, creator.username, 'podrunner');

            return data.id;
        } catch (error) {
            console.error('Error creating podrun:', error);
            return null;
        }
    }

    async getPodrun(podrunKey: string): Promise<PodrunData | null> {
        try {
            const { data: podrun, error: podrunError } = await db.getClient()
                .from('podruns')
                .select('*')
                .eq('podrun_key', podrunKey)
                .eq('status', 'active')
                .single();

            if (podrunError || !podrun) return null;

            // Get participants
            const { data: participants, error: participantsError } = await db.getClient()
                .from('podrun_participants')
                .select('*')
                .eq('podrun_id', podrun.id);

            if (participantsError) {
                console.error('Error fetching participants:', participantsError);
                return null;
            }

            const podrunners = new Map<string, User>();
            const haters = new Map<string, User>();

            participants?.forEach(p => {
                const user = {
                    id: p.user_id,
                    username: p.username || 'Unknown'
                } as User;

                if (p.participant_type === 'podrunner') {
                    podrunners.set(p.user_id, user);
                } else {
                    haters.set(p.user_id, user);
                }
            });

            return {
                id: podrun.id,
                podrunKey: podrun.podrun_key,
                creator: { id: podrun.creator_id } as User,
                guildId: podrun.guild_id,
                channelId: podrun.channel_id,
                messageId: podrun.message_id || undefined,
                startTime: new Date(podrun.start_time),
                runTime: new Date(podrun.run_time),
                status: podrun.status,
                podrunners,
                haters
            };
        } catch (error) {
            console.error('Error getting podrun:', error);
            return null;
        }
    }

    async updatePodrunMessage(podrunKey: string, messageId: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('podruns')
                .update({ message_id: messageId })
                .eq('podrun_key', podrunKey)
                .eq('status', 'active');

            return !error;
        } catch (error) {
            console.error('Error updating podrun message:', error);
            return false;
        }
    }

    async addParticipant(podrunId: number, userId: string, username: string, type: 'podrunner' | 'hater'): Promise<boolean> {
        try {
            // Remove existing participation (if any)
            await db.getClient()
                .from('podrun_participants')
                .delete()
                .eq('podrun_id', podrunId)
                .eq('user_id', userId);

            // Add new participation
            const { error } = await db.getClient()
                .from('podrun_participants')
                .insert({
                    podrun_id: podrunId,
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

    async removeParticipant(podrunId: number, userId: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('podrun_participants')
                .delete()
                .eq('podrun_id', podrunId)
                .eq('user_id', userId);

            return !error;
        } catch (error) {
            console.error('Error removing participant:', error);
            return false;
        }
    }

    async cancelPodrun(podrunKey: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('podruns')
                .update({ status: 'cancelled' })
                .eq('podrun_key', podrunKey)
                .eq('status', 'active');

            // Clear timeout if exists
            const timeout = this.timeouts.get(podrunKey);
            if (timeout) {
                clearTimeout(timeout);
                this.timeouts.delete(podrunKey);
            }

            return !error;
        } catch (error) {
            console.error('Error cancelling podrun:', error);
            return false;
        }
    }

    async completePodrun(podrunKey: string): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('podruns')
                .update({ status: 'completed' })
                .eq('podrun_key', podrunKey)
                .eq('status', 'active');

            // Clear timeout if exists
            const timeout = this.timeouts.get(podrunKey);
            if (timeout) {
                clearTimeout(timeout);
                this.timeouts.delete(podrunKey);
            }

            return !error;
        } catch (error) {
            console.error('Error completing podrun:', error);
            return false;
        }
    }

    async podrunExists(podrunKey: string): Promise<boolean> {
        try {
            const { data, error } = await db.getClient()
                .from('podruns')
                .select('id')
                .eq('podrun_key', podrunKey)
                .eq('status', 'active')
                .limit(1);

            return !error && data && data.length > 0;
        } catch (error) {
            console.error('Error checking if podrun exists:', error);
            return false;
        }
    }

    async cleanupOldPodruns(podrunKey?: string): Promise<boolean> {
        try {
            // Find podruns to clean up: either expired OR cancelled/completed (non-active)
            let cleanupPodrunsQuery = db.getClient()
                .from('podruns')
                .select('id')
                .or(`run_time.lt.${new Date().toISOString()},status.neq.active`);

            if (podrunKey) {
                cleanupPodrunsQuery = cleanupPodrunsQuery.eq('podrun_key', podrunKey);
            }

            const { data: cleanupPodruns, error: selectError } = await cleanupPodrunsQuery;

            if (selectError) {
                console.error('Error finding podruns to clean up:', selectError);
                return false;
            }

            if (!cleanupPodruns || cleanupPodruns.length === 0) {
                return true; // No podruns to clean up
            }

            const cleanupPodrunIds = cleanupPodruns.map(p => p.id);

            // Delete participants of podruns to be cleaned up
            const { error: participantsError } = await db.getClient()
                .from('podrun_participants')
                .delete()
                .in('podrun_id', cleanupPodrunIds);

            if (participantsError) {
                console.error('Error deleting podrun participants:', participantsError);
                // Continue anyway to try to delete the podruns themselves
            }

            // Then delete the podruns themselves (expired OR non-active)
            let deleteQuery = db.getClient()
                .from('podruns')
                .delete()
                .or(`run_time.lt.${new Date().toISOString()},status.neq.active`);

            if (podrunKey) {
                deleteQuery = deleteQuery.eq('podrun_key', podrunKey);
            }

            const { error } = await deleteQuery;

            if (error) {
                console.error('Error cleaning up podruns:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error cleaning up podruns:', error);
            return false;
        }
    }

    async getActivePodrunsForGuild(guildId: string): Promise<PodrunData[]> {
        try {
            const { data, error } = await db.getClient()
                .from('active_podruns_summary')
                .select('*')
                .eq('guild_id', guildId)
                .eq('status', 'active');

            if (error || !data) return [];

            return data.map(p => ({
                id: p.id,
                podrunKey: p.podrun_key,
                creator: { id: p.creator_id } as User,
                guildId: p.guild_id,
                channelId: p.channel_id,
                messageId: p.message_id || undefined,
                startTime: new Date(p.start_time),
                runTime: new Date(p.run_time),
                status: 'active' as const,
                podrunners: new Map(), // Would need additional query to populate
                haters: new Map()      // Would need additional query to populate
            }));
        } catch (error) {
            console.error('Error getting active podruns:', error);
            return [];
        }
    }

    // Timeout management for in-memory operations
    setTimeout(podrunKey: string, callback: () => void, ms: number): void {
        const timeout = setTimeout(callback, ms);
        this.timeouts.set(podrunKey, timeout);
    }

    clearTimeout(podrunKey: string): void {
        const timeout = this.timeouts.get(podrunKey);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(podrunKey);
        }
    }

    cleanup(): void {
        // Clear all timeouts
        for (const [key, timeout] of this.timeouts.entries()) {
            clearTimeout(timeout);
            this.timeouts.delete(key);
        }
    }
}

export const podrunService = new PodrunService();