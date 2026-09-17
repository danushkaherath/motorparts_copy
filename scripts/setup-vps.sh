#!/usr/bin/env bash
# ==============================================================================
# Grocery Store POS — Automated VPS Setup Script
# Supported OS: Ubuntu 22.04 / 24.04 LTS, Debian 12
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting Grocery POS VPS Provisioning"
echo "=========================================================="

# 1. Update and upgrade system packages
echo "Updating apt repositories..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw fail2ban certbot

# 2. Install Docker & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "Installing Docker Engine..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    sudo systemctl enable docker
    sudo systemctl start docker
fi

# 3. Configure UFW Firewall
echo "Configuring firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw --force enable

# 4. Launch Application Containers
echo "Launching Grocery POS stack with Docker Compose..."
docker compose up -d --build

echo "=========================================================="
echo " POS Application Successfully Deployed!"
echo " Access your POS at: http://$(curl -s ifconfig.me)"
echo " Setup daily backup cron via: bash scripts/backup-db.sh --cron"
echo "=========================================================="
