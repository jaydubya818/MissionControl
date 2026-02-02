#!/bin/bash

# Deploy and Start All Agents with PM2
set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🤖 Deploying Mission Control Agents${NC}\n"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 PM2 not found. Installing...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✅ PM2 installed${NC}\n"
fi

# Navigate to project root
cd /Users/jaywest/MissionControl

echo -e "${BLUE}📋 Agent Configuration:${NC}"
echo -e "   🤖 Sofie (LEAD) - Mission Control"
echo -e "   🤖 Backend Developer - Mission Control"
echo -e "   🤖 Frontend Developer - Mission Control"
echo -e "   🤖 DevOps - Mission Control"
echo -e "   🤖 BJ (LEAD) - SellerFi"
echo -e "   🤖 Scout - OpenClaw"
echo ""

# Check if ecosystem config exists
if [ ! -f "ecosystem.config.cjs" ]; then
    echo -e "${RED}❌ ecosystem.config.cjs not found!${NC}"
    exit 1
fi

# Stop any existing processes
echo -e "${YELLOW}🛑 Stopping existing agents...${NC}"
pm2 delete all 2>/dev/null || true
echo -e "${GREEN}✅ Cleaned up${NC}\n"

# Start all agents
echo -e "${BLUE}🚀 Starting all agents...${NC}"
pm2 start ecosystem.config.cjs

echo -e "\n${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALL AGENTS STARTED! 🎉${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

# Show status
pm2 status

echo -e "\n${BLUE}📊 Monitor agents:${NC}"
echo -e "   ${YELLOW}pm2 monit${NC}      - Interactive monitor"
echo -e "   ${YELLOW}pm2 logs${NC}       - View all logs"
echo -e "   ${YELLOW}pm2 logs sofie${NC} - View Sofie's logs"
echo ""

echo -e "${BLUE}🔧 Manage agents:${NC}"
echo -e "   ${YELLOW}pm2 restart all${NC}  - Restart all agents"
echo -e "   ${YELLOW}pm2 stop all${NC}     - Stop all agents"
echo -e "   ${YELLOW}pm2 delete all${NC}   - Remove all agents"
echo ""

echo -e "${BLUE}💾 Save configuration:${NC}"
echo -e "   ${YELLOW}pm2 save${NC}         - Save current setup"
echo -e "   ${YELLOW}pm2 startup${NC}      - Auto-start on boot"
echo ""

# Open monitoring
echo -e "${YELLOW}Opening PM2 monitor in 3 seconds...${NC}"
sleep 3
pm2 monit
