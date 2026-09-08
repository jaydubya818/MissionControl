import { CodexBedrockExecutorAdapter } from "./codexBedrockExecutorAdapter.js";
import { CodexV1ExecutorAdapter } from "./codexExecutorAdapter.js";
import { DeepSeekHarnessExecutorAdapter } from "./deepseekHarnessExecutorAdapter.js";
import type { HarnessRuntimeAdapter } from "./harnessAdapterRegistry.js";
import { open, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIsolatedInvocationBackend } from "./loadIsolatedInvocationBackend.js";
import { pinHostExecutable } from "./pinnedHostExecutable.js";
import { ISOLATED_INVOCATION_MANIFEST, ISOLATED_INVOCATION_ADAPTER_ARTIFACT, ISOLATED_INVOCATION_EFFECTIVE_CONFIG,
  ISOLATED_INVOCATION_RUNTIME_ARTIFACT, ISOLATED_CONTAINER_POLICY_DIGEST, COMPOSITION_SCHEMA,
  INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA, type IsolatedInvocation } from "@mission-control/workflow-engine/harness-contract";

export interface FactoryHarnessEnablement {
  codexEnabled: boolean;
  codexBedrockEnabled?: boolean;
  codexBedrockRouteAdmitted?: boolean;
  deepseekEnabled: boolean;
  legacyFactoryWorkerEnabled: boolean;
}

export interface FactoryHarnessAdapterFactories {
  createCodex: () => HarnessRuntimeAdapter;
  createCodexBedrock?: (routeAdmitted: boolean) => HarnessRuntimeAdapter;
  createDeepSeek: () => HarnessRuntimeAdapter;
}

const DEFAULT_ADAPTER_FACTORIES: FactoryHarnessAdapterFactories = {
  createCodex: () => new CodexV1ExecutorAdapter(),
  createCodexBedrock: (routeAdmitted) => new CodexBedrockExecutorAdapter(routeAdmitted),
  createDeepSeek: () => new DeepSeekHarnessExecutorAdapter(),
};

export function configuredFactoryHarnessAdapters(
  enablement: FactoryHarnessEnablement,
  factories: FactoryHarnessAdapterFactories = DEFAULT_ADAPTER_FACTORIES,
): HarnessRuntimeAdapter[] {
  const adapters: HarnessRuntimeAdapter[] = [];
  if (enablement.codexBedrockEnabled) {
    if (!factories.createCodexBedrock)
      throw new Error("Explicit Bedrock harness factory required.");
    adapters.push(factories.createCodexBedrock(
      enablement.codexBedrockRouteAdmitted === true,
    ));
  }
  if (enablement.codexEnabled) adapters.push(factories.createCodex());
  if (enablement.deepseekEnabled) adapters.push(factories.createDeepSeek());
  if (enablement.legacyFactoryWorkerEnabled && adapters.length === 0) {
    throw new Error("Factory execution is enabled, but no harness adapters were explicitly configured.");
  }
  return adapters;
}

/** Build the registered composition from verified backend bytes. The caller
 * still supplies the canonical lease/currentness check; this does not admit a
 * Factory or create execution authority. Not enabled by the legacy flags. */
export async function createIsolatedFactoryHarness(input: {
  backendBundlePath: string;
  dockerExecutable: string;
  authority: (request: IsolatedInvocation, phase: "DISPATCH" | "RESULT") => Promise<boolean>;
}): Promise<HarnessRuntimeAdapter> {
  const pinned = await pinHostExecutable(input.dockerExecutable, ISOLATED_INVOCATION_EFFECTIVE_CONFIG.dockerExecutableSha256);
  try {
  const verifyDocker = async () => {
    const handle = await open(pinned.executable, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 256_000_000) throw new Error("Docker CLI artifact is invalid.");
      const bytes = await handle.readFile();
      if (bytes.length !== stat.size || createHash("sha256").update(bytes).digest("hex")
        !== ISOLATED_INVOCATION_EFFECTIVE_CONFIG.dockerExecutableSha256) {
        throw new Error("Docker CLI does not match the qualified host artifact.");
      }
    } finally { await handle.close(); }
  };
  await verifyDocker();
  const Backend = await loadIsolatedInvocationBackend(input.backendBundlePath);
  const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
    bridge: { id: "isolated-invocation", version: "1", digest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest },
    backend: { id: "docker-chroot-offline", version: "1", digest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest },
    runtimeImage: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest!, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST,
    invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
  class RegisteredIsolatedBackend extends Backend {
    async dispose() { await pinned.dispose(); }
    capabilities() {
      return { ...super.capabilities(), version: "2", capabilityManifest: structuredClone(ISOLATED_INVOCATION_MANIFEST),
        runtimeArtifact: structuredClone(ISOLATED_INVOCATION_ADAPTER_ARTIFACT), executionBackends: ["isolated-container" as const] };
    }
    async health() {
      let directory: string | undefined;
      let details = "The exact offline backend, Docker CLI and local runtime image are available; canonical admission is still required.";
      let ready = false;
      try {
        await verifyDocker();
        directory = await mkdtemp(join(tmpdir(), "mc-offline-health-"));
        await promisify(execFile)(pinned.executable, ["--host", ISOLATED_INVOCATION_EFFECTIVE_CONFIG.dockerHost,
          "--config", directory, "image", "inspect", composition.runtimeImage],
        { timeout: 10_000, maxBuffer: 128_000, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } });
        ready = true;
      } catch { details = "Exact offline host artifact or local runtime image is unavailable."; }
      finally {
        if (directory) try { await rm(directory, { recursive: true, force: true }); }
        catch { ready = false; details = "Private Docker health configuration cleanup failed."; }
      }
      return { status: ready ? "READY" as const : "UNAVAILABLE" as const, checkedAt: Date.now(),
        adapter: "isolated-invocation", version: "2", details };
    }
  }
  return new RegisteredIsolatedBackend(composition, async (request, phase) => {
    await verifyDocker();
    return input.authority(request, phase);
  }, pinned.executable);
  } catch (error) { await pinned.dispose(); throw error; }
}
