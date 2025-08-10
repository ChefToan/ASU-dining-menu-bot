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
            .setDescription('Amount of t$t to bet')
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(10000)
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
        const betAmount = interaction.options.get('bet_amount')?.value as number;
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

        // Create betting embed
        const betValue = betType === BetType.Number ? specificNumber! : '';
        const betDisplay = rouletteGame.getBetTypeDisplay(betType, betValue);

        const bettingEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🎰 Spinning the Roulette Wheel...')
            .setDescription(`**<@${userId}>** has placed a bet!`)
            .addFields(
                { name: 'Bet Type', value: betDisplay, inline: true },
                { name: 'Bet Amount', value: userService.formatCurrency(betAmount), inline: true }
            )
            .setTimestamp();

        // Create spin button
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('spin_wheel')
                    .setLabel('Spin the Wheel!')
                    .setEmoji('🎰')
                    .setStyle(ButtonStyle.Primary)
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

                // Play the game
                const result = rouletteGame.play(betType, betValue, betAmount);
                
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
                    balanceAfter
                });

                // Create result embed
                const resultColor = result.won ? Colors.Green : Colors.Red;
                const resultTitle = result.won ? '🎉 You Won!' : '😢 You Lost!';

                const resultEmbed = new EmbedBuilder()
                    .setColor(resultColor)
                    .setTitle(resultTitle)
                    .setDescription(`The ball landed on **${result.number}** ${rouletteGame.getColorEmoji(result.color)}`)
                    .addFields(
                        { name: 'Your Bet', value: `${betDisplay}`, inline: true },
                        { name: 'Bet Amount', value: userService.formatCurrency(betAmount), inline: true }
                    );

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