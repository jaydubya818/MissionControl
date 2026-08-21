/**
 * Approval Commands
 * 
 * my_approvals, approve, deny
 */

import type { Context } from "telegraf";
import { api } from "../../../../convex/_generated/api.js";
import type { Id } from "../../../../convex/_generated/dataModel";
import { userProjects } from "./basic.js";

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

interface BotContext extends Context {
  convex: any;
  userProjectId: Id<"projects"> | null;
}

export async function handleMyApprovals(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const approvals = await ctx.convex.query(api.approvals.listPending, {
      projectId,
      limit: 20,
    });
    
    if (!approvals || approvals.length === 0) {
      await ctx.reply("✅ No pending approvals!");
      return;
    }
    
    const agents = await ctx.convex.query(api.agents.listAll, { projectId });
    const agentMap = new Map(agents.map((a: any) => [a._id, a]));
    
    // Send each approval as a separate message with inline buttons
    for (const approval of approvals) {
      const agent = agentMap.get(approval.requestorAgentId) as any;
      const riskEmoji = approval.riskLevel === "RED" ? "🔴" : "🟡";
      const id = approval._id.slice(-6);
      
      let message = `${riskEmoji} **Approval Request #${id}**\n\n`;
      message += `**Action:** ${approval.actionSummary}\n`;
      message += `**Agent:** ${agent?.name || "Unknown"}\n`;
      message += `**Risk:** ${approval.riskLevel}\n`;
      if (approval.estimatedCost) {
        message += `**Cost:** $${approval.estimatedCost.toFixed(2)}\n`;
      }
      if (approval.justification) {
        message += `**Reason:** ${approval.justification}\n`;
      }
      
      // Create inline keyboard with approve/deny buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `approve:${approval._id}` },
            { text: "❌ Deny", callback_data: `deny:${approval._id}` },
          ],
        ],
      };
      
      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }
  } catch (error) {
    console.error("Error in /my_approvals:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleApprove(ctx: BotContext) {
  try {
    const args = ctx.message && "text" in ctx.message 
      ? ctx.message.text.split(" ").slice(1) 
      : [];
    
    if (args.length === 0) {
      await ctx.reply("Usage: /approve <approval-id>");
      return;
    }
    
    const approvalIdSuffix = args[0];
    
    // Find approval by ID suffix
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    const approvals = await ctx.convex.query(api.approvals.listPending, 
      projectId ? { projectId, limit: 100 } : { limit: 100 }
    );
    
    const approval = approvals.find((a: any) => a._id.endsWith(approvalIdSuffix));
    
    if (!approval) {
      await ctx.reply(`❌ Approval #${approvalIdSuffix} not found`);
      return;
    }
    
    await ctx.reply(approvalDecisionUnavailableMessage(`#${approvalIdSuffix}`));
  } catch (error) {
    console.error("Error in /approve:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleDeny(ctx: BotContext) {
  try {
    const args = ctx.message && "text" in ctx.message 
      ? ctx.message.text.split(" ").slice(1) 
      : [];
    
    if (args.length < 2) {
      await ctx.reply("Usage: /deny <approval-id> <reason>");
      return;
    }
    
    const approvalIdSuffix = args[0];
    const reason = args.slice(1).join(" ");
    
    // Find approval by ID suffix
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    const approvals = await ctx.convex.query(api.approvals.listPending, 
      projectId ? { projectId, limit: 100 } : { limit: 100 }
    );
    
    const approval = approvals.find((a: any) => a._id.endsWith(approvalIdSuffix));
    
    if (!approval) {
      await ctx.reply(`❌ Approval #${approvalIdSuffix} not found`);
      return;
    }
    
    void reason;
    await ctx.reply(approvalDecisionUnavailableMessage(`#${approvalIdSuffix}`));
  } catch (error) {
    console.error("Error in /deny:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
