# Telegram Bot Deployment Guide

**Version:** 1.0  
**Last Updated:** 2026-02-02

---

## Prerequisites

1. **Telegram Bot Token**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow prompts
   - Save your bot token

2. **Telegram Chat ID**
   - Add your bot to a group or get your personal chat ID
   - Use [@userinfobot](https://t.me/userinfobot) to get your chat ID
   - Or use [@getidsbot](https://t.me/getidsbot) for group IDs

---

## Option 1: Railway (Recommended)

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### Step 2: Create Project
```bash
cd packages/telegram-bot
railway init
```

### Step 3: Set Environment Variables
```bash
railway variables set TELEGRAM_BOT_TOKEN=your_token_here
railway variables set TELEGRAM_CHAT_ID=your_chat_id
railway variables set VITE_CONVEX_URL=https://different-gopher-55.convex.cloud
```

### Step 4: Deploy
```bash
railway up
```

---

## Option 2: Render

### Step 1: Create Web Service
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Select `packages/telegram-bot` as root directory

### Step 2: Configure
- **Name:** mission-control-telegram-bot
- **Environment:** Node
- **Build Command:** `cd ../.. && pnpm install && cd packages/telegram-bot && pnpm build`
- **Start Command:** `node dist/index.js`

### Step 3: Environment Variables
Add in Render dashboard:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `VITE_CONVEX_URL`

---

## Option 3: Docker (Any Platform)

### Build Image
```bash
cd /Users/jaywest/MissionControl
docker build -f packages/telegram-bot/Dockerfile -t mission-control-telegram-bot .
```

### Run Locally
```bash
docker run -d \
  --name telegram-bot \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_CHAT_ID=your_chat_id \
  -e VITE_CONVEX_URL=https://different-gopher-55.convex.cloud \
  mission-control-telegram-bot
```

### Deploy to Fly.io
```bash
fly launch --dockerfile packages/telegram-bot/Dockerfile
fly secrets set TELEGRAM_BOT_TOKEN=your_token
fly secrets set TELEGRAM_CHAT_ID=your_chat_id
fly secrets set VITE_CONVEX_URL=https://different-gopher-55.convex.cloud
fly deploy
```

---

## Option 4: PM2 on VPS

### Step 1: Install on Server
```bash
# On your server
cd /opt
git clone https://github.com/jaydubya818/MissionControl.git
cd MissionControl
pnpm install
cd packages/telegram-bot
pnpm build
```

### Step 2: Create .env
```bash
cat > .env <<EOF
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
VITE_CONVEX_URL=https://different-gopher-55.convex.cloud
EOF
```

### Step 3: Start with PM2
```bash
pm2 start dist/index.js --name telegram-bot
pm2 save
pm2 startup
```

---

## Testing After Deployment

### 1. Check Bot Status
Send `/start` to your bot on Telegram. You should see:
```
👋 Welcome to Mission Control!

I'm your command bus for managing OpenClaw agents.

Type /help to see available commands.
```

### 2. Test Commands
```
/projects          # Should list OpenClaw project
/switch openclaw   # Should confirm switch
/inbox            # Should show inbox tasks
/status           # Should show project stats
```

### 3. Monitor Logs
```bash
# Railway
railway logs

# Render
# Check logs in dashboard

# Docker
docker logs telegram-bot -f

# PM2
pm2 logs telegram-bot
```

---

## Troubleshooting

### Bot Not Responding
1. Check bot is running
2. Verify `TELEGRAM_BOT_TOKEN` is correct
3. Check logs for errors
4. Ensure bot is not blocked by Telegram

### Commands Failing
1. Verify `VITE_CONVEX_URL` is correct
2. Check Convex is running
3. Ensure data is seeded
4. Check bot has network access

### Notifications Not Sending
1. Verify `TELEGRAM_CHAT_ID` is correct
2. Check bot has permission to send to chat/group
3. Review notification logs in Convex

---

## Security Notes

- **Never commit** `.env` files with tokens
- **Rotate tokens** if exposed
- **Use secrets** management in production
- **Restrict chat access** to authorized users only

---

## Monitoring

### Health Check
The bot should respond to `/start` within 2 seconds.

### Metrics to Monitor
- Command response time
- Notification delivery rate
- Error rate
- Uptime

### Alerts
Set up alerts for:
- Bot offline > 5 minutes
- Error rate > 10%
- Notification failures

---

**Ready to deploy!** Choose your preferred platform and follow the steps above.
