# Deploy Mission Control - Step by Step

**Time:** 10-15 minutes  
**Difficulty:** Easy

---

## 🎯 What You'll Deploy

1. **Telegram Bot** - Command interface for operators
2. **Scout Agent** - First OpenClaw agent

---

## 📋 Prerequisites

### 1. Get Telegram Bot Token (2 minutes)

1. Open Telegram
2. Message **@BotFather**
3. Send: `/newbot`
4. Follow prompts:
   - Bot name: `Mission Control Bot` (or your choice)
   - Username: `your_mission_control_bot` (must end in 'bot')
5. **Copy the token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Chat ID (1 minute)

1. Message **@userinfobot** on Telegram
2. **Copy your ID** (a number like: `123456789`)

### 3. Install Railway CLI (1 minute)

```bash
npm install -g @railway/cli
```

---

## 🚀 Option 1: Automated Script (Recommended)

Run the quick start script:

```bash
cd /Users/jaywest/MissionControl
./QUICK_START.sh
```

The script will:
1. Check prerequisites
2. Prompt for your Telegram credentials
3. Deploy to Railway
4. Start Scout agent
5. Guide you through testing

---

## 🔧 Option 2: Manual Steps

### Step 1: Deploy Telegram Bot

```bash
cd /Users/jaywest/MissionControl/packages/telegram-bot

# Login to Railway
railway login

# Initialize project
railway init

# Set environment variables
railway variables set TELEGRAM_BOT_TOKEN="YOUR_TOKEN_HERE"
railway variables set TELEGRAM_CHAT_ID="YOUR_CHAT_ID_HERE"
railway variables set VITE_CONVEX_URL="https://different-gopher-55.convex.cloud"

# Deploy
railway up
```

**Expected output:**
```
✓ Deployment successful
✓ Service is live at: https://your-bot.railway.app
```

### Step 2: Test Telegram Bot

1. Open Telegram
2. Find your bot (search for the username you created)
3. Send: `/start`

**Expected response:**
```
👋 Welcome to Mission Control!

I'm your command bus for managing OpenClaw agents.

Type /help to see available commands.
```

### Step 3: Test Commands

Try these commands:

```
/projects           # Should show "OpenClaw"
/switch openclaw    # Should confirm switch
/inbox             # Should show 8 tasks
/status            # Should show project stats
```

### Step 4: Run Scout Agent

Open a new terminal:

```bash
cd /Users/jaywest/MissionControl/packages/agent-runner

# Set environment
export CONVEX_URL=https://different-gopher-55.convex.cloud
export PROJECT_SLUG=openclaw
export AGENT_NAME=Scout
export AGENT_ROLE=SPECIALIST
export AGENT_TYPES=CUSTOMER_RESEARCH,SEO_RESEARCH
export AGENT_EMOJI=🔍

# Install dependencies (if needed)
pnpm install

# Start agent
pnpm dev
```

**Expected output:**
```
[Scout] Registered: agent_id_here (Project: OpenClaw)
[Scout] Heartbeat every 900s
[Scout] Project: openclaw (project_id_here)
[Scout] HEARTBEAT_OK — No pending tasks or notifications. Standing by.
```

---

## ✅ Verify Everything Works

### 1. Check UI (1 minute)

Open: https://mission-control-1nx3xil7e-jaydubya818.vercel.app

You should see:
- ✅ Project: "OpenClaw" in top-left
- ✅ Sidebar: 12 agents (11 original + Scout 🔍)
- ✅ Scout status: "ACTIVE" (green badge)
- ✅ Kanban: 8 tasks

### 2. Watch Scout Claim a Task (5 minutes)

1. In UI, click "Create Task"
2. Fill in:
   - Title: "Research competitor pricing"
   - Type: "CUSTOMER_RESEARCH"
   - Priority: 1
   - Description: "Analyze top 5 competitors"
3. Click "Create"

**What happens:**
1. Task appears in INBOX column
2. Within 15 minutes, Scout's heartbeat detects it
3. Scout claims the task (moves to ASSIGNED)
4. Scout starts the task (moves to IN_PROGRESS)
5. Scout posts a work plan

**Watch in terminal:**
```
[Scout] Claimed task task_id_here
[Scout] Started task task_id_here
```

### 3. Check Timeline (1 minute)

1. Click the task in Kanban
2. TaskDrawer opens
3. Click "Timeline" tab

You should see:
- ✅ Task created
- ✅ Task assigned to Scout
- ✅ Task transitioned to IN_PROGRESS
- ✅ Work plan posted

---

## 🎊 Success!

You now have:
- ✅ Telegram bot deployed and responding
- ✅ Scout agent running and claiming tasks
- ✅ Full Mission Control operational

---

## 📱 Telegram Commands Reference

### Basic Commands
- `/projects` - List all projects
- `/switch <slug>` - Switch project
- `/inbox` - Show inbox tasks
- `/status` - Project statistics
- `/burnrate` - Today's spend

### Approvals
- `/my_approvals` - Pending approvals
- `/approve <id>` - Approve request
- `/deny <id> <reason>` - Deny request

### Squad Management
- `/pause_squad` - Pause all agents
- `/resume_squad` - Resume all agents
- `/quarantine <agent>` - Quarantine agent

### Help
- `/help` - Show all commands
- `/start` - Welcome message

---

## 🔧 Troubleshooting

### Bot Not Responding

**Check:**
1. Railway deployment is running: `railway status`
2. Environment variables are set: `railway variables`
3. Bot token is correct
4. You're messaging the right bot

**Fix:**
```bash
railway logs  # Check for errors
railway restart  # Restart service
```

### Agent Not Claiming Tasks

**Check:**
1. Agent is running (terminal shows heartbeats)
2. Task type matches agent's allowedTaskTypes
3. Task is in INBOX status
4. Agent status is ACTIVE (not PAUSED)

**Fix:**
```bash
# Restart agent
# Press Ctrl+C in agent terminal
# Run pnpm dev again
```

### Agent Not Appearing in UI

**Check:**
1. Agent registered successfully (check terminal)
2. Refresh UI (Cmd+R or Ctrl+R)
3. Check Convex dashboard for errors

**Fix:**
```bash
# Check agent registration
# Terminal should show: "[Scout] Registered: agent_id_here"
```

---

## 🎯 Next Steps

### 1. Deploy More Agents

Create different agents for different tasks:

```bash
# Cipher - Code specialist
export AGENT_NAME=Cipher
export AGENT_ROLE=LEAD
export AGENT_TYPES=CODE_REVIEW,REFACTORING
export AGENT_EMOJI=🔐

# Nova - Content specialist
export AGENT_NAME=Nova
export AGENT_ROLE=SPECIALIST
export AGENT_TYPES=CONTENT_CREATION,COPYWRITING
export AGENT_EMOJI=✨
```

### 2. Create More Tasks

Use the UI or Telegram to create tasks:

```
/create_task Research market trends
/create_task Review authentication code
/create_task Write blog post about AI
```

### 3. Monitor and Iterate

Watch the system work:
- Check UI for real-time updates
- Monitor Telegram for notifications
- Review timeline for audit trail
- Adjust budgets and policies as needed

---

## 📚 Documentation

- **Full Guide:** [docs/ALL_PHASES_COMPLETE.md](docs/ALL_PHASES_COMPLETE.md)
- **Agent Integration:** [docs/OPENCLAW_INTEGRATION.md](docs/OPENCLAW_INTEGRATION.md)
- **Telegram Commands:** [docs/TELEGRAM_COMMANDS.md](docs/TELEGRAM_COMMANDS.md)
- **Bot Deployment:** [packages/telegram-bot/DEPLOY.md](packages/telegram-bot/DEPLOY.md)

---

## 🆘 Need Help?

1. Check logs: `railway logs` (bot) or terminal output (agent)
2. Review documentation in `docs/` folder
3. Check Convex dashboard: https://dashboard.convex.dev
4. Verify environment variables are correct

---

**Ready to deploy? Run:**

```bash
cd /Users/jaywest/MissionControl
./QUICK_START.sh
```

🚀 **Let's go!**
