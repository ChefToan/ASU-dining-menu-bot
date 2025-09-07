import { Client, TextChannel } from 'discord.js';
import { env } from '../utils/env';

export class WeeklyReportScheduler {
    private client: Client;
    private schedulerInterval?: NodeJS.Timeout;
    private checkInterval = 60 * 1000; // Check every minute
    
    constructor(client: Client) {
        this.client = client;
    }

    /**
     * Start the weekly report scheduler
     */
    start(): void {
        console.log('[WeeklyReportScheduler] Starting weekly report scheduler...');
        
        // Check immediately and then every minute
        this.checkAndSendReports();
        this.schedulerInterval = setInterval(() => {
            this.checkAndSendReports();
        }, this.checkInterval);
        
        console.log('[WeeklyReportScheduler] Weekly report scheduler started - checking every minute');
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = undefined;
        }
        console.log('[WeeklyReportScheduler] Scheduler stopped');
    }

    /**
     * Check if it's time to send reports and send them
     */
    private async checkAndSendReports(): Promise<void> {
        try {
            if (this.shouldSendReport()) {
                console.log('[WeeklyReportScheduler] Time matches! Sending reports...');
                await this.sendWeeklyReports();
            }
        } catch (error) {
            console.error('[WeeklyReportScheduler] Error checking/sending reports:', error);
        }
    }

    /**
     * Check if we should send the weekly report right now
     * Returns true if it's Sunday at 12:00 PM or 11:30 PM Arizona time
     */
    private shouldSendReport(): boolean {
        const now = new Date();
        
        // Get current Arizona date/time
        const arizonaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Phoenix"}));
        const day = arizonaTime.getDay(); // 0 = Sunday
        const hour = arizonaTime.getHours();
        const minute = arizonaTime.getMinutes();
        
        // Only on Sundays
        if (day !== 0) return false;
        
        // Check if it's 12:00 PM (noon) or 11:30 PM
        const isNoon = hour === 12 && minute === 0;
        const isEvening = hour === 23 && minute === 30;
        
        return isNoon || isEvening;
    }

    /**
     * Send weekly reports to the configured channels
     */
    private async sendWeeklyReports(): Promise<void> {
        console.log('[WeeklyReportScheduler] Sending weekly reports...');
        
        const now = new Date();
        const arizonaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Phoenix"}));
        const hour = arizonaTime.getHours();
        
        // Determine if this is the first (12 PM) or second (11:30 PM) message
        const messageNumber = hour === 12 ? '1/2' : '2/2';
        
        // Send to production server
        const productionRoleId = env.getOptional('PRODUCTION_CA_ROLE_ID');
        const productionServerId = env.getOptional('PRODUCTION_SERVER_ID');
        const productionChannelId = env.getOptional('PRODUCTION_CHANNEL_ID');
        const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        if (!productionRoleId || !productionServerId || !productionChannelId || !weeklyReportUrl) {
            console.error('[WeeklyReportScheduler] Missing required environment variables for weekly report');
            return;
        }
        
        const productionMessage = `<@&${productionRoleId}> Weekly Report Reminder! (${messageNumber})
Weekly Report Link: ${weeklyReportUrl}`;
        await this.sendToChannel(productionChannelId, productionServerId, productionMessage);

        console.log(`[WeeklyReportScheduler] Weekly report (${messageNumber}) sent to PRODUCTION SERVER`);
    }


    /**
     * Send message to a specific channel
     */
    private async sendToChannel(channelId: string, guildId: string, message: string): Promise<void> {
        try {
            const guild = await this.client.guilds.fetch(guildId);
            if (!guild) {
                console.error(`[WeeklyReportScheduler] Guild not found: ${guildId}`);
                return;
            }

            const channel = await guild.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                console.error(`[WeeklyReportScheduler] Text channel not found: ${channelId}`);
                return;
            }

            await (channel as TextChannel).send(message);
            console.log(`[WeeklyReportScheduler] Message sent to channel ${channelId} in guild ${guildId}`);
        } catch (error) {
            console.error(`[WeeklyReportScheduler] Error sending message to channel ${channelId}:`, error);
        }
    }

    /**
     * Manually trigger a test message (sends to production)
     */
    async sendTestMessage(): Promise<void> {
        console.log('[WeeklyReportScheduler] Sending manual test message...');
        const productionRoleId = env.getOptional('PRODUCTION_CA_ROLE_ID');
        const productionServerId = env.getOptional('PRODUCTION_SERVER_ID');
        const productionChannelId = env.getOptional('PRODUCTION_CHANNEL_ID');
        const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        if (!productionRoleId || !productionServerId || !productionChannelId || !weeklyReportUrl) {
            console.error('[WeeklyReportScheduler] Missing required environment variables for test message');
            return;
        }
        
        const testMessage = `<@&${productionRoleId}> Weekly Report Reminder! (MANUAL TEST)
Weekly Report Link: ${weeklyReportUrl}`;

        await this.sendToChannel(productionChannelId, productionServerId, testMessage);
        console.log('[WeeklyReportScheduler] Manual test message sent to production');
    }

    /**
     * Force send a test message right now (for debugging)
     */
    async forceTestMessage(): Promise<void> {
        console.log('[WeeklyReportScheduler] FORCE SENDING test message right now...');
        await this.sendWeeklyReports();
    }

    /**
     * Get next scheduled report time
     */
    getNextReportTimes(): { noon: Date, evening: Date } {
        const now = new Date();
        const nextSunday = new Date(now);
        
        // Find next Sunday
        const daysUntilSunday = (7 - now.getDay()) % 7;
        if (daysUntilSunday === 0) {
            // It's Sunday - check if we've passed both times
            const arizonaTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Phoenix"}));
            const hour = arizonaTime.getHours();
            const minute = arizonaTime.getMinutes();
            
            if (hour > 23 || (hour === 23 && minute >= 30)) {
                // Past 11:30 PM, move to next Sunday
                nextSunday.setDate(now.getDate() + 7);
            }
        } else {
            nextSunday.setDate(now.getDate() + daysUntilSunday);
        }

        // Create times in Arizona timezone
        const arizonaDateStr = nextSunday.toLocaleDateString("en-CA", {timeZone: "America/Phoenix"});
        const [year, month, day] = arizonaDateStr.split('-').map(num => parseInt(num, 10));
        
        const noonTime = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T12:00:00.000-07:00`);
        const eveningTime = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T23:30:00.000-07:00`);
        
        return {
            noon: noonTime,
            evening: eveningTime
        };
    }

    /**
     * Check if scheduler is running
     */
    isRunning(): boolean {
        return this.schedulerInterval !== undefined;
    }
}