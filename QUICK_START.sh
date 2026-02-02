#!/bin/bash
# Mission Control - Quick Start Script
# Run this after getting your Telegram bot token

set -e

echo "🚀 Mission Control Quick Start"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -d "packages/telegram-bot" ]; then
  echo "❌ Error: Run this script from the MissionControl root directory"
  exit 1
fi

# Step 1: Check for required tools
echo "📋 Step 1: Checking prerequisites..."
if ! command -v railway &> /dev/null; then
  echo "⚠️  Railway CLI not found. Install it with:"
  echo "   npm install -g @railway/cli"
  echo ""
  read -p "Install Railway CLI now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install -g @railway/cli
  else
    echo "Skipping Railway deployment..."
  fi
fi

# Step 2: Get Telegram credentials
echo ""
echo "🤖 Step 2: Telegram Bot Setup"
echo "================================"
echo ""
echo "You need:"
echo "1. Bot Token from @BotFather"
echo "2. Your Chat ID (use @userinfobot to get it)"
echo ""
read -p "Do you have your Telegram bot token? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "📱 To get your bot token:"
  echo "   1. Open Telegram and message @BotFather"
  echo "   2. Send: /newbot"
  echo "   3. Follow prompts to create your bot"
  echo "   4. Copy the token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)"
  echo ""
  echo "📱 To get your chat ID:"
  echo "   1. Message @userinfobot on Telegram"
  echo "   2. Copy your ID (a number like: 123456789)"
  echo ""
  read -p "Press Enter when you have both credentials..."
fi

echo ""
read -p "Enter your Telegram Bot Token: " TELEGRAM_BOT_TOKEN
read -p "Enter your Telegram Chat ID: " TELEGRAM_CHAT_ID

# Step 3: Railway deployment
echo ""
echo "🚂 Step 3: Deploy to Railway"
echo "================================"
echo ""
cd packages/telegram-bot

if command -v railway &> /dev/null; then
  echo "Initializing Railway project..."
  railway init || echo "Project may already exist"
  
  echo "Setting environment variables..."
  railway variables set TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN"
  railway variables set TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID"
  railway variables set VITE_CONVEX_URL="https://different-gopher-55.convex.cloud"
  
  echo ""
  read -p "Deploy to Railway now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying..."
    railway up
    echo ""
    echo "✅ Telegram bot deployed!"
    echo ""
    echo "Test it:"
    echo "1. Open Telegram"
    echo "2. Find your bot"
    echo "3. Send: /start"
    echo ""
  fi
else
  echo "⚠️  Railway CLI not available. Deploy manually:"
  echo ""
  echo "Option 1: Railway (recommended)"
  echo "  npm install -g @railway/cli"
  echo "  railway init"
  echo "  railway variables set TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
  echo "  railway variables set TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID"
  echo "  railway variables set VITE_CONVEX_URL=https://different-gopher-55.convex.cloud"
  echo "  railway up"
  echo ""
  echo "Option 2: Docker"
  echo "  cd ../.."
  echo "  docker build -f packages/telegram-bot/Dockerfile -t mc-telegram-bot ."
  echo "  docker run -d \\"
  echo "    -e TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN \\"
  echo "    -e TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID \\"
  echo "    -e VITE_CONVEX_URL=https://different-gopher-55.convex.cloud \\"
  echo "    mc-telegram-bot"
  echo ""
fi

cd ../..

# Step 4: Run agent-runner
echo ""
echo "🤖 Step 4: Run OpenClaw Agent"
echo "================================"
echo ""
read -p "Start Scout agent now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Starting Scout agent..."
  echo "Watch the UI at: https://mission-control-1nx3xil7e-jaydubya818.vercel.app"
  echo ""
  
  export CONVEX_URL=https://different-gopher-55.convex.cloud
  export PROJECT_SLUG=openclaw
  export AGENT_NAME=Scout
  export AGENT_ROLE=SPECIALIST
  export AGENT_TYPES=CUSTOMER_RESEARCH,SEO_RESEARCH
  export AGENT_EMOJI=🔍
  
  cd packages/agent-runner
  echo "Agent configuration:"
  echo "  Name: Scout 🔍"
  echo "  Role: SPECIALIST"
  echo "  Types: CUSTOMER_RESEARCH, SEO_RESEARCH"
  echo "  Project: openclaw"
  echo ""
  echo "Press Ctrl+C to stop the agent"
  echo ""
  pnpm dev
else
  echo ""
  echo "To start the agent later, run:"
  echo ""
  echo "  export CONVEX_URL=https://different-gopher-55.convex.cloud"
  echo "  export PROJECT_SLUG=openclaw"
  echo "  export AGENT_NAME=Scout"
  echo "  export AGENT_ROLE=SPECIALIST"
  echo "  export AGENT_TYPES=CUSTOMER_RESEARCH,SEO_RESEARCH"
  echo "  export AGENT_EMOJI=🔍"
  echo "  cd packages/agent-runner"
  echo "  pnpm dev"
  echo ""
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Check Telegram bot: Send /start to your bot"
echo "2. Check UI: https://mission-control-1nx3xil7e-jaydubya818.vercel.app"
echo "3. Watch Scout agent claim tasks"
echo "4. Monitor timeline in TaskDrawer"
echo ""
