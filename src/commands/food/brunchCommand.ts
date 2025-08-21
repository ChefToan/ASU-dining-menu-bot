import { Colors } from 'discord.js';
import { BaseDiningCommand, MealConfig } from './baseDiningCommand';

const BRUNCH_CONFIG: MealConfig = {
    name: 'Brunch',
    emoji: '🥐',
    color: Colors.DarkOrange,
    description: 'Join us for brunch! React to let us know if you\'re coming.',
    cancelEmoji: '🧇',
    mealType: 'brunch'
};

const brunchCommand = new BaseDiningCommand(BRUNCH_CONFIG);

export const data = brunchCommand.createSlashCommand();
export const execute = brunchCommand.execute.bind(brunchCommand);
export const cleanup = brunchCommand.cleanup.bind(brunchCommand);