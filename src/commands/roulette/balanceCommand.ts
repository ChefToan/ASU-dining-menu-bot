import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors
} from 'discord.js';
import { userService } from '../../services/userService';

export const data = new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your t$t balance')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to check balance for (leave empty for yourself)')
            .setRequired(false)
    );

export async function execute(interaction: CommandInteraction) {
    try {
        const targetUser = interaction.options.get('user')?.user || interaction.user;
        const isOwnBalance = targetUser.id === interaction.user.id;

        const balance = await userService.getBalance(targetUser.id);

        // Get leaderboard position
        const leaderboard = await userService.getLeaderboard(100);
        const position = leaderboard.findIndex((entry: any) => entry.userId === targetUser.id) + 1;

        const balanceEmbed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle(`💰 ${isOwnBalance ? 'Your' : `<@${targetUser.id}>'s`} Balance`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                { name: 'Current Balance', value: userService.formatCurrency(balance), inline: true }
            );

        if (position > 0 && position <= 10) {
            balanceEmbed.addFields(
                { name: 'Leaderboard Position', value: `#${position} 🏆`, inline: true }
            );
        } else if (position > 0) {
            balanceEmbed.addFields(
                { name: 'Leaderboard Position', value: `#${position}`, inline: true }
            );
        }

        if (balance === 0 && isOwnBalance) {
            balanceEmbed.setDescription('You don\'t have any t$t yet!\nUse `/work` to earn some money.');
        } else if (balance === 0 && !isOwnBalance) {
            balanceEmbed.setDescription('This user doesn\'t have any t$t yet.');
        }

        balanceEmbed.setTimestamp();

        await interaction.reply({ embeds: [balanceEmbed] });

    } catch (error) {
        console.error('Error executing balance command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error checking the balance. Please try again later.')
            .setTimestamp();

        try {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } catch (replyError) {
            console.error('Could not send error message:', replyError);
        }
    }
}