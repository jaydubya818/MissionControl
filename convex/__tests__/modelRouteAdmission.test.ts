import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteSnapshot,
  modelRouteProductionEligible,
} from "../lib/modelRouteAdmission";

const routeSnapshot = exactModelRouteSnapshot({
  provider: "OpenAI",
  providerRoute: "OpenAI",
  modelId: "gpt-5.6-terra",
  capabilityIdentity: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: `sha256:${"1".repeat(64)}`,
    effectiveConfigSha256: "2".repeat(64),
  },
  runtimeIdentity: {
    kind: "CODEX_CLI",
    cliVersion: "0.146.0",
    executableSha256: "3".repeat(64),
  },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const qualificationSnapshot = {
  schema: MODEL_ROUTE_QUALIFICATION_SCHEMA,
  routeDigest,
  evidence: { reference: "docs/evidence.json", digest: `sha256:${"4".repeat(64)}` },
  scope: { workloadClasses: ["BUG_FIX"], riskClasses: ["GREEN"] },
  promotedBy: "operator-1",
  promotedAt: 1,
  authority: {
    executionOnly: true,
    routing: false,
    verification: false,
    acceptance: false,
    publication: false,
    merge: false,
  },
};
const qualificationDigest = `sha256:${computeCanonicalHash({
  namespace: MODEL_ROUTE_QUALIFICATION_SCHEMA,
  value: qualificationSnapshot,
})}`;

describe("exact model route admission", () => {
  it("normalizes and freezes the exact route identity", () => {
    expect(routeSnapshot.provider).toBe("openai");
    expect(routeSnapshot.providerRoute).toBe("openai");
    expect(exactModelRouteDigest(routeSnapshot)).toBe(routeDigest);
  });

  it("does not treat registration as qualification", () => {
    expect(modelRouteProductionEligible({
      routeSnapshot,
      routeDigest,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
    })).toBe(false);
  });

  it("admits only the exact human-promoted evidence binding", () => {
    const promoted = {
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot,
      qualificationDigest,
    };
    expect(modelRouteProductionEligible(promoted)).toBe(true);
    expect(modelRouteProductionEligible({ ...promoted, routeDigest: `sha256:${"0".repeat(64)}` })).toBe(false);
    expect(modelRouteProductionEligible({
      ...promoted,
      qualificationSnapshot: {
        ...qualificationSnapshot,
        authority: { ...qualificationSnapshot.authority, routing: true },
      },
    })).toBe(false);
  });
});
