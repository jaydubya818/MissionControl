import { describe, expect, it } from "vitest";
import { bindEngineeringTariff, verifyEngineeringTariff } from "../enterpriseEngineeringTariff";
import {
  FACTORY_DELEGATION_BINDING_SCHEMA,
  assertFactoryDelegationBindingMatches,
  factoryDelegationBindingDigest,
  parseFactoryDelegationBinding,
} from "../factoryDelegationBinding";

const now = 1_800_000_000_000;
const hash = `sha256:${"a".repeat(64)}`;
const fixture = () => ({
  schema: FACTORY_DELEGATION_BINDING_SCHEMA,
  delegationId: "delegation-fixture",
  tenantId: "tenant-fixture",
  projectId: "project-fixture",
  missionId: "mission-fixture",
  missionSpecRevisionId: "spec-revision-fixture",
  missionPlanId: "plan-fixture",
  missionPlanRevision: 2,
  missionPlanDigest: hash,
  workOrderId: "enterprise-work-order",
  workOrderRevisionId: "work-order-revision",
  workOrderRevisionNumber: 3,
  taskId: "task-fixture",
  workflowRunId: "attempt-fixture",
  executionManifestDigest: hash,
  qualityContractDigest: hash,
  authorityGeneration: 4,
  factoryId: "factory-fixture",
  factoryVersion: "b".repeat(64),
  executionProtocol: "MYFACTORY_EXECUTION_V2",
  clientId: "client-fixture",
  ownerScope: "owner-fixture",
  partnerWorkId: "00000000-0000-4000-8000-000000000001",
  partnerWorkGeneration: 1,
  partnerRequestId: "00000000-0000-4000-8000-000000000002",
  partnerRequestDigest: "c".repeat(64),
  repositoryId: "repository-fixture",
  repository: "fixture/application",
  baseCommit: "d".repeat(40),
  baseTree: "e".repeat(40),
  sourceSnapshotDigest: hash,
  executionProfileDigest: hash,
  modelPolicyDigest: hash,
  verificationPolicyDigest: hash,
  allowedEffects: ["repository.read", "sandbox.write", "candidate.create", "verification.request"],
  budgetReservationId: "reservation-fixture",
  maxSpendMicrousd: 0,
  issuedAt: now - 100,
  expiresAt: now + 1_000,
  deadline: now + 2_000,
});

describe("immutable factory delegation binding", () => {
  it("commits the pre-approved engineering tariff into the exact signed delegation chain", () => {
    const original = parseFactoryDelegationBinding(fixture());
    const { binding, tariff } = bindEngineeringTariff(original, now);
    expect(binding.executionManifestDigest).not.toBe(original.executionManifestDigest);
    expect(factoryDelegationBindingDigest(binding)).not.toBe(factoryDelegationBindingDigest(original));
    expect(verifyEngineeringTariff(binding, tariff, now + 1)).toEqual(tariff);
    for (const patch of [{ ownerScope: "other" }, { executionProfileDigest: `sha256:${"f".repeat(64)}` },
      { workflowRunId: "other" }, { maxSpendMicrousd: 1 }, { factoryVersion: "f".repeat(64) },
      { executionManifestDigest: original.executionManifestDigest }]) {
      expect(() => verifyEngineeringTariff({ ...binding, ...patch }, tariff, now + 1)).toThrow();
    }
    for (const patch of [{ approvedBy: "other" }, { approvedAt: now + 2 }, { expiresAt: now + 3 },
      { digest: `sha256:${"f".repeat(64)}` }]) {
      expect(() => verifyEngineeringTariff(binding, { ...tariff, ...patch }, now + 1)).toThrow();
    }
    for (const time of [NaN, now - 1, now + 1000]) expect(() => verifyEngineeringTariff(binding, tariff, time)).toThrow();
    // Reconciliation uses original admission time even after authority expires.
    expect(verifyEngineeringTariff(binding, tariff, now + 1).basis).toBe("DETERMINISTIC_ENGINEERING_ZERO_CHARGE");
  });
  it("retains distinct enterprise and partner identities without admitting execution", () => {
    const binding = parseFactoryDelegationBinding(fixture());
    expect(binding.workOrderId).toBe("enterprise-work-order");
    expect(binding.partnerWorkId).toBe("00000000-0000-4000-8000-000000000001");
    expect(binding).not.toHaveProperty("authorized");
    expect(binding).not.toHaveProperty("status");
    expect(assertFactoryDelegationBindingMatches(binding, fixture(), now)).toBeUndefined();
  });

  it("copies and freezes the binding and effect list", () => {
    const input = fixture();
    const binding = parseFactoryDelegationBinding(input);
    input.allowedEffects.push("publication");
    expect(binding.allowedEffects).toHaveLength(4);
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.allowedEffects)).toBe(true);
  });

  it("gives exact duplicate delivery the same digest regardless of JSON key order", () => {
    const input = fixture();
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(factoryDelegationBindingDigest(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(factoryDelegationBindingDigest(reordered)).toBe(factoryDelegationBindingDigest(input));
    assertFactoryDelegationBindingMatches(reordered, input, now);
  });

  for (const field of Object.keys(fixture())) {
    it(`rejects a missing ${field}`, () => {
      const input: Record<string, unknown> = fixture();
      delete input[field];
      expect(() => parseFactoryDelegationBinding(input)).toThrow("Invalid factory delegation binding");
    });
  }

  for (const field of Object.keys(fixture()).filter(key => !["schema", "executionProtocol"].includes(key))) {
    it(`detects substitution of ${field} without disclosing the mismatched identity`, () => {
      const original = fixture();
      const input: Record<string, unknown> = fixture();
      const value = input[field];
      input[field] = Array.isArray(value) ? value.slice(0, 1)
        : typeof value === "number" ? value + 1
        : field === "partnerWorkId" || field === "partnerRequestId" ? "00000000-0000-4000-8000-000000000009"
        : field === "repository" ? "fixture/other"
        : field === "baseCommit" || field === "baseTree" ? "f".repeat(40)
        : field === "factoryVersion" || field === "partnerRequestDigest" ? "f".repeat(64)
        : typeof value === "string" && value.startsWith("sha256:") ? `sha256:${"f".repeat(64)}`
        : "another-identity";
      expect(() => assertFactoryDelegationBindingMatches(input, original, now))
        .toThrow("Factory delegation binding unavailable or mismatched");
    });
  }

  it.each([
    null, [], "binding", {},
    { ...fixture(), schema: "factory-delegation-binding/v2" },
    { ...fixture(), executionProtocol: "UNSUPPORTED" },
    { ...fixture(), authorized: true },
    { ...fixture(), factoryVersion: "factory-v1-deadbeef" },
    { ...fixture(), sourceSnapshotDigest: "branch:main" },
    { ...fixture(), partnerWorkId: "convex-work-order-id" },
    { ...fixture(), allowedEffects: ["publication"] },
    { ...fixture(), allowedEffects: ["deployment"] },
    { ...fixture(), allowedEffects: ["repository.read", "repository.read"] },
    { ...fixture(), allowedEffects: new Array(1) },
    { ...fixture(), allowedEffects: [] },
    { ...fixture(), maxSpendMicrousd: -1 },
    { ...fixture(), maxSpendMicrousd: 0.5 },
    { ...fixture(), maxSpendMicrousd: Number.MAX_SAFE_INTEGER + 1 },
    { ...fixture(), maxSpendMicrousd: NaN },
    { ...fixture(), maxSpendMicrousd: Infinity },
    { ...fixture(), authorityGeneration: 0 },
    { ...fixture(), missionPlanRevision: "2" },
    { ...fixture(), deadline: now - 1_000 },
    { ...fixture(), issuedAt: now + 1_000 },
    { ...fixture(), expiresAt: now + 3_000 },
    { ...fixture(), ownerScope: "private\nowner" },
    { ...fixture(), ownerScope: "x".repeat(201) },
    { ...fixture(), repository: "../application" },
    Object.assign(Object.create({ inherited: true }), fixture()),
  ])("fails closed on malformed or expanded input %#", input => {
    expect(() => parseFactoryDelegationBinding(input)).toThrow("Invalid factory delegation binding");
  });

  it.each([now + 1_000, now + 2_000, now - 101, NaN, Infinity])("denies an expired, future or invalid clock at %s", clock => {
    expect(() => assertFactoryDelegationBindingMatches(fixture(), fixture(), clock))
      .toThrow("Factory delegation binding unavailable or mismatched");
  });

  it("does not normalize legacy or malformed expected records into current authority", () => {
    expect(() => assertFactoryDelegationBindingMatches(fixture(), {}, now))
      .toThrow("Factory delegation binding unavailable or mismatched");
  });
});
