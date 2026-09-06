import { offlineSandboxIssues as isolatedSandboxIssues } from "./localQualificationSandbox.js";
import type { HarnessCapabilityManifest, HarnessCapabilityRequirement, HarnessRuntimeArtifactIdentity } from "@mission-control/workflow-engine/harness-contract";
import {
  findKnownHarnessManifest,
  findKnownHarnessRuntimeArtifact,
  harnessCapabilityManifestDigest,
  harnessManifestIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  ISOLATED_INVOCATION_ADAPTER_ARTIFACT,
  LEGACY_ISOLATED_INVOCATION_ADAPTER_ARTIFACT,
} from "@mission-control/workflow-engine/harness-contract";

export function resolveFrozenHarnessBinding(input: {
  executor: { adapter: string; version: string };
  harnessCapabilityManifest?: unknown;
  harnessCapabilityManifestDigest?: string;
  harnessEffectiveConfigSha256?: string;
  harnessRuntimeArtifact?: unknown;
  harnessRuntimeArtifactDigest?: string;
  modelRouteSnapshot?: unknown;
  executionBackend?: string;
  sandboxProfileSnapshot?: unknown;
}) {
  const known = findKnownHarnessManifest(input.executor.adapter, input.executor.version);
  const manifest = (input.harnessCapabilityManifest ?? known) as HarnessCapabilityManifest | undefined;
  if (!manifest || harnessManifestIssues(manifest).length > 0) {
    throw new Error(`Unknown or invalid harness adapter ${input.executor.adapter}/${input.executor.version}.`);
  }
  if (manifest.identity.adapterId !== input.executor.adapter || manifest.identity.adapterVersion !== input.executor.version) {
    throw new Error("Harness capability identity does not match the selected executor adapter.");
  }
  const digest = harnessCapabilityManifestDigest(manifest);
  if (input.harnessCapabilityManifestDigest && input.harnessCapabilityManifestDigest !== digest) {
    throw new Error("Frozen harness capability manifest digest is invalid.");
  }
  if (input.harnessEffectiveConfigSha256 && input.harnessEffectiveConfigSha256 !== manifest.effectiveConfigSha256) {
    throw new Error("Frozen harness effective configuration digest is invalid.");
  }
  const routeSnapshot = input.modelRouteSnapshot as Record<string, any> | undefined;
  const executionBackend = input.executionBackend ?? "persistent-worker";
  const legacyArtifact = routeSnapshot?.schema === "factory-model-route/v1"
    ? legacyRouteRuntimeArtifact(routeSnapshot, manifest, executionBackend)
    : undefined;
  const knownArtifact = findKnownHarnessRuntimeArtifact(input.executor.adapter, input.executor.version);
  const backendArtifact = executionBackend === "remote-sandbox"
    ? remoteSandboxRuntimeArtifact(input.sandboxProfileSnapshot, manifest)
    : knownArtifact;
  const artifact = (input.harnessRuntimeArtifact ?? legacyArtifact ?? backendArtifact) as HarnessRuntimeArtifactIdentity | undefined;
  if (!artifact || harnessRuntimeArtifactIssues(artifact).length > 0) {
    throw new Error(`Unknown or invalid harness runtime artifact ${input.executor.adapter}/${input.executor.version}.`);
  }
  if (routeSnapshot?.schema === "factory-model-route/v2" && !input.harnessRuntimeArtifact) {
    throw new Error("Factory model-route V2 requires an explicitly frozen harness runtime artifact.");
  }
  const artifactDigest = harnessRuntimeArtifactDigest(artifact);
  if (input.harnessRuntimeArtifactDigest && input.harnessRuntimeArtifactDigest !== artifactDigest) {
    throw new Error("Frozen harness runtime artifact digest is invalid.");
  }
  if (executionBackend === "isolated-container" && (!known || !knownArtifact
    || harnessCapabilityManifestDigest(known) !== digest || harnessRuntimeArtifactDigest(knownArtifact) !== artifactDigest
    || manifest.schemaVersion !== "harness-capability-manifest/v2")) throw new Error("Isolated execution requires an exact registered non-inference harness.");
  assertRuntimeArtifactMatchesBackend(artifact, executionBackend, input.sandboxProfileSnapshot);
  return {
    adapter: input.executor.adapter,
    version: input.executor.version,
    capabilityManifest: manifest,
    capabilityManifestSha256: digest,
    effectiveConfigSha256: manifest.effectiveConfigSha256,
    runtimeArtifact: structuredClone(artifact),
    runtimeArtifactDigest: artifactDigest,
    runtimeArtifactSha256: artifactDigest,
  };
}

/**
 * The worker-host adapter is an executable loaded by the orchestration
 * process. It is intentionally distinct from the artifact that executes in a
 * remote backend (for example, a pinned sandbox image).
 */
export function resolveHarnessAdapterRuntimeArtifact(executor: { adapter: string; version: string }) {
  const artifact = executor.adapter === "isolated-invocation" && executor.version === "2"
    ? ISOLATED_INVOCATION_ADAPTER_ARTIFACT
    : executor.adapter === "isolated-invocation" && executor.version === "1"
      ? LEGACY_ISOLATED_INVOCATION_ADAPTER_ARTIFACT
      : findKnownHarnessRuntimeArtifact(executor.adapter, executor.version);
  if (!artifact || harnessRuntimeArtifactIssues(artifact).length > 0) {
    throw new Error(`Unknown or invalid harness adapter runtime artifact ${executor.adapter}/${executor.version}.`);
  }
  if (artifact.kind !== "EXECUTABLE") {
    throw new Error(`Harness adapter ${executor.adapter}/${executor.version} is not an exact worker executable.`);
  }
  return {
    runtimeArtifact: structuredClone(artifact),
    runtimeArtifactSha256: harnessRuntimeArtifactDigest(artifact),
  };
}

function legacyRouteRuntimeArtifact(
  route: Record<string, any>,
  manifest: HarnessCapabilityManifest,
  executionBackend: string,
): HarnessRuntimeArtifactIdentity | undefined {
  const runtime = route.runtimeIdentity;
  if (runtime?.kind !== "CODEX_CLI" || typeof runtime.cliVersion !== "string") return undefined;
  if (executionBackend === "persistent-worker" && typeof runtime.executableSha256 === "string") {
    return {
      schemaVersion: "harness-runtime-artifact/v1",
      kind: "EXECUTABLE",
      name: manifest.identity.adapterId,
      version: runtime.cliVersion,
      executableSha256: runtime.executableSha256,
      imageDigest: null,
    };
  }
  if (executionBackend === "remote-sandbox" && typeof runtime.imageDigest === "string") {
    return {
      schemaVersion: "harness-runtime-artifact/v1",
      kind: "CONTAINER_IMAGE",
      name: `${manifest.identity.harnessId}-image`,
      version: runtime.cliVersion,
      executableSha256: null,
      imageDigest: runtime.imageDigest,
    };
  }
  return undefined;
}

function remoteSandboxRuntimeArtifact(
  snapshotInput: unknown,
  manifest: HarnessCapabilityManifest,
): HarnessRuntimeArtifactIdentity | undefined {
  const snapshot = snapshotInput as Record<string, any> | undefined;
  const imageDigest = exactSandboxImageDigest(snapshot);
  if (!imageDigest) return undefined;
  return {
    schemaVersion: "harness-runtime-artifact/v1",
    kind: "CONTAINER_IMAGE",
    name: `${manifest.identity.harnessId}-sandbox`,
    version: boundedRelease(snapshot?.providerProfileVersion)
      ? snapshot.providerProfileVersion
      : null,
    executableSha256: null,
    imageDigest,
  };
}

function assertRuntimeArtifactMatchesBackend(
  artifact: HarnessRuntimeArtifactIdentity,
  executionBackend: string,
  sandboxProfileSnapshot: unknown,
) {
  if (executionBackend === "persistent-worker") {
    if (artifact.kind !== "EXECUTABLE" || !artifact.executableSha256 || artifact.imageDigest !== null) {
      throw new Error("Persistent-worker execution requires the exact frozen harness executable artifact.");
    }
    return;
  }
  if (executionBackend === "remote-sandbox") {
    const imageDigest = exactSandboxImageDigest(sandboxProfileSnapshot as Record<string, any> | undefined);
    if (!imageDigest
      || artifact.kind !== "CONTAINER_IMAGE"
      || artifact.executableSha256 !== null
      || artifact.imageDigest?.toLowerCase() !== imageDigest) {
      throw new Error("Remote-sandbox execution requires the exact immutable Sandbox Profile image artifact.");
    }
    return;
  }
  if (executionBackend === "isolated-container") {
    const snapshot = sandboxProfileSnapshot as Record<string, any>;
    if (isolatedSandboxIssues(snapshot).length || artifact.kind !== "CONTAINER_IMAGE" || artifact.executableSha256 !== null
      || artifact.imageDigest !== snapshot.imageDigest) throw new Error("Isolated container requires the exact qualified image composition.");
    return;
  }
  throw new Error(`Unsupported Factory execution backend ${executionBackend}.`);
}

function exactSandboxImageDigest(snapshot: Record<string, any> | undefined) {
  const securityDigest = snapshot?.security?.image?.digest;
  const imageReferenceDigest = typeof snapshot?.machine?.image === "string"
    ? snapshot.machine.image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]
    : undefined;
  if (typeof securityDigest === "string" && /^sha256:[a-f0-9]{64}$/i.test(securityDigest)) {
    if (!imageReferenceDigest || imageReferenceDigest.toLowerCase() !== securityDigest.toLowerCase()) return undefined;
    return securityDigest.toLowerCase();
  }
  return imageReferenceDigest?.toLowerCase();
}

function boundedRelease(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/.test(value);
}

export function factoryHarnessCapabilityRequirements(
  isolation: "READ_ONLY" | "WORKSPACE_WRITE",
): HarnessCapabilityRequirement[] {
  return [
    { capability: "filesystem.read", minimumSupport: "SUPPORTED" },
    ...(isolation === "WORKSPACE_WRITE"
      ? [{ capability: "filesystem.write", minimumSupport: "SUPPORTED" } as const]
      : []),
    { capability: "filesystem.pathAllowlist", minimumSupport: "PARTIAL" },
    { capability: "shell.available", minimumSupport: "PARTIAL" },
    { capability: "shell.processTreeCancellation", minimumSupport: "PARTIAL" },
    { capability: "git.status", minimumSupport: "SUPPORTED" },
    { capability: "git.diff", minimumSupport: "SUPPORTED" },
    { capability: "tools.structuredOutput", minimumSupport: "PARTIAL" },
    { capability: "headless.support", minimumSupport: "PARTIAL" },
    { capability: "cancellation.support", minimumSupport: "PARTIAL" },
  ];
}
