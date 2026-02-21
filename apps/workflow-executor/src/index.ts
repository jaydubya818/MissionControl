/**
 * Workflow Executor — Standalone Process
 * 
 * Polls for workflow runs and executes steps with retry/escalation logic.
 * Runs as a long-lived process with graceful shutdown handling.
 */

import { createExecutor } from "@mission-control/workflow-engine";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
const STEP_TIMEOUT_MS = parseInt(process.env.STEP_TIMEOUT_MS || "60000", 10);

if (!CONVEX_URL) {
  console.error("❌ Error: CONVEX_URL environment variable is required");
  process.exit(1);
}

console.log("🤖 Mission Control Workflow Executor");
console.log("=====================================");
console.log(`Convex URL: ${CONVEX_URL}`);
console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
console.log(`Step Timeout: ${STEP_TIMEOUT_MS}ms`);
console.log("");

// Create executor
const executor = createExecutor({
  convexUrl: CONVEX_URL,
  pollIntervalMs: POLL_INTERVAL_MS,
  stepTimeoutMs: STEP_TIMEOUT_MS,
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
