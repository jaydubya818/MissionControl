#!/bin/bash
# Start All Mission Control Services

set -e

echo "🚀 Starting Mission Control..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 not found. Installing...${NC}"
    npm install -g pm2
fi

# Start agents with PM2
echo -e "${BLUE}📦 Starting all agents with PM2...${NC}"
pm2 start ecosystem.config.js

echo ""
echo -e "${GREEN}✅ All agents started!${NC}"
echo ""

# Show status
echo -e "${BLUE}📊 Agent Status:${NC}"
pm2 list

echo ""
echo -e "${BLUE}📝 Useful Commands:${NC}"
echo "  pm2 monit          - Monitor all agents"
echo "  pm2 logs           - View all logs"
echo "  pm2 logs agent-sofie - View specific agent logs"
echo "  pm2 stop all       - Stop all agents"
echo "  pm2 restart all    - Restart all agents"
echo "  pm2 delete all     - Remove all agents"
echo ""

# Open UI
echo -e "${BLUE}🌐 Opening Mission Control UI...${NC}"
sleep 2
open http://localhost:5173/ || echo "Open http://localhost:5173/ in your browser"

echo ""
echo -e "${GREEN}🎉 Mission Control is running!${NC}"
echo ""
echo "Next steps:"
echo "1. Check UI at http://localhost:5173/"
echo "2. Switch to 'Mission Control' project"
echo "3. Watch agents claim and work on tasks"
echo "4. Monitor with: pm2 monit"
echo ""
