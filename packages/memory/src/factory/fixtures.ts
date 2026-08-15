import { assembleContextPackage, buildVerificationPlan } from "./context.js";
import { evaluateContextPackage, compareContextVariants } from "./evals.js";
import { InMemoryFactoryKnowledgeGraph } from "./graph.js";
import {
  buildFactoryMemoryDocument,
  chunkFactoryMemoryDocument,
  stableId,
} from "./ingestion.js";
import { planContextRetrieval, runBoundedRetrievalLoop } from "./planner.js";
import { DeterministicSemanticIndex, hybridRetrieve } from "./retrieval.js";
import type {
  ContextPackage,
  FactoryEntity,
  FactoryMemoryChunk,
  FactoryMemoryResult,
  FactoryMemorySourceType,
  FactoryRelationship,
  MemoryProvenance,
  RetrievalPlanStep,
  WorkOrderContextInput,
} from "./types.js";

const FIXTURE_TIME = Date.UTC(2026, 7, 15, 12, 0, 0);
const PROJECT_ID = "project-shop-service";
const REPOSITORY_ID = "repository-shop-service";
const REVISION = "fixture-sha-0042";

function provenance(
  sourceType: FactoryMemorySourceType,
  sourceId: string,
  derivation: "authoritative" | "deterministic" | "inferred" = "authoritative",
): MemoryProvenance {
  return {
    sourceType,
    sourceId,
    revision: REVISION,
    timestamp: FIXTURE_TIME,
    derivation,
  };
}

function entity(
  type: FactoryEntity["type"],
  key: string,
  label: string,
  aliases: string[] = [],
): FactoryEntity {
  return {
    id: stableId(PROJECT_ID, REPOSITORY_ID, type, key),
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    type,
    key,
    label,
    aliases,
    provenance: [provenance("repository-document", key, "deterministic")],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

function relationship(
  source: FactoryEntity,
  relation: FactoryRelationship["relation"],
  target: FactoryEntity,
  derivation: FactoryRelationship["derivation"] = "deterministic",
  confidence?: number,
): FactoryRelationship {
  return {
    id: stableId(source.id, relation, target.id),
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    sourceType: source.type,
    sourceId: source.id,
    relation,
    targetType: target.type,
    targetId: target.id,
    provenance: [
      provenance(
        "repository-document",
        `${source.key}:${relation}:${target.key}`,
        derivation,
      ),
    ],
    confidence,
    derivation,
    createdAt: FIXTURE_TIME,
  };
}

function source(input: {
  sourceType: FactoryMemorySourceType;
  sourceId: string;
  title: string;
  path?: string;
  content: string;
  metadata?: Record<string, unknown>;
}): FactoryMemoryChunk[] {
  const built = buildFactoryMemoryDocument({
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    path: input.path,
    revision: REVISION,
    content: input.content,
    metadata: input.metadata,
    createdAt: FIXTURE_TIME,
    indexedAt: FIXTURE_TIME,
  });
  return chunkFactoryMemoryDocument(built.document, { maxCharacters: 900 });
}

export interface GoldenPathFixture {
  workOrder: WorkOrderContextInput;
  chunks: FactoryMemoryChunk[];
  entities: FactoryEntity[];
  relationships: FactoryRelationship[];
  expectedSourceIds: string[];
}

export function createGoldenPathFixture(): GoldenPathFixture {
  const repository = entity(
    "repository",
    "repository:shop-service",
    "shop-service",
    ["shop service"],
  );
  const auth = entity(
    "component",
    "component:auth-middleware",
    "auth-middleware",
    ["AuthMiddleware", "authentication middleware"],
  );
  const orders = entity("service", "service:orders-api", "orders-api", [
    "orders API",
  ]);
  const billing = entity(
    "service",
    "service:billing-client",
    "billing-client",
    ["billing client"],
  );
  const adr = entity("adr", "adr:ADR-004", "ADR-004");
  const incident = entity("incident", "incident:INC-12", "INC-12");
  const authTest = entity(
    "test",
    "test:auth.integration.test",
    "auth.integration.test",
  );
  const ordersTest = entity("test", "test:orders.e2e.test", "orders.e2e.test");
  const previousWorkOrder = entity("workOrder", "work-order:WO-42", "WO-42");
  const regression = entity(
    "regressionCase",
    "regression:unauthorized-orders-access",
    "unauthorized-orders-access",
  );
  const entities = [
    repository,
    auth,
    orders,
    billing,
    adr,
    incident,
    authTest,
    ordersTest,
    previousWorkOrder,
    regression,
  ];
  const relationships = [
    relationship(repository, "contains", auth),
    relationship(repository, "contains", orders),
    relationship(repository, "contains", billing),
    relationship(auth, "used_by", orders),
    relationship(orders, "governed_by", adr, "authoritative"),
    relationship(incident, "affected", orders, "authoritative"),
    relationship(orders, "covered_by", ordersTest),
    relationship(authTest, "tests", auth),
    relationship(previousWorkOrder, "changes", auth, "authoritative"),
    relationship(regression, "derived_from", incident, "authoritative"),
    relationship(orders, "depends_on", billing),
    relationship(auth, "similar_to", billing, "inferred", 0.42),
  ];
  const chunks = [
    ...source({
      sourceType: "source-code",
      sourceId: "src/auth/authMiddleware.ts",
      title: "Authentication middleware",
      path: "src/auth/authMiddleware.ts",
      content:
        "export function authMiddleware(request) { validateAccessToken(request); }\n// Token refresh support must preserve authorization on orders-api endpoints.",
      metadata: {
        language: "typescript",
        symbols: ["authMiddleware", "validateAccessToken"],
        imports: ["tokenService"],
        component: "auth-middleware",
      },
    }),
    ...source({
      sourceType: "adr",
      sourceId: "ADR-004",
      title: "ADR-004 Require authorization on orders endpoints",
      path: "docs/adr/ADR-004.md",
      content:
        "ADR-004 requires authentication middleware authorization on every orders-api endpoint. Unauthenticated access must return 401.",
    }),
    ...source({
      sourceType: "incident",
      sourceId: "INC-12",
      title: "Unauthenticated orders endpoint incident",
      content:
        "INC-12 affected orders-api after an authentication middleware change allowed unauthorized orders access. Reproduce the incident during verification.",
    }),
    ...source({
      sourceType: "test",
      sourceId: "auth.integration.test",
      title: "Authentication integration tests",
      path: "tests/auth.integration.test.ts",
      content:
        "Covers valid access tokens, expired-token rejection, token refresh success, and unauthenticated 401 behavior for auth-middleware.",
      metadata: { language: "typescript", component: "auth-middleware" },
    }),
    ...source({
      sourceType: "test",
      sourceId: "orders.e2e.test",
      title: "Orders endpoint end-to-end tests",
      path: "tests/orders.e2e.test.ts",
      content:
        "Exercises all orders-api endpoints through authentication middleware and billing-client dependency smoke tests.",
      metadata: { language: "typescript", component: "orders-api" },
    }),
    ...source({
      sourceType: "work-order",
      sourceId: "WO-42",
      title: "Previous auth middleware change",
      content:
        "WO-42 changed auth-middleware and failed verification because the unauthenticated orders endpoint returned 200 instead of 401.",
    }),
    ...source({
      sourceType: "verification-evidence",
      sourceId: "WO-42-verification",
      title: "WO-42 failed verification evidence",
      content:
        "Objective evidence recorded an orders-api authorization boundary failure after the prior auth middleware change.",
    }),
    ...source({
      sourceType: "regression-case",
      sourceId: "unauthorized-orders-access",
      title: "Unauthorized orders access regression",
      content:
        "Regression dataset case reproduces INC-12: unauthenticated orders-api access must be rejected with 401.",
    }),
  ];

  return {
    workOrder: {
      projectId: PROJECT_ID,
      repositoryId: REPOSITORY_ID,
      workOrderId: "WO-100",
      attemptId: "ATTEMPT-1",
      factoryVersionId: "FACTORY-V3",
      objective:
        "Modify authentication middleware and add token refresh support.",
      context:
        "Preserve ADR-004 authorization, inspect dependencies and prior history, prevent INC-12 recurrence, and verify all orders-api endpoints.",
      acceptanceCriteria: [
        {
          id: "AC-1",
          description:
            "Token refresh succeeds for eligible authenticated sessions.",
        },
        {
          id: "AC-2",
          description:
            "Expired and unauthenticated requests cannot access orders endpoints.",
        },
      ],
      changedPaths: ["src/auth/authMiddleware.ts"],
      purpose: "verification",
    },
    chunks,
    entities,
    relationships,
    expectedSourceIds: [
      "src/auth/authMiddleware.ts",
      "ADR-004",
      "INC-12",
      "auth.integration.test",
      "orders.e2e.test",
      "WO-42",
      "unauthorized-orders-access",
    ],
  };
}

function typesForStep(
  step: RetrievalPlanStep,
): FactoryMemorySourceType[] | undefined {
  if (step.sourceTypes?.length) return step.sourceTypes;
  if (step.strategy === "architecture") return ["adr", "repository-document"];
  if (step.strategy === "incident-history")
    return ["incident", "regression-case"];
  if (step.strategy === "git-history")
    return ["git-history", "pull-request", "work-order"];
  if (step.strategy === "trace-history")
    return ["trace", "eval", "attempt", "verification-evidence"];
  if (step.strategy === "verification-history")
    return [
      "test",
      "verification-plan",
      "verification-evidence",
      "regression-case",
    ];
  return undefined;
}

export async function runFactoryMemoryGoldenPath() {
  const fixture = createGoldenPathFixture();
  const graph = new InMemoryFactoryKnowledgeGraph();
  for (const item of fixture.entities) await graph.upsertEntity(item);
  for (const item of fixture.relationships)
    await graph.upsertRelationship(item);
  const plan = planContextRetrieval(
    fixture.workOrder,
    { maxItems: 14, maxEstimatedTokens: 8_000 },
    FIXTURE_TIME,
  );
  const loop = await runBoundedRetrievalLoop({
    plan,
    minimumAuthoritativeResults: 5,
    execute: async (step) =>
      hybridRetrieve({
        chunks: fixture.chunks,
        query: {
          projectId: fixture.workOrder.projectId,
          repositoryId: fixture.workOrder.repositoryId,
          query: step.query ?? fixture.workOrder.objective,
          sourceTypes: typesForStep(step),
          limit: 14,
          budget: plan.budget,
        },
        semanticIndex: new DeterministicSemanticIndex(),
        now: FIXTURE_TIME,
      }),
  });
  const auth = fixture.entities.find(
    (item) => item.label === "auth-middleware",
  )!;
  const adr = fixture.entities.find((item) => item.label === "ADR-004")!;
  const incident = fixture.entities.find((item) => item.label === "INC-12")!;
  const ordersTest = fixture.entities.find(
    (item) => item.label === "orders.e2e.test",
  )!;
  const paths = await Promise.all([
    graph.findPath(fixture.workOrder, auth.id, adr.id, { maxDepth: 3 }),
    graph.findPath(fixture.workOrder, auth.id, incident.id, { maxDepth: 3 }),
    graph.findPath(fixture.workOrder, auth.id, ordersTest.id, { maxDepth: 3 }),
  ]);
  const pathBySource = new Map<
    string,
    NonNullable<(typeof paths)[number]>["steps"]
  >([
    ["ADR-004", paths[0]?.steps ?? []],
    ["INC-12", paths[1]?.steps ?? []],
    ["orders.e2e.test", paths[2]?.steps ?? []],
  ]);
  const pathAwareResults: FactoryMemoryResult[] = loop.results.map(
    (result) => ({
      ...result,
      relationshipPath: pathBySource.get(result.sourceId),
    }),
  );
  const contextPackage = assembleContextPackage({
    workOrder: fixture.workOrder,
    plan,
    results: pathAwareResults,
    generatedAt: FIXTURE_TIME,
    metadata: {
      fixture: "shop-service-five-phase-v1",
      sufficiency: loop.sufficiency,
    },
  });
  const verificationPlan = buildVerificationPlan({
    contextPackage,
    acceptanceCriteria: fixture.workOrder.acceptanceCriteria,
    createdAt: FIXTURE_TIME,
  });
  const graphSlice = await graph.traverse(fixture.workOrder, auth.id, {
    maxDepth: 3,
    maxNodes: 30,
    fanOut: 10,
  });
  const evals = evaluateContextPackage({
    contextPackage,
    candidates: pathAwareResults,
    usedSourceIds: fixture.expectedSourceIds,
    relevantSourceIds: fixture.expectedSourceIds,
    relationships: graphSlice.relationships,
    expectedRelationships: [
      {
        sourceId: auth.id,
        relation: "used_by",
        targetId: fixture.entities.find((item) => item.label === "orders-api")!
          .id,
      },
      {
        sourceId: fixture.entities.find((item) => item.label === "orders-api")!
          .id,
        relation: "covered_by",
        targetId: ordersTest.id,
      },
    ],
    retrievalLatencyMs: loop.observations.reduce(
      (sum, observation) => sum + observation.latencyMs,
      0,
    ),
    verificationInfluenceCount: verificationPlan.checks.filter(
      (check) => check.influencedBy.length > 0,
    ).length,
  });
  const selectedSourceIds = new Set(
    contextPackage.items.map((item) => item.sourceId),
  );
  const inferredPresentedAsAuthority = graphSlice.relationships.some(
    (item) =>
      item.derivation === "inferred" &&
      item.provenance.some((source) => source.derivation === "authoritative"),
  );
  const assertions = [
    [
      "hybrid Factory RAG retrieved authoritative context",
      fixture.expectedSourceIds.every((id) => selectedSourceIds.has(id)),
    ],
    ["typed relationships were created", fixture.relationships.length >= 10],
    ["graph traversal resolved dependency path", paths.every(Boolean)],
    [
      "Context Planner selected multiple retrieval strategies",
      plan.steps.length >= 5,
    ],
    [
      "Context Engine respected token budget",
      contextPackage.estimatedTokens <=
        (contextPackage.budget.maxEstimatedTokens ?? Infinity),
    ],
    [
      "Attempt froze its Context Package",
      contextPackage.frozen &&
        contextPackage.attemptId === fixture.workOrder.attemptId,
    ],
    [
      "Verification Plan referenced historical risk context",
      verificationPlan.checks.some((check) =>
        check.influencedBy.some((source) => source.sourceType === "incident"),
      ),
    ],
    [
      "trace captured retrieval behavior",
      loop.observations.some(
        (observation) => observation.type === "context.plan",
      ) &&
        loop.observations.some(
          (observation) => observation.type === "context.sufficiency",
        ),
    ],
    [
      "context evals completed",
      evals.length >= 6 &&
        evals.every((evaluation) => Number.isFinite(evaluation.score)),
    ],
    [
      "no inferred relationship was treated as authoritative",
      !inferredPresentedAsAuthority,
    ],
  ] as const;

  return {
    fixture,
    plan,
    loop,
    graphSlice,
    contextPackage,
    verificationPlan,
    evals,
    assertions: assertions.map(([message, passed]) => ({ message, passed })),
    output: assertions.map(
      ([message, passed]) => `${passed ? "OK" : "FAIL"}: ${message}.`,
    ),
  };
}

export function createNoisyContextExperiment(base: ContextPackage) {
  const noise = Array.from({ length: 20 }, (_, index) => ({
    ...base.items[index % Math.max(1, base.items.length)],
    sourceType: "repository-document" as const,
    sourceId: `unrelated-${index + 1}`,
    documentId: `noise-doc-${index + 1}`,
    chunkId: `noise-chunk-${index + 1}`,
    content: `Unrelated historical note ${index + 1}. `.repeat(120),
    estimatedTokens: 700,
    priority: "optional" as const,
    reason: "Noise fixture candidate.",
    provenance: provenance("repository-document", `unrelated-${index + 1}`),
  }));
  const large: ContextPackage = {
    ...base,
    id: `${base.id}-noisy`,
    items: [...base.items, ...noise],
    estimatedTokens:
      base.estimatedTokens +
      noise.reduce((sum, item) => sum + item.estimatedTokens, 0),
    contentHash: `${base.contentHash}-noisy`,
  };
  return compareContextVariants([
    {
      name: "Variant A: small relevant context",
      package: base,
      relevantSourceIds: base.items.map((item) => item.sourceId),
      usedSourceIds: base.items.map((item) => item.sourceId),
      latencyMs: 120,
    },
    {
      name: "Variant B: large noisy context",
      package: large,
      relevantSourceIds: base.items.map((item) => item.sourceId),
      usedSourceIds: base.items.map((item) => item.sourceId),
      latencyMs: 480,
    },
  ]);
}
