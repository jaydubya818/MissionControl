import { vi } from "vitest";
import { inferencePriceBook, type ExactInferenceRoute } from "@mission-control/shared";
import { createReservation } from "../../inferenceGateway";

const sha = (letter: string) => `sha256:${letter.repeat(64)}`;

// Invoke the real mutation with an indexed in-memory database. This exercises
// admission behavior, not Convex's transaction scheduler or live provider usage.
export function reservationFixture() {
  const now = Date.now();
  const route = {
    provider: "fixture", providerRoute: "fixture", modelId: "m", routeDigest: sha("b"),
    adapter: "fixture", adapterVersion: "1", endpoint: "https://example.invalid",
  };
  const fallback = { ...route, modelId: "fallback-model", routeDigest: sha("e") };
  const priceBook = inferencePriceBook({
    priceBookId: "pb", version: 1, currency: "USD",
    source: { kind: "OPERATOR_APPROVED", reference: "offline qualification fixture", digest: sha("a") },
    effectiveFrom: now - 1_000,
    rates: [route, fallback].map(candidate => ({ routeDigest: candidate.routeDigest, inputMicrousdPerMillionTokens: 1_000_000,
      outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 0,
      cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0 })),
  });
  const args = {
    projectId: "project", workOrderId: "order", taskId: "task", workflowRunId: "attempt",
    executionProfileId: "profile", executionProfileDigest: sha("c"),
    primaryRoute: route, allowedFallbacks: [] as ExactInferenceRoute[], maxPhysicalCalls: 1,
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
  const catalog: Row[] = [route, fallback].map((candidate, index) => ({ _id: `route-${index}`, ...candidate,
    projectId: "project", enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" }));
  const tables = new Map<string, Row[]>([["inferenceReservations", rows], ["modelCatalog", catalog]]);
  const tableRows = (table: string) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };
  const db = {
    get: async (id: string) => records.get(id) ?? [...tables.values()].flat().find(row => row._id === id) ?? null,
    patch: async (id: string, values: Record<string, unknown>) => {
      const row = await db.get(id);
      if (!row) throw new Error(`Fixture row is missing: ${id}`);
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete row[key];
        else row[key] = value;
      }
    },
    query: (table: string) => {
      const predicates: Array<[string, unknown]> = [];
      let descending = false;
      const selected = () => {
        const matching = tableRows(table).filter(row => predicates.every(([key, value]) => row[key] === value));
        return descending ? matching.reverse() : matching;
      };
      const index = { eq: (key: string, value: unknown) => { predicates.push([key, value]); return index; } };
      const query = {
        withIndex: (_name: string, filter: (q: typeof index) => unknown) => { filter(index); return query; },
        order: (direction: string) => { descending = direction === "desc"; return query; },
        first: async () => selected()[0] ?? null,
        collect: async () => selected(),
        take: async (count: number) => selected().slice(0, count),
      };
      return query;
    },
    insert: vi.fn(async (table: string, data: Record<string, unknown>) => {
      const target = tableRows(table);
      const id = `${table}-db-${target.length + 1}`;
      target.push({ ...data, _id: id });
      return id;
    }),
  };
  type Handler = { _handler: (ctx: unknown, args: unknown) => Promise<unknown> };
  const invoke = <Result = unknown>(operation: unknown, input: unknown) =>
    (operation as Handler)._handler({ db }, input) as Promise<Result>;
  const reserve = (overrides: Partial<typeof args> = {}) =>
    invoke<{ reservationId: string; reservationDigest: string; created: boolean }>(createReservation, { ...args, ...overrides });
  return { args, reserve, invoke, db, rows, records, tableRows, route, fallback };
}
