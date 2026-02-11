/**
 * Seed Built-in Workflows
 * 
 * Loads the 3 built-in workflows (feature-dev, bug-fix, security-audit)
 * from YAML files and inserts them into the Convex database.
 * 
 * Usage:
 *   npx tsx scripts/seed-workflows.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadAllWorkflows } from "../packages/workflow-engine/src/loader";
import * as path from "path";

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable not set");
  process.exit(1);
}

async function main() {
  console.log("🔄 Seeding workflows into Convex...\n");
  
  const client = new ConvexHttpClient(CONVEX_URL);
  
  // Load all workflows from workflows/ directory
  const workflowsDir = path.join(__dirname, "..", "workflows");
  const workflows = loadAllWorkflows(workflowsDir);
  
  console.log(`Found ${workflows.size} workflow(s):\n`);
  
  for (const [id, workflow] of workflows) {
    console.log(`  - ${workflow.name} (${id})`);
    console.log(`    ${workflow.description}`);
    console.log(`    ${workflow.agents.length} agents, ${workflow.steps.length} steps\n`);
  }
  
  // Upsert each workflow
  for (const [id, workflow] of workflows) {
    try {
      await client.mutation(api.workflows.upsert, {
        workflowId: workflow.id,
        name: workflow.name,
        description: workflow.description,
        agents: workflow.agents,
        steps: workflow.steps,
        active: true,
        createdBy: "seed-script",
      });
      
      console.log(`✅ Seeded: ${workflow.name}`);
    } catch (error) {
      console.error(`❌ Failed to seed ${workflow.name}:`, error);
    }
  }
  
  console.log("\n✨ Workflow seeding complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
