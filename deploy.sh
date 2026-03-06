#!/bin/bash

# =============================================================================
#  Endoscopy Suite — "Perfect" Deployment Script for Raspberry Pi
#  Build: Robust Capture v4
# =============================================================================

# 1. Configuration
BRANCH="fix/robust-capture-v4"
PROJECT_DIR="/home/lm/loyalmed"

echo "🚀 Starting Deployment: $BRANCH"

# 2. Check Internet Connectivity (Required for Git/NPM)
echo "🔍 Checking internet connectivity..."
if ! ping -c 1 8.8.8.8 > /dev/null 2>&1; then
    echo "❌ ERROR: No internet connection detect. Please check WiFi/Ethernet."
    exit 1
fi

# 3. Pull latest code
cd $PROJECT_DIR || exit
echo "📥 Fetching latest code from branch: $BRANCH"
git checkout $BRANCH
git fetch origin $BRANCH
git reset --hard origin/$BRANCH

# 4. Install Dependencies
echo "📦 Installing dependencies..."
npm install

# 5. Database Setup
echo "🗄️  Setting up database..."
npx prisma generate
npx prisma db push
node scripts/seed-admin.js

# 6. Production Build
echo "🏗️  Building Next.js application (this may take a few minutes)..."
npm run build

# 7. Restart Application (PM2)
echo "🔄 Restarting system processes..."
pm2 delete all
pm2 start ecosystem.config.js
pm2 save

# 8. Launch Browser
echo "🌐 Launching interface..."
export DISPLAY=:0
firefox http://localhost:3000 &

echo "✅ SUCCESS: Endoscopy Suite is deployed and running."
pm2 list
