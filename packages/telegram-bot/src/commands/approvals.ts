/**
 * Approval Commands
 * 
 * my_approvals, approve, deny
 */

import type { Context } from "telegraf";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { userProjects } from "./basic.js";

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
    
    let message = `⏳ **Pending Approvals** (${approvals.length}):\n\n`;
    
    for (const approval of approvals) {
      const agent = agentMap.get(approval.requestorAgentId) as any;
      const riskEmoji = approval.riskLevel === "RED" ? "🔴" : "🟡";
      const id = approval._id.slice(-6);
      
      message += `${riskEmoji} **#${id}** ${approval.actionSummary}\n`;
      message += `  └ Requested by: ${agent?.name || "Unknown"}\n`;
      message += `  └ Risk: ${approval.riskLevel}\n`;
      if (approval.estimatedCost) {
        message += `  └ Cost: $${approval.estimatedCost.toFixed(2)}\n`;
      }
      message += `  └ /approve ${id} or /deny ${id} <reason>\n\n`;
    }
    
    await ctx.reply(message, { parse_mode: "Markdown" });
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
    
    const result = await ctx.convex.mutation(api.approvals.approve, {
      approvalId: approval._id,
      decidedByUserId: ctx.from?.username || ctx.from?.id.toString() || "operator",
      reason: "Approved via Telegram",
    });
    
    if (result.success) {
      await ctx.reply(`✅ Approved: ${approval.actionSummary}`);
    } else {
      await ctx.reply(`❌ Failed: ${result.error}`);
    }
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
    
    const result = await ctx.convex.mutation(api.approvals.deny, {
      approvalId: approval._id,
      decidedByUserId: ctx.from?.username || ctx.from?.id.toString() || "operator",
      reason,
    });
    
    if (result.success) {
      await ctx.reply(`🚫 Denied: ${approval.actionSummary}\nReason: ${reason}`);
    } else {
      await ctx.reply(`❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.error("Error in /deny:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
