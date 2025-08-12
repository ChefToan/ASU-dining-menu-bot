import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction
} from 'discord.js';
import { userService } from '../../services/userService';
import { rouletteService } from '../../services/rouletteService';
import rouletteGame, { BetType } from '../../utils/rouletteGame';

export const data = new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Play roulette! Place your bets!')
    .addStringOption(option =>
        option.setName('bet_type')
            .setDescription('Type of bet to place')
            .setRequired(true)
            .addChoices(
                { name: 'Red', value: BetType.Red },
                { name: 'Black', value: BetType.Black },
                { name: 'Odd', value: BetType.Odd },
                { name: 'Even', value: BetType.Even },
                { name: 'Low (1-18)', value: BetType.Low },
                { name: 'High (19-36)', value: BetType.High },
                { name: '1st Dozen (1-12)', value: BetType.Dozen1 },
                { name: '2nd Dozen (13-24)', value: BetType.Dozen2 },
                { name: '3rd Dozen (25-36)', value: BetType.Dozen3 },
                { name: '1st Column', value: BetType.Column1 },
                { name: '2nd Column', value: BetType.Column2 },
                { name: '3rd Column', value: BetType.Column3 },
                { name: 'Specific Number', value: BetType.Number }
            )
    )
    .addIntegerOption(option =>
        option.setName('bet_amount')
            .setDescription('Amount of t$t to bet (minimum 10, or -1 for ALL-IN)')
            .setRequired(true)
            .setMinValue(-1)
    )
    .addIntegerOption(option =>
        option.setName('number')
            .setDescription('Specific number to bet on (0-36) - only if bet_type is "Specific Number"')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(36)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const username = interaction.user.username;
        const betType = interaction.options.get('bet_type')?.value as BetType;
        let betAmount = interaction.options.get('bet_amount')?.value as number;
        const specificNumber = interaction.options.get('number')?.value as number | undefined;


        // Check if user has enough balance
        const currentBalance = await userService.getBalance(userId);

        if (currentBalance === 0) {
            const noMoneyEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('💸 No Money!')
                .setDescription('You don\'t have any t$t to bet!\nUse `/work` to earn some money first.')
                .setTimestamp();

            await interaction.editReply({ embeds: [noMoneyEmbed] });
            return;
        }

        // Handle all-in bet (-1 means bet everything)
        if (betAmount === -1) {
            betAmount = currentBalance;
        } else if (betAmount < 10) {
            const tooSmallEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('💰 Minimum Bet')
                .setDescription('Minimum bet is t$t 10. Use -1 to bet everything!')
                .setTimestamp();

            await interaction.editReply({ embeds: [tooSmallEmbed] });
            return;
        }

        if (currentBalance < betAmount) {
            const insufficientFundsEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('💸 Insufficient Funds')
                .setDescription(`You don't have enough t$t to place this bet!`)
                .addFields(
                    { name: 'Your Balance', value: userService.formatCurrency(currentBalance), inline: true },
                    { name: 'Bet Amount', value: userService.formatCurrency(betAmount), inline: true }
                )
                .setFooter({ text: 'Use /work to earn more t$t' })
                .setTimestamp();

            await interaction.editReply({ embeds: [insufficientFundsEmbed] });
            return;
        }


        // Validate number bet
        if (betType === BetType.Number && specificNumber === undefined) {
            const noNumberEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Number Required')
                .setDescription('You must specify a number (0-36) when betting on a specific number!')
                .setTimestamp();

            await interaction.editReply({ embeds: [noNumberEmbed] });
            return;
        }

        // Deduct the bet amount
        const deducted = await userService.removeBalance(userId, betAmount, username);
        if (!deducted) {
            const errorEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Error')
                .setDescription('Could not process your bet. Please try again.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
            return;
        }

        // Get current losing streak and daily stats for display
        const currentLosingStreak = await rouletteService.getCurrentLosingStreak(userId);
        const dailyStats = await rouletteService.getDailyStats(userId);
        
        // Create betting embed
        const betValue = betType === BetType.Number ? specificNumber! : '';
        const betDisplay = rouletteGame.getBetTypeDisplay(betType, betValue);

        // Check if this is an all-in bet
        const isAllIn = betAmount === currentBalance;
        
        const bettingEmbed = new EmbedBuilder()
            .setColor(isAllIn ? Colors.Red : Colors.Blue)
            .setTitle(isAllIn ? '🚨 ALL-IN BET! 🚨' : '🎰 Spinning the Roulette Wheel...')
            .setDescription(`**<@${userId}>** has placed ${isAllIn ? 'an ALL-IN' : 'a'} bet!`)
            .addFields(
                { name: 'Bet Type', value: betDisplay, inline: true },
                { name: 'Bet Amount', value: userService.formatCurrency(betAmount), inline: true }
            );

        // Add losing streak if exists
        if (currentLosingStreak > 0) {
            bettingEmbed.addFields(
                { name: '🎯 Current Losing Streak', value: `${currentLosingStreak} losses`, inline: true }
            );
        }

        // Add daily stats
        if (dailyStats.totalGames > 0) {
            const dailyProfitColor = dailyStats.netProfit >= 0 ? '🟢' : '🔴';
            bettingEmbed.addFields(
                { 
                    name: '📊 Today\'s Stats', 
                    value: `Games: ${dailyStats.totalGames} | Win Rate: ${dailyStats.winRate.toFixed(1)}% | ${dailyProfitColor} ${userService.formatCurrency(dailyStats.netProfit)}`,
                    inline: false 
                }
            );
        }

        bettingEmbed.setTimestamp();

        // Create spin and cancel buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('spin_wheel')
                    .setLabel('Spin the Wheel!')
                    .setEmoji('🎰')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('cancel_bet')
                    .setLabel('Cancel Bet')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary)
            );

        const message = await interaction.editReply({
            embeds: [bettingEmbed],
            components: [row]
        });

        // Create collector for button interaction
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000, // 1 minute timeout
            filter: i => i.user.id === userId
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            if (buttonInteraction.customId === 'spin_wheel') {
                await buttonInteraction.deferUpdate();

                // Get current losing streak
                const losingStreak = await rouletteService.getCurrentLosingStreak(userId);
                
                // Play the game with pity system
                const result = rouletteGame.play(betType, betValue, betAmount, losingStreak);
                
                const balanceBefore = currentBalance - betAmount;
                let balanceAfter = balanceBefore;

                // Update balance if won
                if (result.won) {
                    balanceAfter = await userService.addBalance(userId, result.winAmount, username);
                } else {
                    balanceAfter = await userService.getBalance(userId);
                }


                // Record the game in database
                await rouletteService.recordGame({
                    userId,
                    username,
                    betType,
                    betValue: betValue?.toString(),
                    betAmount,
                    resultNumber: result.number,
                    resultColor: result.color,
                    won: result.won,
                    winAmount: result.winAmount,
                    payoutRatio: result.payout,
                    balanceBefore,
                    balanceAfter,
                    pityApplied: result.pityApplied,
                    pityBonusPercentage: result.pityBonusPercentage,
                    losingStreak: result.losingStreak
                });

                // Create result embed
                const resultColor = result.won ? Colors.Green : Colors.Red;
                let resultTitle = result.won ? '🎉 You Won!' : '😢 You Lost!';
                
                // Add pity system indicator
                if (result.pityApplied && result.won) {
                    resultTitle = '🍀 Lucky Break! You Won!';
                }

                const resultEmbed = new EmbedBuilder()
                    .setColor(resultColor)
                    .setTitle(resultTitle)
                    .setDescription(`The ball landed on **${result.number}** ${rouletteGame.getColorEmoji(result.color)}`)
                    .addFields(
                        { name: 'Your Bet', value: `${betDisplay}`, inline: true },
                        { name: 'Bet Amount', value: userService.formatCurrency(betAmount), inline: true }
                    );

                // Add pity system information
                if (result.pityBonusPercentage > 0) {
                    if (result.losingStreak >= 15) {
                        resultEmbed.addFields({ name: '🍀 Pity System', value: '**Guaranteed Win!** You had a long losing streak.', inline: false });
                    } else if (result.pityApplied) {
                        resultEmbed.addFields({ name: '🍀 Pity System', value: `Lucky boost activated! (+${result.pityBonusPercentage}% chance)`, inline: false });
                    } else if (result.losingStreak >= 5) {
                        resultEmbed.addFields({ name: '🎯 Losing Streak', value: `${result.losingStreak} losses in a row. Better luck next time!`, inline: false });
                    }
                }

                if (result.won) {
                    resultEmbed.addFields(
                        { name: 'Payout', value: `${result.payout}:1`, inline: true },
                        { name: 'Won Amount', value: userService.formatCurrency(result.winAmount), inline: true }
                    );
                } else {
                    resultEmbed.addFields(
                        { name: 'Lost Amount', value: userService.formatCurrency(betAmount), inline: true }
                    );
                }

                resultEmbed.addFields(
                    { name: 'New Balance', value: userService.formatCurrency(balanceAfter), inline: false }
                );

                // Check for bankruptcy bailout (all-in loss that results in 0 balance)
                if (!result.won && isAllIn && balanceAfter === 0) {
                    await userService.setBankruptcyBailout(userId);
                    resultEmbed.addFields(
                        { 
                            name: '🆘 Bankruptcy Bailout Activated!', 
                            value: 'You can use `/work` once without cooldown to get back on your feet!', 
                            inline: false 
                        }
                    );
                }

                resultEmbed.setFooter({ text: 'Play responsibly!' });
                resultEmbed.setTimestamp();

                // Disable the button
                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('spin_wheel')
                            .setLabel('Wheel Spun!')
                            .setEmoji('🎰')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                await buttonInteraction.editReply({
                    embeds: [resultEmbed],
                    components: [disabledRow]
                });

                collector.stop();
            } else if (buttonInteraction.customId === 'cancel_bet') {
                await buttonInteraction.deferUpdate();

                // Refund the bet
                await userService.addBalance(userId, betAmount, username);
                const refundedBalance = await userService.getBalance(userId);

                const cancelEmbed = new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('❌ Bet Cancelled')
                    .setDescription(`**<@${userId}>** cancelled their bet. Your money has been refunded.`)
                    .addFields(
                        { name: 'Refunded', value: userService.formatCurrency(betAmount), inline: true },
                        { name: 'Balance', value: userService.formatCurrency(refundedBalance), inline: true }
                    )
                    .setTimestamp();

                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('cancel_bet')
                            .setLabel('Bet Cancelled')
                            .setEmoji('❌')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                await buttonInteraction.editReply({
                    embeds: [cancelEmbed],
                    components: [disabledRow]
                });

                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                // Timeout - refund the bet
                await userService.addBalance(userId, betAmount, username);
                const refundedBalance = await userService.getBalance(userId);

                const timeoutEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('⏰ Bet Timeout')
                    .setDescription('You didn\'t spin the wheel in time. Your bet has been refunded.')
                    .addFields(
                        { name: 'Refunded', value: userService.formatCurrency(betAmount), inline: true },
                        { name: 'Balance', value: userService.formatCurrency(refundedBalance), inline: true }
                    )
                    .setTimestamp();

                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('spin_wheel')
                            .setLabel('Timed Out')
                            .setEmoji('⏰')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                await interaction.editReply({
                    embeds: [timeoutEmbed],
                    components: [disabledRow]
                });
            }
        });

    } catch (error) {
        console.error('Error executing roulette command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error processing your bet. Please try again later.')
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