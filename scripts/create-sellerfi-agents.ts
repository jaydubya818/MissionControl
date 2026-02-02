#!/usr/bin/env tsx
/**
 * Create SellerFi Agents
 * 
 * This script creates agents for the SellerFi project in Mission Control
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://different-gopher-55.convex.cloud";

const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🚀 Creating SellerFi agents...\n");
  
  // Get SellerFi project
  const projects = await client.query("projects:list" as any, {});
  const sellerfiProject = (projects as any[]).find((p: any) => p.slug === "sellerfi");
  
  if (!sellerfiProject) {
    console.error("❌ SellerFi project not found!");
    process.exit(1);
  }
  
  console.log(`✅ Found SellerFi project: ${sellerfiProject.name} (${sellerfiProject._id})\n`);
  
  // Define agents based on SellerFi .claude/agents structure
  const agents = [
    {
      name: "BJ",
      role: "LEAD",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Supervisor Orchestrator - Master supervisor with comprehensive knowledge of all 151+ agents. Primary point of contact for SellerFi work.",
      allowedTaskTypes: ["ORCHESTRATION", "PLANNING", "COORDINATION", "REVIEW", "ENGINEERING"],
    },
    {
      name: "Agent Organizer",
      role: "LEAD",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Strategic team delegation and project analysis.",
      allowedTaskTypes: ["PLANNING", "COORDINATION", "ANALYSIS"],
    },
    {
      name: "Context Manager",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Central nervous system for project context.",
      allowedTaskTypes: ["CONTEXT_MANAGEMENT", "STATE_COORDINATION"],
    },
    {
      name: "Tech Lead",
      role: "LEAD",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Senior technical leadership for complex projects.",
      allowedTaskTypes: ["ENGINEERING", "ARCHITECTURE", "REVIEW", "PLANNING"],
    },
    {
      name: "Backend Architect",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Scalable API and server system design.",
      allowedTaskTypes: ["ENGINEERING", "ARCHITECTURE", "API_DESIGN"],
    },
    {
      name: "Frontend Developer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "User interface development with React, Next.js.",
      allowedTaskTypes: ["ENGINEERING", "UI_DEVELOPMENT", "CODE_CHANGE"],
    },
    {
      name: "Code Reviewer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Comprehensive code review and quality assurance.",
      allowedTaskTypes: ["REVIEW", "QUALITY_ASSURANCE"],
    },
    {
      name: "Test Writer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Test automation and TDD specialist.",
      allowedTaskTypes: ["TESTING", "QUALITY_ASSURANCE"],
    },
    {
      name: "Security Auditor",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Security audit and vulnerability scanning.",
      allowedTaskTypes: ["SECURITY", "AUDIT", "REVIEW"],
    },
    {
      name: "DevOps Engineer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Infrastructure, deployment, and automation.",
      allowedTaskTypes: ["DEVOPS", "DEPLOYMENT", "INFRASTRUCTURE"],
    },
    {
      name: "Documentation Writer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/SellerFi-GitHub",
      description: "Technical documentation creation and maintenance.",
      allowedTaskTypes: ["DOCS", "DOCUMENTATION"],
    },
  ];
  
  console.log(`📝 Creating ${agents.length} agents...\n`);
  
  let created = 0;
  let existing = 0;
  
  // Create agents
  for (const agentData of agents) {
    try {
      await client.mutation("agents:register" as any, {
        projectId: sellerfiProject._id,
        name: agentData.name,
        role: agentData.role,
        workspacePath: agentData.workspacePath,
        allowedTaskTypes: agentData.allowedTaskTypes,
        metadata: {
          description: agentData.description,
        },
      });
      console.log(`✅ Created: ${agentData.name} (${agentData.role})`);
      created++;
    } catch (error: any) {
      if (error.message && error.message.includes("already exists")) {
        console.log(`⚠️  Already exists: ${agentData.name}`);
        existing++;
      } else {
        console.error(`❌ Error creating ${agentData.name}:`, error.message);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Already existed: ${existing}`);
  console.log(`   Total: ${agents.length}`);
  
  // List all SellerFi agents
  console.log("\n📋 All SellerFi Agents:");
  const allAgents = await client.query("agents:listAll" as any, { projectId: sellerfiProject._id });
  (allAgents as any[]).forEach((agent: any) => {
    console.log(`   - ${agent.name} (${agent.role}) - ${agent.status}`);
  });
  
  console.log("\n✅ Done!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
