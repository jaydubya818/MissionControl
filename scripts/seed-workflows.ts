/**
 * Seed Built-in Workflows
 * 
 * Loads supported workflow definitions from YAML and inserts them into Convex.
 * 
 * Usage:
 *   npx tsx scripts/seed-workflows.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { spawnSync } from "node:child_process";
import { api } from "../convex/_generated/api";
import * as workflowLoader from "../packages/workflow-engine/src/loader.ts";
import * as path from "path";
import { fileURLToPath } from "url";

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const loadAllWorkflows =
  workflowLoader.loadAllWorkflows ??
  (workflowLoader as unknown as { default?: typeof workflowLoader }).default?.loadAllWorkflows;

if (!CONVEX_URL || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY) {
  console.error("Legacy workflow seeding requires explicit CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY deployment administrator credentials.");
  process.exit(1);
}

async function main() {
  if (!loadAllWorkflows) {
    throw new Error("Workflow loader is unavailable.");
  }
  console.log("🔄 Seeding workflows into Convex...\n");
  
  const client = new ConvexHttpClient(CONVEX_URL);

  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await client.query(api.workflows.list, { activeOnly: false });
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  
  // Load all workflows from workflows/ directory
  const workflowsDir = path.join(scriptDirectory, "..", "workflows");
  const workflows = loadAllWorkflows(workflowsDir);
  
  console.log(`Found ${workflows.size} workflow(s):\n`);
  
  for (const [id, workflow] of workflows) {
    console.log(`  - ${workflow.name} (${id})`);
    console.log(`    ${workflow.description}`);
    console.log(`    ${workflow.agents.length} agents, ${workflow.steps.length} steps\n`);
  }
  
  let failureCount = 0;
  for (const [id, workflow] of workflows) {
    try {
      const definition = {
        workflowId: workflow.id,
        name: workflow.name,
        description: workflow.description,
        topology: workflow.topology,
        maxConcurrency: workflow.maxConcurrency,
        convergence: workflow.convergence,
        agents: workflow.agents,
        steps: workflow.steps,
        active: true,
        createdBy: "seed-script",
      };
      // The CLI supports internal functions under deployment-admin authority.
      // Credentials stay in the environment and never enter logged arguments.
      const seeded = spawnSync(process.execPath, [
        path.join(scriptDirectory, "../node_modules/convex/bin/main.js"),
        "run", "workflows:upsert", JSON.stringify(definition),
      ], { env: process.env, stdio: "inherit" });
      if (seeded.error) throw seeded.error;
      if (seeded.status !== 0) throw new Error("Deployment administrator workflow seeding failed.");
      
      console.log(`✅ Seeded: ${workflow.name}`);
    } catch (error) {
      failureCount += 1;
      console.error(`❌ Failed to seed ${workflow.name}:`, error);
    }
  }

  if (failureCount > 0) {
    throw new Error(`Failed to seed ${failureCount} of ${workflows.size} workflows.`);
  }

  console.log("\n✨ Workflow seeding complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
