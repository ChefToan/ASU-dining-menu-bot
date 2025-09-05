import { db } from './database';
import { errorHandler } from '../utils/errorHandler';

export interface MenuCommandContext {
    id?: number;
    message_id: string;
    dining_hall: string;
    original_date: string; // Format: YYYY-MM-DD
    guild_id: string;
    channel_id: string;
    user_id: string;
    created_at?: string;
    expires_at: string;
}

export class MenuCommandContextService {
    // Context expires after 1 week
    private static readonly CONTEXT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    /**
     * Store menu command context for persistent refresh functionality
     */
    static async storeContext(
        messageId: string,
        diningHall: string,
        originalDate: string,
        guildId: string,
        channelId: string,
        userId: string
    ): Promise<boolean> {
        try {
            const expiresAt = new Date(Date.now() + this.CONTEXT_TTL).toISOString();
            
            const { error } = await db.getClient()
                .from('menu_command_contexts')
                .insert({
                    message_id: messageId,
                    dining_hall: diningHall,
                    original_date: originalDate,
                    guild_id: guildId,
                    channel_id: channelId,
                    user_id: userId,
                    expires_at: expiresAt
                });

            if (error) {
                console.error('[MenuContext] Error storing context:', error);
                return false;
            }

            console.log(`[MenuContext] Stored context for message ${messageId}, dining hall: ${diningHall}, date: ${originalDate}`);
            return true;
        } catch (error) {
            console.error('[MenuContext] Error storing context:', error);
            return false;
        }
    }

    /**
     * Get menu command context by message ID
     */
    static async getContext(messageId: string): Promise<MenuCommandContext | null> {
        try {
            const { data, error } = await db.getClient()
                .from('menu_command_contexts')
                .select('*')
                .eq('message_id', messageId)
                .gt('expires_at', new Date().toISOString())
                .single();

            if (error || !data) {
                console.log(`[MenuContext] No valid context found for message ${messageId}`);
                return null;
            }

            console.log(`[MenuContext] Retrieved context for message ${messageId}`);
            return data as MenuCommandContext;
        } catch (error) {
            console.error('[MenuContext] Error retrieving context:', error);
            return null;
        }
    }

    /**
     * Update message ID for a context (when refresh creates new message)
     */
    static async updateMessageId(oldMessageId: string, newMessageId: string): Promise<boolean> {
        try {
            // Get the existing context
            const existingContext = await this.getContext(oldMessageId);
            if (!existingContext) {
                return false;
            }

            // Delete old context
            await db.getClient()
                .from('menu_command_contexts')
                .delete()
                .eq('message_id', oldMessageId);

            // Insert new context with same data but new message ID
            const { error } = await db.getClient()
                .from('menu_command_contexts')
                .insert({
                    message_id: newMessageId,
                    dining_hall: existingContext.dining_hall,
                    original_date: existingContext.original_date,
                    guild_id: existingContext.guild_id,
                    channel_id: existingContext.channel_id,
                    user_id: existingContext.user_id,
                    expires_at: existingContext.expires_at
                });

            if (error) {
                console.error('[MenuContext] Error updating message ID:', error);
                return false;
            }

            console.log(`[MenuContext] Updated context message ID from ${oldMessageId} to ${newMessageId}`);
            return true;
        } catch (error) {
            console.error('[MenuContext] Error updating message ID:', error);
            return false;
        }
    }

    /**
     * Check if a date is today (in MST timezone)
     */
    static isDateToday(dateString: string): boolean {
        const today = new Date();
        // Convert to MST (UTC-7) - Arizona doesn't observe daylight saving
        const mstOffset = -7 * 60; // MST is UTC-7
        const mstToday = new Date(today.getTime() + (mstOffset * 60 * 1000));
        
        // Format today in both formats for comparison
        const todayISO = mstToday.toISOString().split('T')[0]; // YYYY-MM-DD format
        const todayUS = `${mstToday.getMonth() + 1}/${mstToday.getDate()}/${mstToday.getFullYear()}`; // M/D/YYYY format
        
        // Handle both date formats
        const normalizedDate = this.normalizeDateString(dateString);
        const normalizedToday = this.normalizeDateString(todayUS);
        
        console.log(`[MenuContext] Date comparison: input="${dateString}" normalized="${normalizedDate}", today="${todayUS}" normalized="${normalizedToday}"`);
        
        return normalizedDate === normalizedToday || dateString === todayISO;
    }

    /**
     * Normalize date string to consistent format for comparison
     */
    private static normalizeDateString(dateString: string): string {
        // Handle MM/DD/YYYY or M/D/YYYY format
        if (dateString.includes('/')) {
            const [month, day, year] = dateString.split('/');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        }
        // Handle YYYY-MM-DD format - convert to M/D/YYYY
        if (dateString.includes('-') && dateString.length === 10) {
            const [year, month, day] = dateString.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        }
        return dateString;
    }

    /**
     * Determine if we should use cache or API for this date
     */
    static shouldUseCache(originalDate: string): boolean {
        return this.isDateToday(originalDate);
    }

    /**
     * Clean up expired contexts
     */
    static async cleanupExpired(): Promise<number> {
        try {
            const now = new Date().toISOString();
            
            // Get count first for logging
            const { count } = await db.getClient()
                .from('menu_command_contexts')
                .select('*', { count: 'exact', head: true })
                .lt('expires_at', now);

            if (!count || count === 0) {
                console.log('[MenuContext] No expired contexts to clean up');
                return 0;
            }

            // Delete expired contexts
            const { error } = await db.getClient()
                .from('menu_command_contexts')
                .delete()
                .lt('expires_at', now);

            if (error) {
                console.error('[MenuContext] Error during cleanup:', error);
                return 0;
            }

            console.log(`[MenuContext] Cleaned up ${count} expired contexts`);
            return count;
        } catch (error) {
            console.error('[MenuContext] Error during cleanup:', error);
            return 0;
        }
    }

    /**
     * Get context statistics
     */
    static async getStats(): Promise<{ total: number; expired: number }> {
        try {
            const now = new Date().toISOString();
            
            const [totalResult, expiredResult] = await Promise.all([
                db.getClient()
                    .from('menu_command_contexts')
                    .select('*', { count: 'exact', head: true }),
                    
                db.getClient()
                    .from('menu_command_contexts')
                    .select('*', { count: 'exact', head: true })
                    .lt('expires_at', now)
            ]);

            return {
                total: totalResult.count || 0,
                expired: expiredResult.count || 0
            };
        } catch (error) {
            console.error('[MenuContext] Error getting stats:', error);
            return { total: 0, expired: 0 };
        }
    }

    /**
     * Clear all menu command contexts
     */
    static async clearAll(): Promise<boolean> {
        try {
            const { error } = await db.getClient()
                .from('menu_command_contexts')
                .delete()
                .neq('id', 0); // Delete all rows

            if (error) {
                console.error('[MenuContext] Error clearing all contexts:', error);
                return false;
            }

            console.log('[MenuContext] All menu command contexts cleared');
            return true;
        } catch (error) {
            console.error('[MenuContext] Error clearing all contexts:', error);
            return false;
        }
    }
}

export const menuCommandContextService = MenuCommandContextService;