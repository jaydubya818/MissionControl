import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Named schema fragment that keeps downstream TypeScript declaration emission
 * below its serialization limit while preserving Convex runtime validation.
 */
export const evalControlPlaneTables = {
  evalSuites: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    schemaVersion: v.string(),
    key: v.string(),
    name: v.string(),
    description: v.string(),
    version: v.number(),
    suiteDigest: v.string(),
    invalidRatioLimit: v.number(),
    active: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "key"])
    .index("by_project_key_version", ["projectId", "key", "version"])
    .index("by_project_active", ["projectId", "active"]),

  evalSuiteCases: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    suiteId: v.id("evalSuites"),
    key: v.string(),
    name: v.string(),
    severity: v.union(v.literal("BLOCKING"), v.literal("ADVISORY")),
    definition: v.optional(v.any()),
    // Compatibility with receipts written during the schema's preview cycle.
    description: v.optional(v.string()),
    slices: v.optional(v.array(v.string())),
    publicInput: v.optional(v.any()),
    sealedAssertions: v.optional(v.any()),
    negativeControl: v.optional(v.any()),
    ordinal: v.number(),
    createdAt: v.number(),
  })
    .index("by_suite", ["suiteId"])
    .index("by_suite_key", ["suiteId", "key"])
    .index("by_project", ["projectId"]),

  evalBaselines: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    suiteId: v.id("evalSuites"),
    baselineId: v.string(),
    baselineDigest: v.string(),
    suiteDigest: v.string(),
    sourceReceiptDigest: v.string(),
    baseline: v.any(),
    active: v.boolean(),
    promotionReason: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_suite", ["suiteId"])
    .index("by_suite_active", ["suiteId", "active"])
    .index("by_project_baseline", ["projectId", "baselineId"])
    .index("by_digest", ["baselineDigest"]),

  evalControlRuns: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    suiteId: v.id("evalSuites"),
    baselineId: v.optional(v.id("evalBaselines")),
    runKey: v.string(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("QUEUED"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("CANCELED")
    ),
    verdict: v.union(
      v.literal("PASS"),
      v.literal("WARN"),
      v.literal("FAIL"),
      v.literal("INVALID")
    ),
    publishable: v.boolean(),
    releaseBlocking: v.literal(false),
    acceptanceAuthority: v.literal(false),
    provenance: v.any(),
    startedAt: v.number(),
    finishedAt: v.number(),
    receiptDigest: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project_idempotency", ["projectId", "idempotencyKey"])
    .index("by_project_run_key", ["projectId", "runKey"])
    .index("by_suite_started", ["suiteId", "startedAt"])
    .index("by_project_started", ["projectId", "startedAt"])
    .index("by_project_verdict", ["projectId", "verdict"]),

  evalCaseResults: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    runId: v.id("evalControlRuns"),
    suiteCaseId: v.optional(v.id("evalSuiteCases")),
    caseKey: v.string(),
    verdict: v.union(
      v.literal("PASS"),
      v.literal("FAIL"),
      v.literal("INVALID"),
      v.literal("SKIPPED")
    ),
    result: v.any(),
    // Compatibility fields; canonical result data lives in `result`.
    caseName: v.optional(v.string()),
    severity: v.optional(v.union(v.literal("BLOCKING"), v.literal("ADVISORY"))),
    slices: v.optional(v.array(v.string())),
    score: v.optional(v.number()),
    failureOrigin: v.optional(v.any()),
    outputDigest: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_case", ["runId", "caseKey"])
    .index("by_project_verdict", ["projectId", "verdict"]),

  evalRunReceipts: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    suiteId: v.id("evalSuites"),
    runId: v.id("evalControlRuns"),
    receiptDigest: v.string(),
    verdict: v.union(
      v.literal("PASS"),
      v.literal("WARN"),
      v.literal("FAIL"),
      v.literal("INVALID")
    ),
    publishable: v.boolean(),
    releaseBlocking: v.literal(false),
    acceptanceAuthority: v.literal(false),
    receipt: v.any(),
    // Compatibility fields; canonical receipt data lives in `receipt`.
    schemaVersion: v.optional(v.string()),
    metrics: v.optional(v.any()),
    regressions: v.optional(v.any()),
    accountingErrors: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_suite_created", ["suiteId", "createdAt"])
    .index("by_project_created", ["projectId", "createdAt"])
    .index("by_digest", ["receiptDigest"]),
};
