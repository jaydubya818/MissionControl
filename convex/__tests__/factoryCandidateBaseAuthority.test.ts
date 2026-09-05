import { describe, expect, it } from "vitest";
import { reportInternal } from "../factory/attempts";

const BASE = "a".repeat(40);
const INTERMEDIATE = "b".repeat(40);
const CANDIDATE = "c".repeat(40);
const TREE = "d".repeat(40);

type Row = Record<string, any>;

/** Transactional fixture: exercise the actual mutation, without a deployed service. */
function fixture() {
  const now = Date.now();
  let sequence = 1;
  let tables: Record<string, Row[]> = {
    workflowRuns: [{
      _id: "attempt-1", runId: "run-1", tenantId: "tenant-1", projectId: "project-1",
      repositoryId: "repository-1", workOrderId: "work-order-1", workOrderRevisionNumber: 1,
      status: "RUNNING", attemptPurpose: "IMPLEMENTATION", factoryPurpose: "SOFTWARE",
      isMutating: true, branch: "mc/candidate", steps: [], currentStepIndex: 0,
      startedAt: now - 1_000, hostBindingId: "host-binding-1",
      qualityContractDigest: `sha256:${"e".repeat(64)}`,
      verificationContractDigest: `sha256:${"f".repeat(64)}`,
      executionManifestDigest: `sha256:${"1".repeat(64)}`,
      executionManifest: {
        version: "factory-execution-manifest/v1",
        repository: { baseSha: BASE },
        workOrderSpecification: { verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" } },
      },
      lease: {
        leaseId: "lease-1", ownerId: "service-1", workerId: "worker-1",
        workerSessionId: "session-1", workerGeneration: 1,
        claimedAt: now, heartbeatAt: now, expiresAt: now + 120_000,
      },
    }],
    workOrders: [{
      _id: "work-order-1", tenantId: "tenant-1", projectId: "project-1", repositoryId: "repository-1",
      currentRevisionNumber: 1, currentExecutionRunId: "attempt-1",
      qualityContractDigest: `sha256:${"e".repeat(64)}`,
      verificationContractDigest: `sha256:${"f".repeat(64)}`,
      verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" },
    }],
    workspaceRepositories: [{
      _id: "repository-1", projectId: "project-1", repository: "qualification/repo",
      providerRepositoryId: "provider-repository-1", defaultBranch: "main", status: "READY",
    }],
    githubAppInstallations: [{
      _id: "installation-row-1", repositoryId: "repository-1", projectId: "project-1",
      installationId: "installation-1", status: "CONNECTED",
    }],
    workspaceHostBindings: [{
      _id: "host-binding-1", hostId: "worker-1", workerRuntime: { sessionId: "session-1", generation: 1 },
    }],
  };
  const find = (id: string) => Object.values(tables).flat().find(row => row._id === id);
  const db = {
    get: async (id: string) => structuredClone(find(id) ?? null),
    insert: async (table: string, value: Row) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push(structuredClone({ _id: id, _creationTime: sequence, ...value }));
      return id;
    },
    patch: async (id: string, patch: Row) => {
      const row = find(id);
      if (!row) throw new Error(`Missing fixture row ${id}`);
      Object.assign(row, structuredClone(patch));
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const query: any = {
        withIndex: (_name: string, select: (q: any) => unknown) => {
          const predicates: Array<[string, unknown]> = [];
          const index: any = { eq: (field: string, value: unknown) => { predicates.push([field, value]); return index; } };
          select(index);
          rows = rows.filter(row => predicates.every(([field, value]) => row[field] === value));
          return query;
        },
        filter: (select: (q: any) => (row: Row) => boolean) => {
          const predicate = select({
            field: (name: string) => (row: Row) => row[name],
            eq: (field: (row: Row) => unknown, value: unknown) => (row: Row) => field(row) === value,
          });
          rows = rows.filter(predicate);
          return query;
        },
        order: (direction: string) => {
          rows.sort((a, b) => (a._creationTime - b._creationTime) * (direction === "desc" ? -1 : 1));
          return query;
        },
        first: async () => structuredClone(rows[0] ?? null),
        collect: async () => structuredClone(rows),
        take: async (count: number) => structuredClone(rows.slice(0, count)),
      };
      return query;
    },
  };
  const ctx = { db, runMutation: async () => undefined };
  const handler = (reportInternal as unknown as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
  const report = async (packet: Row) => {
    const before = structuredClone(tables);
    try {
      return await handler(ctx, {
        workflowRunId: "attempt-1", leaseId: "lease-1", ownerId: "service-1",
        workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1, packet,
      });
    } catch (error) {
      tables = before;
      throw error;
    }
  };
  return { db, report };
}

function pullRequestArtifact(sourceRevision: string, idempotencyKey: string) {
  return {
    idempotencyKey, artifactType: "PULL_REQUEST", name: "Controlled qualification PR",
    externalLocation: "https://github.com/qualification/repo/pull/1",
    metadata: {
      repositoryId: "repository-1", repository: "qualification/repo", installationId: "installation-1",
      branch: "mc/candidate", sourceRevision, headSha: CANDIDATE, treeSha: TREE,
      pullRequestNumber: 1, pullRequestUrl: "https://github.com/qualification/repo/pull/1",
      providerPullRequestId: "provider-pr-1", draftAtPublication: true,
      executionManifestDigest: `sha256:${"1".repeat(64)}`,
    },
  };
}

const candidateReady = {
  candidateSha: CANDIDATE, treeSha: TREE, providerPullRequestId: "provider-pr-1",
  pullRequestNumber: 1, pullRequestUrl: "https://github.com/qualification/repo/pull/1",
  baseRef: "main", headRef: "mc/candidate", draftAtPublication: true,
};

describe("Factory candidate source authority through the real report mutation", () => {
  it("rejects a second report that tries to replace the frozen base after candidate-ready", async () => {
    const { db, report } = fixture();
    const ready = await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    expect(ready.accepted).toBe(true);
    const before = await db.get("attempt-1");
    expect(before).toMatchObject({ status: "RUNNING", executionBaseSha: BASE, headSha: CANDIDATE });
    expect(before.verificationSubject.candidateSha).toBe(CANDIDATE);

    await expect(report({
      artifacts: [pullRequestArtifact(INTERMEDIATE, "pr:second")],
      terminal: { status: "COMPLETED" },
    })).rejects.toThrow(/frozen|source.revision/i);

    const after = await db.get("attempt-1");
    expect(after).toMatchObject({ status: "RUNNING", executionBaseSha: BASE, headSha: CANDIDATE });
    expect(after.verificationSubject).toEqual(before.verificationSubject);
  });

  it("accepts a separate terminal report when its exact publication lineage still matches", async () => {
    const { db, report } = fixture();
    await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    const terminal = await report({
      artifacts: [pullRequestArtifact(BASE, "pr:second")], terminal: { status: "COMPLETED" },
    });
    expect(terminal).toMatchObject({ accepted: true, terminalStatus: "COMPLETED" });
    expect(await db.get("attempt-1")).toMatchObject({ status: "COMPLETED", executionBaseSha: BASE, headSha: CANDIDATE });
  });

  it("revalidates stored artifact lineage when an idempotency replay resolves to a conflicting historical row", async () => {
    const { db, report } = fixture();
    await report({ artifacts: [pullRequestArtifact(BASE, "pr:first")], candidateReady });
    await db.insert("runArtifacts", {
      ...pullRequestArtifact(INTERMEDIATE, "pr:historical"), workflowRunId: "attempt-1",
    });

    await expect(report({
      artifacts: [pullRequestArtifact(BASE, "pr:historical")], terminal: { status: "COMPLETED" },
    })).rejects.toThrow(/frozen|source.revision/i);
    expect(await db.get("attempt-1")).toMatchObject({ status: "RUNNING", executionBaseSha: BASE });
  });
});
