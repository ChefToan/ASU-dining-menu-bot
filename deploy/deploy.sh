#!/bin/bash
# Deployment script for ASU Dining Bot
# Run this script to deploy updates to the server

set -e

APP_DIR="/home/ubuntu/asu-dining-menu-bot"
SERVICE_NAME="asu-dining-bot"

echo "🚀 Deploying ASU Dining Bot..."

# Navigate to app directory
cd "$APP_DIR"

# Pull latest changes
echo "📥 Pulling latest changes from repository..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies with Yarn..."
yarn install --production --frozen-lockfile

# Build the application
echo "🔨 Building application..."
yarn build

# Restart the service using PM2
echo "🔄 Restarting application..."
if pm2 list | grep -q "$SERVICE_NAME"; then
    pm2 restart "$SERVICE_NAME"
else
    pm2 start ecosystem.config.js
fi

# Save PM2 configuration
pm2 save

echo "✅ Deployment complete!"
echo "📊 Application status:"
pm2 status "$SERVICE_NAME"
echo ""
echo "📝 To view logs: pm2 logs $SERVICE_NAME"
echo "📈 To monitor: pm2 monit"
