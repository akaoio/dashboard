#!/bin/bash

# Dashboard Service Installation Script
# Installs dashboard as a systemd service

set -e

echo "📦 Installing Dashboard Service..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Build the project first
echo "🔨 Building Dashboard..."
npm run build

# Create symbolic link for global CLI access
echo "🔗 Creating global dashboard command..."
ln -sf /home/x/core/projects/dashboard/cli.js /usr/local/bin/dashboard
chmod +x /usr/local/bin/dashboard

# Install systemd service
echo "⚙️ Installing systemd service..."
cp dashboard.service /etc/systemd/system/dashboard@$(whoami).service

# Reload systemd
echo "🔄 Reloading systemd..."
systemctl daemon-reload

# Enable and start service
echo "🚀 Starting Dashboard service..."
systemctl enable dashboard@$(whoami)
systemctl start dashboard@$(whoami)

echo "✅ Dashboard service installed successfully!"
echo ""
echo "Commands:"
echo "  dashboard           - Launch interactive TUI"
echo "  dashboard status    - Check system status"
echo "  dashboard workrooms - List workrooms"
echo ""
echo "Service commands:"
echo "  sudo systemctl status dashboard@$(whoami)   - Check service status"
echo "  sudo systemctl restart dashboard@$(whoami)  - Restart service"
echo "  sudo journalctl -u dashboard@$(whoami) -f   - View logs"
echo ""
echo "Dashboard server running on: http://localhost:8767"