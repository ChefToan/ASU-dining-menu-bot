import { Colors } from 'discord.js';
import { BaseDiningCommand, MealConfig } from './baseDiningCommand';

const DINNER_CONFIG: MealConfig = {
    name: 'Dinner',
    emoji: '🍴',
    color: Colors.Purple,
    description: 'Join us for dinner! React to let us know if you\'re coming.',
    cancelEmoji: '🍕',
    mealType: 'dinner'
};

const dinnerCommand = new BaseDiningCommand(DINNER_CONFIG);

export const data = dinnerCommand.createSlashCommand();
export const execute = dinnerCommand.execute.bind(dinnerCommand);
export const cleanup = dinnerCommand.cleanup.bind(dinnerCommand);