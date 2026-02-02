#!/usr/bin/env tsx
/**
 * Simple Agent Example
 * 
 * This example shows how to create a basic agent that handles tasks.
 * 
 * Usage:
 *   export CONVEX_URL=https://your-deployment.convex.cloud
 *   export PROJECT_SLUG=your-project
 *   pnpm example:simple
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
      name: "SimpleAgent",
      role: "SPECIALIST",
      emoji: "🤖",
      allowedTaskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH", "CONTENT"],
      budgetDaily: 10.0,
      budgetPerRun: 1.0,
    },
    onTaskClaimed: (task) => {
      console.log(`✅ Claimed task: ${task.title}`);
    },
    onTaskCompleted: (task) => {
      console.log(`🎉 Completed task: ${task.title}`);
    },
    onError: (error) => {
      console.error(`❌ Error: ${error.message}`);
    },
  });

  // Register handler for CUSTOMER_RESEARCH tasks
  client.onTask("CUSTOMER_RESEARCH", async (context) => {
    console.log(`\n📋 Working on: ${context.task.title}`);
    
    // Post progress update
    await context.postComment("Starting customer research...");
    
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await context.updateProgress("Gathering data from sources");
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await context.updateProgress("Analyzing findings");
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await context.postComment("Research complete! Preparing deliverable.");
    
    // Return deliverable
    return {
      summary: `Completed customer research for: ${context.task.title}`,
      artifactIds: ["research-report.md", "data-analysis.csv"],
      evidence: "Analyzed 100+ customer responses and identified 3 key insights.",
    };
  });

  // Register handler for SEO_RESEARCH tasks
  client.onTask("SEO_RESEARCH", async (context) => {
    console.log(`\n🔍 Working on: ${context.task.title}`);
    
    await context.postComment("Starting SEO research...");
    
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await context.updateProgress("Analyzing keywords and competitors");
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await context.postComment("SEO analysis complete!");
    
    return {
      summary: `Completed SEO research for: ${context.task.title}`,
      artifactIds: ["seo-report.md", "keywords.csv"],
      evidence: "Identified 50 high-value keywords and analyzed top 10 competitors.",
    };
  });

  // Register fallback handler for any other task type
  client.onAnyTask(async (context) => {
    console.log(`\n📌 Working on: ${context.task.title} (${context.task.type})`);
    
    await context.postComment(`Working on ${context.task.type} task...`);
    
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    return {
      summary: `Completed ${context.task.type} task: ${context.task.title}`,
      artifactIds: ["output.txt"],
    };
  });

  // Start the agent
  console.log("🚀 Starting SimpleAgent...");
  const agent = await client.start();
  console.log(`✅ Agent registered: ${agent.name} (${agent._id})`);
  console.log(`📊 Budget: $${agent.budgetDaily}/day, $${agent.budgetPerRun}/run`);
  console.log(`🎯 Allowed types: ${agent.allowedTaskTypes.join(", ")}`);
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
