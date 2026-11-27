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
import { findKnownIsolatedHarness, SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG, inspectIsolatedRuntimeImage,
  ISOLATED_CONTAINER_POLICY_DIGEST, COMPOSITION_SCHEMA,
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
  version?: "2" | "3";
  authority: (request: IsolatedInvocation, phase: "DISPATCH" | "RESULT") => Promise<boolean>;
}): Promise<HarnessRuntimeAdapter> {
  const version = input.version ?? "2";
  const registered = findKnownIsolatedHarness(version);
  if (!registered || !["2", "3"].includes(version)) throw new Error("Unsupported registered isolated harness version");
  const config = registered.config;
  const dockerDigest = version === "3"
    ? (SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.dockerExecutableSha256ByPlatform as Record<string, string>)[`${process.platform}/${process.arch}`]
    : config.dockerExecutableSha256;
  if (!dockerDigest) throw new Error("Unqualified Docker host platform");
  const pinned = await pinHostExecutable(input.dockerExecutable, dockerDigest);
  try {
  const verifyDocker = async () => {
    const handle = await open(pinned.executable, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 256_000_000) throw new Error("Docker CLI artifact is invalid.");
      const bytes = await handle.readFile();
      if (bytes.length !== stat.size || createHash("sha256").update(bytes).digest("hex")
        !== dockerDigest) {
        throw new Error("Docker CLI does not match the qualified host artifact.");
      }
    } finally { await handle.close(); }
  };
  await verifyDocker();
  const Backend = await loadIsolatedInvocationBackend(input.backendBundlePath, version);
  const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
    bridge: { id: "isolated-invocation", version: "1", digest: config.bridgeImplementationDigest },
    backend: { id: "docker-chroot-offline", version: "1", digest: config.backendImplementationDigest },
    runtimeImage: registered.runtime.imageDigest!, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST,
    invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
  class RegisteredIsolatedBackend extends Backend {
    async dispose() { await pinned.dispose(); }
    capabilities() {
      return { ...super.capabilities(), version, capabilityManifest: structuredClone(registered!.manifest),
        runtimeArtifact: structuredClone(registered!.adapter), executionBackends: ["isolated-container" as const] };
    }
    async health() {
      let directory: string | undefined;
      let details = "The exact offline backend, Docker CLI and local runtime image are available; canonical admission is still required.";
      let ready = false;
      try {
        await verifyDocker();
        directory = await mkdtemp(join(tmpdir(), "mc-offline-health-"));
        for (const reference of registered!.imageBinding
          ? [registered!.imageBinding.manifestDigest, registered!.imageBinding.configDigest] : [composition.runtimeImage]) {
          let stdout: string;
          try {
            ({ stdout } = await promisify(execFile)(pinned.executable, ["--host", config.dockerHost,
              "--config", directory, "image", "inspect", reference],
            { timeout: 10_000, maxBuffer: 128_000, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } }));
          } catch (error) {
            const failure = error as { code?: unknown; stderr?: unknown };
            if (registered!.imageBinding && failure.code === 1 && typeof failure.stderr === "string"
              && failure.stderr.trim() === `Error response from daemon: No such image: ${reference}`) continue;
            throw error;
          }
          if (registered!.imageBinding) inspectIsolatedRuntimeImage(registered!.imageBinding, reference, JSON.parse(stdout));
          ready = true; break;
        }
        if (!ready) throw new Error("Exact image unavailable");
      } catch { details = "Exact offline host artifact or local runtime image is unavailable."; }
      finally {
        if (directory) try { await rm(directory, { recursive: true, force: true }); }
        catch { ready = false; details = "Private Docker health configuration cleanup failed."; }
      }
      return { status: ready ? "READY" as const : "UNAVAILABLE" as const, checkedAt: Date.now(),
        adapter: "isolated-invocation", version, details };
    }
  }
  return new RegisteredIsolatedBackend(composition, async (request, phase) => {
    await verifyDocker();
    return input.authority(request, phase);
  }, pinned.executable, registered.imageBinding);
  } catch (error) { await pinned.dispose(); throw error; }
}
