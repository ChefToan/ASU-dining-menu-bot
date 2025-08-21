import { db } from './database';
import { BetType } from '../utils/rouletteGame';
import { errorHandler } from '../utils/errorHandler';

export interface RouletteGameResult {
    id?: number;
    userId: string;
    username?: string;
    betType: string;
    betValue?: string;
    betAmount: number;
    resultNumber: number;
    resultColor: string;
    won: boolean;
    winAmount: number;
    payoutRatio: number;
    balanceBefore: number;
    balanceAfter: number;
    pityApplied?: boolean;
    pityBonusPercentage?: number;
    losingStreak?: number;
    playedAt: Date;
}

export interface GameStats {
    totalGames: number;
    totalWon: number;
    totalLost: number;
    totalAmountBet: number;
    totalAmountWon: number;
    winRate: number;
    netProfit: number;
}

export class RouletteService {
    async recordGame(gameResult: Omit<RouletteGameResult, 'id' | 'playedAt'>): Promise<number | null> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .insert({
                    user_id: gameResult.userId,
                    username: gameResult.username,
                    bet_type: gameResult.betType,
                    bet_value: gameResult.betValue,
                    bet_amount: gameResult.betAmount,
                    result_number: gameResult.resultNumber,
                    result_color: gameResult.resultColor,
                    won: gameResult.won,
                    win_amount: gameResult.winAmount,
                    payout_ratio: gameResult.payoutRatio,
                    balance_before: gameResult.balanceBefore,
                    balance_after: gameResult.balanceAfter,
                    pity_applied: gameResult.pityApplied || false,
                    pity_bonus_percentage: gameResult.pityBonusPercentage || 0,
                    losing_streak: gameResult.losingStreak || 0
                })
                .select('id')
                .single();

            if (error) throw error;
            return data.id;
        } catch (error) {
            errorHandler.handleServiceError(error, 'rouletteService.recordGame');
            return null;
        }
    }

    async getUserStats(userId: string): Promise<GameStats> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('*')
                .eq('user_id', userId);

            if (error || !data) {
                return this.getEmptyStats();
            }

            const totalGames = data.length;
            const totalWon = data.filter(game => game.won).length;
            const totalLost = totalGames - totalWon;
            const totalAmountBet = data.reduce((sum, game) => sum + game.bet_amount, 0);
            const totalAmountWon = data.reduce((sum, game) => sum + game.win_amount, 0);
            const winRate = totalGames > 0 ? (totalWon / totalGames) * 100 : 0;
            const netProfit = totalAmountWon - totalAmountBet;

            return {
                totalGames,
                totalWon,
                totalLost,
                totalAmountBet,
                totalAmountWon,
                winRate,
                netProfit
            };
        } catch (error) {
            errorHandler.handleServiceError(error, 'rouletteService.getUserStats');
            return this.getEmptyStats();
        }
    }

    async getRecentGames(userId: string, limit: number = 10): Promise<RouletteGameResult[]> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('*')
                .eq('user_id', userId)
                .order('played_at', { ascending: false })
                .limit(limit);

            if (error || !data) return [];

            return data.map(game => ({
                id: game.id,
                userId: game.user_id,
                username: game.username || undefined,
                betType: game.bet_type,
                betValue: game.bet_value || undefined,
                betAmount: game.bet_amount,
                resultNumber: game.result_number,
                resultColor: game.result_color,
                won: game.won,
                winAmount: game.win_amount,
                payoutRatio: game.payout_ratio,
                balanceBefore: game.balance_before,
                balanceAfter: game.balance_after,
                playedAt: new Date(game.played_at)
            }));
        } catch (error) {
            console.error('Error getting recent games:', error);
            return [];
        }
    }

    async getGlobalStats(): Promise<GameStats & { totalPlayers: number }> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('*');

            if (error || !data) {
                return { ...this.getEmptyStats(), totalPlayers: 0 };
            }

            const totalGames = data.length;
            const totalWon = data.filter(game => game.won).length;
            const totalLost = totalGames - totalWon;
            const totalAmountBet = data.reduce((sum, game) => sum + game.bet_amount, 0);
            const totalAmountWon = data.reduce((sum, game) => sum + game.win_amount, 0);
            const winRate = totalGames > 0 ? (totalWon / totalGames) * 100 : 0;
            const netProfit = totalAmountWon - totalAmountBet;
            const totalPlayers = new Set(data.map(game => game.user_id)).size;

            return {
                totalGames,
                totalWon,
                totalLost,
                totalAmountBet,
                totalAmountWon,
                winRate,
                netProfit,
                totalPlayers
            };
        } catch (error) {
            console.error('Error getting global stats:', error);
            return { ...this.getEmptyStats(), totalPlayers: 0 };
        }
    }

    async getTopWinners(limit: number = 10): Promise<Array<{
        userId: string;
        username: string | null;
        totalWinnings: number;
        gamesPlayed: number;
        winRate: number;
    }>> {
        try {
            const { data, error } = await db.getClient()
                .rpc('get_top_winners', { winner_limit: limit });

            if (error || !data) return [];

            return data;
        } catch (error) {
            console.error('Error getting top winners:', error);
            
            // Fallback: calculate manually
            try {
                const { data: allGames, error: gamesError } = await db.getClient()
                    .from('roulette_games')
                    .select('user_id, username, won, win_amount');

                if (gamesError || !allGames) return [];

                const userStats = new Map<string, {
                    username: string | null;
                    totalWinnings: number;
                    gamesPlayed: number;
                    gamesWon: number;
                }>();

                allGames.forEach(game => {
                    const existing = userStats.get(game.user_id) || {
                        username: game.username,
                        totalWinnings: 0,
                        gamesPlayed: 0,
                        gamesWon: 0
                    };

                    existing.gamesPlayed++;
                    existing.totalWinnings += game.win_amount;
                    if (game.won) existing.gamesWon++;

                    userStats.set(game.user_id, existing);
                });

                return Array.from(userStats.entries())
                    .map(([userId, stats]) => ({
                        userId,
                        username: stats.username,
                        totalWinnings: stats.totalWinnings,
                        gamesPlayed: stats.gamesPlayed,
                        winRate: stats.gamesPlayed > 0 ? (stats.gamesWon / stats.gamesPlayed) * 100 : 0
                    }))
                    .sort((a, b) => b.totalWinnings - a.totalWinnings)
                    .slice(0, limit);
            } catch (fallbackError) {
                console.error('Error in fallback top winners calculation:', fallbackError);
                return [];
            }
        }
    }

    async getBetTypeStats(): Promise<Array<{
        betType: string;
        count: number;
        winRate: number;
        totalBet: number;
        totalWon: number;
    }>> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('bet_type, won, bet_amount, win_amount');

            if (error || !data) return [];

            const betTypeStats = new Map<string, {
                count: number;
                wins: number;
                totalBet: number;
                totalWon: number;
            }>();

            data.forEach(game => {
                const existing = betTypeStats.get(game.bet_type) || {
                    count: 0,
                    wins: 0,
                    totalBet: 0,
                    totalWon: 0
                };

                existing.count++;
                existing.totalBet += game.bet_amount;
                existing.totalWon += game.win_amount;
                if (game.won) existing.wins++;

                betTypeStats.set(game.bet_type, existing);
            });

            return Array.from(betTypeStats.entries())
                .map(([betType, stats]) => ({
                    betType,
                    count: stats.count,
                    winRate: stats.count > 0 ? (stats.wins / stats.count) * 100 : 0,
                    totalBet: stats.totalBet,
                    totalWon: stats.totalWon
                }))
                .sort((a, b) => b.count - a.count);
        } catch (error) {
            console.error('Error getting bet type stats:', error);
            return [];
        }
    }

    async getCurrentLosingStreak(userId: string): Promise<number> {
        try {
            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('won')
                .eq('user_id', userId)
                .order('played_at', { ascending: false })
                .limit(50); // Check last 50 games for streak

            if (error || !data || data.length === 0) {
                return 0;
            }

            let streak = 0;
            for (const game of data) {
                if (game.won) {
                    break; // Streak broken
                }
                streak++;
            }

            return streak;
        } catch (error) {
            console.error('Error getting losing streak:', error);
            return 0;
        }
    }

    async getDailyStats(userId: string): Promise<GameStats> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const { data, error } = await db.getClient()
                .from('roulette_games')
                .select('*')
                .eq('user_id', userId)
                .gte('played_at', today.toISOString())
                .lt('played_at', tomorrow.toISOString());

            if (error || !data) {
                return this.getEmptyStats();
            }

            const totalGames = data.length;
            const totalWon = data.filter(game => game.won).length;
            const totalLost = totalGames - totalWon;
            const totalAmountBet = data.reduce((sum, game) => sum + game.bet_amount, 0);
            const totalAmountWon = data.reduce((sum, game) => sum + game.win_amount, 0);
            const winRate = totalGames > 0 ? (totalWon / totalGames) * 100 : 0;
            const netProfit = totalAmountWon - totalAmountBet;

            return {
                totalGames,
                totalWon,
                totalLost,
                totalAmountBet,
                totalAmountWon,
                winRate,
                netProfit
            };
        } catch (error) {
            console.error('Error getting daily stats:', error);
            return this.getEmptyStats();
        }
    }

    private getEmptyStats(): GameStats {
        return {
            totalGames: 0,
            totalWon: 0,
            totalLost: 0,
            totalAmountBet: 0,
            totalAmountWon: 0,
            winRate: 0,
            netProfit: 0
        };
    }
}

export const rouletteService = new RouletteService();