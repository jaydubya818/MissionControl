# Telegram Bot for Mission Control

Command bus and notification channel for OpenClaw agents.

## Setup

1. Create a bot with [@BotFather](https://t.me/botfather)
2. Get your bot token
3. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id
   ```

## Running

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Commands

See [docs/TELEGRAM_COMMANDS.md](../../docs/TELEGRAM_COMMANDS.md) for full command reference.

## Architecture

- **Bot Framework:** Telegraf
- **Database:** Convex (via client)
- **Notifications:** Push to Telegram on events
- **Thread Mapping:** Store threadRef on tasks for thread-per-task
