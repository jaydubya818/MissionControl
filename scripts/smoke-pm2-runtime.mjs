import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pm2Executable = process.env.PM2_EXECUTABLE?.trim() || "pm2";
const pnpmExecutable = process.env.npm_execpath || "pnpm";
const pm2StateDirectory = await mkdtemp(path.join(os.tmpdir(), "mission-control-pm2-smoke-"));
const port = await availablePort();
const environment = {
  ...process.env,
  PM2_HOME: pm2StateDirectory,
  CONVEX_URL: "http://127.0.0.1:3212",
  MC_BACKEND_DEPLOYMENT_CLASS: "local",
  ORCHESTRATION_PORT: String(port),
  ORCHESTRATION_LEGACY_COORDINATOR_ENABLED: "0",
  FACTORY_EXECUTION_ENABLED: "0",
  CODEX_FACTORY_WORKER_ENABLED: "false",
  DEEPSEEK_HARNESS_EXECUTOR_ENABLED: "0",
};

try {
  await run(pnpmExecutable, ["--filter", "@mission-control/orchestration-server", "build"], environment);
  await run(pm2Executable, [
    "start",
    path.join(repositoryRoot, "ecosystem.config.cjs"),
    "--only",
    "mission-control-orchestration",
    "--update-env",
  ], environment);
  const health = await waitForHealth(`http://127.0.0.1:${port}/health`);
  if (health.status !== "ok") throw new Error(`Unexpected orchestration health payload: ${JSON.stringify(health)}`);
  process.stdout.write(`PM2 orchestration smoke: PASS (${health.status})\n`);
} finally {
  await run(pm2Executable, ["delete", "mission-control-orchestration"], environment).catch(() => undefined);
  await run(pm2Executable, ["kill"], environment).catch(() => undefined);
  await rm(pm2StateDirectory, { recursive: true, force: true });
}

async function run(executable, args, env) {
  return await execFileAsync(executable, args, {
    cwd: repositoryRoot,
    env,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const selected = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!selected) throw new Error("Could not reserve a PM2 smoke-test port.");
  return selected;
}

async function waitForHealth(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return await response.json();
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Orchestration did not become healthy: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
