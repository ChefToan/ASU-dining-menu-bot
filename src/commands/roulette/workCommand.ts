import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors
} from 'discord.js';
import { userService } from '../../services/userService';

export const data = new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work to earn some t$t! (30 minute cooldown)');

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Check if user is eligible for bankruptcy bailout
        const workCheck = await userService.canWork(userId);
        const currentBalance = await userService.getBalance(userId);
        
        // Enhanced debugging for bankruptcy bailout
        console.log(`Work attempt - User: ${userId}, Balance: ${currentBalance}, CanWork: ${workCheck.canWork}, BankruptcyBailout: ${workCheck.bankruptcyBailout}`);
        
        const workResult = await userService.doWork(userId, username);

        if (!workResult.success) {
            // User is on cooldown
            const timeRemaining = workResult.timeRemaining!;
            const minutes = Math.floor(timeRemaining / 60000);
            const seconds = Math.floor((timeRemaining % 60000) / 1000);

            let cooldownDescription = `You need to wait **${minutes}m ${seconds}s** before you can work again.`;
            
            // Check if they're broke and might be eligible for bailout
            if (currentBalance === 0) {
                const user = await userService.getOrCreateUser(userId);
                if (user.bankruptcyBailoutCount === 0 && !user.bankruptcyFromGambling) {
                    cooldownDescription += '\n\n💡 **Note:** If you go broke from gambling, you\'ll get a one-time bailout to work without cooldown!';
                } else if (user.bankruptcyBailoutCount > 0) {
                    cooldownDescription += '\n\n⚠️ **Note:** You already used your one-time bankruptcy bailout.';
                }
            }

            const cooldownEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle('⏰ You\'re still on break!')
                .setDescription(cooldownDescription)
                .setFooter({ text: `Current balance: ${userService.formatCurrency(currentBalance)}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [cooldownEmbed] });
            return;
        }

        // Work successful
        const reward = workResult.reward!;
        const newBalance = await userService.getBalance(userId);

        // Array of random work activities
        const workActivities = [
            '🍔 You flipped burgers at the Pod',
            '📚 You tutored someone in CS',
            '🧹 You cleaned the dorm bathrooms',
            '🚗 You delivered food around campus',
            '💻 You fixed someone\'s computer',
            '📝 You helped someone with their homework',
            '🏃 You ran errands for a professor',
            '☕ You worked a shift at the campus coffee shop',
            '🎮 You tested video games for a gaming company',
            '📦 You helped unload deliveries at the bookstore'
        ];

        const activity = workActivities[Math.floor(Math.random() * workActivities.length)];

        const successEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(workCheck.bankruptcyBailout ? '🆘 Emergency Work!' : '💰 Work Complete!')
            .setDescription(`${activity}`)
            .addFields(
                { name: 'Earned', value: userService.formatCurrency(reward), inline: true },
                { name: 'New Balance', value: userService.formatCurrency(newBalance), inline: true }
            );

        if (workCheck.bankruptcyBailout) {
            successEmbed.addFields(
                { 
                    name: '🆘 Bankruptcy Bailout Used', 
                    value: 'You used your one-time bailout! Next work will have normal 30-minute cooldown.', 
                    inline: false 
                }
            );
            successEmbed.setFooter({ text: 'Back on your feet! Normal cooldown applies to future work.' });
        } else {
            successEmbed.setFooter({ text: 'You can work again in 30 minutes' });
        }
        
        successEmbed.setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Error executing work command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error processing your work request. Please try again later.')
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