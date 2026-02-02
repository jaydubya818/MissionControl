#!/bin/bash
# Test Mission Control System

set -e

echo "🧪 Testing Mission Control System..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test function
test_check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $1"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $1"
        ((FAILED++))
    fi
}

# 1. Check if Convex is accessible
echo -e "${BLUE}📡 Testing Convex connection...${NC}"
curl -s https://different-gopher-55.convex.cloud > /dev/null
test_check "Convex backend accessible"

# 2. Check if projects exist
echo -e "${BLUE}📁 Testing projects...${NC}"
PROJECTS=$(npx tsx -e "
import { ConvexHttpClient } from 'convex/browser';
const client = new ConvexHttpClient('https://different-gopher-55.convex.cloud');
const projects = await client.query('projects:list', {});
console.log(projects.length);
process.exit(projects.length >= 3 ? 0 : 1);
" 2>&1 | tail -1)
test_check "Projects exist (found $PROJECTS)"

# 3. Check if agents exist
echo -e "${BLUE}🤖 Testing agents...${NC}"
AGENTS=$(npx tsx -e "
import { ConvexHttpClient } from 'convex/browser';
const client = new ConvexHttpClient('https://different-gopher-55.convex.cloud');
const agents = await client.query('agents:listAll', {});
console.log(agents.length);
process.exit(agents.length >= 18 ? 0 : 1);
" 2>&1 | tail -1)
test_check "Agents exist (found $AGENTS)"

# 4. Check if Mission Control tasks exist
echo -e "${BLUE}📋 Testing Mission Control tasks...${NC}"
TASKS=$(npx tsx -e "
import { ConvexHttpClient } from 'convex/browser';
const client = new ConvexHttpClient('https://different-gopher-55.convex.cloud');
const projects = await client.query('projects:list', {});
const mcProject = projects.find(p => p.slug === 'mission-control');
if (!mcProject) process.exit(1);
const tasks = await client.query('tasks:listAll', { projectId: mcProject._id });
console.log(tasks.length);
process.exit(tasks.length >= 10 ? 0 : 1);
" 2>&1 | tail -1)
test_check "Mission Control tasks exist (found $TASKS)"

# 5. Check if UI dependencies are installed
echo -e "${BLUE}📦 Testing UI dependencies...${NC}"
cd apps/mission-control-ui && [ -d "node_modules" ]
test_check "UI dependencies installed"
cd ../..

# 6. Check if agent-runner dependencies are installed
echo -e "${BLUE}📦 Testing agent-runner dependencies...${NC}"
cd packages/agent-runner && [ -d "node_modules" ]
test_check "Agent runner dependencies installed"
cd ../..

# 7. Check if Telegram bot dependencies are installed
echo -e "${BLUE}📦 Testing Telegram bot dependencies...${NC}"
cd packages/telegram-bot && [ -d "node_modules" ]
test_check "Telegram bot dependencies installed"
cd ../..

# 8. Check if PM2 is installed
echo -e "${BLUE}🔧 Testing PM2...${NC}"
command -v pm2 > /dev/null
test_check "PM2 installed"

# 9. Check if ecosystem.config.js exists
echo -e "${BLUE}⚙️  Testing configuration...${NC}"
[ -f "ecosystem.config.js" ]
test_check "PM2 ecosystem config exists"

# 10. Check if start script exists
echo -e "${BLUE}🚀 Testing start script...${NC}"
[ -f "start-all.sh" ] && [ -x "start-all.sh" ]
test_check "Start script exists and is executable"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}📊 Test Results:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! System is ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./start-all.sh"
    echo "  2. Open: http://localhost:5173/"
    echo "  3. Watch agents work!"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please fix issues above.${NC}"
    exit 1
fi
