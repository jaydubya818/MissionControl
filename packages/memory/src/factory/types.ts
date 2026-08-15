export const FACTORY_MEMORY_SOURCE_TYPES = [
  "source-code",
  "repository-document",
  "adr",
  "work-order",
  "attempt",
  "factory-version",
  "verification-plan",
  "verification-evidence",
  "trace",
  "eval",
  "incident",
  "test",
  "pull-request",
  "git-history",
  "artifact",
  "regression-case",
] as const;
export type FactoryMemorySourceType =
  (typeof FACTORY_MEMORY_SOURCE_TYPES)[number];
export const FACTORY_ENTITY_TYPES = [
  "repository",
  "component",
  "service",
  "module",
  "file",
  "symbol",
  "api",
  "workOrder",
  "attempt",
  "factoryVersion",
  "trace",
  "eval",
  "verificationPlan",
  "verificationEvidence",
  "requirement",
  "test",
  "regressionCase",
  "incident",
  "pullRequest",
  "commit",
  "change",
  "adr",
  "team",
  "environment",
  "artifact",
] as const;
export type FactoryEntityType = (typeof FACTORY_ENTITY_TYPES)[number];
export const FACTORY_RELATIONS = [
  "contains",
  "defines",
  "imports",
  "imported_by",
  "calls",
  "references",
  "depends_on",
  "used_by",
  "uses",
  "owns",
  "owned_by",
  "governed_by",
  "governs",
  "supersedes",
  "implements",
  "implemented_by",
  "changes",
  "changed_by",
  "produced_by",
  "produced",
  "verified_by",
  "verifies",
  "provides_evidence_for",
  "covered_by",
  "covers",
  "tests",
  "affected",
  "affected_by",
  "caused",
  "caused_by",
  "failed_because",
  "similar_to",
  "likely_affects",
  "related_failure",
  "historically_correlated_with",
  "resolved_by",
  "evaluated_by",
  "generated",
  "exposes",
  "deployed_to",
  "associated_with",
  "derived_from",
] as const;
export type FactoryRelation = (typeof FACTORY_RELATIONS)[number];
export type KnowledgeDerivation =
  | "authoritative"
  | "deterministic"
  | "inferred";
export type RetrievalMethod =
  | "lexical"
  | "semantic"
  | "code"
  | "hybrid"
  | "relationship"
  | "graph";
export type FactoryPurpose = "software" | "verification" | "automation";
export interface FactoryScope {
  projectId: string;
  repositoryId?: string;
}
export interface MemoryProvenance {
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  path?: string;
  revision?: string;
  parentDocumentId?: string;
  lineStart?: number;
  lineEnd?: number;
  timestamp: number;
  derivation?: KnowledgeDerivation;
}
export interface FactoryMemoryDocument extends FactoryScope {
  id: string;
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  workOrderId?: string;
  attemptId?: string;
  factoryVersionId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  contentHash: string;
  sourceRevision?: string;
  createdAt: number;
  indexedAt: number;
  invalidatedAt?: number;
  provenance: MemoryProvenance;
}
export interface FactoryMemoryChunk extends FactoryScope {
  id: string;
  documentId: string;
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  workOrderId?: string;
  attemptId?: string;
  factoryVersionId?: string;
  title?: string;
  content: string;
  searchText: string;
  chunkIndex: number;
  estimatedTokens: number;
  contentHash: string;
  metadata?: Record<string, unknown>;
  provenance: MemoryProvenance;
}
export interface FactoryEntity extends FactoryScope {
  id: string;
  type: FactoryEntityType;
  key: string;
  label: string;
  aliases: string[];
  metadata?: Record<string, unknown>;
  provenance: MemoryProvenance[];
  createdAt: number;
  updatedAt: number;
}
export interface FactoryRelationship extends FactoryScope {
  id: string;
  sourceType: FactoryEntityType;
  sourceId: string;
  relation: FactoryRelation;
  targetType: FactoryEntityType;
  targetId: string;
  provenance: MemoryProvenance[];
  confidence?: number;
  derivation: KnowledgeDerivation;
  createdAt: number;
  updatedAt?: number;
}
export interface ContextBudget {
  maxItems?: number;
  maxEstimatedTokens?: number;
}
export interface FactoryMemoryQuery extends FactoryScope {
  query: string;
  repositoryIds?: string[];
  sourceTypes?: FactoryMemorySourceType[];
  workOrderId?: string;
  attemptId?: string;
  factoryVersionId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  filters?: Record<string, unknown>;
  limit?: number;
  budget?: ContextBudget;
}
export interface RelationshipPathStep {
  source: string;
  relation: FactoryRelation;
  target: string;
  derivation: KnowledgeDerivation;
}
export interface FactoryMemoryResult {
  chunkId: string;
  documentId: string;
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  title?: string;
  content: string;
  score: number;
  retrievalMethod: RetrievalMethod;
  estimatedTokens: number;
  authority: KnowledgeDerivation;
  reason: string;
  provenance: MemoryProvenance;
  metadata?: Record<string, unknown>;
  relationshipPath?: RelationshipPathStep[];
}
export type RetrievalStrategy =
  | "none"
  | "code"
  | "hybrid"
  | "relationship"
  | "graph"
  | "git-history"
  | "trace-history"
  | "verification-history"
  | "incident-history"
  | "architecture";
export interface RetrievalPlanStep {
  strategy: RetrievalStrategy;
  query?: string;
  entity?: { type: FactoryEntityType; id: string };
  sourceTypes?: FactoryMemorySourceType[];
  reason: string;
}
export interface RetrievalPlan {
  id: string;
  objective: string;
  purpose: FactoryPurpose;
  steps: RetrievalPlanStep[];
  budget: ContextBudget;
  requiredSourceTypes: FactoryMemorySourceType[];
  maxIterations: number;
  createdAt: number;
}
export interface ContextSufficiency {
  sufficient: boolean;
  reasons: string[];
  missingSourceTypes: FactoryMemorySourceType[];
  authoritativeResultCount: number;
  estimatedTokens: number;
}
export interface ContextPackageItem {
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  documentId: string;
  chunkId: string;
  content: string;
  reason: string;
  priority: "required" | "high" | "normal" | "optional";
  estimatedTokens: number;
  retrievalMethod: RetrievalMethod;
  provenance: MemoryProvenance;
  relationshipPath?: RelationshipPathStep[];
}
export interface ContextPackage {
  id: string;
  projectId: string;
  repositoryId?: string;
  workOrderId: string;
  attemptId?: string;
  factoryVersionId?: string;
  purpose: FactoryPurpose;
  generatedAt: number;
  objective: string;
  items: ContextPackageItem[];
  estimatedTokens: number;
  budget: ContextBudget;
  retrievalPlanId?: string;
  retrievalStrategies: RetrievalStrategy[];
  contentHash: string;
  frozen: boolean;
  metadata?: Record<string, unknown>;
}
export interface ContextDiff {
  added: ContextPackageItem[];
  removed: ContextPackageItem[];
  changedRevisions: Array<{
    sourceId: string;
    before?: string;
    after?: string;
  }>;
  changedRelationshipPaths: Array<{
    sourceId: string;
    before: RelationshipPathStep[];
    after: RelationshipPathStep[];
  }>;
}
export interface VerificationCheckRecommendation {
  id: string;
  name: string;
  rationale: string;
  acceptanceCriterionIds: string[];
  influencedBy: Array<{
    sourceType: FactoryMemorySourceType;
    sourceId: string;
    revision?: string;
  }>;
  evidenceRequired: true;
}
export interface FactoryVerificationPlan {
  id: string;
  workOrderId: string;
  contextPackageId: string;
  createdAt: number;
  checks: VerificationCheckRecommendation[];
  advisoryOnly: true;
}
export interface RetrievalObservation {
  type:
    | "context.plan"
    | "memory.search"
    | "code.search"
    | "graph.traversal"
    | "context.rank"
    | "context.assemble"
    | "context.sufficiency";
  strategy?: RetrievalStrategy;
  query?: string;
  resultCount?: number;
  selectedCount?: number;
  rejectedCount?: number;
  estimatedTokens?: number;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}
export interface ContextEvalResult {
  key:
    | "context_relevance"
    | "context_precision"
    | "context_recall_proxy"
    | "context_efficiency"
    | "unused_context_ratio"
    | "retrieval_cost"
    | "retrieval_latency"
    | "relationship_accuracy"
    | "retrieval_success"
    | "verification_context_quality"
    | "context_budget_compliance";
  score: number;
  passed: boolean;
  reason: string;
  sampleSize: number;
}
export interface FactoryMemoryStore {
  upsertDocument(
    document: FactoryMemoryDocument,
    chunks: FactoryMemoryChunk[],
  ): Promise<void>;
  getDocument(
    scope: FactoryScope,
    id: string,
  ): Promise<FactoryMemoryDocument | null>;
  listChunks(scope: FactoryScope): Promise<FactoryMemoryChunk[]>;
}
export interface SemanticIndex {
  index(chunks: FactoryMemoryChunk[]): Promise<void>;
  search(
    query: string,
    chunks: FactoryMemoryChunk[],
    limit: number,
  ): Promise<Array<{ chunkId: string; score: number }>>;
}
export interface FactoryKnowledgeGraph {
  upsertEntity(entity: FactoryEntity): Promise<void>;
  upsertRelationship(relationship: FactoryRelationship): Promise<void>;
  resolveEntity(
    scope: FactoryScope,
    reference: string,
    type?: FactoryEntityType,
  ): Promise<FactoryEntity | null>;
  neighbors(
    scope: FactoryScope,
    entityId: string,
    options?: GraphQueryOptions,
  ): Promise<GraphSlice>;
  incoming(
    scope: FactoryScope,
    entityId: string,
    options?: GraphQueryOptions,
  ): Promise<GraphSlice>;
  outgoing(
    scope: FactoryScope,
    entityId: string,
    options?: GraphQueryOptions,
  ): Promise<GraphSlice>;
  traverse(
    scope: FactoryScope,
    entityId: string,
    options?: GraphTraversalOptions,
  ): Promise<GraphSlice>;
  findPath(
    scope: FactoryScope,
    sourceId: string,
    targetId: string,
    options?: GraphTraversalOptions,
  ): Promise<GraphPath | null>;
  subgraph(scope: FactoryScope, entityIds: string[]): Promise<GraphSlice>;
}
export interface GraphQueryOptions {
  relations?: FactoryRelation[];
  derivations?: KnowledgeDerivation[];
  direction?: "incoming" | "outgoing" | "both";
  limit?: number;
}
export interface GraphTraversalOptions extends GraphQueryOptions {
  maxDepth?: number;
  maxNodes?: number;
  fanOut?: number;
}
export interface GraphSlice {
  entities: FactoryEntity[];
  relationships: FactoryRelationship[];
  truncated: boolean;
}
export interface GraphPath {
  entities: FactoryEntity[];
  relationships: FactoryRelationship[];
  steps: RelationshipPathStep[];
}
export interface WorkOrderContextInput extends FactoryScope {
  workOrderId: string;
  attemptId?: string;
  factoryVersionId?: string;
  objective: string;
  context?: string;
  acceptanceCriteria: Array<{ id: string; description: string }>;
  changedPaths?: string[];
  purpose: FactoryPurpose;
}
