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
     * Play a round of roulette
     */
    play(betType: BetType, betValue: string | number, betAmount: number): RouletteResult {
        const spinResult = this.spin();
        const won = this.checkWin(betType, betValue, spinResult);
        const payout = this.PAYOUTS[betType];
        const winAmount = won ? betAmount * (payout + 1) : 0; // +1 to include original bet

        return {
            number: spinResult.number,
            color: spinResult.color as 'red' | 'black' | 'green',
            won,
            payout,
            winAmount
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