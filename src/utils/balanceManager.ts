interface UserBalance {
    userId: string;
    balance: number;
    lastWork: Date | null;
}

class BalanceManager {
    private balances: Map<string, UserBalance>;
    private readonly WORK_COOLDOWN = 30 * 60 * 1000; // 30 minutes in milliseconds
    private readonly WORK_REWARD_MIN = 50;
    private readonly WORK_REWARD_MAX = 150;
    private readonly STARTING_BALANCE = 0;

    constructor() {
        this.balances = new Map();
    }

    /**
     * Get or create a user's balance
     */
    getBalance(userId: string): number {
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

    /**
     * Add money to a user's balance
     */
    addBalance(userId: string, amount: number): number {
        const currentBalance = this.getBalance(userId);
        const newBalance = currentBalance + amount;
        const user = this.balances.get(userId)!;
        user.balance = newBalance;
        return newBalance;
    }

    /**
     * Remove money from a user's balance
     */
    removeBalance(userId: string, amount: number): boolean {
        const currentBalance = this.getBalance(userId);
        if (currentBalance < amount) {
            return false; // Insufficient funds
        }
        const user = this.balances.get(userId)!;
        user.balance = currentBalance - amount;
        return true;
    }

    /**
     * Check if user can work (cooldown check)
     */
    canWork(userId: string): { canWork: boolean; timeRemaining?: number } {
        const user = this.balances.get(userId);

        if (!user || !user.lastWork) {
            return { canWork: true };
        }

        const now = new Date();
        const timeSinceLastWork = now.getTime() - user.lastWork.getTime();

        if (timeSinceLastWork >= this.WORK_COOLDOWN) {
            return { canWork: true };
        }

        const timeRemaining = this.WORK_COOLDOWN - timeSinceLastWork;
        return { canWork: false, timeRemaining };
    }

    /**
     * Execute work command and give reward
     */
    doWork(userId: string): { success: boolean; reward?: number; timeRemaining?: number } {
        const workCheck = this.canWork(userId);

        if (!workCheck.canWork) {
            return { success: false, timeRemaining: workCheck.timeRemaining };
        }

        // Generate random reward
        const reward = Math.floor(Math.random() * (this.WORK_REWARD_MAX - this.WORK_REWARD_MIN + 1)) + this.WORK_REWARD_MIN;

        // Update or create user
        if (!this.balances.has(userId)) {
            this.balances.set(userId, {
                userId,
                balance: reward,
                lastWork: new Date()
            });
        } else {
            const user = this.balances.get(userId)!;
            user.balance += reward;
            user.lastWork = new Date();
        }

        return { success: true, reward };
    }

    /**
     * Get leaderboard data
     */
    getLeaderboard(limit: number = 10): Array<{ userId: string; balance: number }> {
        return Array.from(this.balances.values())
            .sort((a, b) => b.balance - a.balance)
            .slice(0, limit)
            .map(user => ({ userId: user.userId, balance: user.balance }));
    }

    /**
     * Format currency for display
     */
    formatCurrency(amount: number): string {
        return `t$t ${amount.toLocaleString()}`;
    }

    /**
     * Clear all balances (for testing or reset)
     */
    clearAll(): void {
        this.balances.clear();
    }
}

// Create singleton instance
const balanceManager = new BalanceManager();

export default balanceManager;