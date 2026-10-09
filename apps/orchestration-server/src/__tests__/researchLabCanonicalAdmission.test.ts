import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bedrockProfileFixture } from "./fixtures/bedrockProfileFixture.js";
import {
  dockerSandboxAdmission,
  dockerSandboxProductionEligible,
  dockerSandboxSnapshotIssues,
  DOCKER_ADMISSION_SCHEMA,
} from "../../../../convex/lib/dockerSandboxAdmission.js";
import {
  assertResearchLabDockerTarget,
  RESEARCH_LAB_PROJECT_ID,
  RESEARCH_LAB_TENANT_ID,
} from "../../../../convex/lib/researchLabDockerScope.js";
import { computeCanonicalHash } from "../../../../convex/lib/genomeHash.js";
import { sandboxProfileDigest } from "../sandboxProvider.js";
const now = Date.UTC(2026, 9, 9, 16);
const hash = (x: unknown) => `sha256:${computeCanonicalHash(x)}`;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3214");
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3215");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function candidate() {
  const snapshot = bedrockProfileFixture(undefined, undefined, true).profile;
  snapshot.dockerQualification.localScope = {
    schema: "research-lab-docker-scope/v1",
    projectId: RESEARCH_LAB_PROJECT_ID,
    tenantId: RESEARCH_LAB_TENANT_ID,
    environment: "LOCAL_RESEARCH_LAB",
    production: "DENIED",
    publication: "DENIED",
    reviewedAt: now,
    validUntil: now + 3600000,
  };
  return snapshot;
}
function admitted() {
  const immutableSnapshot = candidate(),
    profileDigest = sandboxProfileDigest(immutableSnapshot);
  const admissionSnapshot = dockerSandboxAdmission(
    immutableSnapshot,
    profileDigest,
    "OFFLINE_TEST_OPERATOR",
    now,
  );
  return {
    projectId: RESEARCH_LAB_PROJECT_ID,
    tenantId: RESEARCH_LAB_TENANT_ID,
    immutableSnapshot,
    profileDigest,
    admissionSnapshot,
    admissionState: "PRODUCTION_PILOT_ELIGIBLE",
    admissionDigest: hash({
      namespace: DOCKER_ADMISSION_SCHEMA,
      value: admissionSnapshot,
    }),
  };
}
it("admits the exact local variant without expanding routing or publication authority", () => {
  const p = admitted();
  expect(dockerSandboxSnapshotIssues(p.immutableSnapshot)).toEqual([]);
  expect(dockerSandboxProductionEligible(p)).toBe(true);
  expect(p.admissionSnapshot.authority.routing).toBe(false);
  expect(p.admissionSnapshot.authority.publication).toBe(false);
  expect(() =>
    assertResearchLabDockerTarget(p.immutableSnapshot, p),
  ).not.toThrow();
});
it.each(["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"])(
  "rejects shared deployment or missing %s on every read",
  (key) => {
    const p = admitted();
    vi.stubEnv(key, "https://shared.convex.cloud");
    expect(dockerSandboxProductionEligible(p)).toBe(false);
    expect(() =>
      dockerSandboxAdmission(
        p.immutableSnapshot,
        p.profileDigest,
        "operator",
        now,
      ),
    ).toThrow();
    expect(() =>
      assertResearchLabDockerTarget(p.immutableSnapshot, p),
    ).toThrow();
    vi.stubEnv(key, "");
    expect(dockerSandboxProductionEligible(p)).toBe(false);
  },
);
it.each(["projectId", "tenantId"] as const)("rejects copied %s", (key) => {
  const p = admitted();
  p[key] = "another";
  expect(dockerSandboxProductionEligible(p)).toBe(false);
  expect(() => assertResearchLabDockerTarget(p.immutableSnapshot, p)).toThrow();
});
it.each(["projectId", "tenantId", "environment", "production", "publication"])(
  "rejects altered scope %s",
  (key) => {
    const s = candidate();
    s.dockerQualification.localScope[key] = "wrong";
    expect(dockerSandboxSnapshotIssues(s).length).toBeGreaterThan(0);
  },
);
it("rejects expired evidence without mutating the historical admission", () => {
  const p = admitted();
  vi.setSystemTime(now + 3600000);
  expect(dockerSandboxProductionEligible(p)).toBe(false);
});
it.each([0, now, now + 86400001])("rejects invalid expiry %s", (expiry) => {
  const s = candidate();
  s.dockerQualification.localScope.validUntil = expiry;
  expect(dockerSandboxSnapshotIssues(s).length).toBeGreaterThan(0);
});
it("rejects image substitution and absent local scope", () => {
  const s = candidate();
  s.machine.image = "other@sha256:" + "a".repeat(64);
  expect(dockerSandboxSnapshotIssues(s).length).toBeGreaterThan(0);
  delete s.dockerQualification.localScope;
  expect(dockerSandboxSnapshotIssues(s).length).toBeGreaterThan(0);
});
it("preserves standard Docker admission outside local Research Lab", () => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://shared.convex.cloud");
  vi.stubEnv("CONVEX_SITE_URL", "https://shared.convex.site");
  expect(dockerSandboxSnapshotIssues(bedrockProfileFixture().profile)).toEqual(
    [],
  );
});
