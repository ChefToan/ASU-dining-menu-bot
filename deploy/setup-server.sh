#!/bin/bash
# Server setup script for Ubuntu server deployment

set -e  # Exit on any error

echo "🚀 Setting up ASU Dining Bot deployment environment..."

# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository for latest LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally (process manager)
sudo npm install -g pm2

# Install git if not already installed
sudo apt-get install -y git

# Create application directory
APP_DIR="/home/$(whoami)/asu-dining-bot"
if [ ! -d "$APP_DIR" ]; then
    echo "📁 Creating application directory at $APP_DIR"
    mkdir -p "$APP_DIR"
fi

# Create logs directory
mkdir -p "$APP_DIR/logs"
sudo mkdir -p /var/log/asu-dining-bot
sudo chown $(whoami):$(whoami) /var/log/asu-dining-bot

# Setup systemd service (optional - choose PM2 OR systemd)
echo "⚙️  Setting up systemd service..."
sudo cp deploy/systemd-service.example /etc/systemd/system/asu-dining-bot.service

# Update the service file with correct paths
sudo sed -i "s|your-username|$(whoami)|g" /etc/systemd/system/asu-dining-bot.service
sudo sed -i "s|/path/to/asu-dining-menu-bot|$APP_DIR|g" /etc/systemd/system/asu-dining-bot.service

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable asu-dining-bot

# Setup PM2 for auto-startup (alternative to systemd)
pm2 startup
echo "👆 Run the command above to setup PM2 auto-startup"

# Create .env.example for reference
cat > "$APP_DIR/.env.example" << EOF
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id

# Database Configuration
DATABASE_URL=your_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Environment
NODE_ENV=production
EOF

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository to $APP_DIR"
echo "2. Copy and configure your .env file"
echo "3. Set up GitHub Secrets for CI/CD deployment"
echo "4. Push to trigger your first deployment!"
echo ""
echo "GitHub Secrets needed:"
echo "- SERVER_HOST: Your server IP address"
echo "- SERVER_USER: Username for SSH"
echo "- SERVER_SSH_KEY: Private SSH key for authentication"
echo "- DEPLOY_PATH: $APP_DIR (optional)"