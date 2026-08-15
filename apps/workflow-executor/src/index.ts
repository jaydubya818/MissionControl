/**
 * Workflow Executor — Standalone Process
 * 
 * Polls for workflow runs and executes steps with retry/escalation logic.
 * Runs as a long-lived process with graceful shutdown handling.
 */

import * as workflowEngine from "@mission-control/workflow-engine";
import * as dotenv from "dotenv";

const createExecutor =
  workflowEngine.createExecutor ??
  (workflowEngine as unknown as { default?: typeof workflowEngine }).default?.createExecutor;

// Load environment variables
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
const STEP_TIMEOUT_MS = parseInt(process.env.STEP_TIMEOUT_MS || "60000", 10);
const WORKFLOW_EXECUTOR_OWNER_ID = process.env.WORKFLOW_EXECUTOR_OWNER_ID?.trim();
const WORKFLOW_DISPATCH_MODE = process.env.WORKFLOW_DISPATCH_MODE === "SCHEDULED"
  ? "SCHEDULED" as const
  : "MANUAL" as const;
const WORKFLOW_ESTIMATED_COST_USD = Number(process.env.WORKFLOW_ESTIMATED_COST_USD ?? "1");
const CONVEX_SERVICE_AUTH_TOKEN = process.env.CONVEX_SERVICE_AUTH_TOKEN?.trim();

if (!CONVEX_URL) {
  console.error("❌ Error: CONVEX_URL environment variable is required");
  process.exit(1);
}
if (!createExecutor) {
  console.error("❌ Error: workflow engine factory is unavailable");
  process.exit(1);
}

console.log("🤖 Mission Control Workflow Executor");
console.log("=====================================");
console.log(`Convex URL: ${CONVEX_URL}`);
console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
console.log(`Step Timeout: ${STEP_TIMEOUT_MS}ms`);
console.log(`Dispatch Mode: ${WORKFLOW_DISPATCH_MODE}`);
console.log("Continuous scheduling is controlled server-side and defaults to disabled.");
console.log("");

// Create executor
const executor = createExecutor({
  convexUrl: CONVEX_URL,
  serviceAuthToken: CONVEX_SERVICE_AUTH_TOKEN,
  pollIntervalMs: POLL_INTERVAL_MS,
  stepTimeoutMs: STEP_TIMEOUT_MS,
  ownerId: WORKFLOW_EXECUTOR_OWNER_ID,
  dispatchMode: WORKFLOW_DISPATCH_MODE,
  estimatedCostUsd: WORKFLOW_ESTIMATED_COST_USD,
});

// Graceful shutdown handling
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) {
    console.log("⚠️  Force shutdown...");
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop the executor
    executor.stop();
    
    // Give it a moment to finish current work
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    console.log("✅ Executor stopped cleanly");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
}

// Register signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled rejection at:", promise, "reason:", reason);
  shutdown("unhandledRejection");
});

// Health check endpoint (optional, for monitoring)
if (process.env.HEALTH_CHECK_PORT) {
  const http = require("http");
  const port = parseInt(process.env.HEALTH_CHECK_PORT, 10);
  
  const server = http.createServer((req: any, res: any) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
  
  server.listen(port, () => {
    console.log(`🏥 Health check endpoint: http://localhost:${port}/health`);
    console.log("");
  });
}

// Start the executor
console.log("▶️  Starting workflow executor...\n");

executor.start().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
