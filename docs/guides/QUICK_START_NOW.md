# 🚀 Quick Start - Get Everything Running NOW

**Time Required:** 30 minutes  
**Date:** 2026-02-02

---

## ✅ What We're Going to Do

1. **Test the UI** (5 min) - Verify everything works
2. **Deploy Telegram Bot** (10 min) - Get bot running
3. **Start Agent Runners** (10 min) - Enable autonomous work
4. **Watch Agents Work** (5 min) - See the magic happen!

---

## 1️⃣ Test the System (5 minutes)

### Step 1: Open the UI
```bash
# Make sure dev server is running (from repo root)
pnpm dev

# Open in browser
open http://localhost:5173/
```

### Step 2: Test All Features

**✅ Test Checklist:**

1. **Project Switching**
   - [ ] Click project dropdown
   - [ ] Switch to "Mission Control"
   - [ ] Verify 10 tasks appear in INBOX

2. **Task Management**
   - [ ] Click a task to open drawer
   - [ ] See all tabs: Overview, Timeline, Artifacts, Approvals, Cost, **Reviews**
   - [ ] Click "Reviews" tab - should load without errors

3. **Dashboards**
   - [ ] Click "🏥 Health" - verify system status
   - [ ] Click "📊 Monitor" - verify monitoring dashboard
   - [ ] Click "💰 Costs" - verify cost analytics
   - [ ] Click "📊 Agents" - verify agent dashboard
   - [ ] Click "📈 Analytics" - verify advanced analytics

4. **Agents**
   - [ ] View sidebar - should show 4 Mission Control agents
   - [ ] Sofie (LEAD)
   - [ ] Backend Developer (SPECIALIST)
   - [ ] Frontend Developer (SPECIALIST)
   - [ ] DevOps (SPECIALIST)

5. **Create a Test Task**
   - [ ] Click "New Task" button
   - [ ] Fill in: "Test task for agents"
   - [ ] Assign to: Backend Developer
   - [ ] Create task
   - [ ] Verify it appears in INBOX

**✅ If all checks pass, system is working!**

---

## 2️⃣ Deploy Telegram Bot (10 minutes)

### Option A: Railway (Recommended)

#### Step 1: Get Bot Token
```bash
# 1. Open Telegram and message @BotFather
# 2. Send: /newbot
# 3. Follow prompts to create bot
# 4. Copy the token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
```

#### Step 2: Get Your Chat ID
```bash
# 1. Message your bot anything
# 2. Visit: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
# 3. Look for "chat":{"id":123456789}
# 4. Copy that number
```

#### Step 3: Deploy to Railway
```bash
# Navigate to telegram-bot package (from repo root)
cd packages/telegram-bot

# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Set environment variables
railway variables set TELEGRAM_BOT_TOKEN=your_token_here
railway variables set TELEGRAM_CHAT_ID=your_chat_id_here
railway variables set VITE_CONVEX_URL=https://different-gopher-55.convex.cloud

# Deploy!
railway up

# Check logs
railway logs
```

#### Step 4: Test Bot
```bash
# In Telegram, message your bot:
/start
/help
/projects
/switch mission-control
/inbox
/my_approvals
```

**✅ Bot is deployed!**

### Option B: Run Locally (Quick Test)

```bash
# Navigate to telegram-bot package (from repo root)
cd packages/telegram-bot

# Create .env file
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
VITE_CONVEX_URL=https://different-gopher-55.convex.cloud
EOF

# Install dependencies
pnpm install

# Run bot
pnpm dev

# Keep this terminal open!
# Bot is now running locally
```

**Test in Telegram:**
- Send `/start` to your bot
- Should respond with welcome message
- Try `/projects` to see all projects

---

## 3️⃣ Start Agent Runners (10 minutes)

### Option A: Run All Agents with PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file (from repo root)
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: "agent-sofie",
      script: "pnpm",
      args: "dev",
      cwd: "./packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Sofie",
      },
    },
    {
      name: "agent-backend-dev",
      script: "pnpm",
      args: "dev",
      cwd: "./packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Backend Developer",
      },
    },
    {
      name: "agent-devops",
      script: "pnpm",
      args: "dev",
      cwd: "./packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "DevOps",
      },
    },
    {
      name: "agent-bj",
      script: "pnpm",
      args: "dev",
      cwd: "./packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "sellerfi",
        AGENT_NAME: "BJ",
      },
    },
  ],
};
EOF

# Start all agents
pm2 start ecosystem.config.js

# Monitor agents
pm2 monit

# View logs
pm2 logs

# Stop all agents
pm2 stop all

# Restart all agents
pm2 restart all
```

### Option B: Run Individual Agents (Manual)

Open 4 separate terminals:

**Terminal 1: Sofie (Mission Control)**
```bash
# Navigate to agent-runner package (from repo root)
cd packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=mission-control \
AGENT_NAME=Sofie \
pnpm dev
```

**Terminal 2: Backend Developer (Mission Control)**
```bash
# Navigate to agent-runner package (from repo root)
cd packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=mission-control \
AGENT_NAME="Backend Developer" \
pnpm dev
```

**Terminal 3: DevOps (Mission Control)**
```bash
# Navigate to agent-runner package (from repo root)
cd packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=mission-control \
AGENT_NAME=DevOps \
pnpm dev
```

**Terminal 4: BJ (SellerFi)**
```bash
# Navigate to agent-runner package (from repo root)
cd packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=sellerfi \
AGENT_NAME=BJ \
pnpm dev
```

**✅ Agents are running!**

---

## 4️⃣ Watch Agents Work (5 minutes)

### In the UI:

1. **Open Mission Control UI**
   ```bash
   open http://localhost:5173/
   ```

2. **Switch to Mission Control Project**
   - Click project dropdown
   - Select "Mission Control"

3. **Watch the INBOX**
   - You should see 10 tasks
   - Watch as agents claim tasks (status changes to ASSIGNED)
   - Then to IN_PROGRESS as they work

4. **Open Task Drawers**
   - Click any task being worked on
   - Go to "Timeline" tab
   - Watch real-time updates as agent works
   - See messages, transitions, runs

5. **Check Agent Dashboard**
   - Click "📊 Agents" button
   - See active agents
   - View their current tasks
   - Check costs and performance

### In Telegram (if bot is running):

```bash
# Check status
/status

# View inbox
/inbox

# Watch burn rate
/burnrate

# Check approvals
/my_approvals
```

### In PM2 Logs (if using PM2):

```bash
# Watch all agent logs
pm2 logs

# Watch specific agent
pm2 logs agent-sofie
pm2 logs agent-backend-dev
```

---

## 🎯 What You Should See

### Successful Agent Behavior:

1. **Agent Registers**
   ```
   ✅ Agent registered: Backend Developer
   📡 Starting heartbeat loop...
   ```

2. **Agent Claims Task**
   ```
   🎯 Claiming task: Implement Thread-per-Task in Telegram Bot
   ✅ Task claimed successfully
   ```

3. **Agent Works**
   ```
   🔨 Starting work on task...
   📝 Creating work plan...
   ⚙️  Executing implementation...
   ```

4. **Agent Reports Progress**
   ```
   📊 Progress: 25% complete
   💬 Posted update to task
   ```

5. **Agent Completes**
   ```
   ✅ Task completed!
   📤 Deliverable submitted
   🎉 Moving to REVIEW status
   ```

---

## 🔧 Troubleshooting

### UI Not Loading?
```bash
# From repo root
pnpm install
pnpm dev
```

### Telegram Bot Not Responding?
```bash
# Check logs
railway logs
# or
pm2 logs telegram-bot

# Verify environment variables
railway variables
```

### Agent Not Claiming Tasks?
```bash
# Check agent logs
pm2 logs agent-backend-dev

# Verify agent is ACTIVE in UI
# Check agent has correct PROJECT_SLUG
# Verify CONVEX_URL is correct
```

### Tasks Not Appearing?
```bash
# Re-run task creation script (from repo root)
npx tsx scripts/create-mission-control-tasks.ts
```

---

## 📊 Success Metrics

**You'll know it's working when:**

- ✅ UI loads without errors
- ✅ All 8 dashboards work
- ✅ 10 tasks visible in Mission Control INBOX
- ✅ Telegram bot responds to commands
- ✅ Agents show as ACTIVE in sidebar
- ✅ Tasks move from INBOX → ASSIGNED → IN_PROGRESS
- ✅ Timeline shows agent activity
- ✅ PM2 shows all agents running
- ✅ Costs are being tracked

---

## 🎉 You're Done!

**Congratulations! You now have:**

- ✅ Full UI running locally
- ✅ Telegram bot deployed and responding
- ✅ 4 agents running autonomously
- ✅ 10 real tasks being worked on
- ✅ Complete observability
- ✅ Real-time monitoring

**The agents are now working autonomously on Mission Control tasks!**

---

## 📚 Next Steps

1. **Monitor Progress**
   - Watch agents in UI
   - Check Telegram notifications
   - Review PM2 logs

2. **Create More Tasks**
   - Use "New Task" button
   - Assign to agents
   - Watch them work

3. **Test Workflows**
   - Create approval requests
   - Add peer reviews
   - Export incident reports

4. **Deploy to Production**
   - Follow `DEPLOYMENT_COMPLETE_GUIDE.md`
   - Set up monitoring
   - Configure backups

---

## 🆘 Need Help?

- **Documentation:** `DEPLOYMENT_COMPLETE_GUIDE.md`
- **Status:** `COMPLETE_STATUS.md`
- **Roadmap:** `IMPLEMENTATION_ROADMAP_V1.6.md`
- **Health Check:** Click "🏥 Health" in UI

**Everything is ready! Let's get it running!** 🚀
