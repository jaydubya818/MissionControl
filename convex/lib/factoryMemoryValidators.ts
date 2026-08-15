import { v } from "convex/values";

export const factoryMemorySourceTypeValidator = v.union(
  v.literal("source-code"),
  v.literal("repository-document"),
  v.literal("adr"),
  v.literal("work-order"),
  v.literal("attempt"),
  v.literal("factory-version"),
  v.literal("verification-plan"),
  v.literal("verification-evidence"),
  v.literal("trace"),
  v.literal("eval"),
  v.literal("incident"),
  v.literal("test"),
  v.literal("pull-request"),
  v.literal("git-history"),
  v.literal("artifact"),
  v.literal("regression-case"),
);

export const factoryEntityTypeValidator = v.union(
  v.literal("repository"),
  v.literal("component"),
  v.literal("service"),
  v.literal("module"),
  v.literal("file"),
  v.literal("symbol"),
  v.literal("api"),
  v.literal("workOrder"),
  v.literal("attempt"),
  v.literal("factoryVersion"),
  v.literal("trace"),
  v.literal("eval"),
  v.literal("verificationPlan"),
  v.literal("verificationEvidence"),
  v.literal("requirement"),
  v.literal("test"),
  v.literal("regressionCase"),
  v.literal("incident"),
  v.literal("pullRequest"),
  v.literal("commit"),
  v.literal("change"),
  v.literal("adr"),
  v.literal("team"),
  v.literal("environment"),
  v.literal("artifact"),
);

export const factoryRelationValidator = v.union(
  v.literal("contains"),
  v.literal("defines"),
  v.literal("imports"),
  v.literal("imported_by"),
  v.literal("calls"),
  v.literal("references"),
  v.literal("depends_on"),
  v.literal("used_by"),
  v.literal("uses"),
  v.literal("owns"),
  v.literal("owned_by"),
  v.literal("governed_by"),
  v.literal("governs"),
  v.literal("supersedes"),
  v.literal("implements"),
  v.literal("implemented_by"),
  v.literal("changes"),
  v.literal("changed_by"),
  v.literal("produced_by"),
  v.literal("produced"),
  v.literal("verified_by"),
  v.literal("verifies"),
  v.literal("provides_evidence_for"),
  v.literal("covered_by"),
  v.literal("covers"),
  v.literal("tests"),
  v.literal("affected"),
  v.literal("affected_by"),
  v.literal("caused"),
  v.literal("caused_by"),
  v.literal("failed_because"),
  v.literal("similar_to"),
  v.literal("likely_affects"),
  v.literal("related_failure"),
  v.literal("historically_correlated_with"),
  v.literal("resolved_by"),
  v.literal("evaluated_by"),
  v.literal("generated"),
  v.literal("exposes"),
  v.literal("deployed_to"),
  v.literal("associated_with"),
  v.literal("derived_from"),
);

export const factoryKnowledgeDerivationValidator = v.union(
  v.literal("authoritative"),
  v.literal("deterministic"),
  v.literal("inferred"),
);

export const factoryRetrievalMethodValidator = v.union(
  v.literal("lexical"),
  v.literal("semantic"),
  v.literal("code"),
  v.literal("hybrid"),
  v.literal("relationship"),
  v.literal("graph"),
);

export const factoryRetrievalStrategyValidator = v.union(
  v.literal("none"),
  v.literal("code"),
  v.literal("hybrid"),
  v.literal("relationship"),
  v.literal("graph"),
  v.literal("git-history"),
  v.literal("trace-history"),
  v.literal("verification-history"),
  v.literal("incident-history"),
  v.literal("architecture"),
);

export const factoryPurposeValidator = v.union(
  v.literal("software"),
  v.literal("verification"),
  v.literal("automation"),
);

export const factoryMemoryProvenanceValidator = v.object({
  sourceType: factoryMemorySourceTypeValidator,
  sourceId: v.string(),
  path: v.optional(v.string()),
  revision: v.optional(v.string()),
  parentDocumentId: v.optional(v.string()),
  lineStart: v.optional(v.number()),
  lineEnd: v.optional(v.number()),
  timestamp: v.number(),
  derivation: v.optional(factoryKnowledgeDerivationValidator),
});

export const factoryContextBudgetValidator = v.object({
  maxItems: v.optional(v.number()),
  maxEstimatedTokens: v.optional(v.number()),
});

export const factoryRelationshipPathStepValidator = v.object({
  source: v.string(),
  relation: factoryRelationValidator,
  target: v.string(),
  derivation: factoryKnowledgeDerivationValidator,
});

export const factoryContextItemValidator = v.object({
  sourceType: factoryMemorySourceTypeValidator,
  sourceId: v.string(),
  documentId: v.id("factoryMemoryDocuments"),
  chunkId: v.id("factoryMemoryChunks"),
  content: v.string(),
  reason: v.string(),
  priority: v.union(
    v.literal("required"),
    v.literal("high"),
    v.literal("normal"),
    v.literal("optional"),
  ),
  estimatedTokens: v.number(),
  retrievalMethod: factoryRetrievalMethodValidator,
  provenance: factoryMemoryProvenanceValidator,
  relationshipPath: v.optional(v.array(factoryRelationshipPathStepValidator)),
});
