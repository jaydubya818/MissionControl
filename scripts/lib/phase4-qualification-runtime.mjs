import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const PHASE4_QUALIFICATION_CLOUD_PORT = 3224;
export const PHASE4_QUALIFICATION_SITE_PORT = 3225;
export const PHASE4_QUALIFICATION_UI_PORT = 5199;

export function createPhase4QualificationRuntime(source, options = {}) {
  assertNoActiveSqliteSidecars(source.databasePath);
  const runtimeRoot = mkdtempSync(path.join(options.tmpDir ?? os.tmpdir(), "mission-control-phase4-mcp-"));
  const instanceName = `phase4-real-mcp-qualification-${path.basename(runtimeRoot).slice(-6)}`;
  const instanceSecret = options.instanceSecret ?? cryptoRandomHex();
  const serviceCommandSecret = options.serviceCommandSecret ?? cryptoRandomHex();
  const databasePath = path.join(runtimeRoot, "convex_local_backend.sqlite3");
  const storagePath = path.join(runtimeRoot, "convex_local_storage");
  cpSync(source.databasePath, databasePath, { errorOnExist: true });
  cpSync(source.storagePath, storagePath, { recursive: true, errorOnExist: true });
  const adminKey = execFileSync(source.backendBinary, [
    "keygen", "admin-key",
    "--instance-name", instanceName,
    "--instance-secret", instanceSecret,
  ], { encoding: "utf8" }).trim();
  if (!adminKey.startsWith(`${instanceName}|`)) throw new Error("Qualification backend admin key identity is invalid.");
  const environmentPath = writePhase4WorkerEnvironment(runtimeRoot, {
    convexUrl: `http://127.0.0.1:${options.cloudPort ?? PHASE4_QUALIFICATION_CLOUD_PORT}`,
    serviceCommandSecret,
  });
  return {
    adminKey,
    backendBinary: source.backendBinary,
    cloudPort: options.cloudPort ?? PHASE4_QUALIFICATION_CLOUD_PORT,
    convexUrl: `http://127.0.0.1:${options.cloudPort ?? PHASE4_QUALIFICATION_CLOUD_PORT}`,
    databasePath,
    environmentPath,
    instanceName,
    instanceSecret,
    runtimeRoot,
    serviceCommandSecret,
    sitePort: options.sitePort ?? PHASE4_QUALIFICATION_SITE_PORT,
    storagePath,
    uiPort: options.uiPort ?? PHASE4_QUALIFICATION_UI_PORT,
  };
}

export function writePhase4WorkerEnvironment(runtimeRoot, input) {
  const environmentPath = path.join(runtimeRoot, "qualification-worker.env");
  writeFileSync(environmentPath, [
    `CONVEX_URL=${input.convexUrl}`,
    `MISSION_CONTROL_SERVICE_COMMAND_SECRET=${input.serviceCommandSecret}`,
    "",
  ].join("\n"), { mode: 0o600 });
  return environmentPath;
}

export function phase4BackendArguments(runtime) {
  return [
    "--port", String(runtime.cloudPort),
    "--site-proxy-port", String(runtime.sitePort),
    "--convex-origin", runtime.convexUrl,
    "--convex-site", `http://127.0.0.1:${runtime.sitePort}`,
    "--instance-name", runtime.instanceName,
    "--instance-secret", runtime.instanceSecret,
    "--local-storage", runtime.storagePath,
    "--disable-beacon",
    runtime.databasePath,
  ];
}

export function phase4CliEnvironment(runtime, environment = process.env) {
  const result = { ...environment };
  delete result.CONVEX_DEPLOYMENT;
  delete result.CONVEX_DEPLOY_KEY;
  result.CONVEX_SELF_HOSTED_URL = runtime.convexUrl;
  result.CONVEX_SELF_HOSTED_ADMIN_KEY = runtime.adminKey;
  return result;
}

export function phase4UiEnvironment(runtime, environment = process.env) {
  return {
    ...environment,
    VITE_CONVEX_URL: runtime.convexUrl,
    VITE_AUTH_MODE: "demo",
    VITE_FLAG_COMPANY_CONTEXT: "false",
    VITE_FLAG_CONTEXT_REGISTRY: "true",
    VITE_FLAG_EOS_COMMAND_CENTER_PREVIEW: "true",
    VITE_FLAG_UI_SHELL_V2: "true",
  };
}

export async function waitForPhase4Backend(runtime, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${runtime.convexUrl}/instance_name`);
      if (response.ok && (await response.text()).trim() === runtime.instanceName) return;
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Qualification backend did not become ready at ${runtime.convexUrl}.`);
}

export async function assertPhase4PortsAvailable(ports) {
  const occupied = [];
  for (const port of ports) if (await portIsListening(port)) occupied.push(port);
  if (occupied.length > 0) throw new Error(`Qualification port(s) already in use: ${occupied.join(", ")}.`);
}

export async function assertPhase4SourceQuiescent(source, checkPort = portIsListening) {
  assertNoActiveSqliteSidecars(source.databasePath);
  const occupied = [];
  for (const port of source.ports) if (await checkPort(port)) occupied.push(port);
  if (occupied.length > 0) {
    throw new Error(`Research Lab source backend must be stopped before snapshot copy; active port(s): ${occupied.join(", ")}.`);
  }
}

export function readPhase4SourceRuntime(configPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const stateDir = path.dirname(configPath);
  const binary = path.join(os.homedir(), ".cache", "convex", "binaries", config.backendVersion, "convex-local-backend");
  const databasePath = path.join(stateDir, "convex_local_backend.sqlite3");
  const storagePath = path.join(stateDir, "convex_local_storage");
  for (const [label, target] of [["backend binary", binary], ["database", databasePath], ["storage", storagePath]]) {
    if (!existsSync(target)) throw new Error(`Research Lab ${label} is unavailable at ${target}.`);
  }
  const ports = [config.ports?.cloud, config.ports?.site];
  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65_535)) {
    throw new Error("Research Lab source runtime does not declare exact cloud and site ports for the quiescence check.");
  }
  return { backendBinary: binary, databasePath, storagePath, ports };
}

function assertNoActiveSqliteSidecars(databasePath) {
  const sidecars = [`${databasePath}-wal`, `${databasePath}-shm`].filter(existsSync);
  if (sidecars.length > 0) {
    throw new Error(`Research Lab source database has active SQLite sidecar(s): ${sidecars.map((target) => path.basename(target)).join(", ")}. Stop the source backend and checkpoint SQLite before copying.`);
  }
}

function cryptoRandomHex() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join("");
}

function portIsListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
