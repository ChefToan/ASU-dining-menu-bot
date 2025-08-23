#!/bin/bash
# Server setup script for Ubuntu server deployment

set -e  # Exit on any error

echo "🚀 Setting up ASU Dining Bot on Ubuntu Server"

# Update system packages
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js LTS
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Yarn globally
echo "📦 Installing Yarn..."
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt-get update && sudo apt-get install -y yarn

# Install PM2 globally (process manager)
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install git if not already installed
sudo apt-get install -y git

# Create application directory
APP_DIR="/home/ubuntu/asu-dining-menu-bot"
echo "📁 Creating application directory at $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"

# Create logs directory
echo "📁 Creating logs directories..."
mkdir -p "$APP_DIR/logs"
sudo mkdir -p /var/log/asu-dining-bot
sudo chown ubuntu:ubuntu /var/log/asu-dining-bot

# Clone or update repository (if running setup for first time)
if [ ! -d "$APP_DIR/.git" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/ChefToan/asu-dining-menu-bot.git "$APP_DIR"
    cd "$APP_DIR"
else
    echo "🔄 Repository already exists, updating..."
    cd "$APP_DIR"
    git pull origin main
fi

# Install dependencies
echo "📦 Installing dependencies with Yarn..."
yarn install --production --frozen-lockfile

# Build the application
echo "🔨 Building application..."
yarn build

# Setup environment file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚙️  Creating .env file template..."
    cat > "$APP_DIR/.env" << EOF
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_guild_id

# Database Configuration
DATABASE_URL=your_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Environment
NODE_ENV=production

# Logging
LOG_LEVEL=info
EOF
    echo "⚠️  Please edit $APP_DIR/.env with your actual configuration values"
fi

# Setup systemd service
echo "⚙️  Setting up systemd service..."
sudo cp "$APP_DIR/deploy/systemd-service.example" /etc/systemd/system/asu-dining-bot.service

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable asu-dining-bot

# Setup PM2 ecosystem
echo "⚙️  Setting up PM2 configuration..."
pm2 delete asu-dining-bot 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save

# Setup PM2 for auto-startup
pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit $APP_DIR/.env with your actual configuration values"
echo "2. Run: sudo systemctl start asu-dining-bot (if using systemd)"
echo "3. Or run: pm2 restart asu-dining-bot (if using PM2)"
echo "4. Check logs: pm2 logs asu-dining-bot"
echo ""
echo "To setup PM2 auto-startup, run the command shown above as ubuntu user"
