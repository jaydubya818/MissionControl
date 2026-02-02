/**
 * BJ Telegram Bot
 *
 * Dedicated bot instance for BJ, the SellerFi Supervisor Orchestrator.
 *
 * To run:
 * 1. Create a new bot with @BotFather on Telegram
 * 2. Set environment variables:
 *    - BJ_BOT_TOKEN (from @BotFather)
 *    - BJ_CHAT_ID (your Telegram user ID from @userinfobot)
 *    - VITE_CONVEX_URL (your Convex deployment URL)
 * 3. Run: pnpm --filter @mission-control/telegram-bot run:bj
 */

import dotenv from "dotenv";
import { AgentBot } from "./agentBot.js";

dotenv.config();

const BJ_BOT_TOKEN = process.env.BJ_BOT_TOKEN;
const BJ_CHAT_ID = process.env.BJ_CHAT_ID;
const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

if (!BJ_BOT_TOKEN) {
  console.error("❌ BJ_BOT_TOKEN is required");
  console.log("\n📝 To set up BJ's Telegram bot:");
  console.log("1. Open Telegram and message @BotFather");
  console.log("2. Send /newbot and follow the prompts");
  console.log("3. Copy the bot token");
  console.log("4. Add to your .env file:");
  console.log("   BJ_BOT_TOKEN=your-token-here");
  console.log("   BJ_CHAT_ID=your-telegram-user-id");
  console.log("\n💡 Get your user ID by messaging @userinfobot on Telegram");
  process.exit(1);
}

if (!BJ_CHAT_ID) {
  console.error("❌ BJ_CHAT_ID is required");
  console.log("\n💡 Get your Telegram user ID:");
  console.log("1. Open Telegram and message @userinfobot");
  console.log("2. Copy the 'Id' number");
  console.log("3. Add to your .env file:");
  console.log("   BJ_CHAT_ID=your-user-id");
  process.exit(1);
}

if (!CONVEX_URL) {
  console.error("❌ CONVEX_URL is required");
  process.exit(1);
}

console.log("🚀 Starting BJ Telegram Bot...");
console.log(`📡 Convex URL: ${CONVEX_URL}`);

const bjBot = new AgentBot({
  agentName: "BJ",
  botToken: BJ_BOT_TOKEN,
  chatId: BJ_CHAT_ID,
  convexUrl: CONVEX_URL,
});

bjBot.start().catch((error) => {
  console.error("❌ Failed to start BJ bot:", error);
  process.exit(1);
});
