/**
 * Telegram Bot for Mission Control
 * 
 * Command bus and notification channel for OpenClaw agents.
 */

import { Telegraf, Context } from "telegraf";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import dotenv from "dotenv";
import { 
  handleProjects, 
  handleSwitch, 
  handleInbox, 
  handleStatus,
  handleBurnrate,
} from "./commands/basic.js";
import {
  handleMyApprovals,
  handleApprove,
  handleDeny,
} from "./commands/approvals.js";
import {
  handlePauseSquad,
  handleResumeSquad,
  handleQuarantine,
} from "./commands/squad.js";
import { handleThreadReply } from "./threads.js";

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is required");
}

// ============================================================================
// CONTEXT EXTENSION
// ============================================================================

interface BotContext extends Context {
  convex: ConvexHttpClient;
  userProjectId: Id<"projects"> | null;
}

// ============================================================================
// BOT INITIALIZATION
// ============================================================================

const bot = new Telegraf<BotContext>(BOT_TOKEN);
const convex = new ConvexHttpClient(CONVEX_URL);

// Attach convex client to context
bot.use(async (ctx, next) => {
  ctx.convex = convex;
  ctx.userProjectId = null; // TODO: Load from user state
  await next();
});

// ============================================================================
// COMMANDS
// ============================================================================

// Basic commands
bot.command("projects", handleProjects);
bot.command("switch", handleSwitch);
bot.command("inbox", handleInbox);
bot.command("status", handleStatus);
bot.command("burnrate", handleBurnrate);

// Approval commands
bot.command("my_approvals", handleMyApprovals);
bot.command("approve", handleApprove);
bot.command("deny", handleDeny);

// Squad commands
bot.command("pause_squad", handlePauseSquad);
bot.command("resume_squad", handleResumeSquad);
bot.command("quarantine", handleQuarantine);

// Help command
bot.command("help", async (ctx) => {
  await ctx.reply(
    `🤖 Mission Control Bot Commands:\n\n` +
    `📁 Projects:\n` +
    `/projects - List all projects\n` +
    `/switch <slug> - Switch to project\n\n` +
    `📋 Tasks:\n` +
    `/inbox - Show inbox tasks\n` +
    `/status - Show project status\n` +
    `/burnrate - Show burn rate\n\n` +
    `✅ Approvals:\n` +
    `/my_approvals - Show pending approvals\n` +
    `/approve <id> - Approve request\n` +
    `/deny <id> <reason> - Deny request\n\n` +
    `👥 Squad:\n` +
    `/pause_squad - Pause all agents\n` +
    `/resume_squad - Resume all agents\n` +
    `/quarantine <agent> - Quarantine agent\n\n` +
    `See docs/TELEGRAM_COMMANDS.md for details.`
  );
});

// Start command
bot.command("start", async (ctx) => {
  await ctx.reply(
    `👋 Welcome to Mission Control!\n\n` +
    `I'm your command bus for managing OpenClaw agents.\n\n` +
    `Type /help to see available commands.`
  );
});

// ============================================================================
// THREAD REPLIES
// ============================================================================

// Handle replies to task threads
bot.on("message", async (ctx) => {
  // Skip if it's a command
  if (ctx.message && "text" in ctx.message && ctx.message.text?.startsWith("/")) {
    return;
  }
  
  // Handle thread replies
  await handleThreadReply(convex, ctx.message);
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply(`❌ Error: ${err instanceof Error ? err.message : "Unknown error"}`);
});

// ============================================================================
// LAUNCH
// ============================================================================

console.log("🚀 Starting Mission Control Telegram Bot...");
console.log(`📡 Convex URL: ${CONVEX_URL}`);

bot.launch().then(() => {
  console.log("✅ Bot is running!");
  console.log("📱 Send /start to begin");
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

export { bot, convex };
