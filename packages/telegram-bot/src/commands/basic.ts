/**
 * Basic Telegram Commands
 * 
 * Projects, inbox, status, burnrate
 */

import type { Context } from "telegraf";
import { api } from "../../../../convex/_generated/api.js";
import type { Id } from "../../../../convex/_generated/dataModel";

interface BotContext extends Context {
  convex: any;
  userProjectId: Id<"projects"> | null;
}

// User state storage (in-memory for MVP, should be in DB later)
const userProjects = new Map<number, Id<"projects">>();

export async function handleProjects(ctx: BotContext) {
  try {
    const projects = await ctx.convex.query(api.projects.list);
    
    if (!projects || projects.length === 0) {
      await ctx.reply("📁 No projects found. Create one first!");
      return;
    }
    
    let message = "📁 **Projects:**\n\n";
    for (const project of projects) {
      const stats = await ctx.convex.query(api.projects.getStats, { 
        projectId: project._id 
      });
      const current = userProjects.get(ctx.from?.id ?? 0) === project._id ? "✓ " : "";
      message += `${current}**${project.name}** (${project.slug})\n`;
      message += `  └ ${stats.tasks.total} tasks, ${stats.agents.active} agents active\n\n`;
    }
    
    message += `\nUse /switch <slug> to change project`;
    
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /projects:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleSwitch(ctx: BotContext) {
  try {
    const args = ctx.message && "text" in ctx.message 
      ? ctx.message.text.split(" ").slice(1) 
      : [];
    
    if (args.length === 0) {
      await ctx.reply("Usage: /switch <project-slug>");
      return;
    }
    
    const slug = args[0];
    const project = await ctx.convex.query(api.projects.getBySlug, { slug });
    
    if (!project) {
      await ctx.reply(`❌ Project "${slug}" not found. Use /projects to see available projects.`);
      return;
    }
    
    // Store user's active project
    if (ctx.from?.id) {
      userProjects.set(ctx.from.id, project._id);
    }
    
    await ctx.reply(`✅ Switched to project: **${project.name}**`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /switch:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleInbox(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const tasks = await ctx.convex.query(api.tasks.listByStatus, {
      projectId,
      status: "INBOX",
      limit: 20,
    });
    
    if (!tasks || tasks.length === 0) {
      await ctx.reply("📭 Inbox is empty!");
      return;
    }
    
    let message = `📥 **Inbox** (${tasks.length} tasks):\n\n`;
    
    for (const task of tasks) {
      const priorityEmoji = task.priority === 1 ? "🔴" : task.priority === 2 ? "🟠" : "🔵";
      message += `${priorityEmoji} **#${task._id.slice(-4)}** ${task.title}\n`;
      message += `  └ ${task.type}`;
      if (task.estimatedCost) {
        message += ` · $${task.estimatedCost.toFixed(2)}`;
      }
      message += `\n\n`;
    }
    
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /inbox:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleStatus(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const stats = await ctx.convex.query(api.projects.getStats, { projectId });
    const project = await ctx.convex.query(api.projects.get, { projectId });
    
    let message = `📊 **Status: ${project.name}**\n\n`;
    
    message += `👥 **Agents:**\n`;
    message += `  └ ${stats.agents.active} active, ${stats.agents.paused} paused (${stats.agents.total} total)\n\n`;
    
    message += `📋 **Tasks:**\n`;
    message += `  └ ${stats.tasks.inbox} inbox\n`;
    message += `  └ ${stats.tasks.assigned} assigned\n`;
    message += `  └ ${stats.tasks.inProgress} in progress\n`;
    message += `  └ ${stats.tasks.review} review\n`;
    message += `  └ ${stats.tasks.needsApproval} needs approval\n`;
    message += `  └ ${stats.tasks.blocked} blocked\n`;
    message += `  └ ${stats.tasks.done} done\n\n`;
    
    message += `✅ **Approvals:**\n`;
    message += `  └ ${stats.approvals.pending} pending\n`;
    
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /status:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handleBurnrate(ctx: BotContext) {
  try {
    const projectId = ctx.from?.id ? userProjects.get(ctx.from.id) : null;
    
    if (!projectId) {
      await ctx.reply("⚠️ No project selected. Use /switch <slug> first.");
      return;
    }
    
    const report = await ctx.convex.query(api.standup.generate, { projectId });
    const project = await ctx.convex.query(api.projects.get, { projectId });
    
    let message = `💰 **Burn Rate: ${project.name}**\n\n`;
    message += `Today: $${report.burnRate.today.toFixed(2)}\n\n`;
    
    if (report.agents.list && report.agents.list.length > 0) {
      message += `**By Agent:**\n`;
      for (const agent of report.agents.list.slice(0, 10)) {
        if (agent.spendToday > 0) {
          message += `  └ ${agent.name}: $${agent.spendToday.toFixed(2)} / $${agent.budgetDaily.toFixed(2)}\n`;
        }
      }
    }
    
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in /burnrate:", error);
    await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Export user state for other modules
export { userProjects };
