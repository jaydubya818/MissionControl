import { vi } from "vitest";
import { createPrepublicationGitVerificationSubject } from "@mission-control/workflow-engine/verification-subject";
import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { replayAttemptSetDigest, replayDigest, replayEvaluatorIdentity, replaySnapshot, snapshotReplayWorkload } from "../../lib/factoryReplay";

// Controlled persistence fixtures. The *.fixture.ts name excludes this helper from Convex server discovery.
export const NOW = 1_000_000;
export const BASE = "a".repeat(40);
export const CANDIDATE = "b".repeat(40);
export const QUALITY = `sha256:${"9".repeat(64)}`;
export type Row = Record<string, any> & { _id: string };
export const handler = (fn: unknown) => (fn as { _handler: (ctx: any, args: any) => Promise<any> })._handler;

export function workload(id = "source-work", approvals: string[] = ["RISK_REVIEW"]): Row {
  const contract = { schemaVersion: 2, enforcementMode: "ENFORCED", requireHumanReview: false,
    requiredRisks: [], independence: { required: true, minimumBoundary: "SEPARATE_ATTEMPT" },
    checks: [{ id: "check", name: "Task persists", verifierId: "test", category: "TEST", mandatory: true,
      acceptanceCriterionIds: ["criterion"], command: { executable: "node", args: ["--test"], timeoutMs: 30_000 } }] };
  return { _id: id, tenantId: "tenant", projectId: "project", kind: "SOFTWARE_CHANGE", title: "Persist a task",
    desiredOutcome: "A saved task survives a reload", repositoryId: "repository", repository: "example/replay",
    workflowId: "implement", priority: 3, riskLevel: "LOW", state: "READY", approvalStatus: approvals.length ? "APPROVED" : "NOT_REQUIRED",
    currentRevisionNumber: 1, requiredApprovals: approvals, isMutating: true, executionEnvironment: "POLICY_SELECTED",
    qualityContractDigest: QUALITY, planningRepositorySha: BASE, verificationContract: contract,
    verificationContractDigest: verificationContractDigest(contract, QUALITY), constraints: [],
    requirements: [{ id: "requirement", title: "Persistence", description: "Persist saved tasks" }],
    acceptanceCriteria: [{ id: "criterion", title: "Task survives reload", status: "PASS", requirementIds: ["requirement"] }],
    changeBudget: { maxFilesChanged: 5, maxLinesChanged: 200, allowedPaths: ["src/**"], allowedCommandClasses: ["TEST"], prohibitedCommandClasses: [] },
    metadata: { implementationPolicy: { maxAttempts: 2, maxCostUsd: 5, timeoutMinutes: 10 } },
  };
}

export function context({ authenticated = true, role = "Admin", scopedProject = "project", count = 1, approvals = ["RISK_REVIEW"] } = {}) {
  let sequence = 0;
  const source = workload("source-work", approvals);
  const tables: Record<string, Row[]> = {
    tenants: [{ _id: "tenant", active: true }], projects: [{ _id: "project", tenantId: "tenant" }, { _id: "other-project", tenantId: "tenant" }],
    operators: [{ _id: "operator", authId: "user", tenantId: "tenant", active: true }],
    roles: [{ _id: "role", tenantId: "tenant", name: role, permissions: [] }],
    roleAssignments: [{ _id: "assignment", operatorId: "operator", roleId: "role", scope: { type: "project", id: scopedProject } }],
    workspaceRepositories: [{ _id: "repository", projectId: "project", repository: "example/replay", status: "READY" }],
    workOrders: [source],
    evalDefinitions: [{ _id: "evaluator", _creationTime: 1, projectId: "project", name: "quality", enabled: true,
      version: 1, scope: "ATTEMPT", scoreType: "NUMERIC", evaluatorType: "HUMAN", configuration: { rubric: "Task persists after reload" } }],
    evalDatasets: [{ _id: "dataset", projectId: "project", version: count, name: "Fixed regression cases" }],
    evalDatasetItems: Array.from({ length: count }, (_, i) => ({ _id: `item-${i}`, projectId: "project", datasetId: "dataset",
      sourceWorkOrderId: source._id, input: { workOrder: { title: source.title, desiredOutcome: source.desiredOutcome,
        acceptanceCriteria: source.acceptanceCriteria, constraints: source.constraints }, prompt: `frozen case ${i}` }, expectedOutcome: { pass: true } })),
    factoryDefinitionVersions: ["baseline", "candidate"].map(name => ({ _id: `version-${name}`, projectId: "project", repositoryId: "repository",
      configurationDigest: `sha256:${name === "baseline" ? "1".repeat(64) : "2".repeat(64)}`, budget: { maxAttempts: 2 } })),
    experiments: [{ _id: "experiment", projectId: "project", datasetId: "dataset", datasetVersion: count,
      evalDefinitionIds: ["evaluator"], status: "DRAFT", name: "Replay", metadata: {} }],
    experimentVariants: ["baseline", "candidate"].map(name => ({ _id: `variant-${name}`, projectId: "project", experimentId: "experiment",
      name, factoryDefinitionVersionId: `version-${name}`, sampleSize: 0, configuration: {} })),
    metaLoopSuggestions: [{ _id: "suggestion", projectId: "project", experimentId: "experiment" }],
  };
  const find = (id: string) => Object.values(tables).flat().find(row => row._id === id);
  const writes: Array<{ table?: string; id?: string; value: any }> = [];
  const ctx: any = {
    auth: { getUserIdentity: vi.fn(async () => authenticated ? { subject: "user", issuer: "issuer", tokenIdentifier: "issuer|user" } : null) },
    db: {
      get: async (id: string) => structuredClone(find(id) ?? null),
      insert: async (table: string, value: any) => {
        const row = structuredClone({ ...value, _id: `${table}-${++sequence}`, _creationTime: sequence });
        (tables[table] ??= []).push(row); writes.push({ table, value: row }); return row._id;
      },
      patch: async (id: string, value: any) => { Object.assign(find(id)!, structuredClone(value)); writes.push({ id, value }); },
      query: (table: string) => {
        let rows = [...(tables[table] ?? [])];
        const q: any = {
          withIndex: (_name: string, select: (index: any) => unknown) => {
            const conditions: Array<[string, any]> = [];
            const index: any = { eq: (field: string, value: any) => { conditions.push([field, value]); return index; } };
            select(index); rows = rows.filter(row => conditions.every(([field, value]) => row[field] === value)); return q;
          },
          collect: async () => structuredClone(rows), first: async () => structuredClone(rows[0] ?? null),
          unique: async () => { if (rows.length > 1) throw new Error("Ambiguous fixture index"); return structuredClone(rows[0] ?? null); },
          take: async (n: number) => structuredClone(rows.slice(0, n)),
          order: (direction: string) => { if (direction === "desc") rows.reverse(); return q; },
          filter: (select: (predicate: any) => (row: Row) => boolean) => {
            const predicate = select({ field: (name: string) => (row: Row) => row[name],
              eq: (left: (row: Row) => unknown, right: unknown) => (row: Row) => left(row) === right });
            rows = rows.filter(predicate); return q;
          },
        }; return q;
      },
    },
    scheduler: { runAfter: vi.fn(async () => undefined), runAt: vi.fn(async () => undefined) },
  };
  const invoke = async (fn: unknown, args: unknown) => {
    const before = structuredClone(tables), mark = writes.length, beforeSequence = sequence;
    try { return await handler(fn)(ctx, args); }
    catch (error) { for (const key of Object.keys(tables)) delete tables[key]; Object.assign(tables, before); writes.length = mark; sequence = beforeSequence; throw error; }
  };
  return { ctx, tables, find, writes, invoke };
}

export type Fixture = ReturnType<typeof context>;

export function installManifest(f: Fixture) {
  const dataset = f.tables.evalDatasets[0], items = f.tables.evalDatasetItems;
  const definition = replaySnapshot({ schema: "factory-replay/v1", projectId: "project", experimentId: "experiment",
    datasetId: dataset._id, datasetVersion: dataset.version, datasetSnapshot: dataset, datasetItems: items,
    datasetDigest: replayDigest({ dataset, items }), minimumPairs: items.length, maxAttemptsPerCase: 2,
    evaluators: f.tables.evalDefinitions.map(definition => ({ id: definition._id, definition, digest: replayDigest(definition), ...replayEvaluatorIdentity(definition as any) })),
    variants: f.tables.experimentVariants.map(row => ({ id: row._id, name: row.name,
      factoryDefinitionVersionId: row.factoryDefinitionVersionId, configurationDigest: f.find(row.factoryDefinitionVersionId)!.configurationDigest,
      tuple: { admittedAt: NOW - 1, factoryDefinitionVersionId: row.factoryDefinitionVersionId } })),
    cases: items.map(item => { const source = f.find(item.sourceWorkOrderId)!, snapshot = snapshotReplayWorkload(source as any);
      return { key: item._id, datasetItemId: item._id, sourceWorkOrderId: source._id, input: item.input,
        expectedOutcome: item.expectedOutcome, workload: snapshot, workloadDigest: replayDigest(snapshot) }; }),
  });
  const manifest = { _id: "manifest", projectId: "project", experimentId: "experiment", definition,
    digest: replayDigest(definition), createdAt: NOW - 100, createdBy: "operator" };
  f.tables.factoryReplayManifests = [manifest];
  f.tables.experiments[0].metadata.factoryReplayManifestId = manifest._id;
  return manifest;
}

export function installCase(f: Fixture, variant = "baseline", caseKey = "item-0") {
  const manifest = f.tables.factoryReplayManifests[0];
  const frozen = manifest.definition.cases.find((item: any) => item.key === caseKey);
  const wo = { ...structuredClone(f.find(frozen.sourceWorkOrderId)!), _id: `work-${variant}-${caseKey}`, missionId: undefined,
    metadata: structuredClone(frozen.workload.metadata), state: "READY", currentRevisionNumber: 1 };
  f.tables.workOrders.push(wo);
  const binding = { _id: `case-${variant}-${caseKey}`, projectId: "project", manifestId: manifest._id,
    variantId: `variant-${variant}`, caseKey, workOrderId: wo._id, workOrderRevision: 1, boundAt: NOW - 90, boundBy: "operator" };
  (f.tables.factoryReplayCases ??= []).push(binding);
  if (wo.requiredApprovals.length) (f.tables.approvalDecisions ??= []).push({ _id: `approval-${binding._id}`,
    workOrderId: wo._id, projectId: "project", approvalType: "RISK_REVIEW", status: "APPROVED", createdAt: NOW - 90, expiresAt: NOW + 50_000 });
  return { binding, wo };
}

export function installEvidence(f: Fixture, binding: Row, { score = 1, cost = 1, owner = 0, assistant = 0 } = {}) {
  const manifest = f.tables.factoryReplayManifests[0], wo = f.find(binding.workOrderId)!;
  const variant = manifest.definition.variants.find((item: any) => item.id === binding.variantId);
  const sourceId = `source-${binding._id}`, verifierId = `verifier-${binding._id}`;
  const subject = createPrepublicationGitVerificationSubject({ version: 2, kind: "GIT_CANDIDATE",
    workOrderId: wo._id, workOrderRevisionNumber: 1, verificationContractDigest: wo.verificationContractDigest,
    sourceAttemptId: sourceId, repositoryId: "repository", provider: "GITHUB", providerRepositoryId: "provider-repo",
    baseSha: BASE, candidateSha: CANDIDATE, treeSha: "c".repeat(40), baseRef: "main", headRef: "candidate",
    rawDiffSha256: `sha256:${"4".repeat(64)}` });
  const tuple = { projectId: "project", workOrderId: wo._id, workOrderRevisionNumber: 1,
    verificationContractDigest: wo.verificationContractDigest, sourceAttemptId: sourceId,
    verificationSubjectId: subject.subjectId, verificationSubjectDigest: subject.digest,
    sourceRevision: BASE, candidateRevision: CANDIDATE };
  const plan = { verificationPlanId: `plan-${binding._id}`, verificationPlanDigest: `sha256:${"e".repeat(64)}` };
  const native = (id: string) => {
    const executionManifest = { version: "factory-execution-manifest/v3", causation: { workflowRunId: id }, repository: { baseSha: BASE } };
    return { executorInvocationId: `invocation-${id}`, executorAdapter: "codex", executorVersion: "v1", executionManifest,
      executionManifestDigest: replayDigest(executionManifest), executionCostAuthorization: { actualCost: { status: "MEASURED", usd: cost } }, humanInterventions: 0 };
  };
  const source = { _id: sourceId, ...tuple, ...native(sourceId), repositoryId: "repository", attemptPurpose: "IMPLEMENTATION", qualityContractDigest: QUALITY,
    factoryDefinitionVersionId: variant.factoryDefinitionVersionId, factoryConfigurationDigest: variant.configurationDigest,
    status: "PAUSED", startedAt: NOW - 1000, candidateReadyAt: NOW - 500, executionBaseSha: BASE,
    headSha: CANDIDATE, treeSha: "c".repeat(40), verificationSubject: subject,
    context: { factoryReplay: { manifestDigest: manifest.digest, caseId: binding._id } } };
  const verifier = { _id: verifierId, ...tuple, ...native(verifierId), attemptPurpose: "VERIFICATION", factoryPurpose: "VERIFICATION",
    qualityContractDigest: QUALITY, status: "COMPLETED", startedAt: NOW - 400, completedAt: NOW - 200,
    verificationAttemptBinding: { ...tuple, verificationSubject: subject } };
  const result = { _id: `result-${binding._id}`, ...tuple, ...plan, workflowRunId: verifierId, status: "COMPLETED", verdict: "VERIFIED",
    independenceValid: true, decisionInputDigest: `sha256:${"f".repeat(64)}`, createdAt: NOW - 400, completedAt: NOW - 200 };
  const envelope = { _id: `evidence-${binding._id}`, ...tuple, ...plan, workflowRunId: verifierId, verificationAttemptId: verifierId,
    verificationRunId: result._id, provenance: "LIVE", producer: { independent: true, attemptId: verifierId },
    checkId: "check", result: "PASS", recordedAt: NOW - 250 };
  const receipt = { _id: `receipt-${binding._id}`, ...tuple, ...plan, workflowRunId: verifierId, verificationAttemptId: verifierId,
    verificationRunId: result._id, receiptScope: "WORK_ORDER", status: "PASSED", verdict: "VERIFIED", independenceValid: true,
    decisionInputDigest: result.decisionInputDigest, evidenceEnvelopeIds: [envelope._id], checks: [{ checkId: "check", status: "PASS" }],
    recordedAt: NOW - 100, validUntil: NOW + 10_000 };
  const evaluation = { _id: `score-${binding._id}`, projectId: "project", workflowRunId: sourceId, evalDefinitionId: "evaluator",
    scoreType: "NUMERIC", value: score, evaluator: { type: "HUMAN", version: "v1" }, createdAt: NOW - 50, createdBy: "operator" };
  for (const [table, rows] of Object.entries({ workflowRuns: [source, verifier], verificationRuns: [result],
    verificationReceipts: [receipt], evidenceEnvelopes: [envelope], evalScores: [evaluation] })) (f.tables[table] ??= []).push(...rows);
  wo.currentExecutionRunId = sourceId;
  const report = { _id: `report-${binding._id}`, projectId: "project", caseId: binding._id,
    attemptSetDigest: replayAttemptSetDigest([source, verifier] as any), ownerCount: owner, assistantOutsideFactoryCount: assistant,
    evidenceRefs: ["controlled fixture report"], recordedBy: "operator", recordedAt: NOW - 25 };
  (f.tables.factoryReplayInterventionReports ??= []).push(report);
  return { source, verifier, result, envelope, receipt, evaluation, report };
}
