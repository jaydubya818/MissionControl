import { exerciseCodexRuntime } from "./runtime-fixture.mjs";
// Deterministic fixture only. No provider calls, no candidate change.
import {
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
  createReadStream,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import net from "node:net";
import { createHash } from "node:crypto";
const checks = [];
function check(name, test) {
  try {
    checks.push({ name, passed: Boolean(test()) });
  } catch {
    checks.push({ name, passed: false });
  }
}
const denied = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check("workspace_write_read", () => {
  writeFileSync("fixture-probe", "private");
  return readFileSync("fixture-probe", "utf8") === "private";
});
execFileSync("git", ["clean", "-f", "--", "fixture-probe"]);
check("private_temp", () => {
  writeFileSync("/tmp/fixture-probe", "private");
  return true;
});
check("nonroot", () => process.getuid() === 10001);
check(
  "runtime_available",
  () =>
    execFileSync("codex", ["--version"], { encoding: "utf8" }).trim() ===
    "codex-cli 0.146.0",
);
const native =
  "/opt/mission-control/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex";
const runtimeHash = createHash("sha256");
for await (const chunk of createReadStream(native)) runtimeHash.update(chunk);
const runtime = {
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  codexSha256: runtimeHash.digest("hex"),
};
const sandbox = spawnSync(
  "codex",
  [
    "sandbox",
    "linux",
    "--full-auto",
    "--",
    "node",
    "-e",
    'process.stdout.write("FDLC_DETERMINISTIC_RUNTIME_OK")',
  ],
  { encoding: "utf8", timeout: 15000, maxBuffer: 4096 },
);
runtime.deterministicSandbox = {
  status: sandbox.status,
  signal: sandbox.signal,
  markerObserved:
    sandbox.stdout?.includes("FDLC_DETERMINISTIC_RUNTIME_OK") === true,
  stderr: sandbox.stderr?.slice(-2000) ?? "",
  errorCode: sandbox.error?.code ?? null,
};
runtime.outerBoundaryFixture = await exerciseCodexRuntime();
check(
  "actual_codex_tool_execution",
  () =>
    runtime.outerBoundaryFixture.markerObserved &&
    runtime.outerBoundaryFixture.completed &&
    runtime.outerBoundaryFixture.exitCode === 0,
);
check("native_runtime_readonly", () =>
  denied(() => closeSync(openSync(native, "r+"))),
);
check("privilege_escalation_denied", () =>
  denied(() =>
    execFileSync(
      "/usr/bin/setpriv",
      ["--reuid=0", "--regid=0", "--clear-groups", "id"],
      { stdio: "ignore" },
    ),
  ),
);
check("runtime_readonly", () =>
  denied(() => closeSync(openSync("/opt/factory/bridge.mjs", "r+"))),
);
check("root_readonly", () =>
  denied(() => writeFileSync("/etc/fixture-probe", "denied")),
);
for (const p of [
  "/Users/jaywest",
  "/host",
  "/host/etc",
  "/var/run/docker.sock",
  "/run/docker.sock",
  "/Users/jaywest/.codex/auth.json",
  "/Users/jaywest/MissionControl",
  "/private/tmp",
])
  check("absent:" + p, () => !existsSync(p));
check(
  "no_credentials_env",
  () =>
    !Object.keys(process.env).some((k) =>
      /TOKEN|SECRET|API_KEY|PASSWORD/.test(k),
    ),
);
const status = readFileSync("/proc/self/status", "utf8");
check("no_new_privileges", () => /NoNewPrivs:\s+1/.test(status));
check("capabilities_dropped", () => /CapEff:\s+0000000000000000/.test(status));
check("seccomp_filter", () => /Seccomp:\s+2/.test(status));
for (const [name, host] of Object.entries({
  public: "1.1.1.1",
  localhost: "127.0.0.1",
  metadata: "169.254.169.254",
  private: "10.0.0.1",
  hostGateway: "192.168.65.254",
  alternateProvider: "api.anthropic.com",
})) {
  const blocked = await new Promise((resolve) => {
    const socket = net.connect({ host, port: 443 });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.on("connect", () => finish(false));
    socket.on("error", () => finish(true));
    socket.setTimeout(750, () => finish(true));
  });
  checks.push({ name: "network_denied:" + name, passed: blocked });
}
// Deliberate FAILED factory result prevents fixture from publication/acceptance.
writeFileSync(
  "/var/lib/mission-control/attempt/executor-result.json",
  JSON.stringify({
    schema: "factory-result/v1",
    status: "FAILED",
    summary: JSON.stringify({
      schema: "factory-docker-probes/v1",
      runtime,
      checks,
    }),
    completedAcceptanceCriterionIds: [],
    incompleteAcceptanceCriterionIds: ["ac-remote"],
    unknownAcceptanceCriterionIds: [],
    verificationCommands: [],
    knownRisks: ["Qualification fixture; not a pilot candidate."],
    nextAction: "Review containment evidence.",
  }),
);
