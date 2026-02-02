# Telegram Bot Setup Guide

Mission Control supports multiple Telegram bots:
1. **Mission Control Bot** - Main bot for system commands and notifications
2. **Agent Bots** - Individual bots for specific agents (e.g., BJ)

## Prerequisites

- Telegram account
- Access to @BotFather on Telegram
- Convex deployment URL

## Step 1: Create Telegram Bots

### Mission Control Bot (if not already created)

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Choose a name: `Mission Control Bot`
4. Choose a username: `your_mission_control_bot` (must be unique and end with 'bot')
5. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### BJ Agent Bot

1. Message `@BotFather` again
2. Send `/newbot`
3. Choose a name: `BJ - SellerFi Orchestrator`
4. Choose a username: `your_bj_sellerfi_bot` (must be unique and end with 'bot')
5. Copy the bot token

## Step 2: Get Your Chat ID

1. Search for `@userinfobot` on Telegram
2. Send `/start`
3. Copy your user ID (the `Id` field)

## Step 3: Configure Environment Variables

Create or update `/packages/telegram-bot/.env`:

```bash
# Mission Control Bot
TELEGRAM_BOT_TOKEN=your-mission-control-token-here
TELEGRAM_CHAT_ID=your-telegram-user-id

# BJ Agent Bot
BJ_BOT_TOKEN=your-bj-bot-token-here
BJ_CHAT_ID=your-telegram-user-id

# Convex
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

## Step 4: Create BJ Agent in Mission Control

If BJ doesn't exist in your database yet, run:

```bash
# Create SellerFi project (if not exists)
npx convex run setupProjects:createInitialProjects

# Create BJ and other SellerFi agents
npx convex run setupSellerFiAgents:createSellerFiAgents
```

## Step 5: Run the Bots

### Mission Control Bot (commands and notifications)

```bash
# Development mode
pnpm --filter @mission-control/telegram-bot dev

# Production
pnpm --filter @mission-control/telegram-bot build
pnpm --filter @mission-control/telegram-bot start
```

### BJ Agent Bot (conversational interface)

```bash
# Development mode
pnpm --filter @mission-control/telegram-bot dev:bj

# Production
pnpm --filter @mission-control/telegram-bot build
pnpm --filter @mission-control/telegram-bot start:bj
```

## Step 6: Test the Bots

### Test Mission Control Bot

1. Open Telegram and search for your Mission Control bot username
2. Send `/start` - You should get a welcome message
3. Send `/help` - You should see available commands
4. Send `/projects` - You should see your projects

### Test BJ Agent Bot

1. Open Telegram and search for your BJ bot username
2. Send `/start` - You should get a welcome from BJ
3. Send `/status` - You should see BJ's current status
4. Send a message like "Review the authentication code" - BJ should create a task

## Bot Capabilities

### Mission Control Bot

Commands:
- `/help` - Show available commands
- `/projects` - List projects
- `/switch <project>` - Switch to project
- `/inbox` - Show inbox tasks
- `/status` - Show project status
- `/burnrate` - Show burn rate
- `/my_approvals` - Show pending approvals
- `/approve <id>` - Approve request
- `/deny <id> <reason>` - Deny request
- `/pause_squad` - Pause all agents
- `/resume_squad` - Resume all agents
- `/quarantine <agent>` - Quarantine agent

### BJ Agent Bot

Commands:
- `/start` - Introduction
- `/status` - Show BJ's current status and tasks
- `/tasks` - List BJ's tasks
- `/help` - Show available commands

Conversational:
- Send any message to create a task for BJ
- BJ will automatically classify the task type based on content
- BJ will respond with task confirmation

## Running Multiple Agent Bots

To create additional agent bots (e.g., for Tech Lead, Agent Organizer):

1. Create new bot with @BotFather
2. Add token to `.env`:
   ```bash
   TECH_LEAD_BOT_TOKEN=...
   TECH_LEAD_CHAT_ID=...
   ```

3. Create new bot file: `src/tech-lead-bot.ts`:
   ```typescript
   import { AgentBot } from "./agentBot.js";

   const bot = new AgentBot({
     agentName: "Tech Lead",
     botToken: process.env.TECH_LEAD_BOT_TOKEN!,
     chatId: process.env.TECH_LEAD_CHAT_ID!,
     convexUrl: process.env.VITE_CONVEX_URL!,
   });

   bot.start();
   ```

4. Add script to `package.json`:
   ```json
   "dev:tech-lead": "tsx watch src/tech-lead-bot.ts",
   "start:tech-lead": "node dist/tech-lead-bot.js"
   ```

## Deployment

### Railway / Heroku

For production deployment, set environment variables in your hosting platform:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
BJ_BOT_TOKEN=...
BJ_CHAT_ID=...
VITE_CONVEX_URL=...
```

Update your `Procfile` or start command:
```
web: node packages/telegram-bot/dist/index.js
bj: node packages/telegram-bot/dist/bj-bot.js
```

### Docker

Build both bots:
```dockerfile
# Build
RUN pnpm --filter @mission-control/telegram-bot build

# Run Mission Control bot
CMD ["node", "packages/telegram-bot/dist/index.js"]

# Or run BJ bot
CMD ["node", "packages/telegram-bot/dist/bj-bot.js"]
```

## Troubleshooting

### Bot doesn't respond

1. Check bot token is correct
2. Verify Convex URL is correct
3. Check agent exists in database
4. Look at console logs for errors

### "Agent not found" error

Run the setup script:
```bash
npx convex run setupSellerFiAgents:createSellerFiAgents
```

### Bot stops polling

Check for:
- Network connectivity issues
- Bot token conflicts (same token used twice)
- Telegram API rate limits

### Tasks not creating

1. Verify agent has correct permissions
2. Check task types in agent's `allowedTaskTypes`
3. Look at Convex dashboard for errors

## Advanced Configuration

### Custom Task Type Inference

Edit `agentBot.ts` `inferTaskType()` method to customize how messages are classified:

```typescript
private inferTaskType(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes("your-keyword")) {
    return "YOUR_TASK_TYPE";
  }

  return "OPS";
}
```

### Custom Bot Responses

Modify the `getRoleDescription()` method to customize bot personalities:

```typescript
private getRoleDescription(): string {
  const descriptions: Record<string, string> = {
    "BJ": "Your custom description here",
  };
  return descriptions[this.agentName] || "AI agent";
}
```

## Next Steps

- [ ] Set up webhooks for faster response times
- [ ] Add rich message formatting (buttons, keyboards)
- [ ] Integrate with agent execution results
- [ ] Add voice message support
- [ ] Create agent-to-agent communication via Telegram
