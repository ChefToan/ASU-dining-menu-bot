export enum BetType {
    Number = 'number',
    Red = 'red',
    Black = 'black',
    Odd = 'odd',
    Even = 'even',
    Low = 'low',      // 1-18
    High = 'high',    // 19-36
    Dozen1 = 'dozen1', // 1-12
    Dozen2 = 'dozen2', // 13-24
    Dozen3 = 'dozen3', // 25-36
    Column1 = 'column1', // 1,4,7,10,13,16,19,22,25,28,31,34
    Column2 = 'column2', // 2,5,8,11,14,17,20,23,26,29,32,35
    Column3 = 'column3'  // 3,6,9,12,15,18,21,24,27,30,33,36
}

export interface RouletteResult {
    number: number;
    color: 'red' | 'black' | 'green';
    won: boolean;
    payout: number;
    winAmount: number;
    pityApplied: boolean;
    pityBonusPercentage: number;
    losingStreak: number;
}

class RouletteGame {
    private readonly RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    private readonly BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

    // Payout ratios (x:1)
    private readonly PAYOUTS = {
        [BetType.Number]: 35,    // 35:1
        [BetType.Red]: 1,         // 1:1
        [BetType.Black]: 1,       // 1:1
        [BetType.Odd]: 1,         // 1:1
        [BetType.Even]: 1,        // 1:1
        [BetType.Low]: 1,         // 1:1
        [BetType.High]: 1,        // 1:1
        [BetType.Dozen1]: 2,      // 2:1
        [BetType.Dozen2]: 2,      // 2:1
        [BetType.Dozen3]: 2,      // 2:1
        [BetType.Column1]: 2,     // 2:1
        [BetType.Column2]: 2,     // 2:1
        [BetType.Column3]: 2      // 2:1
    };

    // Maximum bet size that can receive any pity benefits
    private readonly MAX_PITY_BET_SIZE = 200;

    // Consolation prizes for all bet types (no forced wins, just small bonuses)
    // Only applies to bets ≤ MAX_PITY_BET_SIZE
    private readonly CONSOLATION_THRESHOLDS: Record<number, number> = {
        5: 25,   // 5 losses = t$t25
        10: 50,  // 10 losses = t$t50  
        15: 75,  // 15 losses = t$t75 (reduced from 100)
        25: 100  // 25 losses = t$t100 (reduced from 200)
    };

    /**
     * Spin the roulette wheel
     */
    spin(): { number: number; color: 'red' | 'black' | 'green' } {
        const number = Math.floor(Math.random() * 37); // 0-36
        let color: 'red' | 'black' | 'green';

        if (number === 0) {
            color = 'green';
        } else if (this.RED_NUMBERS.includes(number)) {
            color = 'red';
        } else {
            color = 'black';
        }

        return { number, color };
    }

    /**
     * Check if a bet wins
     */
    checkWin(betType: BetType, betValue: string | number, spinResult: { number: number; color: string }): boolean {
        const { number } = spinResult;

        // Handle 0 - only wins on specific number bet
        if (number === 0) {
            return betType === BetType.Number && parseInt(betValue.toString()) === 0;
        }

        switch (betType) {
            case BetType.Number:
                return number === parseInt(betValue.toString());

            case BetType.Red:
                return this.RED_NUMBERS.includes(number);

            case BetType.Black:
                return this.BLACK_NUMBERS.includes(number);

            case BetType.Odd:
                return number % 2 === 1;

            case BetType.Even:
                return number % 2 === 0;

            case BetType.Low:
                return number >= 1 && number <= 18;

            case BetType.High:
                return number >= 19 && number <= 36;

            case BetType.Dozen1:
                return number >= 1 && number <= 12;

            case BetType.Dozen2:
                return number >= 13 && number <= 24;

            case BetType.Dozen3:
                return number >= 25 && number <= 36;

            case BetType.Column1:
                return number % 3 === 1;

            case BetType.Column2:
                return number % 3 === 2;

            case BetType.Column3:
                return number % 3 === 0;

            default:
                return false;
        }
    }

    /**
     * Calculate pity bonus with anti-exploitation measures
     * Only consolation prizes, no guaranteed wins or forced results
     */
    calculatePityBonus(losingStreak: number, betAmount: number, betType: BetType, userBalance?: number, averageRecentBetSize?: number): { bonusChance: number; flatBonus: number; maxBetForBonus: number; consolationPrize: number } {
        let pityResult = { bonusChance: 0, flatBonus: 0, maxBetForBonus: 0, consolationPrize: 0 };

        // Only give consolation prizes for reasonable bet sizes
        if (betAmount <= this.MAX_PITY_BET_SIZE && losingStreak >= 5) {
            const consolationThresholds = Object.keys(this.CONSOLATION_THRESHOLDS)
                .map(k => parseInt(k))
                .sort((a, b) => b - a);
            
            for (const threshold of consolationThresholds) {
                if (losingStreak >= threshold) {
                    let baseConsolation = this.CONSOLATION_THRESHOLDS[threshold];
                    
                    // Anti-exploitation measures:
                    
                    // 1. Scale with bet amount to prevent tiny bet farming
                    const betSizeMultiplier = Math.min(betAmount / 100, 1.0); // Max 1x multiplier at 100+ bet
                    baseConsolation = Math.floor(baseConsolation * betSizeMultiplier);
                    
                    // 2. Scale inversely with user balance to prevent rich player abuse
                    if (userBalance && userBalance > 1000) {
                        const balanceReduction = Math.min((userBalance - 1000) / 10000, 0.8); // Max 80% reduction
                        baseConsolation = Math.floor(baseConsolation * (1 - balanceReduction));
                    }
                    
                    // 3. Scale with average bet size during streak to prevent manipulation
                    if (averageRecentBetSize && averageRecentBetSize < betAmount * 0.5) {
                        const manipulationPenalty = 0.5; // 50% reduction for streak building
                        baseConsolation = Math.floor(baseConsolation * manipulationPenalty);
                    }
                    
                    // Minimum consolation of 5 to prevent it from going to 0
                    pityResult.consolationPrize = Math.max(baseConsolation, 5);
                    break;
                }
            }
        }
        
        return pityResult;
    }

    /**
     * Apply pity system to spin result - NO FORCED WINS, only consolation prizes
     */
    applyPitySystem(
        betType: BetType, 
        betValue: string | number, 
        originalResult: { number: number; color: 'red' | 'black' | 'green' },
        pityBonus: { bonusChance: number; flatBonus: number; maxBetForBonus: number; consolationPrize: number }
    ): { result: { number: number; color: 'red' | 'black' | 'green' }; forced: boolean } {
        // No forced wins - pity system only provides consolation prizes
        // The spin result is always natural and unmodified
        return { result: originalResult, forced: false };
    }

    /**
     * Generate a favorable result for the given bet
     */
    generateFavorableResult(betType: BetType, betValue: string | number): { number: number; color: 'red' | 'black' | 'green' } {
        let favorableNumbers: number[] = [];

        switch (betType) {
            case BetType.Number:
                return this.getNumberDetails(parseInt(betValue.toString()));
            case BetType.Red:
                favorableNumbers = this.RED_NUMBERS;
                break;
            case BetType.Black:
                favorableNumbers = this.BLACK_NUMBERS;
                break;
            case BetType.Odd:
                favorableNumbers = Array.from({length: 36}, (_, i) => i + 1).filter(n => n % 2 === 1);
                break;
            case BetType.Even:
                favorableNumbers = Array.from({length: 36}, (_, i) => i + 1).filter(n => n % 2 === 0);
                break;
            case BetType.Low:
                favorableNumbers = Array.from({length: 18}, (_, i) => i + 1);
                break;
            case BetType.High:
                favorableNumbers = Array.from({length: 18}, (_, i) => i + 19);
                break;
            case BetType.Dozen1:
                favorableNumbers = Array.from({length: 12}, (_, i) => i + 1);
                break;
            case BetType.Dozen2:
                favorableNumbers = Array.from({length: 12}, (_, i) => i + 13);
                break;
            case BetType.Dozen3:
                favorableNumbers = Array.from({length: 12}, (_, i) => i + 25);
                break;
            case BetType.Column1:
                favorableNumbers = Array.from({length: 12}, (_, i) => (i * 3) + 1);
                break;
            case BetType.Column2:
                favorableNumbers = Array.from({length: 12}, (_, i) => (i * 3) + 2);
                break;
            case BetType.Column3:
                favorableNumbers = Array.from({length: 12}, (_, i) => (i * 3) + 3);
                break;
        }

        const randomIndex = Math.floor(Math.random() * favorableNumbers.length);
        const number = favorableNumbers[randomIndex];
        return this.getNumberDetails(number);
    }

    /**
     * Get number details (color)
     */
    getNumberDetails(number: number): { number: number; color: 'red' | 'black' | 'green' } {
        let color: 'red' | 'black' | 'green';
        
        if (number === 0) {
            color = 'green';
        } else if (this.RED_NUMBERS.includes(number)) {
            color = 'red';
        } else {
            color = 'black';
        }

        return { number, color };
    }

    /**
     * Play a round of roulette with exploit-proof pity system
     */
    play(betType: BetType, betValue: string | number, betAmount: number, losingStreak: number = 0, userBalance?: number): RouletteResult {
        const originalSpinResult = this.spin();
        const pityBonus = this.calculatePityBonus(losingStreak, betAmount, betType, userBalance);
        
        const { result: finalResult, forced: pityForced } = this.applyPitySystem(
            betType, 
            betValue, 
            originalSpinResult, 
            pityBonus
        );

        const won = this.checkWin(betType, betValue, finalResult);
        const payout = this.PAYOUTS[betType];
        
        let winAmount = 0;
        if (won) {
            // Calculate base win amount
            winAmount = betAmount * (payout + 1); // +1 to include original bet
        }

        // Always add consolation prize if applicable (regardless of win/loss)
        if (pityBonus.consolationPrize > 0) {
            winAmount += pityBonus.consolationPrize;
        }

        return {
            number: finalResult.number,
            color: finalResult.color,
            won,
            payout,
            winAmount,
            pityApplied: pityBonus.consolationPrize > 0, // Only true when consolation prize given
            pityBonusPercentage: 0, // No win chance bonuses anymore
            losingStreak
        };
    }

    /**
     * Get color emoji
     */
    getColorEmoji(color: 'red' | 'black' | 'green'): string {
        switch (color) {
            case 'red': return '🔴';
            case 'black': return '⚫';
            case 'green': return '🟢';
        }
    }

    /**
     * Get bet type display name
     */
    getBetTypeDisplay(betType: BetType, betValue?: string | number): string {
        switch (betType) {
            case BetType.Number:
                return `Number ${betValue}`;
            case BetType.Red:
                return 'Red';
            case BetType.Black:
                return 'Black';
            case BetType.Odd:
                return 'Odd';
            case BetType.Even:
                return 'Even';
            case BetType.Low:
                return 'Low (1-18)';
            case BetType.High:
                return 'High (19-36)';
            case BetType.Dozen1:
                return '1st Dozen (1-12)';
            case BetType.Dozen2:
                return '2nd Dozen (13-24)';
            case BetType.Dozen3:
                return '3rd Dozen (25-36)';
            case BetType.Column1:
                return '1st Column';
            case BetType.Column2:
                return '2nd Column';
            case BetType.Column3:
                return '3rd Column';
            default:
                return 'Unknown';
        }
    }

    /**
     * Validate bet type string
     */
    isValidBetType(type: string): type is BetType {
        return Object.values(BetType).includes(type as BetType);
    }
}

// Create singleton instance
const rouletteGame = new RouletteGame();

export default rouletteGame;