/**
 * Telegram Bot for Mission Control
 * 
 * Command bus and notification channel for OpenClaw agents.
 */

import { Telegraf, Context } from "telegraf";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
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

/**
 * Approval decisions are deliberately NOT available from Telegram.
 *
 * `approvals.approve` / `approvals.deny` now resolve the deciding operator
 * server-side from an authenticated Mission Control identity, because RED-risk
 * dual control is enforced by comparing the first and second decider. This bot
 * holds no operator identity: it previously passed the sender's Telegram
 * username as the decider, which meant anyone in the chat could approve a
 * consequential action and could satisfy both halves of dual control alone.
 *
 * Reading the pending queue from chat stays supported; deciding does not.
 */
function approvalDecisionUnavailableMessage(approvalRef: string): string {
  const base = process.env.MISSION_CONTROL_APP_URL?.trim();
  const where = base
    ? `${base.replace(/\/+$/, "")}/v2/control-approvals`
    : "Mission Control → Approvals";
  return [
    `🔒 Approval ${approvalRef} cannot be decided from Telegram.`,
    "",
    "Consequential approvals require an authenticated Mission Control operator so the",
    "decision is attributable and dual control cannot be satisfied by one person.",
    "",
    `Decide it here: ${where}`,
  ].join("\n");
}

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

// Handle inline button callbacks
bot.on("callback_query", async (ctx) => {
  const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
  
  if (!data) {
    await ctx.answerCbQuery("No data received");
    return;
  }
  
  // Parse callback data
  const [action, approvalId] = data.split(":");
  
  if (action === "approve") {
    // Deciding an approval requires an authenticated Mission Control operator.
    await ctx.answerCbQuery("Decide in Mission Control");
    await ctx.reply(approvalDecisionUnavailableMessage(approvalId));
  } else if (action === "deny") {
    // For deny, we need a reason - prompt user
    await ctx.answerCbQuery("Use /deny command with reason");
    await ctx.reply(
      `To deny this approval, use:\n\`/deny ${approvalId} <your reason>\``,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.answerCbQuery("Unknown action");
  }
});

// ============================================================================
// INLINE BUTTON CALLBACKS
// ============================================================================

bot.on("callback_query", async (ctx) => {
  const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
  
  if (!data) {
    await ctx.answerCbQuery("No data received");
    return;
  }
  
  try {
    // Parse callback data
    const [action, approvalId] = data.split(":");
    
    if (action === "approve") {
      await ctx.answerCbQuery("Decide in Mission Control");
      await ctx.reply(approvalDecisionUnavailableMessage(approvalId.slice(-6)));
    } else if (action === "deny") {
      // For deny, we need a reason - prompt user
      await ctx.answerCbQuery("Use /deny command with reason");
      await ctx.reply(
        `To deny this approval, use:\n\`/deny ${approvalId.slice(-6)} <your reason>\``,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.answerCbQuery("Unknown action");
    }
  } catch (error) {
    console.error("Error handling callback:", error);
    await ctx.answerCbQuery("❌ Error");
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
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
