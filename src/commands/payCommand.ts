import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ButtonInteraction,
    User
} from 'discord.js';
import { userService } from '../services/userService';
import { db } from '../services/database';

export const data = new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send money to another user')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to send money to')
            .setRequired(true)
    )
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('Amount of t$t to send (minimum 10)')
            .setRequired(true)
            .setMinValue(10)
    )
    .addStringOption(option =>
        option.setName('message')
            .setDescription('Optional message to include with the payment')
            .setRequired(false)
            .setMaxLength(100)
    );

// Rate limiting and safety constants
const TRANSFER_COOLDOWN = 30 * 1000; // 30 seconds between transfers
const MIN_TRANSFER_AMOUNT = 10;
const MAX_TRANSFER_AMOUNT = 50000; // Maximum per transaction
const MAX_DAILY_TRANSFERS = 10; // Maximum transfers per day
const MAX_DAILY_AMOUNT = 200000; // Maximum amount per day
const userCooldowns = new Map<string, number>();

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const sender = interaction.user;
        const receiver = interaction.options.get('user')?.user;
        const amount = interaction.options.get('amount')?.value as number;
        const message = interaction.options.get('message')?.value as string | null;

        if (!receiver || typeof amount !== 'number') {
            const invalidArgsEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Invalid Arguments')
                .setDescription('Please provide a valid user and amount.')
                .setTimestamp();

            await interaction.editReply({ embeds: [invalidArgsEmbed] });
            return;
        }

        // Basic validation
        if (sender.id === receiver.id) {
            const selfPayEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Invalid Transaction')
                .setDescription('You cannot send money to yourself!')
                .setTimestamp();

            await interaction.editReply({ embeds: [selfPayEmbed] });
            return;
        }

        if (receiver.bot) {
            const botPayEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Invalid Transaction')
                .setDescription('You cannot send money to bots!')
                .setTimestamp();

            await interaction.editReply({ embeds: [botPayEmbed] });
            return;
        }

        // Amount validation
        if (amount < MIN_TRANSFER_AMOUNT) {
            const tooSmallEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Amount Too Small')
                .setDescription(`Minimum transfer amount is ${userService.formatCurrency(MIN_TRANSFER_AMOUNT)}.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [tooSmallEmbed] });
            return;
        }

        if (amount > MAX_TRANSFER_AMOUNT) {
            const tooLargeEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('❌ Amount Too Large')
                .setDescription(`Maximum transfer amount is ${userService.formatCurrency(MAX_TRANSFER_AMOUNT)} per transaction.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [tooLargeEmbed] });
            return;
        }

        // Rate limiting check
        const now = Date.now();
        const lastTransfer = userCooldowns.get(sender.id) || 0;
        if (now - lastTransfer < TRANSFER_COOLDOWN) {
            const timeRemaining = Math.ceil((TRANSFER_COOLDOWN - (now - lastTransfer)) / 1000);
            const cooldownEmbed = new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('⏰ Transfer Cooldown')
                .setDescription(`Please wait ${timeRemaining} seconds before making another transfer.`)
                .setTimestamp();

            await interaction.editReply({ embeds: [cooldownEmbed] });
            return;
        }

        // Check sender's balance
        const senderBalance = await userService.getBalance(sender.id);
        if (senderBalance < amount) {
            const insufficientFundsEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('💸 Insufficient Funds')
                .setDescription('You don\'t have enough t$t to make this transfer!')
                .addFields(
                    { name: 'Your Balance', value: userService.formatCurrency(senderBalance), inline: true },
                    { name: 'Transfer Amount', value: userService.formatCurrency(amount), inline: true }
                )
                .setFooter({ text: 'Use /work to earn more t$t' })
                .setTimestamp();

            await interaction.editReply({ embeds: [insufficientFundsEmbed] });
            return;
        }

        // Check daily limits
        const dailyLimits = await checkDailyLimits(sender.id, amount);
        if (!dailyLimits.allowed) {
            const limitEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('🚫 Daily Limit Exceeded')
                .setDescription(dailyLimits.reason!)
                .addFields(
                    { name: 'Today\'s Transfers', value: `${dailyLimits.transfersToday}/${MAX_DAILY_TRANSFERS}`, inline: true },
                    { name: 'Today\'s Amount', value: `${userService.formatCurrency(dailyLimits.amountToday)}/${userService.formatCurrency(MAX_DAILY_AMOUNT)}`, inline: true }
                )
                .setFooter({ text: 'Limits reset daily at midnight' })
                .setTimestamp();

            await interaction.editReply({ embeds: [limitEmbed] });
            return;
        }

        // Check bankruptcy bailout restrictions to prevent multi-account farming
        const senderUser = await userService.getOrCreateUser(sender.id, sender.username);
        const receiverUser = await userService.getOrCreateUser(receiver.id, receiver.username);
        
        if (senderUser.bankruptcyBailoutCount > 0 || receiverUser.bankruptcyBailoutCount > 0) {
            // Add 10% transfer fee for accounts that used bankruptcy bailout
            const transferFee = Math.ceil(amount * 0.10);
            const totalCost = amount + transferFee;
            
            if (senderBalance < totalCost) {
                const feeEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle('💰 Bankruptcy Bailout Fee')
                    .setDescription('Accounts that used bankruptcy bailout have a 10% transfer fee to prevent exploitation.')
                    .addFields(
                        { name: 'Transfer Amount', value: userService.formatCurrency(amount), inline: true },
                        { name: 'Transfer Fee (10%)', value: userService.formatCurrency(transferFee), inline: true },
                        { name: 'Total Cost', value: userService.formatCurrency(totalCost), inline: true },
                        { name: 'Your Balance', value: userService.formatCurrency(senderBalance), inline: true },
                        { name: 'Shortfall', value: userService.formatCurrency(totalCost - senderBalance), inline: true }
                    )
                    .setFooter({ text: 'This prevents multi-account bailout farming' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [feeEmbed] });
                return;
            }
        }

        // Create receiver user if doesn't exist
        await userService.getOrCreateUser(receiver.id, receiver.username);

        // Check if bankruptcy bailout fee applies for confirmation
        const hasBailoutFee = senderUser.bankruptcyBailoutCount > 0 || receiverUser.bankruptcyBailoutCount > 0;
        const transferFee = hasBailoutFee ? Math.ceil(amount * 0.10) : 0;
        const totalCost = amount + transferFee;

        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('💸 Confirm Transfer')
            .setDescription('Please confirm this money transfer:')
            .addFields(
                { name: 'From', value: `<@${sender.id}>`, inline: true },
                { name: 'To', value: `<@${receiver.id}>`, inline: true },
                { name: 'Amount', value: userService.formatCurrency(amount), inline: true }
            );

        if (hasBailoutFee) {
            confirmEmbed.addFields(
                { name: 'Transfer Fee (10%)', value: userService.formatCurrency(transferFee), inline: true },
                { name: 'Total Cost', value: userService.formatCurrency(totalCost), inline: true }
            );
        }

        if (message) {
            confirmEmbed.addFields({ name: 'Message', value: message, inline: false });
        }

        confirmEmbed.addFields(
            { name: 'Your Balance After', value: userService.formatCurrency(senderBalance - totalCost), inline: true },
            { name: 'Daily Transfers Used', value: `${dailyLimits.transfersToday + 1}/${MAX_DAILY_TRANSFERS}`, inline: true }
        );

        if (hasBailoutFee) {
            confirmEmbed.setFooter({ text: 'Bankruptcy bailout accounts have transfer fees to prevent exploitation' });
        } else {
            confirmEmbed.setFooter({ text: 'This action cannot be undone' });
        }

        confirmEmbed.setTimestamp();

        // Create confirmation buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_transfer')
                    .setLabel('Confirm Transfer')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_transfer')
                    .setLabel('Cancel')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Secondary)
            );

        const confirmMessage = await interaction.editReply({
            embeds: [confirmEmbed],
            components: [row]
        });

        // Create collector for confirmation
        const collector = confirmMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000, // 1 minute timeout
            filter: i => i.user.id === sender.id
        });

        collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
            if (buttonInteraction.customId === 'confirm_transfer') {
                // Immediately disable both buttons to prevent double-clicks
                const processingRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_transfer')
                            .setLabel('Processing...')
                            .setEmoji('⏳')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('cancel_transfer')
                            .setLabel('Cancel')
                            .setEmoji('❌')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                await buttonInteraction.update({
                    components: [processingRow]
                });

                try {
                    // Double-check balance and limits before proceeding
                    const currentBalance = await userService.getBalance(sender.id);
                    if (currentBalance < amount) {
                        throw new Error('Insufficient funds');
                    }

                    const currentLimits = await checkDailyLimits(sender.id, amount);
                    if (!currentLimits.allowed) {
                        throw new Error('Daily limits exceeded');
                    }

                    // Check if bankruptcy bailout fee applies
                    const senderUser = await userService.getOrCreateUser(sender.id, sender.username);
                    const receiverUser = await userService.getOrCreateUser(receiver.id, receiver.username);
                    const hasBailoutFee = senderUser.bankruptcyBailoutCount > 0 || receiverUser.bankruptcyBailoutCount > 0;
                    
                    // Perform the transfer (with fee if applicable)
                    const success = await performTransfer(sender, receiver, amount, message, hasBailoutFee);
                    
                    if (!success) {
                        throw new Error('Transfer failed');
                    }

                    // Update cooldown
                    userCooldowns.set(sender.id, Date.now());

                    // Get updated balance
                    const newSenderBalance = await userService.getBalance(sender.id);

                    // Create success embed
                    const successEmbed = new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setTitle('✅ Transfer Successful!')
                        .setDescription(`Successfully sent ${userService.formatCurrency(amount)} to <@${receiver.id}>`)
                        .addFields(
                            { name: 'Your New Balance', value: userService.formatCurrency(newSenderBalance), inline: true }
                        );

                    if (message) {
                        successEmbed.addFields({ name: 'Message', value: message, inline: false });
                    }

                    successEmbed.setFooter({ text: 'Transfer completed successfully' })
                        .setTimestamp();

                    const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_transfer')
                                .setLabel('Transfer Complete')
                                .setEmoji('✅')
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true)
                        );

                    await buttonInteraction.editReply({
                        embeds: [successEmbed],
                        components: [disabledRow]
                    });

                } catch (error) {
                    console.error('Transfer error:', error);
                    
                    const errorEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle('❌ Transfer Failed')
                        .setDescription('There was an error processing your transfer. Please try again.')
                        .setTimestamp();

                    await buttonInteraction.editReply({
                        embeds: [errorEmbed],
                        components: []
                    });
                }

                collector.stop();
            } else if (buttonInteraction.customId === 'cancel_transfer') {
                await buttonInteraction.deferUpdate();

                const cancelEmbed = new EmbedBuilder()
                    .setColor(Colors.Yellow)
                    .setTitle('❌ Transfer Cancelled')
                    .setDescription('The money transfer has been cancelled.')
                    .setTimestamp();

                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('cancel_transfer')
                            .setLabel('Cancelled')
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
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(Colors.Orange)
                    .setTitle('⏰ Transfer Timeout')
                    .setDescription('Transfer confirmation timed out. Please try again.')
                    .setTimestamp();

                const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_transfer')
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
        console.error('Error executing pay command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error processing your request. Please try again later.')
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

async function checkDailyLimits(userId: string, amount: number): Promise<{
    allowed: boolean;
    reason?: string;
    transfersToday: number;
    amountToday: number;
}> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { data, error } = await db.getClient()
            .from('transactions')
            .select('amount')
            .eq('sender_id', userId)
            .eq('transaction_type', 'transfer')
            .gte('created_at', today.toISOString())
            .lt('created_at', tomorrow.toISOString());

        if (error) {
            console.error('Error checking daily limits:', error);
            return { allowed: true, transfersToday: 0, amountToday: 0 };
        }

        const transfersToday = data?.length || 0;
        const amountToday = data?.reduce((sum, t) => sum + t.amount, 0) || 0;

        if (transfersToday >= MAX_DAILY_TRANSFERS) {
            return {
                allowed: false,
                reason: `You have reached the daily transfer limit of ${MAX_DAILY_TRANSFERS} transfers.`,
                transfersToday,
                amountToday
            };
        }

        if (amountToday + amount > MAX_DAILY_AMOUNT) {
            return {
                allowed: false,
                reason: `This transfer would exceed your daily amount limit of ${userService.formatCurrency(MAX_DAILY_AMOUNT)}.`,
                transfersToday,
                amountToday
            };
        }

        return { allowed: true, transfersToday, amountToday };
    } catch (error) {
        console.error('Error in checkDailyLimits:', error);
        return { allowed: true, transfersToday: 0, amountToday: 0 };
    }
}

async function performTransfer(sender: User, receiver: User, amount: number, message?: string | null, hasBailoutFee: boolean = false): Promise<boolean> {
    try {
        // Calculate total cost including potential bankruptcy bailout fee
        const transferFee = hasBailoutFee ? Math.ceil(amount * 0.10) : 0;
        const totalCost = amount + transferFee;
        
        // Get current balances
        const senderBalance = await userService.getBalance(sender.id);
        const receiverBalance = await userService.getBalance(receiver.id);

        if (senderBalance < totalCost) {
            return false;
        }

        // Perform the transfer atomically
        const senderSuccess = await userService.removeBalance(sender.id, totalCost, sender.username);
        if (!senderSuccess) {
            return false;
        }

        const newReceiverBalance = await userService.addBalance(receiver.id, amount, receiver.username);
        const newSenderBalance = await userService.getBalance(sender.id);

        // Record the transaction
        const { error } = await db.getClient()
            .from('transactions')
            .insert({
                sender_id: sender.id,
                receiver_id: receiver.id,
                sender_username: sender.username,
                receiver_username: receiver.username,
                amount: amount,
                transaction_type: 'transfer',
                description: hasBailoutFee ? 
                    `${message || 'User to user transfer'} (${transferFee} fee for bankruptcy bailout)` : 
                    (message || 'User to user transfer'),
                sender_balance_before: senderBalance,
                sender_balance_after: newSenderBalance,
                receiver_balance_before: receiverBalance,
                receiver_balance_after: newReceiverBalance
            });

        if (error) {
            console.error('Error recording transaction:', error);
            // Transaction was successful even if logging failed
        }

        return true;
    } catch (error) {
        console.error('Error in performTransfer:', error);
        return false;
    }
}