import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    Colors
} from 'discord.js';
import balanceManager from '../../utils/balanceManager';

export const data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the t$t richest users');

export async function execute(interaction: CommandInteraction) {
    try {
        await interaction.deferReply();

        const leaderboard = balanceManager.getLeaderboard(10);

        if (leaderboard.length === 0) {
            const emptyEmbed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle('📊 t$t Leaderboard')
                .setDescription('No one has earned any t$t yet!\nBe the first by using `/work`!')
                .setTimestamp();

            await interaction.editReply({ embeds: [emptyEmbed] });
            return;
        }

        // Build leaderboard description
        let description = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            let medal = '';

            if (i === 0) medal = '🥇';
            else if (i === 1) medal = '🥈';
            else if (i === 2) medal = '🥉';
            else medal = `**${i + 1}.**`;

            // Try to get user info (may fail if user left server)
            try {
                const user = await interaction.client.users.fetch(entry.userId);
                description += `${medal} ${user.username} - ${balanceManager.formatCurrency(entry.balance)}\n`;
            } catch {
                description += `${medal} Unknown User - ${balanceManager.formatCurrency(entry.balance)}\n`;
            }
        }

        // Check requestor's position if not in top 10
        const userId = interaction.user.id;
        const allUsers = balanceManager.getLeaderboard(1000);
        const userPosition = allUsers.findIndex((entry: any) => entry.userId === userId) + 1;
        const userBalance = balanceManager.getBalance(userId);

        const leaderboardEmbed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('📊 t$t Leaderboard - Top 10')
            .setDescription(description)
            .setTimestamp();

        if (userPosition > 10 && userPosition > 0) {
            leaderboardEmbed.addFields({
                name: 'Your Position',
                value: `#${userPosition} - ${balanceManager.formatCurrency(userBalance)}`,
                inline: false
            });
        } else if (userPosition === 0 && userBalance === 0) {
            leaderboardEmbed.setFooter({ text: 'Use /work to start earning t$t!' });
        }

        await interaction.editReply({ embeds: [leaderboardEmbed] });

    } catch (error) {
        console.error('Error executing leaderboard command:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('There was an error fetching the leaderboard. Please try again later.')
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