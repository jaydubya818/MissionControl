#!/bin/bash

# Test Editing Features - Interactive Guide
# This script guides you through testing all editing methods

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎯 Testing Mission Control Editing Features${NC}\n"

# Check if UI is running
echo -e "${YELLOW}📡 Checking if UI is running...${NC}"
if curl -s http://localhost:5173/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ UI is running at http://localhost:5173/${NC}\n"
else
    echo -e "${YELLOW}⚠️  UI not running. Starting it now...${NC}"
    cd /Users/jaywest/MissionControl/apps/mission-control-ui
    pnpm dev > /dev/null 2>&1 &
    sleep 5
    echo -e "${GREEN}✅ UI started${NC}\n"
fi

# Open UI
echo -e "${BLUE}🌐 Opening Mission Control UI...${NC}"
open http://localhost:5173/
sleep 2

echo -e "\n${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  EDITING TEST GUIDE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

# Test 1: Double-Click Edit
echo -e "${BLUE}📝 TEST 1: Double-Click Edit${NC}"
echo -e "   1. Find any task card in the Kanban board"
echo -e "   2. ${YELLOW}Double-click${NC} the card"
echo -e "   3. Quick edit modal should appear"
echo -e "   4. Change the title or description"
echo -e "   5. Click '💾 Save Changes'"
echo -e "   6. Modal closes, changes saved!"
echo ""
read -p "Press Enter when you've completed Test 1..."
echo -e "${GREEN}✅ Test 1 Complete!${NC}\n"

# Test 2: Edit Button on Card
echo -e "${BLUE}📝 TEST 2: Edit Button on Card${NC}"
echo -e "   1. Find the ${YELLOW}✏️ button${NC} in the top-right of any card"
echo -e "   2. Click the ✏️ button"
echo -e "   3. Quick edit modal should appear"
echo -e "   4. Change the status (e.g., INBOX → IN_PROGRESS)"
echo -e "   5. Change the priority (e.g., P3 → P2)"
echo -e "   6. Click '💾 Save Changes'"
echo ""
read -p "Press Enter when you've completed Test 2..."
echo -e "${GREEN}✅ Test 2 Complete!${NC}\n"

# Test 3: Full Edit Mode
echo -e "${BLUE}📝 TEST 3: Full Edit Mode in Drawer${NC}"
echo -e "   1. ${YELLOW}Click any task${NC} to open the drawer"
echo -e "   2. Click the ${YELLOW}'✏️ Edit'${NC} button in the header"
echo -e "   3. Full edit mode activates"
echo -e "   4. Scroll down to 'Assigned Agents'"
echo -e "   5. ${YELLOW}Click agent chips${NC} to assign/unassign"
echo -e "   6. Edit the description (larger text area)"
echo -e "   7. Click '💾 Save'"
echo -e "   8. Edit mode closes, back to normal view"
echo ""
read -p "Press Enter when you've completed Test 3..."
echo -e "${GREEN}✅ Test 3 Complete!${NC}\n"

# Test 4: Validation
echo -e "${BLUE}📝 TEST 4: Validation${NC}"
echo -e "   1. Double-click any card"
echo -e "   2. ${YELLOW}Clear the title${NC} (delete all text)"
echo -e "   3. Try to click '💾 Save Changes'"
echo -e "   4. Button should be ${YELLOW}disabled${NC} (grayed out)"
echo -e "   5. Add text back to title"
echo -e "   6. Button becomes enabled"
echo -e "   7. Click Cancel to close"
echo ""
read -p "Press Enter when you've completed Test 4..."
echo -e "${GREEN}✅ Test 4 Complete!${NC}\n"

# Test 5: Keyboard Shortcuts
echo -e "${BLUE}📝 TEST 5: Keyboard Shortcuts${NC}"
echo -e "   1. Double-click any card"
echo -e "   2. Press ${YELLOW}ESC${NC} key"
echo -e "   3. Modal should close without saving"
echo -e "   4. Double-click card again"
echo -e "   5. Press ${YELLOW}Tab${NC} to navigate between fields"
echo -e "   6. Press ESC to close"
echo ""
read -p "Press Enter when you've completed Test 5..."
echo -e "${GREEN}✅ Test 5 Complete!${NC}\n"

# Summary
echo -e "\n${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ALL TESTS COMPLETE! 🎉${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}✅ Editing Features Verified:${NC}"
echo -e "   ✅ Double-click edit"
echo -e "   ✅ Edit button on cards"
echo -e "   ✅ Full edit mode in drawer"
echo -e "   ✅ Multi-agent assignment"
echo -e "   ✅ Validation"
echo -e "   ✅ Keyboard shortcuts"
echo ""

echo -e "${GREEN}🎯 Next Steps:${NC}"
echo -e "   1. Deploy Telegram bot to Railway"
echo -e "   2. Start PM2 agents"
echo -e "   3. Add more features"
echo ""

echo -e "${BLUE}Ready to deploy? Run:${NC}"
echo -e "   ${YELLOW}./deploy-all.sh${NC}"
echo ""
