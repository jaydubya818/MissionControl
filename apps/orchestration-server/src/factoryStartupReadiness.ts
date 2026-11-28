import path from "node:path";
import type { ExecutorHealth } from "@mission-control/workflow-engine";
import type { FactoryHostReporterConfig } from "./factoryHostReporter.js";

export type StartupCheck = {
  id: string;
  status: "PASS" | "FAIL" | "UNVERIFIED";
  summary: string;
  nextAction: string;
  settings: string[];
};

export function parseFactoryVersionBindings(
  value: string | undefined,
  repositoryId: string,
): FactoryHostReporterConfig["factoryVersionBindings"] {
  if (!value?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 32) {
    throw new Error("CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON must contain 1-32 bindings.");
  }
  return parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Every Factory Version worker binding must be an object.");
    }
    const binding = item as Record<string, unknown>;
    if (binding.repositoryId !== repositoryId) {
      throw new Error("Factory Version worker bindings must use CODEX_WORKER_REPOSITORY_ID.");
    }
    return binding as unknown as NonNullable<FactoryHostReporterConfig["factoryVersionBindings"]>[number];
  });
}

export function evaluateFactoryStartupReadiness(input: {
  env: NodeJS.ProcessEnv;
  platform: string;
  architecture: string;
  codexHealth?: Pick<ExecutorHealth, "status">;
  packageManager?: { status: "PASS" | "FAIL"; version?: string };
  checkedAt: number;
}) {
  const { env } = input;
  const checks: StartupCheck[] = [];
  const check = (id: string, status: StartupCheck["status"], summary: string, nextAction: string, settings: string[] = []) => {
    checks.push({ id, status, summary, nextAction, settings });
  };
  const present = (name: string) => Boolean(env[name]?.trim());
  let validBackend = false;
  try {
    const url = new URL(env.CONVEX_URL ?? "");
    validBackend = !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch { /* The diagnostic reports a fixed message without echoing input. */ }
  check("control-plane-url", validBackend ? "PASS" : "FAIL", validBackend ? "Control-plane URL has a valid local configuration." : "Control-plane URL is missing or invalid.",
    "Configure CONVEX_URL for the existing control plane. Local configuration does not establish a connection.", ["CONVEX_URL"]);
  for (const [id, name] of [["project-scope", "CODEX_WORKER_PROJECT_ID"], ["repository-scope", "CODEX_WORKER_REPOSITORY_ID"],
    ["service-signing", "MISSION_CONTROL_SERVICE_COMMAND_SECRET"]] as const) {
    check(id, present(name) ? "PASS" : "FAIL", present(name) ? `${name} is configured.` : `${name} is missing.`,
      "Use the existing scoped worker identity and repository binding. Do not copy credentials into a report.", [name]);
  }
  check("service-registration", "UNVERIFIED", present("MISSION_CONTROL_SERVICE_ID") ? "An explicit service identity is configured; its registration is unverified." : "The worker uses the orchestration-server service identity by default; its registration is unverified.",
    "Verify the service registration, capabilities, and repository scope in Mission Control.", ["MISSION_CONTROL_SERVICE_ID", "CONVEX_SERVICE_AUTH_TOKEN"]);
  const selected = [
    ["codex", env.CODEX_FACTORY_WORKER_ENABLED === "true"],
    ["codex-bedrock", env.CODEX_BEDROCK_HARNESS_ENABLED === "1"],
    ["deepseek", env.DEEPSEEK_HARNESS_EXECUTOR_ENABLED === "1"],
    ["fab", env.FAB_EXECUTOR_ENABLED === "1"],
    ["offline", env.MC_OFFLINE_FACTORY_WORKER_ENABLED === "1"],
  ] as const;
  const enabled = selected.filter(([, on]) => on).map(([name]) => name);
  check("worker-selection", enabled.length ? "PASS" : "FAIL", enabled.length ? `Selected adapters: ${enabled.join(", ")}.` : "No durable factory worker is enabled.",
    "Enable an adapter qualified for the intended Factory Version.", ["CODEX_FACTORY_WORKER_ENABLED", "CODEX_BEDROCK_HARNESS_ENABLED", "DEEPSEEK_HARNESS_EXECUTOR_ENABLED", "FAB_EXECUTOR_ENABLED"]);
  const conflict = enabled.length > 0 && (env.FACTORY_EXECUTION_ENABLED === "1" || env.SHADOW_PROVIDER_ONLY === "true");
  check("execution-mode", conflict || enabled.includes("offline") ? "FAIL" : "PASS",
    conflict ? "Durable execution conflicts with legacy or shadow execution." : enabled.includes("offline") ? "The offline fixture denies inference and cannot generate the requested application." : "No local execution-mode conflict was found.",
    "Use the existing live execution mode without changing synthetic-inference or admission rules.");
  const journal = env.MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR?.trim();
  check("accounting-path", journal && path.isAbsolute(journal) ? "PASS" : "FAIL",
    journal && path.isAbsolute(journal) ? "An absolute accounting-journal path is configured." : "An absolute accounting-journal path is required.",
    "Configure a host-owned persistent directory. Worker startup must still validate ownership, scope, and durability.", ["MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR"]);
  let bindingCount = 0;
  try { bindingCount = parseFactoryVersionBindings(env.CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON, env.CODEX_WORKER_REPOSITORY_ID?.trim() ?? "")?.length ?? 0; } catch { /* Never print user-controlled JSON or parser details. */ }
  check("factory-version-bindings", bindingCount ? "PASS" : "FAIL", bindingCount ? `${bindingCount} repository-bound configuration entries parsed; server admission is unverified.` : "Factory Version bindings are missing, malformed, or bound to another repository.",
    "Use the existing admitted Factory Version bindings. The control plane validates their digests, model routes, and current qualification.", ["CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON"]);
  if (enabled.includes("codex")) {
    // The adapter's containment probe writes its "outside" fixture under the temp directory. When TMPDIR is
    // unset or points at /tmp, that fixture sits inside the sandbox's minimal-read set, so the probe correctly
    // refuses to certify containment. Name that cause instead of leaving it to be rediscovered.
    const tempDir = env.TMPDIR?.trim() ?? "";
    const weakTempDir = input.platform === "darwin" && (!tempDir || /^\/(private\/)?tmp(\/|$)/.test(tempDir));
    const codexReady = input.codexHealth?.status === "READY";
    check("codex-runtime", codexReady ? "PASS" : input.codexHealth ? "FAIL" : "UNVERIFIED",
      codexReady ? "The existing Codex adapter health check passed." : "The existing Codex adapter has not established an admitted local runtime.",
      "Run the evaluated Codex version and native artifact on a supported host, or qualify a new runtime through the existing admission process."
        + (!codexReady && weakTempDir ? " TMPDIR is unset or under /tmp; start the worker with the macOS per-user temp directory (getconf DARWIN_USER_TEMP_DIR) so the containment probe can run." : ""),
      codexReady || !weakTempDir ? ["CODEX_EXECUTABLE"] : ["CODEX_EXECUTABLE", "TMPDIR"]);
  }
  if (enabled.includes("fab")) {
    check("fab-platform", input.platform === "darwin" ? "UNVERIFIED" : "FAIL", input.platform === "darwin" ? "The platform supports Fab's native boundary; adapter admission is unverified." : "Fab's native containment requires macOS.",
      "Use an admitted macOS Fab worker with its existing provider grant and runtime configuration.", ["FAB_EXECUTOR_CONFIG", "FAB_EXECUTOR_STATE_DIR"]);
  }
  if (enabled.some((name) => ["codex-bedrock", "deepseek"].includes(name))) {
    check("provider-admission", "UNVERIFIED", "Configured provider adapters require their existing startup and control-plane admission checks.",
      "Verify the exact provider route, bounded grant, runtime artifact, and independent verifier through the existing worker.");
  }
  check("package-manager", input.packageManager?.status ?? "UNVERIFIED",
    input.packageManager?.status === "PASS" ? "The host package-manager probe reports pnpm 9.0.0." : "The pinned package manager has not been verified using the worker's executable lookup.",
    "Install pnpm 9.0.0 in the worker's restricted PATH, or configure the explicit host CLI path outside candidate source.", ["MISSION_CONTROL_FACTORY_PNPM_CLI_PATH"]);
  check("dispatch-admission", "UNVERIFIED", "No workload was created, admitted, or dispatched by this diagnostic.",
    "Start the existing worker, confirm /ready and a current host heartbeat, then evaluate the actual WorkOrder readiness in Mission Control.");
  const failures = checks.filter((item) => item.status === "FAIL");
  return {
    schema: "factory-startup-readiness/v1" as const,
    checkedAt: input.checkedAt,
    host: { platform: input.platform, architecture: input.architecture },
    localPrerequisites: failures.length ? "BLOCKED" as const : "CHECKED" as const,
    dispatchAdmission: "UNVERIFIED" as const,
    executionAuthority: false as const,
    selectedAdapters: enabled,
    checks,
    nextActions: [...new Set((failures.length ? failures : checks.filter((item) => item.status === "UNVERIFIED")).map((item) => item.nextAction))],
  };
}
