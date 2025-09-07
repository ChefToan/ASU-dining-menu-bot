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
            // TEMP DEBUG LOGGING
            const now = new Date();
            console.log(`[WeeklyReportScheduler] DEBUG - Check called at: ${now.toISOString()}`);
            
            if (this.shouldSendReport()) {
                console.log('[WeeklyReportScheduler] Time matches! Sending reports...');
                await this.sendWeeklyReports();
            } else {
                console.log('[WeeklyReportScheduler] DEBUG - Time does not match, not sending reports');
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
        
        // TEMP DEBUG LOGGING
        console.log('[WeeklyReportScheduler] DEBUG - Time comparison:');
        console.log(`[WeeklyReportScheduler] DEBUG - Server UTC time: ${now.toISOString()}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Arizona time string: ${now.toLocaleString("en-US", {timeZone: "America/Phoenix"})}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Arizona Date object: ${arizonaTime.toISOString()}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Day: ${day} (0=Sunday), Hour: ${hour}, Minute: ${minute}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Is Sunday: ${day === 0}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Is noon (12:00): ${hour === 12 && minute === 0}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Is evening (23:30): ${hour === 23 && minute === 30}`);
        
        // Only on Sundays
        if (day !== 0) return false;
        
        // Check if it's 12:00 PM (noon) or 11:30 PM
        const isNoon = hour === 12 && minute === 0;
        const isEvening = hour === 12 && minute === 20;
        
        const shouldSend = isNoon || isEvening;
        console.log(`[WeeklyReportScheduler] DEBUG - Should send report: ${shouldSend}`);
        
        return shouldSend;
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
        
        // TEMPORARILY COMMENTED OUT - Send to production server
        // const productionRoleId = env.getOptional('PRODUCTION_CA_ROLE_ID');
        // const productionServerId = env.getOptional('PRODUCTION_SERVER_ID');
        // const productionChannelId = env.getOptional('PRODUCTION_CHANNEL_ID');
        // const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        // if (!productionRoleId || !productionServerId || !productionChannelId || !weeklyReportUrl) {
        //     console.error('[WeeklyReportScheduler] Missing required environment variables for weekly report');
        //     return;
        // }
        
        // const productionMessage = `<@&${productionRoleId}> Weekly Report Reminder! (${messageNumber})
        // Weekly Report Link: ${weeklyReportUrl}`;
        // await this.sendToChannel(productionChannelId, productionServerId, productionMessage);

        // console.log(`[WeeklyReportScheduler] Weekly report (${messageNumber}) sent to PRODUCTION SERVER`);

        // Send to test server instead
        const testRoleId = env.getOptional('TEST_CA_ROLE_ID');
        const testServerId = env.getOptional('TEST_SERVER_ID');
        const testChannelId = env.getOptional('TEST_CHANNEL_ID');
        const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        // TEMP DEBUG LOGGING
        console.log('[WeeklyReportScheduler] DEBUG - Environment variables:');
        console.log(`[WeeklyReportScheduler] DEBUG - TEST_CA_ROLE_ID: ${testRoleId ? 'SET' : 'MISSING'}`);
        console.log(`[WeeklyReportScheduler] DEBUG - TEST_SERVER_ID: ${testServerId ? 'SET' : 'MISSING'}`);
        console.log(`[WeeklyReportScheduler] DEBUG - TEST_CHANNEL_ID: ${testChannelId ? 'SET' : 'MISSING'}`);
        console.log(`[WeeklyReportScheduler] DEBUG - WEEKLY_REPORT_SURVEY_URL: ${weeklyReportUrl ? 'SET' : 'MISSING'}`);
        
        if (!testRoleId || !testServerId || !testChannelId || !weeklyReportUrl) {
            console.error('[WeeklyReportScheduler] Missing required environment variables for weekly report (test server)');
            return;
        }
        
        const testMessage = `<@&${testRoleId}> Weekly Report Reminder! (${messageNumber}) [TEST SERVER]
Weekly Report Link: ${weeklyReportUrl}`;
        
        console.log(`[WeeklyReportScheduler] DEBUG - About to send message to test server`);
        console.log(`[WeeklyReportScheduler] DEBUG - Channel: ${testChannelId}, Server: ${testServerId}`);
        console.log(`[WeeklyReportScheduler] DEBUG - Message: ${testMessage}`);
        
        await this.sendToChannel(testChannelId, testServerId, testMessage);

        console.log(`[WeeklyReportScheduler] Weekly report (${messageNumber}) sent to TEST SERVER`);
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
     * Manually trigger a test message (sends to test server)
     */
    async sendTestMessage(): Promise<void> {
        console.log('[WeeklyReportScheduler] Sending manual test message...');
        // TEMPORARILY COMMENTED OUT - Send to production server
        // const productionRoleId = env.getOptional('PRODUCTION_CA_ROLE_ID');
        // const productionServerId = env.getOptional('PRODUCTION_SERVER_ID');
        // const productionChannelId = env.getOptional('PRODUCTION_CHANNEL_ID');
        // const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        // if (!productionRoleId || !productionServerId || !productionChannelId || !weeklyReportUrl) {
        //     console.error('[WeeklyReportScheduler] Missing required environment variables for test message');
        //     return;
        // }
        
        // const testMessage = `<@&${productionRoleId}> Weekly Report Reminder! (MANUAL TEST)
        // Weekly Report Link: ${weeklyReportUrl}`;

        // await this.sendToChannel(productionChannelId, productionServerId, testMessage);
        // console.log('[WeeklyReportScheduler] Manual test message sent to production');

        // Send to test server instead
        const testRoleId = env.getOptional('TEST_CA_ROLE_ID');
        const testServerId = env.getOptional('TEST_SERVER_ID');
        const testChannelId = env.getOptional('TEST_CHANNEL_ID');
        const weeklyReportUrl = env.getOptional('WEEKLY_REPORT_SURVEY_URL');
        
        if (!testRoleId || !testServerId || !testChannelId || !weeklyReportUrl) {
            console.error('[WeeklyReportScheduler] Missing required environment variables for test message (test server)');
            return;
        }
        
        const testMessage = `<@&${testRoleId}> Weekly Report Reminder! (MANUAL TEST) [TEST SERVER]
Weekly Report Link: ${weeklyReportUrl}`;

        await this.sendToChannel(testChannelId, testServerId, testMessage);
        console.log('[WeeklyReportScheduler] Manual test message sent to test server');
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