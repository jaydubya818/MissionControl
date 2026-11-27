import { describe, expect, it } from "vitest";
import { assertIsolatedRuntimeImageBinding, inspectIsolatedRuntimeImage, isolatedRuntimeImageEvidenceMatches } from "../isolatedRuntimeImage.js";

const binding = { manifestDigest: `sha256:${"a".repeat(64)}`, configDigest: `sha256:${"b".repeat(64)}`,
  sourceSha: "c".repeat(40), os: "linux" as const, architecture: "amd64" as const };
const inspection = (classic = false) => [{ Id: classic ? binding.configDigest : binding.manifestDigest,
  Os: binding.os, Architecture: binding.architecture, Config: { Labels: { "org.opencontainers.image.revision": binding.sourceSha } },
  ...(!classic ? { Descriptor: { digest: binding.manifestDigest, annotations: { "config.digest": binding.configDigest } } } : {}),
}];

describe("qualified OCI image identity", () => {
  it.each([false, true])("retains exact daemon-observed identity, classic=%s", classic => {
    const reference = classic ? binding.configDigest : binding.manifestDigest;
    const evidence = inspectIsolatedRuntimeImage(binding, reference, inspection(classic));
    expect(evidence.selectedReference).toBe(reference);
    expect(isolatedRuntimeImageEvidenceMatches(evidence, binding)).toBe(true);
    expect(isolatedRuntimeImageEvidenceMatches({ ...evidence, sourceSha: "d".repeat(40) }, binding)).toBe(false);
    expect(isolatedRuntimeImageEvidenceMatches({ ...evidence, extra: true }, binding)).toBe(false);
  });
  it.each(["Id", "Architecture", "Os", "source", "manifest", "config", "descriptor"])('rejects contradictory %s', field => {
    const rows = inspection();
    const row = rows[0] as any;
    if (field === "source") row.Config.Labels["org.opencontainers.image.revision"] = "d".repeat(40);
    else if (field === "manifest") row.Descriptor.digest = binding.configDigest;
    else if (field === "config") row.Descriptor.annotations["config.digest"] = binding.manifestDigest;
    else if (field === "descriptor") delete row.Descriptor;
    else row[field] = "other";
    expect(() => inspectIsolatedRuntimeImage(binding, binding.manifestDigest, rows)).toThrow("contradicts");
  });
  it("rejects tags, unbound alias mappings, multiple images and extended bindings", () => {
    expect(() => inspectIsolatedRuntimeImage(binding, "runtime:latest", inspection())).toThrow();
    expect(() => inspectIsolatedRuntimeImage(binding, binding.manifestDigest, [...inspection(), ...inspection()])).toThrow();
    expect(() => assertIsolatedRuntimeImageBinding(binding, binding.configDigest)).toThrow();
    expect(() => assertIsolatedRuntimeImageBinding({ ...binding, configDigest: binding.manifestDigest }, binding.manifestDigest)).toThrow();
    expect(() => assertIsolatedRuntimeImageBinding({ ...binding, extra: true } as any, binding.manifestDigest)).toThrow();
  });
});
