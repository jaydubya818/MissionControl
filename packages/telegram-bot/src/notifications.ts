/**
 * Notification System
 * 
 * Sends notifications to Telegram for key events.
 */

import type { Telegraf } from "telegraf";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// CONFIGURATION
// ============================================================================

const NOTIFICATION_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!NOTIFICATION_CHAT_ID) {
  console.warn("⚠️ TELEGRAM_CHAT_ID not set - notifications will not be sent");
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface NotificationPayload {
  type: "APPROVAL_PENDING" | "BUDGET_EXCEEDED" | "LOOP_BLOCKED" | "GATEWAY_DEGRADED" | "TASK_BLOCKED";
  projectId?: Id<"projects">;
  taskId?: Id<"tasks">;
  agentId?: Id<"agents">;
  approvalId?: Id<"approvals">;
  data: any;
}

// ============================================================================
// SEND NOTIFICATION
// ============================================================================

export async function sendNotification(
  bot: Telegraf,
  convex: ConvexHttpClient,
  payload: NotificationPayload
) {
  if (!NOTIFICATION_CHAT_ID) {
    console.warn("Notification skipped - no chat ID configured");
    return;
  }
  
  try {
    const message = await formatNotification(convex, payload);
    await bot.telegram.sendMessage(NOTIFICATION_CHAT_ID, message, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}

// ============================================================================
// FORMAT NOTIFICATION
// ============================================================================

async function formatNotification(
  convex: ConvexHttpClient,
  payload: NotificationPayload
): Promise<string> {
  switch (payload.type) {
    case "APPROVAL_PENDING": {
      const approval = payload.data;
      const agent = payload.agentId 
        ? await convex.query(api.agents.get, { agentId: payload.agentId })
        : null;
      
      return (
        `⏳ **Approval Required**\n\n` +
        `${approval.actionSummary}\n` +
        `Requested by: ${agent?.name || "Unknown"}\n` +
        `Risk: ${approval.riskLevel}\n` +
        `ID: ${payload.approvalId?.slice(-6)}\n\n` +
        `/approve ${payload.approvalId?.slice(-6)} or /deny ${payload.approvalId?.slice(-6)} <reason>`
      );
    }
    
    case "BUDGET_EXCEEDED": {
      const { agentName, spendToday, budgetDaily, taskTitle } = payload.data;
      
      return (
        `💰 **Budget Exceeded**\n\n` +
        `Agent: ${agentName}\n` +
        `Spend: $${spendToday.toFixed(2)} / $${budgetDaily.toFixed(2)}\n` +
        (taskTitle ? `Task: ${taskTitle}\n` : "") +
        `\nAgent has been paused. Use /resume_squad to resume.`
      );
    }
    
    case "LOOP_BLOCKED": {
      const { taskTitle, loopType, count, threshold } = payload.data;
      
      return (
        `🔄 **Loop Detected**\n\n` +
        `Task: ${taskTitle}\n` +
        `Type: ${loopType}\n` +
        `Count: ${count} (threshold: ${threshold})\n` +
        `\nTask has been blocked. Review and unblock manually.`
      );
    }
    
    case "GATEWAY_DEGRADED": {
      const { gateway, status, message } = payload.data;
      
      return (
        `⚠️ **Gateway Degraded**\n\n` +
        `Gateway: ${gateway}\n` +
        `Status: ${status}\n` +
        `${message}`
      );
    }
    
    case "TASK_BLOCKED": {
      const { taskTitle, reason } = payload.data;
      
      return (
        `🚫 **Task Blocked**\n\n` +
        `Task: ${taskTitle}\n` +
        `Reason: ${reason}\n` +
        `\nReview and unblock in Mission Control.`
      );
    }
    
    default:
      return `📬 Notification: ${JSON.stringify(payload)}`;
  }
}

// ============================================================================
// NOTIFICATION TRIGGERS
// ============================================================================

/**
 * Poll for new notifications and send to Telegram.
 * Should be called periodically (e.g., every 30 seconds).
 */
export async function pollAndSendNotifications(
  bot: Telegraf,
  convex: ConvexHttpClient
) {
  // This would query a notifications queue or listen to Convex subscriptions
  // For MVP, notifications can be triggered directly from mutations
  console.log("Polling for notifications...");
}
