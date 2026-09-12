import { describe, expect, it } from "vitest";
import scenarioEvidence from "../../docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json";
import {
  MISSION_CONTROL_GOLDEN_SUITE_V1,
  canonicalDigest,
  evalSuiteDigest,
} from "@mission-control/shared";
import {
  getDashboard,
  getPublicSuite,
  installGoldenSuiteV1,
  recordSuiteRun,
} from "../evalControlPlane";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function createDb(initial: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    evalSuites: [], evalSuiteCases: [], evalBaselines: [], evalControlRuns: [],
    evalCaseResults: [], evalRunReceipts: [], activities: [], ...initial,
  };
  let sequence = 1;
  const db = {
    get: async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: any) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, patch: any) => {
      const row = Object.values(tables).flat().find((item) => item._id === id);
      if (!row) throw new Error(`Missing ${id}`);
      Object.assign(row, patch);
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply: (q: any) => any) => {
          const conditions: Array<[string, unknown]> = [];
          const q: any = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return q; } };
          apply(q);
          rows = rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
          return builder;
        },
        order: (direction: string) => {
          rows.sort((left, right) => ((left.startedAt ?? left.createdAt ?? left._creationTime) - (right.startedAt ?? right.createdAt ?? right._creationTime)) * (direction === "desc" ? -1 : 1));
          return builder;
        },
        first: async () => rows[0] ?? null,
        collect: async () => [...rows],
        take: async (count: number) => rows.slice(0, count),
      };
      return builder;
    },
  };
  return { db, tables };
}

describe("eval control-plane persistence", () => {
  it("installs once, hides sealed gold, records complete receipts, and remains idempotent", async () => {
    const previousDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    try {
      const tenant = { _id: "tenant-1", active: true };
      const project = { _id: "project-1", tenantId: tenant._id, name: "Factory", slug: "factory" };
      const { db, tables } = createDb({ tenants: [tenant], projects: [project] });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      const firstInstall = await functionHandler(installGoldenSuiteV1)(ctx, { projectId: project._id });
      const secondInstall = await functionHandler(installGoldenSuiteV1)(ctx, { projectId: project._id });
      expect(firstInstall.created).toBe(true);
      expect(secondInstall).toEqual({ suiteId: firstInstall.suiteId, created: false });
      expect(tables.evalSuiteCases).toHaveLength(7);

      const publicSuite = await functionHandler(getPublicSuite)(ctx, { projectId: project._id, suiteId: firstInstall.suiteId });
      expect(publicSuite.cases).toHaveLength(7);
      expect(JSON.stringify(publicSuite)).not.toContain("sealedAssertions");
      expect(JSON.stringify(publicSuite)).not.toContain("negativeControl");

      const suiteDigest = evalSuiteDigest(MISSION_CONTROL_GOLDEN_SUITE_V1);
      const runInput = {
        projectId: project._id,
        suiteId: firstInstall.suiteId,
        runKey: "eval-run-1",
        idempotencyKey: "eval-run-1",
        runStatus: "COMPLETED",
        provenance: {
          repository: "jaydubya818/MissionControl",
          revision: "0123456789abcdef0123456789abcdef01234567",
          adapter: {
            id: "system-factory-scenario-evidence",
            version: "1.0.0",
            digest: canonicalDigest("mission-control/eval-adapter", { id: "system-factory-scenario-evidence", version: "1.0.0" }),
          },
          runtime: { name: "node", version: "20.19.0" },
          datasetDigest: suiteDigest,
          resolvedConfigDigest: canonicalDigest("mission-control/eval-config", { suiteDigest, seed: "test" }),
          seed: "test",
          artifacts: [{ path: "scenario-evidence.json", digest: canonicalDigest("mission-control/eval-artifact", scenarioEvidence) }],
        },
        outcomes: MISSION_CONTROL_GOLDEN_SUITE_V1.cases.map((testCase) => ({
          caseKey: testCase.key,
          status: "SCORED",
          actual: scenarioEvidence,
          evidenceRefs: ["scenario-evidence.json"],
        })),
        startedAt: 1_000,
        finishedAt: 2_000,
      };
      const firstRun = await functionHandler(recordSuiteRun)(ctx, runInput);
      const secondRun = await functionHandler(recordSuiteRun)(ctx, runInput);

      expect(firstRun.created).toBe(true);
      expect(firstRun.receipt).toMatchObject({ verdict: "WARN", publishable: true, releaseBlocking: false, acceptanceAuthority: false });
      expect(firstRun.receipt.metrics).toMatchObject({ blockingCases: 6, blockingPassed: 6, advisoryCases: 1, advisoryPassed: 0 });
      expect(secondRun).toMatchObject({ runId: firstRun.runId, created: false });
      expect(tables.evalControlRuns).toHaveLength(1);
      expect(tables.evalCaseResults).toHaveLength(7);
      expect(tables.evalRunReceipts).toHaveLength(1);
      expect(tables.activities.map((activity) => activity.action)).toEqual(["EVAL_SUITE_INSTALLED", "EVAL_RUN_RECORDED"]);

      const dashboard = await functionHandler(getDashboard)(ctx, { projectId: project._id });
      expect(dashboard.latestRun).toMatchObject({ verdict: "WARN", publishable: true });
      expect(dashboard.authority).toEqual({ releaseBlocking: false, acceptanceAuthority: false });
    } finally {
      if (previousDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = previousDemoFlag;
    }
  });

  it("fails reads and writes closed without workspace authorization", async () => {
    const previousDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    try {
      const tenant = { _id: "tenant-1", active: true };
      const project = { _id: "project-1", tenantId: tenant._id, name: "Factory", slug: "factory" };
      const { db } = createDb({ tenants: [tenant], projects: [project] });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      await expect(functionHandler(getDashboard)(ctx, { projectId: project._id })).rejects.toThrow(/unavailable or unauthorized/);
      await expect(functionHandler(installGoldenSuiteV1)(ctx, { projectId: project._id })).rejects.toThrow(/unavailable or unauthorized/);
    } finally {
      if (previousDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = previousDemoFlag;
    }
  });
});
