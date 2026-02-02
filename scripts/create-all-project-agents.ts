#!/usr/bin/env tsx
/**
 * Create Agents for All Projects
 * 
 * Creates specialized agents for Mission Control and OpenClaw projects
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://different-gopher-55.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🚀 Creating agents for all projects...\n");
  
  // Get all projects
  const projects = await client.query("projects:list" as any, {});
  const missionControlProject = (projects as any[]).find((p: any) => p.slug === "mission-control");
  const openclawProject = (projects as any[]).find((p: any) => p.slug === "openclaw");
  
  if (!missionControlProject) {
    console.error("❌ Mission Control project not found!");
    process.exit(1);
  }
  
  if (!openclawProject) {
    console.error("❌ OpenClaw project not found!");
    process.exit(1);
  }
  
  // Mission Control Agents
  console.log("📝 Creating Mission Control agents...\n");
  const mcAgents = [
    {
      name: "Sofie",
      role: "LEAD",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "Chief Agent Officer (CAO) for Mission Control. Top-level authority for execution, triage, and governance.",
      allowedTaskTypes: ["ORCHESTRATION", "PLANNING", "GOVERNANCE", "REVIEW", "ENGINEERING"],
    },
    {
      name: "Backend Developer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "Convex backend development specialist.",
      allowedTaskTypes: ["ENGINEERING", "BACKEND", "API_DESIGN"],
    },
    {
      name: "Frontend Developer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "React/Vite UI development specialist.",
      allowedTaskTypes: ["ENGINEERING", "UI_DEVELOPMENT", "CODE_CHANGE"],
    },
    {
      name: "DevOps",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "Deployment and infrastructure specialist.",
      allowedTaskTypes: ["DEVOPS", "DEPLOYMENT", "INFRASTRUCTURE"],
    },
  ];
  
  let mcCreated = 0;
  let mcExisting = 0;
  
  for (const agentData of mcAgents) {
    try {
      await client.mutation("agents:register" as any, {
        projectId: missionControlProject._id,
        name: agentData.name,
        role: agentData.role,
        workspacePath: agentData.workspacePath,
        allowedTaskTypes: agentData.allowedTaskTypes,
        metadata: { description: agentData.description },
      });
      console.log(`✅ Created: ${agentData.name} (${agentData.role})`);
      mcCreated++;
    } catch (error: any) {
      if (error.message && error.message.includes("already exists")) {
        console.log(`⚠️  Already exists: ${agentData.name}`);
        mcExisting++;
      } else {
        console.error(`❌ Error creating ${agentData.name}:`, error.message);
      }
    }
  }
  
  console.log(`\n📊 Mission Control Summary:`);
  console.log(`   Created: ${mcCreated}`);
  console.log(`   Already existed: ${mcExisting}`);
  console.log(`   Total: ${mcAgents.length}\n`);
  
  // OpenClaw Agents
  console.log("📝 Creating OpenClaw agents...\n");
  const openclawAgents = [
    {
      name: "Scout",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "Research and reconnaissance specialist.",
      allowedTaskTypes: ["RESEARCH", "CUSTOMER_RESEARCH", "ANALYSIS"],
    },
    {
      name: "Scribe",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "Documentation and content creation specialist.",
      allowedTaskTypes: ["DOCS", "DOCUMENTATION", "CONTENT"],
    },
    {
      name: "Engineer",
      role: "SPECIALIST",
      workspacePath: "/Users/jaywest/MissionControl",
      description: "General engineering specialist.",
      allowedTaskTypes: ["ENGINEERING", "CODE_CHANGE", "REFACTOR"],
    },
  ];
  
  let ocCreated = 0;
  let ocExisting = 0;
  
  for (const agentData of openclawAgents) {
    try {
      await client.mutation("agents:register" as any, {
        projectId: openclawProject._id,
        name: agentData.name,
        role: agentData.role,
        workspacePath: agentData.workspacePath,
        allowedTaskTypes: agentData.allowedTaskTypes,
        metadata: { description: agentData.description },
      });
      console.log(`✅ Created: ${agentData.name} (${agentData.role})`);
      ocCreated++;
    } catch (error: any) {
      if (error.message && error.message.includes("already exists")) {
        console.log(`⚠️  Already exists: ${agentData.name}`);
        ocExisting++;
      } else {
        console.error(`❌ Error creating ${agentData.name}:`, error.message);
      }
    }
  }
  
  console.log(`\n📊 OpenClaw Summary:`);
  console.log(`   Created: ${ocCreated}`);
  console.log(`   Already existed: ${ocExisting}`);
  console.log(`   Total: ${openclawAgents.length}\n`);
  
  // List all agents by project
  console.log("📋 All Agents by Project:\n");
  
  console.log("Mission Control:");
  const mcAllAgents = await client.query("agents:listAll" as any, { projectId: missionControlProject._id });
  (mcAllAgents as any[]).forEach((agent: any) => {
    console.log(`   - ${agent.name} (${agent.role}) - ${agent.status}`);
  });
  
  console.log("\nOpenClaw:");
  const ocAllAgents = await client.query("agents:listAll" as any, { projectId: openclawProject._id });
  (ocAllAgents as any[]).forEach((agent: any) => {
    console.log(`   - ${agent.name} (${agent.role}) - ${agent.status}`);
  });
  
  console.log("\n✅ Done!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
