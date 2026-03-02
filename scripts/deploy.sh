#!/bin/bash
###############################################################################
# deploy.sh — One-command deploy for Endoscopy Suite on Raspberry Pi
#
# Usage: bash deploy.sh
#
# What it does:
#   1. Pulls latest code from GitHub
#   2. Installs dependencies (if package.json changed)
#   3. Builds the Next.js app
#   4. Restarts PM2 services (app + capture daemon)
#   5. Optionally installs & enables the GStreamer systemd service
###############################################################################

set -euo pipefail

APP_DIR="/home/lm/loyalmed"
SERVICE_FILE="$APP_DIR/scripts/livefeed.service"
SERVICE_NAME="livefeed"

log() { echo -e "\033[1;36m[deploy]\033[0m $(date '+%H:%M:%S') $*"; }
err() { echo -e "\033[1;31m[deploy]\033[0m $(date '+%H:%M:%S') ERROR: $*" >&2; }

cd "$APP_DIR"

# ── 1. Git Pull ──
log "Pulling latest code..."
git pull origin main || { err "Git pull failed"; exit 1; }

# ── 2. Dependencies (only if package.json changed) ──
if git diff HEAD~1 --name-only 2>/dev/null | grep -q "package.json"; then
    log "package.json changed — running npm install..."
    npm install --production=false
else
    log "No dependency changes, skipping npm install."
fi

# ── 3. Build ──
log "Building Next.js app..."
npm run build || { err "Build failed"; exit 1; }

# ── 4. Restart PM2 ──
log "Restarting PM2 services..."
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

# ── 5. GStreamer Service (install once) ──
if [ ! -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
    log "Installing GStreamer systemd service ($SERVICE_NAME)..."
    sudo cp "$SERVICE_FILE" /etc/systemd/system/$SERVICE_NAME.service
    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    sudo systemctl start $SERVICE_NAME
    log "Service installed and started."
else
    log "GStreamer service already installed. Restarting..."
    sudo systemctl restart $SERVICE_NAME
fi

# ── 6. PM2 Startup (auto-start on boot) ──
log "Ensuring PM2 starts on boot..."
pm2 startup systemd -u lm --hp /home/lm 2>/dev/null || true
pm2 save

log "═══════════════════════════════════════════════════"
log "  ✅  Deploy complete!"
log ""
log "  App:     http://localhost:3000"
log "  Camera:  systemctl status $SERVICE_NAME"
log "  PM2:     pm2 status"
log "═══════════════════════════════════════════════════"
