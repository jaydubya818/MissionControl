#!/usr/bin/env tsx
/**
 * Create Mission Control Project Tasks
 * 
 * Creates real tasks for Mission Control agents to work on
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://different-gopher-55.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🚀 Creating Mission Control tasks...\n");
  
  // Get Mission Control project
  const projects = await client.query("projects:list" as any, {});
  const mcProject = (projects as any[]).find((p: any) => p.slug === "mission-control");
  
  if (!mcProject) {
    console.error("❌ Mission Control project not found!");
    process.exit(1);
  }
  
  // Get agents
  const agents = await client.query("agents:listAll" as any, { projectId: mcProject._id });
  const sofie = (agents as any[]).find((a: any) => a.name === "Sofie");
  const backendDev = (agents as any[]).find((a: any) => a.name === "Backend Developer");
  const frontendDev = (agents as any[]).find((a: any) => a.name === "Frontend Developer");
  const devops = (agents as any[]).find((a: any) => a.name === "DevOps");
  
  // Define tasks
  const tasks = [
    {
      title: "Implement Thread-per-Task in Telegram Bot",
      description: "Add thread management to Telegram bot so each task gets its own thread. Update packages/telegram-bot/src/threads.ts to create threads on task creation and post all task-related messages to the thread.",
      type: "ENGINEERING",
      priority: 2,
      assigneeIds: backendDev ? [backendDev._id] : [],
    },
    {
      title: "Add Export Report Button to TaskDrawer",
      description: "Create ExportReportButton component that uses api.reports.generateIncidentReport to download markdown reports. Add button to TaskDrawer UI.",
      type: "ENGINEERING",
      priority: 2,
      assigneeIds: frontendDev ? [frontendDev._id] : [],
    },
    {
      title: "Integrate Retry Logic into Convex Mutations",
      description: "Update critical Convex mutations to use withRetry from packages/shared/src/retry.ts. Focus on external API calls and database operations that might fail.",
      type: "ENGINEERING",
      priority: 2,
      assigneeIds: backendDev ? [backendDev._id] : [],
    },
    {
      title: "Deploy Telegram Bot to Railway",
      description: "Follow DEPLOYMENT_COMPLETE_GUIDE.md to deploy the Telegram bot to Railway. Set up environment variables, test all commands, and verify notifications work.",
      type: "OPS",
      priority: 1,
      assigneeIds: devops ? [devops._id] : [],
    },
    {
      title: "Start Agent Runners for All Projects",
      description: "Start agent-runner instances for BJ (SellerFi), Sofie (Mission Control), and Scout (OpenClaw). Use PM2 for process management. Verify heartbeats and task claiming work.",
      type: "OPS",
      priority: 1,
      assigneeIds: devops ? [devops._id] : [],
    },
    {
      title: "Review and Test Peer Review System",
      description: "Test the new peer review system. Create PRAISE, REFUTE, CHANGESET, and APPROVE reviews. Verify response workflow, scoring, and activity logging work correctly.",
      type: "DOCS",
      priority: 3,
      assigneeIds: sofie ? [sofie._id] : [],
    },
    {
      title: "Implement GitHub Integration",
      description: "Create packages/github-integration with Octokit. Implement syncIssues, updatePRStatus, and createPRFromTask methods. Add webhook handler for GitHub events.",
      type: "ENGINEERING",
      priority: 3,
      assigneeIds: backendDev ? [backendDev._id] : [],
    },
    {
      title: "Add Agent Learning Performance Tracking",
      description: "Implement agentPerformance table and updateAgentPerformance cron job. Track success rates, review scores, and task patterns per agent. Add performance dashboard.",
      type: "ENGINEERING",
      priority: 3,
      assigneeIds: backendDev ? [backendDev._id] : [],
    },
    {
      title: "Optimize Database Queries for Performance",
      description: "Review all Convex queries for performance. Add proper indexes, implement pagination where needed, and add caching for frequently accessed data.",
      type: "ENGINEERING",
      priority: 2,
      assigneeIds: backendDev ? [backendDev._id] : [],
    },
    {
      title: "Create Comprehensive Testing Suite",
      description: "Set up Vitest for unit tests. Create tests for critical mutations, queries, and UI components. Aim for 80% code coverage on core functionality.",
      type: "ENGINEERING",
      priority: 3,
      assigneeIds: [backendDev?._id, frontendDev?._id].filter(Boolean) as any[],
    },
  ];
  
  let created = 0;
  let failed = 0;
  
  for (const taskData of tasks) {
    try {
      const result = await client.mutation("tasks:create" as any, {
        projectId: mcProject._id,
        title: taskData.title,
        description: taskData.description,
        type: taskData.type,
        priority: taskData.priority,
        assigneeIds: taskData.assigneeIds,
        idempotencyKey: `task:${taskData.title}:${Date.now()}`,
      });
      
      console.log(`✅ Created: ${taskData.title}`);
      created++;
    } catch (error: any) {
      if (error.message && error.message.includes("already exists")) {
        console.log(`⚠️  Already exists: ${taskData.title}`);
      } else {
        console.error(`❌ Error creating ${taskData.title}:`, error.message);
        failed++;
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${tasks.length}`);
  
  // List all tasks
  console.log(`\n📋 All Mission Control Tasks:\n`);
  const allTasks = await client.query("tasks:listAll" as any, { projectId: mcProject._id });
  (allTasks as any[]).forEach((task: any) => {
    const agent = (agents as any[]).find((a: any) => task.assigneeIds?.includes(a._id));
    console.log(`   - [${task.status}] ${task.title}`);
    if (agent) {
      console.log(`     Assigned to: ${agent.name}`);
    }
  });
  
  console.log("\n✅ Done!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
