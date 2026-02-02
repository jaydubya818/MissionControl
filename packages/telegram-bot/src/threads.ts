/**
 * Thread-per-Task Management
 * 
 * Creates and manages Telegram threads for tasks.
 */

import type { Telegraf } from "telegraf";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FORUM_TOPIC_ID = process.env.TELEGRAM_FORUM_TOPIC_ID; // Optional: for forum groups

// ============================================================================
// CREATE THREAD FOR TASK
// ============================================================================

export async function createThreadForTask(
  bot: Telegraf,
  convex: ConvexHttpClient,
  taskId: Id<"tasks">
) {
  if (!TELEGRAM_CHAT_ID) {
    console.warn("TELEGRAM_CHAT_ID not set - cannot create thread");
    return null;
  }
  
  try {
    const task = await convex.query(api.tasks.get, { taskId });
    if (!task) {
      console.error("Task not found:", taskId);
      return null;
    }
    
    // Check if thread already exists
    if (task.threadRef) {
      console.log(`Thread already exists for task ${taskId}: ${task.threadRef}`);
      return task.threadRef;
    }
    
    // Create thread message
    const priorityEmoji = task.priority === 1 ? "🔴" : task.priority === 2 ? "🟠" : "🔵";
    const messageOptions: any = {
      parse_mode: "Markdown",
    };
    
    if (FORUM_TOPIC_ID) {
      messageOptions.message_thread_id = parseInt(FORUM_TOPIC_ID);
    }
    
    const message = await bot.telegram.sendMessage(
      TELEGRAM_CHAT_ID,
      `${priorityEmoji} **Task: ${task.title}**\n\n` +
      `Type: ${task.type}\n` +
      `Priority: ${task.priority}\n` +
      `Status: ${task.status}\n\n` +
      `${task.description || "No description"}`,
      messageOptions
    );
    
    // Store threadRef on task
    const threadRef = `${TELEGRAM_CHAT_ID}:${message.message_id}`;
    await convex.mutation(api.tasks.updateThreadRef, {
      taskId,
      threadRef,
    });
    
    console.log(`Created thread for task ${taskId}: ${threadRef}`);
    return threadRef;
  } catch (error) {
    console.error("Failed to create thread:", error);
    return null;
  }
}

// ============================================================================
// POST MESSAGE TO THREAD
// ============================================================================

export async function postMessageToThread(
  bot: Telegraf,
  threadRef: string,
  message: string
) {
  if (!threadRef) {
    console.warn("No threadRef provided");
    return;
  }
  
  try {
    const [chatId, messageId] = threadRef.split(":");
    
    const messageOptions: any = {
      parse_mode: "Markdown",
      reply_to_message_id: parseInt(messageId),
    };
    
    await bot.telegram.sendMessage(chatId, message, messageOptions);
  } catch (error) {
    console.error("Failed to post to thread:", error);
  }
}

// ============================================================================
// LISTEN TO THREAD REPLIES
// ============================================================================

/**
 * Handle replies in task threads.
 * When a human replies to a task thread, post the message to Mission Control.
 */
export async function handleThreadReply(
  convex: ConvexHttpClient,
  message: any
) {
  try {
    // Check if this is a reply
    if (!message.reply_to_message) {
      return;
    }
    
    const replyToMessageId = message.reply_to_message.message_id;
    const chatId = message.chat.id;
    const threadRef = `${chatId}:${replyToMessageId}`;
    
    // Find task with this threadRef
    const tasks = await convex.query(api.tasks.listAll, {});
    const task = tasks.find((t: any) => t.threadRef === threadRef);
    
    if (!task) {
      console.log("No task found for thread:", threadRef);
      return;
    }
    
    // Post message to Mission Control
    await convex.mutation(api.messages.post, {
      taskId: task._id,
      authorType: "HUMAN",
      authorUserId: message.from.username || message.from.id.toString(),
      type: "COMMENT",
      content: message.text || "[non-text message]",
      idempotencyKey: `telegram-${message.message_id}-${Date.now()}`,
    });
    
    console.log(`Posted thread reply to task ${task._id}`);
  } catch (error) {
    console.error("Failed to handle thread reply:", error);
  }
}

// ============================================================================
// SYNC TASK STATUS TO THREAD
// ============================================================================

/**
 * Update thread message when task status changes.
 */
export async function updateThreadStatus(
  bot: Telegraf,
  convex: ConvexHttpClient,
  taskId: Id<"tasks">
) {
  try {
    const task = await convex.query(api.tasks.get, { taskId });
    if (!task || !task.threadRef) {
      return;
    }
    
    const [chatId, messageId] = task.threadRef.split(":");
    const priorityEmoji = task.priority === 1 ? "🔴" : task.priority === 2 ? "🟠" : "🔵";
    const statusEmoji = {
      INBOX: "📥",
      ASSIGNED: "👤",
      IN_PROGRESS: "⚙️",
      REVIEW: "👀",
      NEEDS_APPROVAL: "⏳",
      BLOCKED: "🚫",
      DONE: "✅",
      CANCELED: "❌",
    };
    
    await bot.telegram.editMessageText(
      chatId,
      parseInt(messageId),
      undefined,
      `${priorityEmoji} **Task: ${task.title}**\n\n` +
      `Type: ${task.type}\n` +
      `Priority: ${task.priority}\n` +
      `Status: ${statusEmoji[task.status as keyof typeof statusEmoji] || "📋"} ${task.status}\n\n` +
      `${task.description || "No description"}`,
      { parse_mode: "Markdown" }
    );
    
    console.log(`Updated thread status for task ${taskId}`);
  } catch (error) {
    // Ignore errors (message might be too old to edit)
    console.warn("Could not update thread status:", error);
  }
}
