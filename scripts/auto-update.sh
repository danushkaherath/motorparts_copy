#!/usr/bin/env bash
# ==============================================================================
# Grocery POS — Automatic Update Script
# Checks GitHub for new commits on 'main'. If changes are detected,
# pulls the code and rebuilds the containers without downtime.
# ==============================================================================

set -euo pipefail

APP_DIR="${HOME}/grocery"
LOG_FILE="${APP_DIR}/auto-update.log"

cd "${APP_DIR}"

# Fetch latest status from remote quietly
git fetch origin main > /dev/null 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] New update detected on GitHub ($LOCAL -> $REMOTE). Deploying..." | tee -a "${LOG_FILE}"
    
    # Pull latest changes
    git pull origin main | tee -a "${LOG_FILE}"
    
    # Rebuild and restart updated containers
    docker compose up -d --build | tee -a "${LOG_FILE}"
    
    # Clean up dangling images to save disk space
    docker image prune -f > /dev/null 2>&1
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update deployed successfully!" | tee -a "${LOG_FILE}"
fi
