#!/bin/bash
# Health check script for ASU Dining Bot

APP_DIR="/home/ubuntu/asu-dining-menu-bot"
SERVICE_NAME="asu-dining-bot"

echo "🔍 ASU Dining Bot Health Check"
echo "================================"

# Check if application directory exists
if [ -d "$APP_DIR" ]; then
    echo "✅ Application directory exists: $APP_DIR"
else
    echo "❌ Application directory not found: $APP_DIR"
    exit 1
fi

# Check PM2 status
echo ""
echo "📊 PM2 Process Status:"
if pm2 list | grep -q "$SERVICE_NAME"; then
    pm2 status "$SERVICE_NAME"

    # Check if process is running
    if pm2 list | grep "$SERVICE_NAME" | grep -q "online"; then
        echo "✅ Application is running"
    else
        echo "⚠️  Application is not running properly"
    fi
else
    echo "❌ PM2 process not found"
fi

# Check disk space
echo ""
echo "💾 Disk Usage:"
df -h "$APP_DIR"

# Check memory usage
echo ""
echo "🧠 Memory Usage:"
free -h

# Check recent logs for errors
echo ""
echo "📝 Recent Error Logs (last 10 lines):"
if [ -f "$APP_DIR/logs/error.log" ]; then
    tail -10 "$APP_DIR/logs/error.log"
else
    echo "No error log file found"
fi

echo ""
echo "Health check complete!"
