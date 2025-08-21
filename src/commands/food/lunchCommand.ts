import { Colors } from 'discord.js';
import { BaseDiningCommand, MealConfig } from './baseDiningCommand';

const LUNCH_CONFIG: MealConfig = {
    name: 'Lunch',
    emoji: '🍽️',
    color: Colors.Gold,
    description: 'Join us for lunch! React to let us know if you\'re coming.',
    cancelEmoji: '🥪',
    mealType: 'lunch'
};

const lunchCommand = new BaseDiningCommand(LUNCH_CONFIG);

export const data = lunchCommand.createSlashCommand();
export const execute = lunchCommand.execute.bind(lunchCommand);
export const cleanup = lunchCommand.cleanup.bind(lunchCommand);