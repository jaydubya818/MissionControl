#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import {
  assertPhase4PortsAvailable,
  assertPhase4SourceQuiescent,
  createPhase4QualificationRuntime,
  phase4BackendArguments,
  phase4CliEnvironment,
  phase4UiEnvironment,
  readPhase4SourceRuntime,
  waitForPhase4Backend,
} from "./lib/phase4-qualification-runtime.mjs";

const SOURCE_CONFIG = process.env.MISSION_CONTROL_RESEARCH_LAB_CONFIG
  ?? path.join(process.env.HOME ?? "", ".convex", "convex-backend-state", "local-jaydubya818-missioncontrol_df0fe", "config.json");
const CLOUD_PORT = boundedPort(process.env.PHASE4_QUALIFICATION_CLOUD_PORT, 3224);
const SITE_PORT = boundedPort(process.env.PHASE4_QUALIFICATION_SITE_PORT, 3225);
const UI_PORT = boundedPort(process.env.PHASE4_QUALIFICATION_UI_PORT, 5199);

async function main() {
  const generatedEnvPath = path.join(process.cwd(), ".env.local");
  if (existsSync(generatedEnvPath)) {
    throw new Error("Phase 4 qualification requires a worktree without .env.local so generated self-hosted configuration can be removed safely.");
  }
  await assertPhase4PortsAvailable([CLOUD_PORT, SITE_PORT, UI_PORT]);
  await run("pnpm", ["run", "ci:prepare"]);
  const source = readPhase4SourceRuntime(SOURCE_CONFIG);
  await assertPhase4SourceQuiescent(source);
  const runtime = createPhase4QualificationRuntime(source, {
    cloudPort: CLOUD_PORT,
    sitePort: SITE_PORT,
    uiPort: UI_PORT,
  });
  const children = [];
  let shuttingDown = false;
  const shutdown = (signal = "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    // The terminal forwards Ctrl-C to the full foreground process group. Remove
    // qualification-only paths before signaling children so a fast child exit
    // cannot terminate the launcher before its deterministic cleanup runs.
    rmSync(generatedEnvPath, { force: true });
    rmSync(runtime.runtimeRoot, { recursive: true, force: true });
    for (const child of [...children].reverse()) if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("exit", () => shutdown("SIGTERM"));

  try {
    const backend = spawn(runtime.backendBinary, phase4BackendArguments(runtime), { stdio: "inherit" });
    children.push(backend);
    await waitForPhase4Backend(runtime);

    await run("pnpm", ["exec", "convex", "dev", "--once", "--typecheck", "disable", "--codegen", "disable"], {
      env: phase4CliEnvironment(runtime),
    });
    await run("pnpm", ["exec", "convex", "env", "set", "MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1"], {
      env: phase4CliEnvironment(runtime),
    });
    await run("pnpm", ["exec", "convex", "env", "set", "MC_ALLOW_LOCAL_OPERATOR_GOVERNED_ACCEPTANCE", "1"], {
      env: phase4CliEnvironment(runtime),
    });
    await run("pnpm", ["exec", "convex", "env", "set", "MISSION_CONTROL_SERVICE_COMMAND_SECRET", runtime.serviceCommandSecret], {
      env: phase4CliEnvironment(runtime),
    });

    const ui = spawn("pnpm", ["--filter", "mission-control-ui", "exec", "vite", "--port", String(runtime.uiPort), "--strictPort"], {
      env: phase4UiEnvironment(runtime),
      stdio: "inherit",
    });
    children.push(ui);
    console.log("\nPhase 4 isolated qualification runtime is readying.");
    console.log(`Backend: ${runtime.convexUrl}`);
    console.log(`Browser: http://localhost:${runtime.uiPort}`);
    console.log(`Disposable state: ${runtime.runtimeRoot}`);
    console.log(`Worker environment: ${runtime.environmentPath}`);
    console.log("No seed or executor was started. Ctrl-C removes the disposable copy.\n");

    await Promise.all(children.map((child) => new Promise((resolve, reject) => {
      child.once("exit", (code, signal) => {
        if (shuttingDown || signal === "SIGTERM" || signal === "SIGINT") return resolve();
        reject(new Error(`Qualification child exited unexpectedly (${code ?? signal}).`));
      });
    })));
  } finally {
    shutdown();
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}.`)));
  });
}

function boundedPort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`Invalid qualification port: ${value}.`);
  return port;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
