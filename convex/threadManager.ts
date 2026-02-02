/**
 * Thread-per-Task Manager
 * 
 * Manages Telegram threads for each task
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const updateThreadRef = mutation({
  args: {
    taskId: v.id("tasks"),
    chatId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      threadRef: {
        chatId: args.chatId,
        threadId: args.threadId,
      },
    });
    
    return { success: true };
  },
});
