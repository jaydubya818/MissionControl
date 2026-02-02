#!/bin/bash

# Deploy Telegram Bot to Railway
set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Deploying Telegram Bot to Railway${NC}\n"

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}📦 Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
    echo -e "${GREEN}✅ Railway CLI installed${NC}\n"
fi

# Navigate to telegram-bot directory
cd /Users/jaywest/MissionControl/packages/telegram-bot

echo -e "${BLUE}📋 Pre-deployment Checklist:${NC}"
echo -e "   ✅ Telegram bot token from @BotFather"
echo -e "   ✅ Telegram chat ID"
echo -e "   ✅ Convex URL: https://different-gopher-55.convex.cloud"
echo ""

# Check if already initialized
if [ ! -f ".railway/config.json" ]; then
    echo -e "${YELLOW}🎯 Initializing Railway project...${NC}"
    railway init
    echo -e "${GREEN}✅ Railway project initialized${NC}\n"
else
    echo -e "${GREEN}✅ Railway project already initialized${NC}\n"
fi

# Set environment variables
echo -e "${BLUE}🔧 Setting environment variables...${NC}"
echo ""
echo -e "${YELLOW}Please enter your Telegram Bot Token:${NC}"
read -p "Token: " BOT_TOKEN

echo -e "${YELLOW}Please enter your Telegram Chat ID:${NC}"
read -p "Chat ID: " CHAT_ID

railway variables set TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
railway variables set TELEGRAM_CHAT_ID="$CHAT_ID"
railway variables set VITE_CONVEX_URL="https://different-gopher-55.convex.cloud"

echo -e "${GREEN}✅ Environment variables set${NC}\n"

# Deploy
echo -e "${BLUE}🚀 Deploying to Railway...${NC}"
railway up

echo -e "\n${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  TELEGRAM BOT DEPLOYED! 🎉${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}📱 Test your bot:${NC}"
echo -e "   1. Open Telegram"
echo -e "   2. Send: /start"
echo -e "   3. Try: /inbox"
echo -e "   4. Try: /status"
echo ""

echo -e "${BLUE}📊 View logs:${NC}"
echo -e "   ${YELLOW}railway logs${NC}"
echo ""

echo -e "${BLUE}🔗 View dashboard:${NC}"
echo -e "   ${YELLOW}railway open${NC}"
echo ""
