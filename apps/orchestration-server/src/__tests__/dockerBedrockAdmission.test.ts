import { describe, it, expect } from "vitest";
import { computeCanonicalHash } from "../../../../convex/lib/genomeHash.js";
import {
  dockerSandboxAdmission,
  DOCKER_ADMISSION_SCHEMA,
  dockerSandboxSnapshotIssues,
} from "../../../../convex/lib/dockerSandboxAdmission.js";
import { sandboxProfileProductionEligible } from "../../../../convex/lib/sandboxProfileAdmission.js";
import { sandboxProfileDigest } from "../sandboxProvider.js";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
const hash = (x: unknown) => `sha256:${computeCanonicalHash(x)}`;
function fixture() {
  const immutableSnapshot = bedrockProfileFixture().profile,
    profileDigest = sandboxProfileDigest(immutableSnapshot);
  const admissionSnapshot = dockerSandboxAdmission(
    immutableSnapshot,
    profileDigest,
    "OFFLINE_FIXTURE",
    1,
  );
  return {
    immutableSnapshot,
    profileDigest,
    admissionState: "PRODUCTION_PILOT_ELIGIBLE",
    admissionSnapshot,
    admissionDigest: hash({
      namespace: DOCKER_ADMISSION_SCHEMA,
      value: admissionSnapshot,
    }),
  };
}
describe("separate Docker admission evidence (pure fixture; no issuance)", () => {
  it("derives provider-specific admission without VM security or routing authority", () => {
    const f = fixture();
    expect(dockerSandboxSnapshotIssues(f.immutableSnapshot)).toEqual([]);
    expect(sandboxProfileProductionEligible(f)).toBe(true);
    expect(f.admissionSnapshot.authority.routing).toBe(false);
    expect(f.immutableSnapshot.security).toBeUndefined();
  });
  it.each([
    "imageDigest",
    "toolchainDigest",
    "evidencePacketDigest",
    "bridgeProtocol",
    "harness",
  ])("denies substituted %s", (key) => {
    const f = fixture();
    f.immutableSnapshot.dockerQualification[key] = "wrong";
    expect(sandboxProfileProductionEligible(f)).toBe(false);
  });
  it("requires separate promotion and exact admission digest", () => {
    const f = fixture();
    f.admissionState = "QUALIFICATION_ONLY";
    expect(sandboxProfileProductionEligible(f)).toBe(false);
    f.admissionState = "PRODUCTION_PILOT_ELIGIBLE";
    f.admissionDigest = hash("different");
    expect(sandboxProfileProductionEligible(f)).toBe(false);
  });
  it("rejects transplanted VM qualification and credential access", () => {
    const f = fixture();
    f.immutableSnapshot.security = {};
    expect(sandboxProfileProductionEligible(f)).toBe(false);
    delete f.immutableSnapshot.security;
    f.immutableSnapshot.credentials.inference = "ATTEMPT_SCOPED_OPENROUTER";
    expect(sandboxProfileProductionEligible(f)).toBe(false);
  });
});
