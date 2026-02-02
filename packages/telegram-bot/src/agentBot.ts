/**
 * Agent-Specific Telegram Bot
 *
 * Creates individual bot instances for agents like BJ that can:
 * - Receive tasks and queries via Telegram
 * - Post responses and updates
 * - Handle conversational interactions
 */

import { Telegraf } from "telegraf";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";

export interface AgentBotConfig {
  agentName: string;
  botToken: string;
  chatId: string;
  convexUrl: string;
}

export class AgentBot {
  private bot: Telegraf;
  private convex: ConvexHttpClient;
  private agentName: string;
  private chatId: string;
  private agentId?: Id<"agents">;

  constructor(config: AgentBotConfig) {
    this.bot = new Telegraf(config.botToken);
    this.convex = new ConvexHttpClient(config.convexUrl);
    this.agentName = config.agentName;
    this.chatId = config.chatId;
  }

  async start() {
    // Find the agent in the database
    const agents = await this.convex.query(api.agents.listAll, {});
    const agent = agents.find((a: any) => a.name === this.agentName);

    if (!agent) {
      throw new Error(`Agent "${this.agentName}" not found in Mission Control`);
    }

    this.agentId = agent._id;
    console.log(`🤖 ${this.agentName} bot initialized (ID: ${this.agentId})`);

    // Set up bot handlers
    this.setupHandlers();

    // Start polling
    await this.bot.launch();
    console.log(`✅ ${this.agentName} bot is running`);

    // Enable graceful shutdown
    process.once("SIGINT", () => this.bot.stop("SIGINT"));
    process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
  }

  private setupHandlers() {
    // Start command
    this.bot.command("start", async (ctx) => {
      await ctx.reply(
        `👋 Hi! I'm ${this.agentName}, your ${this.getRoleDescription()}.\n\n` +
        `You can:\n` +
        `- Send me tasks or questions\n` +
        `- Use /status to see what I'm working on\n` +
        `- Use /help for more commands`
      );
    });

    // Help command
    this.bot.command("help", async (ctx) => {
      await ctx.reply(
        `🤖 ${this.agentName} Commands:\n\n` +
        `/start - Introduction\n` +
        `/status - Current tasks and status\n` +
        `/tasks - List my tasks\n` +
        `/help - Show this help\n\n` +
        `You can also just send me a message with a task or question!`
      );
    });

    // Status command
    this.bot.command("status", async (ctx) => {
      try {
        if (!this.agentId) {
          await ctx.reply("❌ Agent not initialized");
          return;
        }

        const agent = await this.convex.query(api.agents.get, { agentId: this.agentId });
        const tasks = await this.convex.query(api.tasks.listByAgent, { agentId: this.agentId });

        const activeTasks = tasks.filter((t: any) =>
          t.status === "IN_PROGRESS" || t.status === "ASSIGNED"
        );

        let message = `📊 ${this.agentName} Status:\n\n`;
        message += `Status: ${agent.status}\n`;
        message += `Role: ${agent.role}\n`;
        message += `Active Tasks: ${activeTasks.length}\n`;
        message += `Budget Used Today: $${agent.spendToday.toFixed(2)} / $${agent.budgetDaily.toFixed(2)}\n\n`;

        if (activeTasks.length > 0) {
          message += `🔄 Current Tasks:\n`;
          activeTasks.slice(0, 5).forEach((task: any) => {
            message += `• ${task.title} (${task.status})\n`;
          });
        }

        await ctx.reply(message);
      } catch (error) {
        await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });

    // Tasks command
    this.bot.command("tasks", async (ctx) => {
      try {
        if (!this.agentId) {
          await ctx.reply("❌ Agent not initialized");
          return;
        }

        const tasks = await this.convex.query(api.tasks.listByAgent, { agentId: this.agentId });

        if (tasks.length === 0) {
          await ctx.reply("📭 No tasks assigned");
          return;
        }

        let message = `📋 My Tasks:\n\n`;

        const byStatus: Record<string, any[]> = {};
        tasks.forEach((task: any) => {
          if (!byStatus[task.status]) byStatus[task.status] = [];
          byStatus[task.status].push(task);
        });

        const statusOrder = ["IN_PROGRESS", "ASSIGNED", "REVIEW", "BLOCKED", "DONE"];

        statusOrder.forEach(status => {
          const statusTasks = byStatus[status] || [];
          if (statusTasks.length > 0) {
            message += `\n${this.getStatusEmoji(status)} ${status}:\n`;
            statusTasks.slice(0, 3).forEach((task: any) => {
              message += `• ${task.title}\n`;
            });
            if (statusTasks.length > 3) {
              message += `  ... and ${statusTasks.length - 3} more\n`;
            }
          }
        });

        await ctx.reply(message);
      } catch (error) {
        await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });

    // Handle text messages (create tasks or respond)
    this.bot.on("text", async (ctx) => {
      // Skip if it's a command
      if (ctx.message.text.startsWith("/")) {
        return;
      }

      try {
        if (!this.agentId) {
          await ctx.reply("❌ Agent not initialized");
          return;
        }

        const text = ctx.message.text;

        // Create a task in Mission Control
        const taskType = this.inferTaskType(text);

        const taskId = await this.convex.mutation(api.tasks.create, {
          title: text.length > 100 ? text.substring(0, 97) + "..." : text,
          description: text,
          type: taskType,
          priority: 3,
          assigneeNames: [this.agentName],
          source: "telegram",
        });

        await ctx.reply(
          `✅ Task created!\n\n` +
          `I've added this to my task list. I'll get started on it soon.\n\n` +
          `Task ID: ${taskId.slice(-6)}\n` +
          `Type: ${taskType}`
        );
      } catch (error) {
        await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  }

  private getRoleDescription(): string {
    const descriptions: Record<string, string> = {
      "BJ": "Supervisor Orchestrator for SellerFi. I coordinate complex multi-agent workflows.",
      "Agent Organizer": "Strategic team delegation specialist",
      "Tech Lead": "Technical leadership for complex projects",
    };
    return descriptions[this.agentName] || "AI agent";
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      "INBOX": "📥",
      "ASSIGNED": "📌",
      "IN_PROGRESS": "🔄",
      "REVIEW": "👀",
      "BLOCKED": "🚫",
      "DONE": "✅",
      "CANCELLED": "❌",
    };
    return emojis[status] || "•";
  }

  private inferTaskType(text: string): string {
    const lower = text.toLowerCase();

    if (lower.includes("bug") || lower.includes("fix") || lower.includes("error")) {
      return "ENGINEERING";
    }
    if (lower.includes("doc") || lower.includes("write") || lower.includes("explain")) {
      return "DOCS";
    }
    if (lower.includes("test") || lower.includes("qa")) {
      return "ENGINEERING";
    }
    if (lower.includes("design") || lower.includes("ui") || lower.includes("ux")) {
      return "CONTENT";
    }
    if (lower.includes("plan") || lower.includes("strategy") || lower.includes("organize")) {
      return "ORCHESTRATION";
    }
    if (lower.includes("review") || lower.includes("check")) {
      return "REVIEW";
    }

    return "OPS"; // Default
  }

  // Send a message to the agent's chat
  async sendMessage(message: string) {
    try {
      await this.bot.telegram.sendMessage(this.chatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(`Failed to send message to ${this.agentName}:`, error);
    }
  }
}
