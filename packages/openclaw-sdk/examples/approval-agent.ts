#!/usr/bin/env tsx
/**
 * Approval Agent Example
 * 
 * This example shows how to request approvals for high-risk actions.
 * 
 * Usage:
 *   export CONVEX_URL=https://your-deployment.convex.cloud
 *   export PROJECT_SLUG=your-project
 *   pnpm example:approval
 */

import { MissionControlClient } from "../src";

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "";
const PROJECT_SLUG = process.env.PROJECT_SLUG || "openclaw";

if (!CONVEX_URL) {
  console.error("Error: CONVEX_URL environment variable is required");
  process.exit(1);
}

async function main() {
  // Create client
  const client = new MissionControlClient({
    convexUrl: CONVEX_URL,
    projectSlug: PROJECT_SLUG,
    agent: {
      name: "ApprovalAgent",
      role: "INTERN", // Interns require approval for YELLOW actions
      emoji: "🔒",
      allowedTaskTypes: ["CODE_CHANGE", "ENGINEERING"],
      budgetDaily: 5.0,
      budgetPerRun: 0.5,
    },
    onApprovalNeeded: (approval) => {
      console.log(`\n⚠️  Approval requested: ${approval.actionSummary}`);
      console.log(`   Risk: ${approval.riskLevel}`);
      console.log(`   Cost: $${approval.estimatedCost || 0}`);
      console.log(`   Use Telegram /my_approvals to approve/deny\n`);
    },
    onTaskClaimed: (task) => {
      console.log(`✅ Claimed task: ${task.title}`);
    },
    onTaskCompleted: (task) => {
      console.log(`🎉 Completed task: ${task.title}`);
    },
  });

  // Register handler for CODE_CHANGE tasks
  client.onTask("CODE_CHANGE", async (context) => {
    console.log(`\n💻 Working on: ${context.task.title}`);
    
    await context.postComment("Analyzing code change requirements...");
    
    // Simulate analysis
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Check if we need to modify critical files
    const needsCriticalFileAccess = Math.random() > 0.5;
    
    if (needsCriticalFileAccess) {
      // Request approval for critical file access
      console.log("\n🔐 Requesting approval for critical file access...");
      
      const approval = await context.requestApproval(
        "MODIFY_CRITICAL_FILE",
        "Need to modify authentication module to implement feature",
        0.25
      );
      
      console.log(`   Approval ID: ${approval._id}`);
      console.log(`   Status: ${approval.status}`);
      console.log(`   Waiting for operator decision...\n`);
      
      // In a real implementation, you would poll for approval status
      // For this example, we'll just wait a bit
      await new Promise((resolve) => setTimeout(resolve, 5000));
      
      await context.postComment("⏳ Waiting for approval to proceed...");
    }
    
    // Continue with work
    await context.updateProgress("Implementing code changes");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    await context.updateProgress("Running tests");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    await context.postComment("Code changes complete and tested!");
    
    return {
      summary: `Implemented code changes for: ${context.task.title}`,
      artifactIds: ["src/auth.ts", "tests/auth.test.ts"],
      evidence: "All tests passing. Code reviewed and follows best practices.",
    };
  });

  // Register handler for ENGINEERING tasks
  client.onTask("ENGINEERING", async (context) => {
    console.log(`\n⚙️  Working on: ${context.task.title}`);
    
    await context.postComment("Starting engineering task...");
    
    // Check if task requires high budget
    const estimatedCost = Math.random() * 2;
    
    if (estimatedCost > 1.0) {
      // Request approval for high-cost operation
      console.log(`\n💰 Requesting approval for high-cost operation ($${estimatedCost.toFixed(2)})...`);
      
      const approval = await context.requestApproval(
        "HIGH_COST_OPERATION",
        `This task requires ${estimatedCost.toFixed(2)} USD which exceeds normal budget`,
        estimatedCost
      );
      
      console.log(`   Approval ID: ${approval._id}`);
      console.log(`   Waiting for budget approval...\n`);
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    
    // Do work
    await context.updateProgress("Executing engineering task");
    await new Promise((resolve) => setTimeout(resolve, 4000));
    
    return {
      summary: `Completed engineering task: ${context.task.title}`,
      artifactIds: ["deployment.yaml", "config.json"],
    };
  });

  // Start the agent
  console.log("🚀 Starting ApprovalAgent...");
  const agent = await client.start();
  console.log(`✅ Agent registered: ${agent.name} (${agent._id})`);
  console.log(`👤 Role: ${agent.role} (requires approvals for YELLOW+ actions)`);
  console.log(`📊 Budget: $${agent.budgetDaily}/day, $${agent.budgetPerRun}/run`);
  console.log(`\n⏰ Heartbeat every 15 minutes. Waiting for tasks...\n`);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down...");
    await client.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
