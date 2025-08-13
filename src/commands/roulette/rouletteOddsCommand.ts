import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors
} from 'discord.js';
import { rouletteService } from '../../services/rouletteService';

export const data = new SlashCommandBuilder()
    .setName('roulette-odds')
    .setDescription('Show exact probabilities and payout information for roulette bets');

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const userId = interaction.user.id;
        
        // Get user's current losing streak for pity system info
        const losingStreak = await rouletteService.getCurrentLosingStreak(userId);
        
        // Calculate pity bonus manually based on new balanced system
        let pityBonus = { bonusChance: 0, flatBonus: 0, maxBetForBonus: 0 };
        if (losingStreak >= 20) {
            pityBonus = { bonusChance: 100, flatBonus: 0, maxBetForBonus: 1000 };
        } else if (losingStreak >= 15) {
            pityBonus = { bonusChance: 40, flatBonus: 200, maxBetForBonus: 500 };
        } else if (losingStreak >= 10) {
            pityBonus = { bonusChance: 25, flatBonus: 100, maxBetForBonus: 200 };
        } else if (losingStreak >= 5) {
            pityBonus = { bonusChance: 15, flatBonus: 50, maxBetForBonus: 100 };
        }

        const oddsEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🎰 Roulette Odds & Payouts')
            .setDescription('Exact probabilities and payout information for all bet types')
            .addFields(
                { 
                    name: '🔴 Red/Black & ⚫ Odd/Even', 
                    value: '**Win Chance:** 18/37 = 48.65%\n**Payout:** 1:1 (Double your bet)\n**House Edge:** 2.70%', 
                    inline: true 
                },
                { 
                    name: '🔢 Low (1-18) & High (19-36)', 
                    value: '**Win Chance:** 18/37 = 48.65%\n**Payout:** 1:1 (Double your bet)\n**House Edge:** 2.70%', 
                    inline: true 
                },
                { 
                    name: '🎯 Specific Number (0-36)', 
                    value: '**Win Chance:** 1/37 = 2.70%\n**Payout:** 35:1 (36x your bet)\n**House Edge:** 2.70%', 
                    inline: true 
                },
                { 
                    name: '🎲 Dozens (1-12, 13-24, 25-36)', 
                    value: '**Win Chance:** 12/37 = 32.43%\n**Payout:** 2:1 (Triple your bet)\n**House Edge:** 2.70%', 
                    inline: true 
                },
                { 
                    name: '📊 Columns (1st, 2nd, 3rd)', 
                    value: '**Win Chance:** 12/37 = 32.43%\n**Payout:** 2:1 (Triple your bet)\n**House Edge:** 2.70%', 
                    inline: true 
                },
                { 
                    name: '🟢 Zero (0)', 
                    value: '**Special:** House wins on all bets except direct number bets\n**Frequency:** 1/37 = 2.70%', 
                    inline: true 
                }
            );

        // Add pity system information if user has losing streak
        if (losingStreak > 0 && pityBonus.bonusChance > 0) {
            let pityInfo = '';
            if (pityBonus.bonusChance >= 100) {
                pityInfo = `🍀 **Guaranteed Win!** Your next bet is guaranteed to win due to your ${losingStreak} losing streak.`;
            } else {
                pityInfo = `🍀 **Pity System Active!** +${pityBonus.bonusChance}% win chance on your next bet`;
                if (pityBonus.flatBonus > 0) {
                    pityInfo += ` with +t$t${pityBonus.flatBonus} bonus (for bets ≤t$t${pityBonus.maxBetForBonus})`;
                }
                pityInfo += ` (${losingStreak} losing streak)`;
            }
            oddsEmbed.addFields({ name: 'Your Current Status', value: pityInfo, inline: false });
        }

        oddsEmbed.addFields(
            { 
                name: '💡 Pity System Explained', 
                value: '• 5 losses: +15% win chance + t$t50 bonus (bets ≤t$t100)\n• 10 losses: +25% win chance + t$t100 bonus (bets ≤t$t200)\n• 15 losses: +40% win chance + t$t200 bonus (bets ≤t$t500)\n• 20+ losses: Guaranteed win (no bonus)', 
                inline: false 
            },
            { 
                name: 'ℹ️ Additional Info',
                value: '• Minimum bet: t$t 10\n• Use -1 for ALL-IN bets\n• All users start with t$t 0\n• Use `/pay` to transfer money to other users\n• Use `/work` to earn t$t every 30 minutes\n• **Bankruptcy Bailout:** If you have t$t 0, you get a one-time special work session',
                inline: false 
            }
        );

        oddsEmbed.setFooter({ text: 'Remember: The house always has a 2.70% edge on all bets!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [oddsEmbed] });

    } catch (error) {
        console.error('Error executing roulette-odds command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error retrieving odds information.')
            .setTimestamp();

        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (replyError) {
            console.error('Could not send error message:', replyError);
        }
    }
}