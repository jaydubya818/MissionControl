# Mission Control - Complete Deployment Guide

**Date:** 2026-02-02  
**Version:** v1.5

---

## 🎉 What's Been Built

### ✅ Core Features (Complete)
- ✅ Multi-project workspaces (3 projects: OpenClaw, SellerFi, Mission Control)
- ✅ 18 agents across all projects
- ✅ Task state machine with transitions
- ✅ Approval workflow
- ✅ Policy engine
- ✅ Budget tracking
- ✅ Observability (activities, alerts, runs)
- ✅ Real-time UI with Convex
- ✅ Drag & Drop Kanban
- ✅ Smart Task Assignment
- ✅ Webhook System
- ✅ Mobile Responsive UI
- ✅ Health Dashboard
- ✅ Monitoring Dashboard
- ✅ Cost Analytics
- ✅ Agent Performance Dashboard
- ✅ Task Comments with @Mentions
- ✅ Telegram Bot with inline buttons

### 📦 What's Ready to Deploy
1. **UI** - React/Vite app (already deployed to Vercel)
2. **Backend** - Convex (already deployed)
3. **Telegram Bot** - Ready for Railway deployment
4. **Agent Runner** - Ready for local/cloud deployment

---

## 🚀 Quick Start (5 Minutes)

### 1. UI is Already Running!
```bash
# Open in browser:
http://localhost:5173/

# Or production:
https://mission-control-mission-control-ui-git-main-jaydubya818.vercel.app
```

### 2. Test the System
1. Select a project from dropdown
2. View agents in sidebar
3. Create a test task
4. Assign to an agent
5. Check Health Dashboard (🏥 Health button)
6. Check Monitoring (📊 Monitor button)

---

## 📱 Deploy Telegram Bot (10 Minutes)

### Option A: Railway (Recommended)

#### Step 1: Get Bot Token
```bash
# 1. Message @BotFather on Telegram
# 2. Send: /newbot
# 3. Follow prompts
# 4. Copy the token
```

#### Step 2: Deploy to Railway
```bash
cd /Users/jaywest/MissionControl/packages/telegram-bot

# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Set environment variables
railway variables set TELEGRAM_BOT_TOKEN=your_token_here
railway variables set VITE_CONVEX_URL=https://different-gopher-55.convex.cloud

# Deploy
railway up

# Check logs
railway logs
```

#### Step 3: Test
```bash
# In Telegram, message your bot:
/start
/help
/projects
/my_approvals
```

### Option B: Docker (Alternative)

```bash
cd /Users/jaywest/MissionControl

# Build
docker build -t mission-control-telegram -f packages/telegram-bot/Dockerfile .

# Run
docker run -d \
  --name telegram-bot \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e VITE_CONVEX_URL=https://different-gopher-55.convex.cloud \
  mission-control-telegram

# Check logs
docker logs -f telegram-bot
```

### Option C: Local (Development)

```bash
cd /Users/jaywest/MissionControl/packages/telegram-bot

# Create .env
cat > .env << EOF
TELEGRAM_BOT_TOKEN=your_token_here
VITE_CONVEX_URL=https://different-gopher-55.convex.cloud
EOF

# Run
pnpm dev

# Keep terminal open - bot is running!
```

---

## 🤖 Deploy Agent Runner (15 Minutes)

### What is Agent Runner?

The agent-runner package enables autonomous agents to:
- Claim tasks automatically
- Execute work
- Report progress via heartbeat
- Request approvals when needed

### Option A: Local Development

```bash
cd /Users/jaywest/MissionControl/packages/agent-runner

# Create .env
cat > .env << EOF
CONVEX_URL=https://different-gopher-55.convex.cloud
PROJECT_SLUG=sellerfi
AGENT_NAME=BJ
EOF

# Run
pnpm dev

# Agent will:
# 1. Register with Mission Control
# 2. Start heartbeat loop
# 3. Claim and execute tasks
# 4. Report progress
```

### Option B: Multiple Agents

```bash
# Terminal 1: BJ for SellerFi
cd /Users/jaywest/MissionControl/packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=sellerfi \
AGENT_NAME=BJ \
pnpm dev

# Terminal 2: Sofie for Mission Control
cd /Users/jaywest/MissionControl/packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=mission-control \
AGENT_NAME=Sofie \
pnpm dev

# Terminal 3: Scout for OpenClaw
cd /Users/jaywest/MissionControl/packages/agent-runner
CONVEX_URL=https://different-gopher-55.convex.cloud \
PROJECT_SLUG=openclaw \
AGENT_NAME=Scout \
pnpm dev
```

### Option C: Production (PM2)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: "agent-bj",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "sellerfi",
        AGENT_NAME: "BJ",
      },
    },
    {
      name: "agent-sofie",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Sofie",
      },
    },
  ],
};
EOF

# Start all agents
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs

# Stop all
pm2 stop all
```

---

## 🧪 Testing Checklist

### UI Testing
- [ ] Open http://localhost:5173/
- [ ] Switch between projects
- [ ] View all agents in sidebar
- [ ] Create a task
- [ ] Assign task to agent
- [ ] View task in Kanban
- [ ] Drag task between columns
- [ ] Open task drawer
- [ ] View task timeline
- [ ] Add comment with @mention
- [ ] Check Health Dashboard
- [ ] Check Monitoring Dashboard
- [ ] Check Cost Analytics
- [ ] Check Agent Dashboard
- [ ] Test on mobile (responsive)

### Telegram Bot Testing
- [ ] Send /start
- [ ] Send /help
- [ ] Send /projects
- [ ] Send /switch sellerfi
- [ ] Send /inbox
- [ ] Send /status
- [ ] Send /my_approvals
- [ ] Click inline "Approve" button
- [ ] Send /pause_squad
- [ ] Send /resume_squad

### Agent Runner Testing
- [ ] Agent registers successfully
- [ ] Agent appears in UI as ACTIVE
- [ ] Agent claims a task
- [ ] Agent reports progress
- [ ] Agent completes task
- [ ] Agent requests approval (if needed)
- [ ] Agent heartbeat shows in logs

---

## 📊 Monitoring & Observability

### Health Checks

```bash
# Check system health
curl https://different-gopher-55.convex.cloud/api/query \
  -H "Content-Type: application/json" \
  -d '{"path":"health:check","args":{}}'

# Check metrics
curl https://different-gopher-55.convex.cloud/api/query \
  -H "Content-Type: application/json" \
  -d '{"path":"health:metrics","args":{}}'
```

### In UI
- Click "🏥 Health" button
- View system status
- Check component health
- View metrics

### Monitoring Dashboard
- Click "📊 Monitor" button
- View errors tab
- View performance tab
- View audit log tab

---

## 🔧 Troubleshooting

### Telegram Bot Not Responding

```bash
# Check logs
railway logs
# or
docker logs telegram-bot
# or
pm2 logs telegram-bot

# Common issues:
# 1. Wrong token - check TELEGRAM_BOT_TOKEN
# 2. Wrong Convex URL - check VITE_CONVEX_URL
# 3. Bot not started - run railway up
```

### Agent Not Claiming Tasks

```bash
# Check agent status in UI
# Should show as ACTIVE

# Check logs
pm2 logs agent-bj

# Common issues:
# 1. Wrong project slug
# 2. Wrong agent name
# 3. No tasks available
# 4. Agent paused
```

### UI Not Loading

```bash
# Check Convex deployment
npx convex dev --once

# Check Vercel deployment
vercel --prod

# Common issues:
# 1. Convex bundler error - use dev deployment
# 2. Environment variables missing
# 3. Build failed
```

---

## 📚 Documentation

- **Projects Guide:** `PROJECTS_GUIDE.md`
- **SellerFi Agents:** `SELLERFI_AGENTS_GUIDE.md`
- **Runbook:** `docs/RUNBOOK.md`
- **Telegram Commands:** `docs/TELEGRAM_COMMANDS.md`
- **Implementation Plans:**
  - `IMPLEMENTATION_PLAN_V1.3.md`
  - `IMPLEMENTATION_PLAN_V1.4.md`
  - `V1.3_COMPLETE.md`
  - `V1.4_COMPLETE.md`

---

## 🎯 What's Next?

### Immediate (Optional Enhancements)
1. **Add more agents** - Create specialized agents for each project
2. **Create tasks** - Start using the system for real work
3. **Set up webhooks** - Integrate with external systems
4. **Configure policies** - Fine-tune approval rules

### Future Features (v1.6+)
1. **Multi-executor routing** - Route tasks to different execution environments
2. **Advanced peer review** - PRAISE/REFUTE/CHANGESET workflows
3. **Thread-per-task** - Telegram threads for each task
4. **Export incident reports** - Generate compliance reports
5. **Full-text search** - Enhanced search across all data

---

## ✅ Summary

You now have:
- ✅ **3 projects** (OpenClaw, SellerFi, Mission Control)
- ✅ **18 agents** across all projects
- ✅ **Full UI** with dashboards and monitoring
- ✅ **Telegram bot** ready to deploy
- ✅ **Agent runner** ready to deploy
- ✅ **Complete observability** with health checks and monitoring
- ✅ **Mobile responsive** UI
- ✅ **Webhook system** for integrations

**Everything is ready to deploy!** 🚀

Choose your deployment strategy and follow the guides above.

---

## 🆘 Need Help?

1. **Check logs** - Most issues are visible in logs
2. **Check Health Dashboard** - System status at a glance
3. **Check Monitoring** - Errors and performance metrics
4. **Review docs** - Comprehensive guides available
5. **Test locally first** - Easier to debug

**You're all set!** 🎉
