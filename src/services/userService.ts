import { db } from './database';
import { fallbackService } from './fallbackService';

let useDatabaseFallback = false;

export interface UserBalance {
    userId: string;
    balance: number;
    lastWork: Date | null;
    bankruptcyBailoutUsed: boolean;
    username?: string;
}

export interface WorkResult {
    success: boolean;
    reward?: number;
    timeRemaining?: number;
}

export class UserService {
    private readonly WORK_COOLDOWN = 30 * 60 * 1000; // 30 minutes in milliseconds
    private readonly WORK_REWARD_MIN = 50;
    private readonly WORK_REWARD_MAX = 150;
    private readonly STARTING_BALANCE = 0;

    async getOrCreateUser(userId: string, username?: string): Promise<UserBalance> {
        try {
            const { data: existingUser, error: selectError } = await db.getClient()
                .from('users')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!selectError && existingUser) {
                return {
                    userId: existingUser.user_id,
                    balance: existingUser.balance,
                    lastWork: existingUser.last_work ? new Date(existingUser.last_work) : null,
                    bankruptcyBailoutUsed: existingUser.bankruptcy_bailout_used || false,
                    username: existingUser.username || undefined
                };
            }

            // Create new user
            const { data: newUser, error: insertError } = await db.getClient()
                .from('users')
                .insert({
                    user_id: userId,
                    username,
                    balance: this.STARTING_BALANCE
                })
                .select('*')
                .single();

            if (insertError) throw insertError;

            return {
                userId: newUser.user_id,
                balance: newUser.balance,
                lastWork: newUser.last_work ? new Date(newUser.last_work) : null,
                bankruptcyBailoutUsed: newUser.bankruptcy_bailout_used || false,
                username: newUser.username || undefined
            };
        } catch (error) {
            console.error('Error getting/creating user:', error);
            // Fallback to default user
            return {
                userId,
                balance: this.STARTING_BALANCE,
                lastWork: null,
                bankruptcyBailoutUsed: false,
                username
            };
        }
    }

    async getBalance(userId: string): Promise<number> {
        if (useDatabaseFallback) {
            return fallbackService.getBalance(userId);
        }
        
        try {
            const user = await this.getOrCreateUser(userId);
            return user.balance;
        } catch (error) {
            console.warn('Database error, using fallback for getBalance:', error);
            useDatabaseFallback = true;
            return fallbackService.getBalance(userId);
        }
    }

    async addBalance(userId: string, amount: number, username?: string): Promise<number> {
        if (useDatabaseFallback) {
            return fallbackService.addBalance(userId, amount, username);
        }
        
        try {
            const user = await this.getOrCreateUser(userId, username);
            const newBalance = user.balance + amount;

            const { error } = await db.getClient()
                .from('users')
                .update({ balance: newBalance, username })
                .eq('user_id', userId);

            if (error) throw error;
            return newBalance;
        } catch (error) {
            console.error('Error adding balance, using fallback:', error);
            useDatabaseFallback = true;
            return fallbackService.addBalance(userId, amount, username);
        }
    }

    async removeBalance(userId: string, amount: number, username?: string): Promise<boolean> {
        if (useDatabaseFallback) {
            return fallbackService.removeBalance(userId, amount, username);
        }
        
        try {
            const user = await this.getOrCreateUser(userId, username);
            
            if (user.balance < amount) {
                return false; // Insufficient funds
            }

            const newBalance = user.balance - amount;
            const { error } = await db.getClient()
                .from('users')
                .update({ balance: newBalance, username })
                .eq('user_id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error removing balance, using fallback:', error);
            useDatabaseFallback = true;
            return fallbackService.removeBalance(userId, amount, username);
        }
    }

    async canWork(userId: string): Promise<{ canWork: boolean; timeRemaining?: number; bankruptcyBailout?: boolean }> {
        try {
            const user = await this.getOrCreateUser(userId);

            // Check if user is broke and eligible for bankruptcy bailout
            if (user.balance === 0 && !user.bankruptcyBailoutUsed) {
                return { canWork: true, bankruptcyBailout: true };
            }

            if (!user.lastWork) {
                return { canWork: true };
            }

            const now = new Date();
            const timeSinceLastWork = now.getTime() - user.lastWork.getTime();

            if (timeSinceLastWork >= this.WORK_COOLDOWN) {
                return { canWork: true };
            }

            const timeRemaining = this.WORK_COOLDOWN - timeSinceLastWork;
            return { canWork: false, timeRemaining };
        } catch (error) {
            console.error('Error checking work cooldown:', error);
            return { canWork: true };
        }
    }

    async doWork(userId: string, username?: string): Promise<WorkResult> {
        if (useDatabaseFallback) {
            return fallbackService.doWork(userId, username);
        }
        
        try {
            const workCheck = await this.canWork(userId);

            if (!workCheck.canWork) {
                return { success: false, timeRemaining: workCheck.timeRemaining };
            }

            // Generate random reward
            const reward = Math.floor(Math.random() * (this.WORK_REWARD_MAX - this.WORK_REWARD_MIN + 1)) + this.WORK_REWARD_MIN;

            const user = await this.getOrCreateUser(userId, username);
            const balanceBefore = user.balance;
            const balanceAfter = balanceBefore + reward;

            // Prepare update object
            const updateData: any = {
                balance: balanceAfter, 
                last_work: new Date().toISOString(),
                username 
            };

            // If this is a bankruptcy bailout, mark it as used
            if (workCheck.bankruptcyBailout) {
                updateData.bankruptcy_bailout_used = true;
            }

            // Update user balance and last work time
            const { error: updateError } = await db.getClient()
                .from('users')
                .update(updateData)
                .eq('user_id', userId);

            if (updateError) throw updateError;

            // Record work session
            const { error: recordError } = await db.getClient()
                .from('work_sessions')
                .insert({
                    user_id: userId,
                    username,
                    reward_amount: reward,
                    balance_before: balanceBefore,
                    balance_after: balanceAfter
                });

            if (recordError) {
                console.error('Error recording work session:', recordError);
                // Don't fail the entire operation if recording fails
            }

            return { success: true, reward };
        } catch (error) {
            console.error('Error doing work, using fallback:', error);
            useDatabaseFallback = true;
            return fallbackService.doWork(userId, username);
        }
    }

    async getLeaderboard(limit: number = 10): Promise<Array<{ userId: string; username: string | null; balance: number; rank: number }>> {
        if (useDatabaseFallback) {
            return fallbackService.getLeaderboard(limit);
        }
        
        try {
            const { data, error } = await db.getClient()
                .from('user_leaderboard')
                .select('*')
                .limit(limit);

            if (error) throw error;
            
            // Map the database column names to our interface
            return (data || []).map(row => ({
                userId: row.user_id,
                username: row.username,
                balance: row.balance,
                rank: row.rank
            }));
        } catch (error) {
            console.error('Error getting leaderboard, using fallback:', error);
            useDatabaseFallback = true;
            return fallbackService.getLeaderboard(limit);
        }
    }


    async setBankruptcyBailout(userId: string): Promise<void> {
        try {
            const { error } = await db.getClient()
                .from('users')
                .update({ bankruptcy_bailout_used: false })
                .eq('user_id', userId);

            if (error) throw error;
        } catch (error) {
            console.error('Error setting bankruptcy bailout:', error);
        }
    }

    formatCurrency(amount: number): string {
        return `t$t ${amount.toLocaleString()}`;
    }

    async clearAll(): Promise<void> {
        try {
            const { error } = await db.getClient()
                .from('users')
                .delete()
                .neq('id', 0); // Delete all users

            if (error) throw error;
        } catch (error) {
            console.error('Error clearing all users:', error);
            throw error;
        }
    }
}

export const userService = new UserService();