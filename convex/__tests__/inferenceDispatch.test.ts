import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inferencePriceBook, canonicalDigest } from "@mission-control/shared";
import { claimIntentInternal, persistIntentInternal } from "../inferenceGateway";
import { reservationFixture } from "./helpers/inference.fixture";
import { classifyAuthorityRecords } from "./helpers/classifyAuthority.fixture";

vi.mock("../lib/companyAccess", () => ({
  FACTORY_PERMISSIONS: { MANAGE_AUTOMATION: "manage", APPROVE: "approve" },
  requireWorkspacePermission: async () => ({ project: { tenantId: "tenant" }, actorId: "operator" }),
}));
beforeEach(() => vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1"));
afterEach(() => vi.unstubAllEnvs());

async function fixture(scope: Pick<Parameters<typeof classifyAuthorityRecords>[0], "qualifiedRepositoryIds" | "workloadClasses" | "riskClasses"> = {}) {
  const f = reservationFixture();
  Object.assign(f.route, { provider: "openai", providerRoute: "openai-chat-completions",
    modelId: "gpt-4o-mini-2024-07-18", adapter: "mission-control-openai-chat-completions",
    adapterVersion: "1.0.0", endpoint: "https://api.openai.com/v1/chat/completions" });
  Object.assign(f.tableRows("modelCatalog")[0], f.route);
  const authority = classifyAuthorityRecords({ projectId: "project", repositoryId: "repo", profileId: "profile",
    modelCatalogId: "route-0", now: Date.now(), workOrderId: "order", taskId: "task", attemptId: "attempt", factoryVersionId: "version", ...scope });
  Object.assign(f.route, { routeDigest: authority.modelRoute.routeDigest });
  Object.assign(f.tableRows("modelCatalog")[0], authority.modelRoute);
  Object.assign(f.records.get("profile")!, authority.profile);
  const run: any = f.records.get("attempt");
  Object.assign(run, authority.runBindings);
  f.args.executionProfileDigest = authority.profile.profileDigest;
  f.args.policyDigest = authority.runBindings.executionManifestDigest;
  const wo: any = f.records.get("order");
  Object.assign(wo, { repositoryId: "repo", currentExecutionRunId: "attempt",
    metadata: { implementationPolicy: { maxCostUsd: 1 } } });
  Object.assign(run, { repositoryId: "repo", hostBindingId: "host", factoryDefinitionVersionId: "version" });
  Object.assign(run.lease, { workerId: "worker", workerSessionId: "session", workerGeneration: 1 });
  f.records.set("host", { _id: "host", projectId: "project", hostId: "worker",
    workerRuntime: { sessionId: "session", generation: 1 } });
  f.records.set("version", { _id: "version", projectId: "project", repositoryId: "repo",
    ...authority.versionBindings });
  const price = inferencePriceBook({ priceBookId: "pb", version: 1, currency: "USD",
    source: { kind: "OPERATOR_APPROVED", reference: "offline", digest: `sha256:${"a".repeat(64)}` },
    effectiveFrom: Date.now() - 1000, effectiveUntil: Date.now() + 60_000,
    rates: [{ routeDigest: f.route.routeDigest, inputMicrousdPerMillionTokens: 1_000_000,
      outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 1_000_000, serviceTier: "default" }] });
  Object.assign(f.records.get("price-book")!, { immutableSnapshot: price, priceBookDigest: price.digest,
    effectiveFrom: price.effectiveFrom, effectiveUntil: price.effectiveUntil });
  const reservation = await f.reserve({ maxInputTokens: 128_000, maxOutputTokens: 1024,
    maxCacheReadTokens: 128_000, maxCacheWriteTokens: 0, maxReasoningTokens: 0, maxCostMicrousd: 300_000 });
  const persisted = await f.invoke<{ intentId: string }>(persistIntentInternal, {
    workflowRunId: "attempt", reservationId: reservation.reservationId,
    logicalRequestKey: f.args.logicalRequestKey, physicalOrdinal: 1, route: f.route,
    requestDigest: `sha256:${"f".repeat(64)}`, intentKey: "canonical-intent" });
  const args = { workflowRunId: "attempt", intentId: persisted.intentId,
    leaseId: "lease", claimId: "dispatch-claim",
    dispatch: { contract: "classify-text/v1", payloadBytes: 200, maximumOutputTokens: 1024 } };
  return { ...f, run, wo, args, reservation,
    claim: () => f.invoke<any>(claimIntentInternal, args) };
}

describe("classification dispatch claim", () => {
  it.each([
    [{ qualifiedRepositoryIds: ["excluded"] }, "QUALIFICATION_SCOPE_MISMATCH"],
    [{ workloadClasses: ["VERIFICATION"] }, "EXECUTION_PROFILE_QUALIFICATION_MISMATCH"],
    [{ riskClasses: ["YELLOW"] }, "EXECUTION_PROFILE_QUALIFICATION_MISMATCH"],
  ] as const)("rejects current but out-of-scope qualification %j", async (scope, reason) => {
    const f = await fixture(JSON.parse(JSON.stringify(scope)));
    await expect(f.claim()).rejects.toThrow(reason);
    expect((await f.db.get(f.args.intentId))!.state).toBe("PERSISTED");
  });

  it("atomically persists a bounded allowance with the unique claim and exact identities", async () => {
    const f = await fixture();
    const result = await f.claim();
    expect(result.dispatchAllowance).toMatchObject({
      schema: "classify-inference-dispatch/v1", intentId: f.args.intentId,
      intentLogicalId: "canonical-intent", reservationId: f.reservation.reservationId,
      reservationDigest: f.reservation.reservationDigest, attemptId: "attempt", repositoryId: "repo",
      requestDigest: `sha256:${"f".repeat(64)}`, payloadBytes: 200,
      maximumInputTokens: 128_000, maximumCacheReadTokens: 128_000,
      maximumOutputTokens: 1024, maximumPhysicalCalls: 1, maxCostMicrousd: 300_000,
    });
    const intent: any = await f.db.get(f.args.intentId);
    expect(intent.dispatchAllowance).toEqual(result.dispatchAllowance);
    expect(result.dispatchAllowance.validUntil).toBeLessThanOrEqual(result.dispatchAllowance.issuedAt + 30_000);
    await expect(f.claim()).resolves.toMatchObject({ claimed: false });
  });

  it.each(["revision", "currentAttempt", "approval", "profile", "profileDigest", "route",
    "hostGeneration", "missingRegistration", "factoryBudget", "workOrderBudget", "priceRetired",
    "priceDigest", "priceExpiry", "unpricedCache", "inputBound", "outputBound", "cacheBound",
    "payload", "requestOutput", "policy", "repository", "aggregate", "disabled", "factoryConfiguration",
    "infiniteFactoryBudget", "infiniteWorkOrderBudget", "routeOutput", "routeTemperature", "qualification",
    "harnessProjection", "missingFactoryConfiguration"])("denies %s before claiming", async fault => {
    const f = await fixture();
    const reservation: any = f.rows[0];
    const price: any = f.records.get("price-book");
    switch (fault) {
      case "revision": f.wo.currentRevisionNumber = 2; break;
      case "currentAttempt": f.wo.currentExecutionRunId = "other"; break;
      case "approval": f.wo.approvalStatus = "PENDING"; break;
      case "profile": f.records.get("profile")!.enabled = false; break;
      case "profileDigest": f.run.executionProfileDigest = "other"; break;
      case "route": f.tableRows("modelCatalog")[0].modelId = "other"; break;
      case "hostGeneration": (f.records.get("host")!.workerRuntime as any).generation = 2; break;
      case "missingRegistration": delete f.run.lease.workerId; delete f.run.lease.workerSessionId; delete f.run.lease.workerGeneration; break;
      case "factoryBudget": (f.records.get("version")!.budget as any).maxCostUsd = 0.2; break;
      case "factoryConfiguration": f.run.factoryConfigurationDigest = "substituted"; break;
      case "missingFactoryConfiguration": delete f.run.factoryConfigurationDigest; break;
      case "qualification": f.run.executionProfileQualificationDigest = `sha256:${"a".repeat(64)}`; break;
      case "harnessProjection": f.run.executionManifest.harness.capabilityManifestSha256 = `sha256:${"a".repeat(64)}`; break;
      case "infiniteFactoryBudget": (f.records.get("version")!.budget as any).maxCostUsd = Infinity; break;
      case "infiniteWorkOrderBudget": f.wo.metadata.implementationPolicy.maxCostUsd = Infinity; break;
      case "routeOutput": f.args.dispatch.maximumOutputTokens = 512; break;
      case "routeTemperature": (f.args.dispatch as any).temperature = 0.5; break;
      case "workOrderBudget": f.wo.metadata.implementationPolicy.maxCostUsd = 0.2; break;
      case "priceRetired": price.state = "RETIRED"; break;
      case "priceDigest": price.immutableSnapshot.source.reference = "changed"; break;
      case "priceExpiry": price.effectiveUntil = 1; break;
      case "unpricedCache": {
        delete price.immutableSnapshot.rates[0].cacheReadMicrousdPerMillionTokens;
        const { digest: _digest, ...bytes } = price.immutableSnapshot;
        price.priceBookDigest = canonicalDigest("inference-price-book/v1", bytes);
        price.immutableSnapshot.digest = price.priceBookDigest;
        reservation.immutableSnapshot.priceBookDigest = price.priceBookDigest;
        break;
      }
      case "inputBound": reservation.immutableSnapshot.maxInputTokens = 127_999; break;
      case "outputBound": reservation.immutableSnapshot.maxOutputTokens = 1023; break;
      case "cacheBound": reservation.immutableSnapshot.maxCacheReadTokens = 0; break;
      case "payload": f.args.dispatch.payloadBytes = 256_001; break;
      case "requestOutput": f.args.dispatch.maximumOutputTokens = 1025; break;
      case "policy": f.run.executionManifestDigest = "other"; break;
      case "repository": f.run.repositoryId = "other"; break;
      case "aggregate": f.rows.push({ ...reservation, _id: "other-reservation", maxCostMicrousd: 800_000,
        immutableSnapshot: { ...reservation.immutableSnapshot, maxCostMicrousd: 800_000 } }); break;
      case "disabled": vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "0"); break;
    }
    // Re-sign deliberately altered valid reservations so ceiling tests cannot
    // pass merely because snapshot integrity failed first.
    if (["inputBound", "outputBound", "cacheBound", "unpricedCache"].includes(fault)) {
      const { digest: _digest, ...bytes } = reservation.immutableSnapshot;
      reservation.reservationDigest = canonicalDigest("inference-reservation/v1", bytes);
      reservation.immutableSnapshot.digest = reservation.reservationDigest;
    }
    if (fault === "aggregate") {
      const other: any = f.rows[1];
      const { digest: _digest, ...bytes } = other.immutableSnapshot;
      other.reservationDigest = canonicalDigest("inference-reservation/v1", bytes);
      other.immutableSnapshot.digest = other.reservationDigest;
    }
    const expectedError = fault === "unpricedCache" ? "unpriced token dimension"
      : fault === "aggregate" ? "Aggregate inference reservations exceed"
      : ["routeOutput", "routeTemperature"].includes(fault) ? "ROUTE_PARAMETERS_CHANGED" : undefined;
    await expect(f.claim()).rejects.toThrow(expectedError);
    expect((await f.db.get(f.args.intentId))!.state).toBe("PERSISTED");
    expect((await f.db.get(f.args.intentId))!.dispatchAllowance).toBeUndefined();
  });
});
