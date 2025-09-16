import {
    SlashCommandBuilder,
    CommandInteraction,
    AttachmentBuilder
} from 'discord.js';
import path from 'path';

export const data = new SlashCommandBuilder()
    .setName('sus')
    .setDescription('Sends sussy gif');

export async function execute(interaction: CommandInteraction) {
    try {
        const susGifPath = path.join(process.cwd(), 'assets', 'sus.gif');
        const attachment = new AttachmentBuilder(susGifPath, { name: 'sus.gif' });

        await interaction.reply({ files: [attachment] });

    } catch (error) {
        console.error('Error executing sus command:', error);

        try {
            await interaction.reply({ content: 'There was an error sending the sus gif. Please try again later.', ephemeral: true });
        } catch (replyError) {
            console.error('Could not send error message:', replyError);
        }
    }
}