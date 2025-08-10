// Fallback service for when database is unavailable
// This maintains the original in-memory functionality as a backup

import { User } from 'discord.js';

interface UserBalance {
    userId: string;
    balance: number;
    lastWork: Date | null;
    username?: string;
}

interface FallbackPodrun {
    creator: User;
    podrunners: Map<string, User>;
    haters: Map<string, User>;
    timeout: NodeJS.Timeout;
    startTime: Date;
    runTime: Date;
    isCancelled: boolean;
}

class FallbackService {
    // In-memory storage for fallback mode
    private balances = new Map<string, UserBalance>();
    private activePodruns = new Map<string, FallbackPodrun>();
    private cache = new Map<string, { data: any; expires: Date }>();

    private readonly WORK_COOLDOWN = 30 * 60 * 1000; // 30 minutes
    private readonly WORK_REWARD_MIN = 50;
    private readonly WORK_REWARD_MAX = 150;
    private readonly STARTING_BALANCE = 0;

    // User service fallbacks
    async getBalance(userId: string): Promise<number> {
        const user = this.balances.get(userId);
        if (!user) {
            this.balances.set(userId, {
                userId,
                balance: this.STARTING_BALANCE,
                lastWork: null
            });
            return this.STARTING_BALANCE;
        }
        return user.balance;
    }

    async addBalance(userId: string, amount: number, username?: string): Promise<number> {
        const currentBalance = await this.getBalance(userId);
        const newBalance = currentBalance + amount;
        const user = this.balances.get(userId)!;
        user.balance = newBalance;
        if (username) user.username = username;
        return newBalance;
    }

    async removeBalance(userId: string, amount: number, username?: string): Promise<boolean> {
        const currentBalance = await this.getBalance(userId);
        if (currentBalance < amount) return false;
        
        const user = this.balances.get(userId)!;
        user.balance = currentBalance - amount;
        if (username) user.username = username;
        return true;
    }

    async canWork(userId: string): Promise<{ canWork: boolean; timeRemaining?: number }> {
        const user = this.balances.get(userId);
        if (!user || !user.lastWork) return { canWork: true };

        const now = new Date();
        const timeSinceLastWork = now.getTime() - user.lastWork.getTime();

        if (timeSinceLastWork >= this.WORK_COOLDOWN) {
            return { canWork: true };
        }

        const timeRemaining = this.WORK_COOLDOWN - timeSinceLastWork;
        return { canWork: false, timeRemaining };
    }

    async doWork(userId: string, username?: string): Promise<{ success: boolean; reward?: number; timeRemaining?: number }> {
        const workCheck = await this.canWork(userId);
        if (!workCheck.canWork) {
            return { success: false, timeRemaining: workCheck.timeRemaining };
        }

        const reward = Math.floor(Math.random() * (this.WORK_REWARD_MAX - this.WORK_REWARD_MIN + 1)) + this.WORK_REWARD_MIN;
        
        if (!this.balances.has(userId)) {
            this.balances.set(userId, {
                userId,
                balance: reward,
                lastWork: new Date(),
                username
            });
        } else {
            const user = this.balances.get(userId)!;
            user.balance += reward;
            user.lastWork = new Date();
            if (username) user.username = username;
        }

        return { success: true, reward };
    }

    async getLeaderboard(limit: number = 10): Promise<Array<{ userId: string; username: string | null; balance: number; rank: number }>> {
        return Array.from(this.balances.values())
            .sort((a, b) => b.balance - a.balance)
            .slice(0, limit)
            .map((user, index) => ({
                userId: user.userId,
                username: user.username || null,
                balance: user.balance,
                rank: index + 1
            }));
    }

    formatCurrency(amount: number): string {
        return `t$t ${amount.toLocaleString()}`;
    }

    // Podrun service fallbacks
    async podrunExists(podrunKey: string): Promise<boolean> {
        return this.activePodruns.has(podrunKey);
    }

    async createPodrun(
        podrunKey: string,
        creator: User,
        guildId: string,
        channelId: string,
        startTime: Date,
        runTime: Date,
        messageId?: string
    ): Promise<number> {
        // In fallback mode, just return a dummy ID
        return 1;
    }

    async cancelPodrun(podrunKey: string): Promise<boolean> {
        const podrun = this.activePodruns.get(podrunKey);
        if (!podrun) return false;

        podrun.isCancelled = true;
        clearTimeout(podrun.timeout);
        this.activePodruns.delete(podrunKey);
        return true;
    }

    // Cache service fallbacks
    async getCacheEntry<T>(key: string): Promise<T | null> {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (entry.expires < new Date()) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    async setCacheEntry<T>(key: string, value: T, ttlMs: number = 30 * 60 * 1000): Promise<boolean> {
        const expires = new Date(Date.now() + ttlMs);
        this.cache.set(key, { data: value, expires });
        return true;
    }

    async clearCache(): Promise<boolean> {
        this.cache.clear();
        return true;
    }

    async getCacheStats(): Promise<{ totalEntries: number; expiredEntries: number; activeEntries: number }> {
        const now = new Date();
        let expired = 0;
        let active = 0;

        for (const entry of this.cache.values()) {
            if (entry.expires < now) {
                expired++;
            } else {
                active++;
            }
        }

        return {
            totalEntries: this.cache.size,
            expiredEntries: expired,
            activeEntries: active
        };
    }

    // Cleanup method
    cleanup(): void {
        // Clear all timeouts
        for (const [key, podrun] of this.activePodruns.entries()) {
            clearTimeout(podrun.timeout);
            this.activePodruns.delete(key);
        }

        // Clear cache
        this.cache.clear();
        
        console.log('Fallback service cleaned up');
    }

    // Status check
    getStatus(): { mode: 'fallback'; entries: { users: number; podruns: number; cache: number } } {
        return {
            mode: 'fallback',
            entries: {
                users: this.balances.size,
                podruns: this.activePodruns.size,
                cache: this.cache.size
            }
        };
    }
}

export const fallbackService = new FallbackService();