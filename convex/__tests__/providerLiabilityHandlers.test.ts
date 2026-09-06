import { afterEach, expect, it, vi } from "vitest";
import {
  registerPriceVersion,
  createReservation,
  getReservation,
  reconcileUsage,
  reserveRequestInternal,
  recordUsageInternal,
} from "../factory/providerLiability";
import { createReservation as createCanonicalReservation } from "../inferenceGateway";
import { inferencePriceBook } from "@mission-control/shared";
import { liabilityDigest } from "../lib/providerLiability";
// Profile cryptographic/admission behavior has its own suite. Here vary its
// eligibility while exercising the actual liability handlers and worker fencing.
vi.mock("../lib/executionProfileAdmission", () => ({
  loadExecutionProfileAdmission: async (ctx: any) => ({
    eligible: ctx.profileEligible,
    profile: ctx.bridgeProfile }),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const hash = "sha256:" + "a".repeat(64);
function fixture() {
  const now = Date.now();
  const price = {
    schema: "factory-provider-price/v1",
    provider: "fixture",
    model: "fixture",
    api: "RESPONSES",
    currency: "USD",
    effectiveAt: now - 1000,
    expiresAt: now + 60000,
    source: "https://example.test/fixture",
    evidenceDigest: hash,
    inputNanoUsdPerToken: 1,
    outputNanoUsdPerToken: 2,
    maximumInputTokens: 10,
    maximumOutputTokens: 10,
    maximumPayloadBytes: 100,
    inputBound: "CONSERVATIVELY_BOUNDED",
    outputIncludesReasoning: true,
    inclusiveCacheWorstCase: true,
    otherBillableDimensions: "NONE",
  };
  const scope = {
    projectId: "project",
    repositoryId: "repo",
    workOrderId: "wo",
    workOrderRevision: 1,
    executionProfileId: "profile",
    executionProfileDigest: hash,
    modelRouteDigest: hash,
    priceDigest: liabilityDigest(price),
  };
  const rows: any = {
    reservation: {
      _id: "reservation",
      projectId: "project",
      workOrderId: "wo",
      executionProfileId: "profile",
      priceId: "price",
      snapshot: {
        schema: "factory-provider-reservation/v1",
        scope,
        maximumNanoUsd: 30,
        expiresAt: now + 60000,
        maximumRequests: 2,
        frozen: false,
        holds: [],
      },
    },
    run: {
      _id: "run",
      projectId: "project",
      workOrderId: "wo",
      workOrderRevisionNumber: 1,
      repositoryId: "repo",
      status: "RUNNING",
      executionProfileId: "profile",
      executionProfileDigest: hash,
      hostBindingId: "host",
      factoryDefinitionVersionId: "version",
      lease: {
        leaseId: "lease",
        workerId: "worker",
        workerSessionId: "session",
        workerGeneration: 1,
        expiresAt: now + 60000,
      },
    },
    wo: { _id: "wo", currentExecutionRunId: "run", currentRevisionNumber: 1 },
    host: {
      hostId: "worker",
      workerRuntime: { sessionId: "session", generation: 1 },
    },
    version: { budget: { maxCostUsd: 1 } },
    price: {
      _id: "price",
      projectId: "project",
      snapshot: price,
      digest: liabilityDigest(price),
    },
    project: { _id: "project", tenantId: "tenant" },
    tenant: { _id: "tenant", active: true },
  };
  rows.reservation.creationDigest = liabilityDigest(rows.reservation.snapshot);
  const ctx: any = {
    profileEligible: true,
    auth: { getUserIdentity: async () => null },
    db: {
      get: async (id: string) => rows[id] ?? null,
      patch: vi.fn(async (id: string, p: any) => Object.assign(rows[id], p)),
      insert: vi.fn(async () => "event"),
      query: () => ({
        withIndex: () => ({
          first: async () => null,
          collect: async () => [],
          unique: async () => null,
        }),
        collect: async () => [],
      }),
    },
  };
  const args: any = {
    reservationId: "reservation",
    workflowRunId: "run",
    leaseId: "lease",
    generation: 1,
    requestId: "request",
    requestDigest: hash,
    payloadBytes: 10,
    outputTokens: 10,
  };
  return { ctx, rows, args, price };
}
const handler = (fn: unknown) =>
  (fn as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
it.each(["expiry", "replacement", "revokedProfile", "cancelled", "completed", "worker", "retiredPrice"])("settles original admitted usage after %s without granting new spending", async fault => {
  const { ctx, rows, args } = fixture();
  await handler(reserveRequestInternal)(ctx, args);
  if (fault === "expiry") rows.run.lease.expiresAt = 1;
  if (fault === "replacement") { rows.wo.currentExecutionRunId = "replacement"; rows.wo.currentRevisionNumber = 2; }
  if (fault === "revokedProfile") ctx.profileEligible = false;
  if (fault === "cancelled") rows.run.cancellationRequestedAt = 1;
  if (fault === "completed") rows.run.status = "COMPLETED";
  if (fault === "worker") rows.host.workerRuntime.generation = 2;
  if (fault === "retiredPrice") { vi.useFakeTimers(); vi.setSystemTime(Date.now() + 120_000); }
  const usage = { requestId: args.requestId, requestDigest: args.requestDigest, provider: "fixture", model: "fixture",
    providerRequestId: "provider-request", usageId: "usage", inputTokens: 5, outputTokens: 1, classification: "ACTUAL", expectedReceiptRevision: 0 };
  await expect(handler(recordUsageInternal)(ctx, { ...args, usage })).resolves.toMatchObject({ duplicate: false });
  await expect(handler(recordUsageInternal)(ctx, { ...args, usage })).resolves.toMatchObject({ duplicate: true });
  expect(rows.reservation.snapshot.holds[0]).toMatchObject({ state: "SETTLED", accountedNanoUsd: 7, costClassification: "ESTIMATED" });
  await expect(handler(reserveRequestInternal)(ctx, { ...args, requestId: "new" })).rejects.toThrow();
});

it.each(["Attempt", "lease", "generation", "request", "profile", "repository", "scope", "priceBytes", "priceDigest"])("rejects substituted historical %s settlement binding", async fault => {
  const { ctx, rows, args } = fixture();
  await handler(reserveRequestInternal)(ctx, args);
  rows.run.status = "COMPLETED";
  const usage = { requestId: args.requestId, requestDigest: args.requestDigest, provider: "fixture", model: "fixture",
    providerRequestId: "provider-request", usageId: "usage", inputTokens: 5, outputTokens: 1, classification: "ACTUAL", expectedReceiptRevision: 0 };
  if (fault === "Attempt") { rows.other = { ...rows.run, _id: "other" }; args.workflowRunId = "other"; }
  if (fault === "lease") args.leaseId = "wrong";
  if (fault === "generation") args.generation = 2;
  if (fault === "request") usage.requestDigest = "sha256:" + "b".repeat(64);
  if (fault === "profile") rows.run.executionProfileDigest = "sha256:" + "b".repeat(64);
  if (fault === "repository") rows.run.repositoryId = "other";
  if (fault === "scope") rows.reservation.snapshot.maximumNanoUsd++;
  if (fault === "priceBytes") rows.price.snapshot.inputNanoUsdPerToken++;
  if (fault === "priceDigest") rows.price.digest = "sha256:" + "b".repeat(64);
  await expect(handler(recordUsageInternal)(ctx, { ...args, usage })).rejects.toThrow(/Historical usage|Usage Attempt/);
  expect(rows.reservation.snapshot.holds[0].state).toBe("RESERVED");
});

it("records one hold through the actual mutation and rejects a second full-balance request", async () => {
  const { ctx, rows, args } = fixture();
  await handler(reserveRequestInternal)(ctx, args);
  expect(rows.reservation.snapshot.holds).toHaveLength(1);
  await expect(
    handler(reserveRequestInternal)(ctx, { ...args, requestId: "second" }),
  ).rejects.toThrow("LIABILITY_EXHAUSTED");
});
it.each([
  "staleRun",
  "staleRevision",
  "cancel",
  "expiredLease",
  "lease",
  "generation",
  "hostSession",
  "hostGeneration",
  "profile",
  "profileDigest",
  "scope",
  "budget",
] as const)("fences %s at the mutation boundary", async (fault) => {
  const { ctx, rows, args } = fixture();
  switch (fault) {
    case "staleRun":
      rows.wo.currentExecutionRunId = "other";
      break;
    case "staleRevision":
      rows.wo.currentRevisionNumber = 2;
      break;
    case "cancel":
      rows.run.cancellationRequestedAt = 1;
      break;
    case "expiredLease":
      rows.run.lease.expiresAt = 1;
      break;
    case "lease":
      args.leaseId = "other";
      break;
    case "generation":
      args.generation = 2;
      break;
    case "hostSession":
      rows.host.workerRuntime.sessionId = "other";
      break;
    case "hostGeneration":
      rows.host.workerRuntime.generation = 2;
      break;
    case "profile":
      ctx.profileEligible = false;
      break;
    case "profileDigest":
      rows.run.executionProfileDigest = "other";
      break;
    case "scope":
      rows.run.repositoryId = "other";
      break;
    case "budget":
      rows.version.budget.maxCostUsd = 0;
      break;
  }
  await expect(handler(reserveRequestInternal)(ctx, args)).rejects.toThrow();
  expect(ctx.db.patch).not.toHaveBeenCalled();
});
it("denies another Attempt settling an existing hold", async () => {
  const { ctx, rows, args } = fixture();
  await handler(reserveRequestInternal)(ctx, args);
  rows.reservation.snapshot.holds[0].attemptId = "other";
  await expect(
    handler(recordUsageInternal)(ctx, {
      ...args,
      usage: { requestId: "request" },
    }),
  ).rejects.toThrow("Usage Attempt mismatch");
  expect(ctx.db.insert).not.toHaveBeenCalled();
});
it.each([
  registerPriceVersion,
  createReservation,
  getReservation,
  reconcileUsage,
])("denies anonymous public monetary authority", async (api) => {
  vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "0");
  const { ctx, args, price } = fixture();
  await expect(
    handler(api)(ctx, {
      ...args,
      projectId: "project",
      price,
      registrationKey: "key",
    }),
  ).rejects.toThrow();
  expect(ctx.db.patch).not.toHaveBeenCalled();
  expect(ctx.db.insert).not.toHaveBeenCalled();
});
 function bedrockHandlerFixture() {
  const f = fixture();
  f.price.api = "CONVERSE";
  f.price.provider = "aws-bedrock";
  f.price.model = "anthropic.claude-sonnet-4-6";
  f.rows.price.digest = liabilityDigest(f.price);
  f.rows.reservation.snapshot.scope.priceDigest = f.rows.price.digest;
  f.ctx.bridgeProfile = {
    immutableSnapshot: {
      harness: {
        adapter: "codex",
        version: "bedrock-v1",
        capabilityManifestDigest: hash,
      },
      runtimeArtifact: { digest: hash },
      executionBackend: "remote-sandbox",
      sandboxProfile: { profileSnapshot: { provider: "DOCKER" } },
      modelRoute: {
        routeSnapshot: { provider: "aws-bedrock", modelId: f.price.model },
      },
    },
  };
  f.args.bridgeIdentity = {
    schema: "factory-bedrock-inference/v1",
    workOrderId: "wo",
    workOrderRevision: 1,
    executionProfileId: "profile",
    executionProfileDigest: hash,
    harnessDigest: hash,
    runtimeDigest: hash,
    backend: "remote-sandbox",
    modelRouteDigest: hash,
    priceDigest: f.rows.price.digest,
    provider: "aws-bedrock",
    model: f.price.model,
    retryGeneration: 0,
  };
  vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1");
  Object.assign(f.rows.wo, { projectId: "project", tenantId: "tenant", approvalStatus: "APPROVED", metadata: { implementationPolicy: { maxCostUsd: 1 } } });
  Object.assign(f.rows.run, { parentTaskId: "task", executionManifestDigest: hash });
  f.rows.task = { _id: "task", projectId: "project" };
  f.rows.profile = { _id: "profile", projectId: "project", profileDigest: hash, modelRouteDigest: hash, modelCatalogId: "route", qualificationExpiresAt: Date.now() + 60000, immutableSnapshot: f.ctx.bridgeProfile.immutableSnapshot };
  f.rows.route = { _id: "route", projectId: "project", provider: f.price.provider, modelId: f.price.model, providerRoute: "fixture-approved-us-bedrock", routeDigest: hash, enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" };
  const book = inferencePriceBook({ priceBookId: "book", version: 1, currency: "USD", source: { kind: "OPERATOR_APPROVED", reference: f.price.source, digest: f.price.evidenceDigest }, effectiveFrom: f.price.effectiveAt, effectiveUntil: f.price.expiresAt, rates: [{ routeDigest: hash, inputMicrousdPerMillionTokens: 1000, outputMicrousdPerMillionTokens: 2000 }] });
  f.rows.book = { _id: "book", _table: "inferencePriceBooks", projectId: "project", ...book, sourceKind: book.source.kind, sourceReference: book.source.reference, sourceDigest: book.source.digest, immutableSnapshot: book, priceBookDigest: book.digest, state: "ACTIVE" };
  let sequence = 0;
  f.ctx.db.insert = vi.fn(async (table: string, value: any) => { const id = `${table}-${++sequence}`; f.rows[id] = { _id: id, _table: table, ...value }; return id; });
  f.ctx.db.query = (table: string) => {
    const matches: [string, any][] = [];
    const values = () => Object.values(f.rows).filter((row: any) => row._table === table && matches.every(([field, value]) => field.split(".").reduce((current: any, key) => current?.[key], row) === value));
    const query = { withIndex: (_: string, builder: any) => { const index = { eq: (field: string, value: any) => { matches.push([field, value]); return index; } }; builder(index); return query; }, first: async () => values()[0] ?? null, unique: async () => values()[0] ?? null, collect: async () => values() };
    return query;
  };
  f.rows.reservation.creationDigest = liabilityDigest(f.rows.reservation.snapshot);
  return f;
}
it("binds Bedrock request admission evidence through actual handler", async () => {
  const f = bedrockHandlerFixture();
  const r = await handler(reserveRequestInternal)(f.ctx, f.args);
  expect(r).toMatchObject({
    requestId: f.args.requestId,
    requestDigest: f.args.requestDigest,
    bridgeIdentityDigest: liabilityDigest(f.args.bridgeIdentity),
  });
  expect(r.validUntil).toBeGreaterThan(r.admittedAt);
});
it.each([
  "workOrderId",
  "workOrderRevision",
  "executionProfileId",
  "executionProfileDigest",
  "harnessDigest",
  "runtimeDigest",
  "backend",
  "modelRouteDigest",
  "priceDigest",
  "provider",
  "model",
  "retryGeneration",
])("rejects exact Bedrock %s substitution in actual handler", async (field) => {
  const f = bedrockHandlerFixture();
  f.args.bridgeIdentity[field] =
    typeof f.args.bridgeIdentity[field] === "number" ? 99 : "substituted";
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow(
    "BEDROCK_BRIDGE_IDENTITY_MISMATCH",
  );
  expect(f.ctx.db.patch).not.toHaveBeenCalled();
});
it("requires bridge binding for Bedrock even when omitted by caller", async () => {
  const f = bedrockHandlerFixture();
  delete f.args.bridgeIdentity;
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow(
    "BEDROCK_BRIDGE_IDENTITY_MISMATCH",
  );
});
it("rejects old Codex harness despite valid-looking supplied digest", async () => {
  const f = bedrockHandlerFixture();
  f.ctx.bridgeProfile.immutableSnapshot.harness.version = "v1";
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow(
    "BEDROCK_BRIDGE_IDENTITY_MISMATCH",
  );
});
it("fences a second Bedrock request while first outcome is unresolved", async () => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await expect(
    handler(reserveRequestInternal)(f.ctx, { ...f.args, requestId: "next" }),
  ).rejects.toThrow("BEDROCK_PRIOR_REQUEST_UNRESOLVED");
});

it("rejects a price for another Bedrock API", async () => {
  const f = bedrockHandlerFixture();
  f.price.api = "INVOKE_MODEL";
  f.rows.price.digest = liabilityDigest(f.price);
  f.rows.reservation.snapshot.scope.priceDigest = f.rows.price.digest;
  f.args.bridgeIdentity.priceDigest = f.rows.price.digest;
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow(
    "BEDROCK_PRICE_API_MISMATCH",
  );
});

it.each(["by_provider_usage", "by_provider_request"])(
  "rejects cross-reservation receipt replay through %s index",
  async (index) => {
    const f = fixture();
    await handler(reserveRequestInternal)(f.ctx, f.args);
    f.ctx.db.query = () => ({
      withIndex: (name: string) => ({
        first: async () =>
          name === index
            ? {
                reservationId: "another",
                usage: { requestId: "other", requestDigest: hash },
              }
            : null,
      }),
    });
    await expect(
      handler(recordUsageInternal)(f.ctx, {
        reservationId: "reservation",
        workflowRunId: "run",
        leaseId: "lease",
        generation: 1,
        usage: {
          requestId: "request",
          requestDigest: hash,
          provider: f.price.provider,
          model: f.price.model,
          providerRequestId: "provider-receipt",
          usageId: "usage-receipt",
          inputTokens: 1,
          outputTokens: 1,
          classification: "ACTUAL",
          expectedReceiptRevision: 0,
        },
      }),
    ).rejects.toThrow("PROVIDER_RECEIPT_ALREADY_OWNED");
    expect(f.rows.reservation.snapshot.holds[0].state).toBe("RESERVED");
  },
);

const accountingRows = (f: ReturnType<typeof bedrockHandlerFixture>, table: string): any[] => Object.values(f.rows).filter((row: any) => row._table === table);
const bedrockUsage = (f: ReturnType<typeof bedrockHandlerFixture>, classification = "ACTUAL") => ({ requestId: f.args.requestId, requestDigest: hash, provider: f.price.provider, model: f.price.model, providerRequestId: classification === "ACTUAL" ? "provider-request-1" : "", usageId: classification === "ACTUAL" ? "usage-1" : "", inputTokens: classification === "ACTUAL" ? 1 : 0, outputTokens: classification === "ACTUAL" ? 1 : 0, classification, expectedReceiptRevision: 0 });
it.each(["provider", "model"])("retains corrected %s drift as UNKNOWN money and preserves the original receipt", async field => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f, "UNKNOWN") });
  const original = structuredClone(accountingRows(f, "inferencePhysicalReceipts")[0]);
  await handler(reconcileUsage)(f.ctx, { reservationId: "reservation", evidenceReference: "fixture://correction",
    usage: { ...bedrockUsage(f), expectedReceiptRevision: 1, [field]: "different" } });
  const [event] = accountingRows(f, "inferenceReconciliations");
  expect(event.observedCostMicrousd).toBeUndefined(); expect(event.completeness).toBe("UNKNOWN");
  expect(event.observedUsage).toEqual({ inputTokens: 1, outputTokens: 1 });
  expect(accountingRows(f, "inferencePhysicalReceipts")[0]).toEqual(original);
  expect(f.rows.reservation.snapshot.frozen).toBe(true);
  expect(f.rows.wo.inferenceSpendingFence).toBeDefined();
});
it("atomically composes a canonical reservation and claimed physical intent before Bedrock reserve proof", async () => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  const [reservation] = accountingRows(f, "inferenceReservations");
  const [intent] = accountingRows(f, "inferencePhysicalIntents");
  expect(reservation.immutableSnapshot.reservationId).toBe(reservation._id);
  expect(reservation.workflowRunId).toBe("run");
  expect(reservation.allowedFallbacks).toEqual([]);
  expect(reservation.maxPhysicalCalls).toBe(1);
  expect(reservation.maxReasoningTokens).toBe(0);
  expect(reservation.maxCostMicrousd).toBe(2); // each dimension rounds upward; nano cap remains 30
  expect(intent.state).toBe("CLAIMED");
  expect(intent.requestDigest).toBe(hash);
  expect(intent.reservationId).toBe(reservation._id);
});
it.each(["disabled", "price", "provenance", "inactive", "route", "approval", "task", "budget", "parallelBudget"])("denies composed Bedrock accounting for %s before any write", async fault => {
  const f = bedrockHandlerFixture();
  if (fault === "disabled") vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "0");
  if (fault === "price") f.rows.book.rates[0].inputMicrousdPerMillionTokens++;
  if (fault === "provenance") f.rows.book.sourceDigest = "sha256:" + "b".repeat(64);
  if (fault === "inactive") f.rows.book.state = "RETIRED";
  if (fault === "route") f.rows.route.routeDigest = "sha256:" + "b".repeat(64);
  if (fault === "approval") f.rows.wo.approvalStatus = "PENDING";
  if (fault === "task") delete f.rows.task;
  if (fault === "budget") delete f.rows.wo.metadata;
  if (fault === "parallelBudget") f.rows.other = { _table: "inferenceReservations", workOrderId: "wo", logicalRequestKey: "unrelated" };
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow();
  expect(f.ctx.db.insert).not.toHaveBeenCalled();
  expect(f.ctx.db.patch).not.toHaveBeenCalled();
});
it("settles both aggregate exposure and canonical physical receipt without claiming unknown dimensions", async () => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f) });
  const [receipt] = accountingRows(f, "inferencePhysicalReceipts");
  expect(receipt.providerRequestId).toBe("provider-request-1");
  expect(receipt.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
  expect(receipt.costCompleteness).toBe("PARTIAL");
  expect(f.rows.reservation.snapshot.holds[0].state).toBe("SETTLED");
  expect(accountingRows(f, "inferencePhysicalIntents")[0].state).toBe("RECEIPTED");
});
it("retains unknown liability and appends an unknown canonical receipt with no invented zero usage", async () => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f, "UNKNOWN") });
  const [receipt] = accountingRows(f, "inferencePhysicalReceipts");
  expect(receipt.delivery).toBe("UNKNOWN");
  expect(receipt.usage).toEqual({});
  expect(receipt.costMicrousd).toBeUndefined();
  expect(f.rows.reservation.snapshot.holds[0]).toMatchObject({ state: "UNKNOWN", maximumNanoUsd: 30 });
  await expect(handler(reserveRequestInternal)(f.ctx, { ...f.args, requestId: "retry" })).rejects.toThrow("BEDROCK_PRIOR_REQUEST_UNRESOLVED");
});
it("clamps the returned send proof to the governed price-book expiry", async () => {
  const f = bedrockHandlerFixture();
  const expires = Date.now() + 2000;
  f.rows.book.effectiveUntil = expires;
  const { schema: _schema, digest: _digest, ...input } = f.rows.book.immutableSnapshot;
  const book = inferencePriceBook({ ...input, effectiveUntil: expires });
  f.rows.book.immutableSnapshot = book;
  f.rows.book.priceBookDigest = book.digest;
  const proof = await handler(reserveRequestInternal)(f.ctx, f.args);
  expect(proof.validUntil).toBe(expires);
});
it("rejects an aggregate above the WorkOrder ceiling even when this physical call fits", async () => {
  const f = bedrockHandlerFixture();
  f.rows.reservation.snapshot.maximumNanoUsd = 2_000_000_000;
  // Factory permits 10 USD; WorkOrder permits 1 USD; this physical call costs only 30 nano-USD.
  f.rows.version.budget.maxCostUsd = 10;
  await expect(handler(reserveRequestInternal)(f.ctx, f.args)).rejects.toThrow("BEDROCK_ACCOUNTING_WORKORDER_BUDGET_MISSING");
  expect(f.ctx.db.insert).not.toHaveBeenCalled();
});
function allowFixtureOperator(f: ReturnType<typeof bedrockHandlerFixture>) {
  vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "1");
  f.rows.tenant._table = "tenants";
}
it.each(["EXHAUSTED", "ACTIVE"])("rejects aggregate allocation after existing canonical %s budget", async state => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  f.rows.wo.repositoryId = "repo";
  f.rows.route.routeSnapshot = { provider: f.price.provider, modelId: f.price.model };
  f.rows.existing = { _table: "inferenceReservations", workOrderId: "wo", state };
  await expect(handler(createReservation)(f.ctx, { projectId: "project", workOrderId: "wo", executionProfileId: "profile", priceId: "price", maximumNanoUsd: 30, expiresAt: Date.now() + 1000, maximumRequests: 2, idempotencyKey: "new-budget" })).rejects.toThrow("WorkOrder already has independent inference budget authority");
  expect(f.ctx.db.insert).not.toHaveBeenCalled();
});
it("rejects public canonical reservation allocation after aggregate allocation", async () => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  f.rows.reservation._table = "factoryProviderReservations";
  await expect(handler(createCanonicalReservation)(f.ctx, { projectId: "project", workOrderId: "wo" })).rejects.toThrow("WorkOrder aggregate liability requires the composed admission path");
  expect(f.ctx.db.insert).not.toHaveBeenCalled();
});
it("reconciles UNKNOWN through operator authority without rewriting the canonical receipt", async () => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f, "UNKNOWN") });
  const receipt = structuredClone(accountingRows(f, "inferencePhysicalReceipts")[0]);
  await handler(reconcileUsage)(f.ctx, { reservationId: "reservation", usage: { ...bedrockUsage(f), expectedReceiptRevision: 1 }, evidenceReference: "fixture://operator-correction" });
  expect(accountingRows(f, "inferencePhysicalReceipts")[0]).toEqual(receipt);
  expect(accountingRows(f, "inferenceReconciliations")).toHaveLength(1);
  expect(accountingRows(f, "inferenceReconciliations")[0]).toMatchObject({ providerRequestId: "provider-request-1", receiptId: receipt._id });
  expect(f.rows.reservation.snapshot.holds[0].state).toBe("SETTLED");
});
it.each([{ inputTokens: 11, outputTokens: 1 }, { inputTokens: 1, outputTokens: 11 }, { inputTokens: 11, outputTokens: 11 }])("retains observed overrun %j and freezes aggregate atomically without expanding pre-send limits", async observed => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  const result = await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: { ...bedrockUsage(f), ...observed } });
  expect(result.incident).toBe(true);
  expect(f.rows.reservation.snapshot.frozen).toBe(true);
  expect(f.rows.reservation.snapshot.holds[0].state).toBe("OVERRUN");
  const [receipt] = accountingRows(f, "inferencePhysicalReceipts");
  expect(receipt).toMatchObject({ delivery: "DELIVERED", status: "FAILED", failureCode: "PROVIDER_USAGE_OVERRUN", usage: observed, costClassification: "ESTIMATED" });
  expect(receipt.immutableSnapshot.schema).toBe("inference-physical-receipt/v3");
  expect(receipt.violationCodes.length).toBeGreaterThan(0);
  expect(accountingRows(f, "inferenceReconciliations")).toHaveLength(0);
  expect(f.rows.wo.inferenceSpendingFence.receiptId).toBe(receipt._id);
  expect(accountingRows(f, "inferenceReservations")[0].maxOutputTokens).toBe(10);
  await expect(handler(reserveRequestInternal)(f.ctx, { ...f.args, requestId: "next" })).rejects.toThrow();
});
it.each(["receipt", "reconciliation"])("denies actual settlement request ID already owned by a canonical %s in another WorkOrder", async ownerKind => {
  const f = bedrockHandlerFixture();
  await handler(reserveRequestInternal)(f.ctx, f.args);
  f.rows.foreignReceipt = { _id: "foreignReceipt", _table: "inferencePhysicalReceipts", projectId: "project", workOrderId: "other-wo", route: { provider: "aws-bedrock" }, ...(ownerKind === "receipt" ? { providerRequestId: "provider-request-1" } : {}) };
  if (ownerKind === "reconciliation") f.rows.foreignCorrection = { _id: "foreignCorrection", _table: "inferenceReconciliations", projectId: "project", providerRequestId: "provider-request-1", receiptId: "foreignReceipt" };
  await expect(handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f) })).rejects.toThrow(/Canonical provider request belongs/);
  expect(f.rows.reservation.snapshot.holds[0].state).toBe("RESERVED");
});
it.each(["receipt", "reconciliation"])("denies unknown correction using another canonical %s provider request ID", async ownerKind => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f, "UNKNOWN") });
  f.rows.foreignReceipt = { _id: "foreignReceipt", _table: "inferencePhysicalReceipts", projectId: "project", workOrderId: "other-wo", route: { provider: "aws-bedrock" }, ...(ownerKind === "receipt" ? { providerRequestId: "provider-request-1" } : {}) };
  if (ownerKind === "reconciliation") f.rows.foreignCorrection = { _id: "foreignCorrection", _table: "inferenceReconciliations", projectId: "project", providerRequestId: "provider-request-1", receiptId: "foreignReceipt" };
  await expect(handler(reconcileUsage)(f.ctx, { reservationId: "reservation", usage: { ...bedrockUsage(f), expectedReceiptRevision: 1 }, evidenceReference: "fixture://correction" })).rejects.toThrow(/Canonical provider request belongs/);
  expect(f.rows.reservation.snapshot.holds[0].state).toBe("UNKNOWN");
});
it("retains sequential operator corrections for one provider usage ID with exact-revision idempotency", async () => {
  const f = bedrockHandlerFixture();
  allowFixtureOperator(f);
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f, "UNKNOWN") });
  const correction = { reservationId: "reservation", usage: { ...bedrockUsage(f), expectedReceiptRevision: 1 }, evidenceReference: "fixture://correction-1" };
  await handler(reconcileUsage)(f.ctx, correction);
  const second = { ...correction, usage: { ...correction.usage, inputTokens: 2, expectedReceiptRevision: 2 }, evidenceReference: "fixture://correction-2" };
  await handler(reconcileUsage)(f.ctx, second);
  expect(accountingRows(f, "inferenceReconciliations")).toHaveLength(2);
  expect(new Set(accountingRows(f, "inferenceReconciliations").map(row => row.providerEventId)).size).toBe(2);
  expect((await handler(reconcileUsage)(f.ctx, second)).duplicate).toBe(true);
  expect(accountingRows(f, "inferenceReconciliations")).toHaveLength(2);
});
it("retains cumulative canonical allocation after settled paired requests without expanding the WorkOrder ceiling", async () => {
  const f = bedrockHandlerFixture();
  f.rows.reservation.snapshot.maximumNanoUsd = 90;
  f.rows.reservation.snapshot.maximumRequests = 3;
  f.rows.reservation.creationDigest = liabilityDigest(f.rows.reservation.snapshot);
  f.rows.wo.metadata.implementationPolicy.maxCostUsd = 0.000004;
  for (let ordinal = 1; ordinal <= 2; ordinal++) {
    f.args.requestId = `request-${ordinal}`;
    await handler(reserveRequestInternal)(f.ctx, f.args);
    await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: { ...bedrockUsage(f), providerRequestId: `provider-${ordinal}`, usageId: `usage-${ordinal}` } });
  }
  const allocations = accountingRows(f, "inferenceReservations");
  expect(allocations.map(row => row.state)).toEqual(["EXHAUSTED", "EXHAUSTED"]);
  expect(allocations.reduce((sum, row) => sum + row.maxCostMicrousd, 0)).toBe(4);
  expect(f.rows.reservation.snapshot.holds).toHaveLength(2);
  await expect(handler(reserveRequestInternal)(f.ctx, { ...f.args, requestId: "request-3" })).rejects.toThrow("Aggregate inference reservations exceed the approved WorkOrder cost ceiling");
  expect(accountingRows(f, "inferenceReservations")).toHaveLength(2);
  expect(f.rows.reservation.snapshot.holds).toHaveLength(2);
  expect(f.rows.wo.metadata.implementationPolicy.maxCostUsd).toBe(0.000004);
});
it("rejects immutable allocation drift before composing the next physical request", async () => {
  const f = bedrockHandlerFixture();
  f.rows.reservation.snapshot.maximumNanoUsd = 60;
  f.rows.reservation.creationDigest = liabilityDigest(f.rows.reservation.snapshot);
  await handler(reserveRequestInternal)(f.ctx, f.args);
  await handler(recordUsageInternal)(f.ctx, { ...f.args, usage: bedrockUsage(f) });
  accountingRows(f, "inferenceReservations")[0].immutableSnapshot.maxCostMicrousd = 0;
  await expect(handler(reserveRequestInternal)(f.ctx, { ...f.args, requestId: "next" })).rejects.toThrow("Existing WorkOrder inference allocation is invalid");
  expect(f.rows.reservation.snapshot.holds).toHaveLength(1);
});
