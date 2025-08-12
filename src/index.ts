import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import * as podrunCommand from './commands/podrunCommand';
import * as workCommand from './commands/roulette/workCommand';
import * as rouletteCommand from './commands/roulette/rouletteCommand';
import * as rouletteOddsCommand from './commands/roulette/rouletteOddsCommand';
import * as balanceCommand from './commands/roulette/balanceCommand';
import * as leaderboardCommand from './commands/roulette/leaderboardCommand';
import * as payCommand from './commands/payCommand';
import * as menuCommand from './commands/menuCommand';
import { REST, Routes } from 'discord.js';
import { db } from './services/database';
import { podrunService } from './services/podrunService';

// Load environment variables
config();

// Create a new client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

// Extend the Client interface to include commands
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, any>;
    }
}

// Create a collection for commands
client.commands = new Collection();

// Add commands to the collection
client.commands.set(podrunCommand.data.name, podrunCommand);
client.commands.set(workCommand.data.name, workCommand);
client.commands.set(rouletteCommand.data.name, rouletteCommand);
client.commands.set(rouletteOddsCommand.data.name, rouletteOddsCommand);
client.commands.set(balanceCommand.data.name, balanceCommand);
client.commands.set(leaderboardCommand.data.name, leaderboardCommand);
client.commands.set(payCommand.data.name, payCommand);
client.commands.set(menuCommand.data.name, menuCommand);


// When the client is ready, run this code
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // Test database connection
    console.log('Testing database connection...');
    const isConnected = await db.testConnection();
    if (isConnected) {
        console.log('✅ Database connection successful');
    } else {
        console.warn('⚠️ Database connection failed - some features may not work');
    }

    // Clean up any expired podruns on startup
    console.log('Cleaning up expired podruns...');
    await podrunService.cleanupExpiredPodruns();
    console.log('✅ Expired podruns cleaned up');

});

// Handle interaction create events with comprehensive error handling
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);

        try {
            const errorMessage = 'There was an error executing this command!';

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true })
                    .catch(e => console.error('Could not follow up with error:', e));
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true })
                    .catch(e => console.error('Could not reply with error:', e));
            }
        } catch (responseError) {
            console.error('Failed to send error response:', responseError);
        }
    }
});

// Function to register slash commands with better error handling
const registerCommands = async () => {
    const commands = [
        podrunCommand.data.toJSON(),
        workCommand.data.toJSON(),
        rouletteCommand.data.toJSON(),
        rouletteOddsCommand.data.toJSON(),
        balanceCommand.data.toJSON(),
        leaderboardCommand.data.toJSON(),
        payCommand.data.toJSON(),
        menuCommand.data.toJSON()
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

    try {
        console.log('Started refreshing application (/) commands.');

        try {
            await rest.put(
                Routes.applicationCommands(process.env.APPLICATION_ID!),
                { body: commands }
            );
            console.log('Successfully registered global commands.');
        } catch (globalError) {
            console.warn('Could not register global commands:', globalError);
            console.log('Will continue without command registration. Commands may need to be registered manually.');
        }
    } catch (error) {
        console.error('Error during command registration:', error);
        console.log('Continuing with bot startup despite registration issues...');
    }
};

// Start the bot with maximum error handling
const startBot = async () => {
    try {

        // Try to register commands but continue even if it fails
        await registerCommands().catch(error => {
            console.error('Command registration failed, but continuing:', error);
        });

        // Login to Discord
        return client.login(process.env.DISCORD_TOKEN).catch(error => {
            console.error('Failed to login:', error);
            throw error;
        });
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
};

// Start the bot
startBot();

// Fix for graceful shutdown
let isShuttingDown = false;

// Improved shutdown function with timeout
async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return; // Prevent multiple shutdown attempts
    isShuttingDown = true;

    console.log(`${signal} received. Bot is shutting down...`);

    try {

        // Clean up any active podruns
        if (podrunCommand.cleanup) {
            podrunCommand.cleanup();
        }

        // Set a timeout to force exit after 3 seconds
        const forceExitTimeout = setTimeout(() => {
            console.log('Forcing exit after timeout...');
            process.exit(0);
        }, 3000);

        // Make sure the timeout is unref'd so it doesn't keep the process alive
        forceExitTimeout.unref();

        // Clean up Discord client
        await client.destroy();
        // console.log('Discord client destroyed successfully.');

        // Exit normally
        process.kill(process.pid, 'SIGINT');
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Handle process signals properly
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled rejections and exceptions to prevent crashes
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    console.log('Bot will attempt to continue running...');
});