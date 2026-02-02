/**
 * Squad Management Commands
 * 
 * pause_squad, resume_squad, quarantine
 */

import type { Context } from "telegraf";
import { api } from "../../../../convex/_generated/api.js";
import type { Id } from "../../../../convex/_generated/dataModel";
import { userProjects } from "./basic.js";

interface BotContext extends Context {
  convex: any;
  userProjectId: Id<"projects"> | null;
}

export async function handlePauseSquad(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const result = await ctx.convex.mutation(api.agents.pauseAll, {
      projectId,
      userId: ctx.from?.username || ctx.from?.id.toString() || "operator",
      reason: "Pause squad via Telegram",
    });
    
    await ctx.reply(`⏸️ Paused ${result.paused} agent(s)`);
  } catch (error) {
    console.error("Error in /pause_squad:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleResumeSquad(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const result = await ctx.convex.mutation(api.agents.resumeAll, {
      projectId,
      userId: ctx.from?.username || ctx.from?.id.toString() || "operator",
      reason: "Resume squad via Telegram",
    });
    
    await ctx.reply(`▶️ Resumed ${result.resumed} agent(s)`);
  } catch (error) {
    console.error("Error in /resume_squad:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleQuarantine(ctx: BotContext) {
  try {
    const args = ctx.message && "text" in ctx.message 
      ? ctx.message.text.split(" ").slice(1) 
      : [];
    
    if (args.length === 0) {
      await ctx.reply("Usage: /quarantine <agent-name>");
      return;
    }
    
    const agentName = args.join(" ");
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    // Find agent by name
    const agents = await ctx.convex.query(api.agents.listAll, 
      projectId ? { projectId } : {}
    );
    const agent = agents.find((a: any) => 
      a.name.toLowerCase() === agentName.toLowerCase()
    );
    
    if (!agent) {
      await ctx.reply(`❌ Agent "${agentName}" not found`);
      return;
    }
    
    const result = await ctx.convex.mutation(api.agents.updateStatus, {
      agentId: agent._id,
      status: "QUARANTINED",
      reason: `Quarantined via Telegram by ${ctx.from?.username || "operator"}`,
    });
    
    if (result.success) {
      await ctx.reply(`🚨 Quarantined agent: ${agent.name}`);
    } else {
      await ctx.reply(`❌ Failed: ${result.error}`);
    }
  } catch (error) {
    console.error("Error in /quarantine:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
