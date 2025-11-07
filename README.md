# ASU Dining Menu Bot 🍽️

A comprehensive Discord bot for Arizona State University that provides dining hall menus, podrun organization, roulette games, and user economy management. Now powered by Supabase for persistent data storage!

![ASU Dining]()

## Features ✨

### Core Features
- **Real-time Menu Access**: Fetch the latest menus from ASU dining halls
- **Multiple Dining Halls**: Support for Barrett, Manzy (Manzanita), Hassay (Hassayampa), Tooker, and MU (Pitchforks)
- **Date Selection**: View menus for today or any specific date
- **Station-based Organization**: View menu items organized by food stations
- **Interactive Interface**: User-friendly button-based navigation

### Social Features
- **Podrun Organization**: Create and manage group dining events with countdown timers
- **User Participation**: Join as podrunner or express disinterest (hater status)
- **Real-time Updates**: Live participant tracking with embed updates

### Economy & Games
- **Virtual Currency (t$t)**: Earn and spend virtual currency through various activities
- **Work System**: Regular income through work commands with cooldown mechanics
- **Roulette Casino**: Full-featured roulette game with multiple bet types
- **User Balances**: Persistent balance tracking with transaction history
- **Leaderboards**: Track top earners and gambling statistics

### Data & Performance
- **Supabase Integration**: All data persisted in PostgreSQL database
- **Intelligent Caching**: Reduces API calls and improves response times
- **Fallback System**: Continues operation even when database is unavailable
- **Comprehensive Logging**: Detailed error handling and performance monitoring

## Prerequisites 📋

- Node.js (v16+)
- Yarn package manager
- A Discord Bot Token
- Discord Application ID

## Installation 🚀

1. Clone the repository:
   ```bash
   git clone https://github.com/ChefToan/asu-dining-menu-bot.git
   cd asu-dining-menu-bot
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   APPLICATION_ID=your_discord_application_id
   ```

4. Build the project:
   ```bash
   yarn build
   ```

5. Start the bot:
   ```bash
   yarn start
   ```

## Usage 💬

Once the bot is running and added to your Discord server, you can use the following slash command:

```
/menu [dining_hall] [date]
```

- `dining_hall` (required): Choose from Barrett, Manzy (Manzanita), Hassay (Hassayampa), Tooker, or MU (Pitchforks)
- `date` (optional): Specify a date in MM/DD/YYYY format (defaults to today)

Example:
```
/menu dining_hall:barrett date:05/08/2025
```

After running the command, you'll be presented with an interactive menu that allows you to:
1. Select a meal period (e.g., Breakfast, Lunch, Dinner)
2. Browse food stations
3. View menu items for each station

## Development 🛠️

To run the bot in development mode with automatic restart on code changes:
```bash
yarn dev
```

## Technical Details 🔧

- **Discord.js**: Powers the Discord bot functionality
- **TypeScript**: Provides type safety and modern JavaScript features
- **Axios**: Handles HTTP requests to the ASU dining API
- **In-memory Caching**: Improves performance and reduces API load
- **Error Handling**: Comprehensive error handling for API failures and edge cases

## License 📝

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author ✍️

- **Toan** - [ChefToan](https://github.com/ChefToan)
