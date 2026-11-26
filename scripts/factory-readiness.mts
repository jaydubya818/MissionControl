import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CodexV1ExecutorAdapter } from "../apps/orchestration-server/src/codexExecutorAdapter.js";
import { evaluateFactoryStartupReadiness } from "../apps/orchestration-server/src/factoryStartupReadiness.js";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
if (args.includes("--help")) {
  console.log("Usage: pnpm run factory:readiness [--json]\nReads the current host environment and runs local executable health checks.\nDoes not start a worker, connect to providers, create records, or grant dispatch authority.");
} else if (args.some((argument) => argument !== "--json")) {
  console.error("Unsupported option. Use --help.");
  process.exitCode = 2;
} else {
  const run = promisify(execFile);
  let packageManager: { status: "PASS" | "FAIL" } = { status: "FAIL" };
  try {
    const configured = process.env.MISSION_CONTROL_FACTORY_PNPM_CLI_PATH;
    let cli: string | undefined;
    if (configured) {
      if (!path.isAbsolute(configured)) throw new Error("INVALID_HOST_CLI");
      const checkout = path.resolve(process.env.CODEX_WORKER_CHECKOUT_ROOT?.trim() || process.cwd());
      const roots = [checkout, await realpath(checkout)];
      cli = await realpath(configured);
      if (![path.resolve(configured), cli].every((candidate) => roots.every((root) => candidate !== root && !candidate.startsWith(root + path.sep)))
        || !(await stat(cli)).isFile()) throw new Error("INVALID_HOST_CLI");
    }
    const output = await run(cli ? process.execPath : "pnpm", cli ? [cli, "--version"] : ["--version"], {
      cwd: os.tmpdir(), timeout: 10_000, maxBuffer: 16_384,
      env: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", HOME: os.homedir(),
        COREPACK_ENABLE_NETWORK: "0", COREPACK_ENABLE_PROJECT_SPEC: "0", COREPACK_ENABLE_AUTO_PIN: "0" },
    });
    packageManager = { status: output.stdout.trim() === "9.0.0" ? "PASS" : "FAIL" };
  } catch { /* A fixed diagnostic below avoids exposing command output or secrets. */ }
  const codexHealth = process.env.CODEX_FACTORY_WORKER_ENABLED === "true"
    ? await new CodexV1ExecutorAdapter().health() : undefined;
  const report = evaluateFactoryStartupReadiness({ env: process.env, platform: process.platform, architecture: process.arch,
    codexHealth, packageManager, checkedAt: Date.now() });
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Factory local prerequisites: ${report.localPrerequisites}. Dispatch admission: ${report.dispatchAdmission}.`);
    for (const check of report.checks) console.log(`[${check.status}] ${check.summary}\n  ${check.nextAction}`);
  }
  process.exitCode = report.localPrerequisites === "BLOCKED" ? 1 : 0;
}
