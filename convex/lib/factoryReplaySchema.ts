import { defineTable } from "convex/server";
import { v } from "convex/values";

const replayDefinition = v.object({
  schema: v.literal("factory-replay/v1"),
  projectId: v.id("projects"),
  experimentId: v.id("experiments"),
  datasetId: v.id("evalDatasets"),
  datasetVersion: v.number(),
  datasetSnapshot: v.any(),
  datasetItems: v.array(v.any()),
  datasetDigest: v.string(),
  minimumPairs: v.number(),
  maxAttemptsPerCase: v.number(),
  evaluators: v.array(v.object({
    id: v.id("evalDefinitions"),
    digest: v.string(),
    definition: v.any(),
    implementationVersion: v.string(),
    model: v.optional(v.string()),
  })),
  variants: v.array(v.object({
    id: v.id("experimentVariants"),
    name: v.string(),
    factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
    configurationDigest: v.string(),
    tuple: v.any(),
  })),
  cases: v.array(v.object({
    key: v.string(),
    datasetItemId: v.id("evalDatasetItems"),
    sourceWorkOrderId: v.id("workOrders"),
    input: v.any(),
    expectedOutcome: v.optional(v.any()),
    workload: v.any(),
    workloadDigest: v.string(),
  })),
});

export const factoryReplayTables = {
  factoryReplayManifests: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    experimentId: v.id("experiments"),
    definition: replayDefinition,
    digest: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_experiment", ["experimentId"])
    .index("by_project", ["projectId"]),

  factoryReplayCases: defineTable({
    projectId: v.id("projects"),
    manifestId: v.id("factoryReplayManifests"),
    variantId: v.id("experimentVariants"),
    caseKey: v.string(),
    workOrderId: v.id("workOrders"),
    workOrderRevision: v.number(),
    boundBy: v.string(),
    boundAt: v.number(),
  }).index("by_manifest", ["manifestId"])
    .index("by_manifest_variant_case", ["manifestId", "variantId", "caseKey"])
    .index("by_work_order", ["workOrderId"]),

  factoryReplayInterventionReports: defineTable({
    projectId: v.id("projects"),
    caseId: v.id("factoryReplayCases"),
    attemptSetDigest: v.string(),
    ownerCount: v.number(),
    assistantOutsideFactoryCount: v.number(),
    evidenceRefs: v.array(v.string()),
    recordedBy: v.string(),
    recordedAt: v.number(),
  }).index("by_case", ["caseId"])
    .index("by_case_attempts", ["caseId", "attemptSetDigest"]),
};
