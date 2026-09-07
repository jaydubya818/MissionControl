import { describe, expect, it } from "vitest";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  KNOWN_HARNESS_MANIFESTS,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";
import {
  resolveFrozenHarnessBinding,
  resolveHarnessAdapterRuntimeArtifact,
} from "../lib/harnessCapabilities";

const remoteImageDigest = `sha256:${"a".repeat(64)}`;
const alternateImageDigest = `sha256:${"b".repeat(64)}`;
const executor = { adapter: "codex", version: "v1" };
const legacyRoute = {
  schema: "factory-model-route/v1",
  runtimeIdentity: {
    kind: "CODEX_CLI",
    cliVersion: CODEX_V1_RUNTIME_ARTIFACT.version,
    executableSha256: CODEX_V1_RUNTIME_ARTIFACT.executableSha256,
    imageDigest: remoteImageDigest,
  },
};
const profile = {
  schema: "factory-sandbox-profile/v1",
  providerProfileVersion: "sandbox-v1",
  machine: { image: `factory-runtime@${remoteImageDigest}` },
  security: { image: { digest: remoteImageDigest } },
};

describe("frozen harness runtime identity", () => {
  it("selects the legacy executable or image strictly by execution backend", () => {
    const persistent = resolveFrozenHarnessBinding({
      executor,
      modelRouteSnapshot: legacyRoute,
      executionBackend: "persistent-worker",
    });
    expect(persistent.runtimeArtifact).toMatchObject({
      kind: "EXECUTABLE",
      executableSha256: CODEX_V1_RUNTIME_ARTIFACT.executableSha256,
      imageDigest: null,
    });

    const remote = resolveFrozenHarnessBinding({
      executor,
      modelRouteSnapshot: legacyRoute,
      executionBackend: "remote-sandbox",
      sandboxProfileSnapshot: profile,
    });
    expect(remote.runtimeArtifact).toMatchObject({
      kind: "CONTAINER_IMAGE",
      executableSha256: null,
      imageDigest: remoteImageDigest,
    });
    expect(remote.runtimeArtifactSha256).not.toBe(persistent.runtimeArtifactSha256);
  });

  it("derives a new remote execution artifact from the immutable Sandbox Profile", () => {
    const remote = resolveFrozenHarnessBinding({
      executor,
      executionBackend: "remote-sandbox",
      sandboxProfileSnapshot: profile,
    });
    expect(remote.runtimeArtifact).toEqual({
      schemaVersion: "harness-runtime-artifact/v1",
      kind: "CONTAINER_IMAGE",
      name: `${CODEX_V1_HARNESS_MANIFEST.identity.harnessId}-sandbox`,
      version: "sandbox-v1",
      executableSha256: null,
      imageDigest: remoteImageDigest,
    });
    expect(remote.runtimeArtifactSha256).toBe(harnessRuntimeArtifactDigest(remote.runtimeArtifact));
  });

  it("rejects frozen remote artifacts that differ from the profile image", () => {
    expect(() => resolveFrozenHarnessBinding({
      executor,
      executionBackend: "remote-sandbox",
      sandboxProfileSnapshot: profile,
      harnessRuntimeArtifact: {
        schemaVersion: "harness-runtime-artifact/v1",
        kind: "CONTAINER_IMAGE",
        name: "codex-cli-sandbox",
        version: "sandbox-v1",
        executableSha256: null,
        imageDigest: alternateImageDigest,
      },
    })).toThrow(/exact immutable Sandbox Profile image artifact/);
  });

  it("keeps the worker-host adapter executable separate from a remote image", () => {
    const adapterRuntime = resolveHarnessAdapterRuntimeArtifact(executor);
    expect(adapterRuntime.runtimeArtifact).toEqual(CODEX_V1_RUNTIME_ARTIFACT);
    expect(adapterRuntime.runtimeArtifactSha256).toBe(harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT));
  });

  it("resolves an executable worker-host artifact for every Factory harness option", () => {
    for (const manifest of KNOWN_HARNESS_MANIFESTS) {
      const adapterRuntime = resolveHarnessAdapterRuntimeArtifact({
        adapter: manifest.identity.adapterId,
        version: manifest.identity.adapterVersion,
      });
      expect(adapterRuntime.runtimeArtifact.kind).toBe("EXECUTABLE");
      expect(adapterRuntime.runtimeArtifact.executableSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(adapterRuntime.runtimeArtifact.imageDigest).toBeNull();
    }
  });
});
