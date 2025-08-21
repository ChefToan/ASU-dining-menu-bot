import { Colors } from 'discord.js';
import { BaseDiningCommand, MealConfig } from './baseDiningCommand';

const LIGHT_LUNCH_CONFIG: MealConfig = {
    name: 'Light Lunch',
    emoji: '🥗',
    color: Colors.Green,
    description: 'Join us for light lunch! React to let us know if you\'re coming.',
    cancelEmoji: '🥙',
    mealType: 'light_lunch'
};

const lightLunchCommand = new BaseDiningCommand(LIGHT_LUNCH_CONFIG);

export const data = lightLunchCommand.createSlashCommand();
export const execute = lightLunchCommand.execute.bind(lightLunchCommand);
export const cleanup = lightLunchCommand.cleanup.bind(lightLunchCommand);