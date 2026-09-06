import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReservation } from "../inferenceGateway";
import {
  compareRouteEconomics,
  inferencePriceBook,
  inferenceReservation,
  summarizeRouteEconomics,
} from "@mission-control/shared";

const schemaSource = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");
const gatewaySource = readFileSync(new URL("../inferenceGateway.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../serviceCommands.ts", import.meta.url), "utf8");

const sha = (letter: string) => `sha256:${letter.repeat(64)}`;

vi.mock("../lib/companyAccess", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/companyAccess")>(),
  requireWorkspacePermission: vi.fn(async () => ({ actorId: "operator", project: { tenantId: "tenant" } })),
}));

// Invoke the real mutation with an indexed in-memory database. This exercises
// admission behavior, not Convex's transaction scheduler or live provider usage.
function reservationFixture() {
  const now = Date.now();
  const route = {
    provider: "fixture", providerRoute: "fixture", modelId: "m", routeDigest: sha("b"),
    adapter: "fixture", adapterVersion: "1", endpoint: "https://example.invalid",
  };
  const priceBook = inferencePriceBook({
    priceBookId: "pb", version: 1, currency: "USD",
    source: { kind: "OPERATOR_APPROVED", reference: "offline qualification fixture", digest: sha("a") },
    effectiveFrom: now - 1_000,
    rates: [{ routeDigest: route.routeDigest, inputMicrousdPerMillionTokens: 1_000_000,
      outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 0,
      cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0 }],
  });
  const args = {
    projectId: "project", workOrderId: "order", taskId: "task", workflowRunId: "attempt",
    executionProfileId: "profile", executionProfileDigest: sha("c"),
    primaryRoute: route, allowedFallbacks: [], maxPhysicalCalls: 1,
    maxInputTokens: 1, maxOutputTokens: 1, maxCacheReadTokens: 1, maxCacheWriteTokens: 1,
    maxReasoningTokens: 1, maxCostMicrousd: 60, logicalRequestKey: "request-1",
    deadlineAt: now + 90_000, priceBookId: "price-book", policyDigest: sha("d"),
    leaseId: "lease", leaseExpiresAt: now + 60_000, registrationIdempotencyKey: "registration-1",
  };
  type Row = Record<string, unknown> & { _id: string };
  const rows: Row[] = [];
  const records = new Map<string, Row>([
    ["order", { _id: "order", projectId: "project", approvalStatus: "APPROVED", currentRevisionNumber: 1,
      metadata: { implementationPolicy: { maxCostUsd: 0.0001 } } }],
    ["task", { _id: "task", projectId: "project" }],
    ["attempt", { _id: "attempt", projectId: "project", parentTaskId: "task", workOrderId: "order",
      workOrderRevisionNumber: 1, status: "RUNNING", executionProfileId: "profile",
      executionProfileDigest: args.executionProfileDigest, executionManifestDigest: args.policyDigest,
      lease: { leaseId: args.leaseId, expiresAt: args.leaseExpiresAt } }],
    ["profile", { _id: "profile", projectId: "project", profileDigest: args.executionProfileDigest,
      enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationExpiresAt: now + 60_000 }],
    ["price-book", { _id: "price-book", projectId: "project", state: "ACTIVE",
      effectiveFrom: priceBook.effectiveFrom, immutableSnapshot: priceBook, priceBookDigest: priceBook.digest }],
  ]);
  const catalog: Row[] = [{ _id: "route", ...route, projectId: "project", enabled: true,
    qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" }];
  const db = {
    get: async (id: string) => records.get(id) ?? null,
    query: (table: string) => {
      const predicates: Array<[string, unknown]> = [];
      const selected = () => (table === "modelCatalog" ? catalog : rows)
        .filter(row => predicates.every(([key, value]) => row[key] === value));
      const index = { eq: (key: string, value: unknown) => { predicates.push([key, value]); return index; } };
      const query = {
        withIndex: (_name: string, filter: (q: typeof index) => unknown) => { filter(index); return query; },
        first: async () => selected()[0] ?? null,
        collect: async () => selected(),
      };
      return query;
    },
    insert: vi.fn(async (table: string, data: Record<string, unknown>) => {
      expect(table).toBe("inferenceReservations");
      const id = `reservation-${rows.length + 1}`;
      rows.push({ ...data, _id: id });
      return id;
    }),
  };
  type Handler = { _handler: (ctx: unknown, args: unknown) => Promise<unknown> };
  const reserve = (overrides: Partial<typeof args> = {}) =>
    (createReservation as unknown as Handler)._handler({ db }, { ...args, ...overrides });
  return { args, reserve, db, rows, records };
}

describe("WorkOrder inference allocation authority", () => {
  beforeEach(() => vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it("rejects duplicate parent allocation across logical requests and permits the exact remaining amount", async () => {
    const { reserve, rows } = reservationFixture();
    await reserve();
    const next = { logicalRequestKey: "request-2", registrationIdempotencyKey: "registration-2" };
    await expect(reserve(next)).rejects.toThrow("Aggregate inference reservations exceed");
    expect(rows).toHaveLength(1);
    await expect(reserve({ ...next, maxCostMicrousd: 40 })).resolves.toMatchObject({ created: true });
    expect(rows.reduce((total, row) => total + Number(row.maxCostMicrousd), 0)).toBe(100);
  });

  it("keeps the WorkOrder allocation across separate Attempts", async () => {
    const { reserve, records, rows } = reservationFixture();
    await reserve();
    records.set("attempt-2", { ...records.get("attempt")!, _id: "attempt-2" });
    await expect(reserve({ workflowRunId: "attempt-2", logicalRequestKey: "attempt-2:request-1",
      registrationIdempotencyKey: "attempt-2:registration-1" })).rejects.toThrow("Aggregate inference reservations exceed");
    expect(rows).toHaveLength(1);
  });

  it("returns exact replays without consuming the allocation twice and rejects changed bytes", async () => {
    const { reserve, db } = reservationFixture();
    const first = await reserve({ maxCostMicrousd: 100 });
    await expect(reserve({ maxCostMicrousd: 100 })).resolves.toEqual({ ...first as object, created: false });
    await expect(reserve({ maxCostMicrousd: 99 })).rejects.toThrow("different immutable bytes");
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it.each(["ACTIVE", "CANCELLED", "EXPIRED", "EXHAUSTED"])("does not release %s allocations without settlement proof", async state => {
    const { reserve, rows } = reservationFixture();
    rows.push({ _id: "prior", projectId: "project", workOrderId: "order", workflowRunId: "prior-attempt",
      maxCostMicrousd: 60, immutableSnapshot: { maxCostMicrousd: 60 }, state, deadlineAt: 1, leaseExpiresAt: 1 });
    await expect(reserve()).rejects.toThrow("Aggregate inference reservations exceed");
    expect(rows).toHaveLength(1);
  });

  it("isolates allocations belonging to another WorkOrder", async () => {
    const { reserve, rows } = reservationFixture();
    rows.push({ _id: "unrelated", projectId: "project", workOrderId: "other-order", maxCostMicrousd: 100 });
    await expect(reserve({ maxCostMicrousd: 100 })).resolves.toMatchObject({ created: true });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("fails closed on invalid existing allocation %s", async maxCostMicrousd => {
    const { reserve, rows, db } = reservationFixture();
    rows.push({ _id: "corrupt", projectId: "project", workOrderId: "order", maxCostMicrousd });
    await expect(reserve()).rejects.toThrow("Existing WorkOrder inference allocation is invalid");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("fails closed on a prior reservation with a substituted project", async () => {
    const { reserve, rows } = reservationFixture();
    rows.push({ _id: "wrong-project", projectId: "other-project", workOrderId: "order", maxCostMicrousd: 2 });
    await expect(reserve()).rejects.toThrow("Existing WorkOrder inference allocation is invalid");
  });

  it("does not overflow while adding individually valid allocations", async () => {
    const { reserve, rows } = reservationFixture();
    for (let i = 0; i < 2; i++) rows.push({ _id: `prior-${i}`, projectId: "project", workOrderId: "order",
      maxCostMicrousd: Number.MAX_SAFE_INTEGER, immutableSnapshot: { maxCostMicrousd: Number.MAX_SAFE_INTEGER } });
    await expect(reserve()).rejects.toThrow("Aggregate inference reservations exceed");
  });

  it.each([1, 61, undefined])("rejects a stored allocation that diverges from its immutable snapshot (%s)", async storedCost => {
    const { reserve, rows, db } = reservationFixture();
    await reserve();
    if (storedCost === undefined) delete rows[0].immutableSnapshot;
    else rows[0].maxCostMicrousd = storedCost;
    await expect(reserve({ logicalRequestKey: "request-2", registrationIdempotencyKey: "registration-2",
      maxCostMicrousd: 40 })).rejects.toThrow("Existing WorkOrder inference allocation is invalid");
    expect(db.insert).toHaveBeenCalledOnce();
  });
});

describe("governed inference schema contract", () => {
  it("lands the full append-only ledger and required identity indexes atomically", () => {
    for (const table of [
      "inferencePriceBooks", "inferenceReservations", "inferencePhysicalIntents",
      "inferencePhysicalReceipts", "inferenceReconciliations", "factoryOutcomeEvents",
      "factoryOutcomeProjections",
      "inferenceRouteComparisons",
    ]) expect(schemaSource).toContain(`${table}: defineTable`);
    for (const index of ["by_registration", "by_logical_request", "by_provider_request", "by_provider_event", "by_source"]) {
      expect(schemaSource).toContain(`.index("${index}"`);
    }
  });

  it("exposes signed service capabilities while keeping transport mutations internal", () => {
    for (const capability of [
      "inference.intents.persist", "inference.intents.claim", "inference.receipts.append",
      "inference.reconciliations.append",
    ]) expect(serviceSource).toContain(`"${capability}"`);
    for (const mutation of ["persistIntentInternal", "claimIntentInternal", "appendReceiptInternal", "appendReconciliationInternal"]) {
      expect(gatewaySource).toContain(`export const ${mutation} = internalMutation`);
    }
    expect(gatewaySource).toContain("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED");
    expect(gatewaySource).toContain("Inference receipt replay conflicts with immutable history.");
    expect(gatewaySource).toContain("Inference intent replay conflicts with immutable history.");
    expect(gatewaySource).toContain("reservation.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain("intent.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain("receipt.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain('workOrder.approvalStatus !== "APPROVED"');
    expect(gatewaySource).toContain("args.policyDigest !== run.executionManifestDigest");
    expect(gatewaySource).toContain("priceBook.effectiveUntil <= reservationCreatedAt");
  });

  it("retains unknown cost and autonomous-promotion denials in public projections", () => {
    expect(gatewaySource).toContain('maturity: "EXPERIMENTAL_OFFLINE_QUALIFIED"');
    expect(gatewaySource).toContain('"No autonomous route promotion"');
    expect(schemaSource).toContain('v.literal("UNKNOWN")');
    expect(schemaSource).toContain('v.literal("IN_PROGRESS")');
  });
});

describe("worst-case reservation and comparison controls", () => {
  it("denies a reservation whose full exposure exceeds its money ceiling", () => {
    const priceBook = inferencePriceBook({
      priceBookId: "pb", version: 1, currency: "USD",
      source: { kind: "OPERATOR_APPROVED", reference: "fixture", digest: sha("a") },
      effectiveFrom: 1,
      rates: [{
        routeDigest: sha("b"), inputMicrousdPerMillionTokens: 1_000_000,
        outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 0,
        cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0,
      }],
    });
    expect(() => inferenceReservation({
      reservationId: "r", projectId: "p", workOrderId: "w", taskId: "t", attemptId: "a",
      logicalRequestKey: "p:a:s:1",
      executionProfileId: "ep", executionProfileDigest: sha("c"),
      primaryRoute: { provider: "fixture", providerRoute: "fixture", modelId: "m", routeDigest: sha("b"), adapter: "fixture", adapterVersion: "1", endpoint: "https://example.invalid" },
      allowedFallbacks: [], maxPhysicalCalls: 1, maxInputTokens: 100, maxOutputTokens: 100,
      maxCacheReadTokens: 1, maxCacheWriteTokens: 1, maxReasoningTokens: 1,
      maxCostMicrousd: 1, currency: "USD", deadlineAt: 3, priceBookId: "pb",
      priceBookDigest: priceBook.digest, policyDigest: sha("d"), leaseId: "l", leaseExpiresAt: 2, createdAt: 1,
    }, priceBook)).toThrow(/Worst-case dispatch exposure/);
  });

  it("returns NO_GO when either route has unknown or missing evidence", () => {
    const absent = summarizeRouteEconomics([], { routeDigest: sha("a"), cohortDigest: sha("b"), minimumSampleSize: 1, now: 100, maxAgeMs: 100 });
    expect(compareRouteEconomics(absent, { ...absent, routeDigest: sha("c") })).toMatchObject({
      status: "NO_GO",
      blockers: expect.arrayContaining(["ROUTE_NOT_QUALIFIED_BY_ECONOMICS", "ACCEPTED_OUTCOME_COST_UNKNOWN"]),
    });
  });
});
