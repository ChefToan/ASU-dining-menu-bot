# ASU Dining Menu Bot 🍽️

A Discord bot that provides easy access to Arizona State University's dining hall menus.

![ASU Dining]()

## Features ✨

- **Real-time Menu Access**: Fetch the latest menus from ASU dining halls
- **Multiple Dining Halls**: Support for Barrett, Manzi (Manzanita), Hassay (Hassayampa), Tooker, and MU (Pitchforks)
- **Date Selection**: View menus for today or any specific date
- **Meal Period Navigation**: Easily browse breakfast, lunch, dinner, and other meal periods
- **Station-based Organization**: View menu items organized by food stations
- **Interactive Interface**: User-friendly button-based navigation
- **Automatic Timezone Handling**: Converts UTC times to Mountain Time
- **Efficient Caching**: Reduces API calls and improves response time

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

- `dining_hall` (required): Choose from Barrett, Manzi (Manzanita), Hassay (Hassayampa), Tooker, or MU (Pitchforks)
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
