import { Colors } from 'discord.js';
import { BaseDiningCommand, MealConfig } from './baseDiningCommand';

const BREAKFAST_CONFIG: MealConfig = {
    name: 'Breakfast',
    emoji: '🍳',
    color: Colors.Orange,
    description: 'Join us for breakfast! React to let us know if you\'re coming.',
    cancelEmoji: '🥞',
    mealType: 'breakfast'
};

const breakfastCommand = new BaseDiningCommand(BREAKFAST_CONFIG);

export const data = breakfastCommand.createSlashCommand();
export const execute = breakfastCommand.execute.bind(breakfastCommand);
export const cleanup = breakfastCommand.cleanup.bind(breakfastCommand);