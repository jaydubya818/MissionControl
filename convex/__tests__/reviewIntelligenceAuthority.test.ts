import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decideCandidate } from "../reviewIntelligence";
import { resolveFlag } from "../lib/flags";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

describe("Review Intelligence negative authority and access contract", () => {
  it("keeps the optional residual reviewer default-off", () => {
    expect(resolveFlag([], "review-intelligence.residual-ai", "project-1")).toMatchObject({
      enabled: false,
      source: "default",
    });
  });

  it("cannot manufacture verification, publication, merge, or acceptance", () => {
    const reviewSource = source("convex/reviewIntelligence.ts");
    const serviceSource = source("convex/serviceCommands.ts");
    for (const forbidden of [
      'insert("verificationReceipts"', 'insert("verificationRuns"',
      'insert("evidenceEnvelopes"', 'insert("qualityGateDecisions"',
      "internal.workOrders.accept", "api.workOrders.accept", "publishCandidate", "mergePullRequest",
    ]) {
      expect(reviewSource, `review source contains forbidden authority ${forbidden}`).not.toContain(forbidden);
    }
    expect(serviceSource).not.toMatch(/recordReviewDecisionCandidate[\s\S]{0,2500}workOrders\.accept/);
    expect(serviceSource).not.toMatch(/recordResidualReviewAnalysis[\s\S]{0,2500}workOrders\.accept/);
    expect(reviewSource).toContain("COMPANY_PERMISSIONS.APPROVE_DELIVERY");
    expect(reviewSource).toContain("exact-current deterministic VERIFIED evidence");
    expect(reviewSource).toContain("distinct from the execution worker");
  });

  it("fails candidate acceptance closed for an anonymous cross-workspace caller", async () => {
    const originalDemo = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const candidate = {
      _id: "decision-1", projectId: "project-a", repositoryId: "repo-a",
      workOrderId: "wo-a", workflowRunId: "run-a", workOrderRevisionNumber: 1,
      candidateRevision: "head-a", status: "PROPOSED",
    };
    const records: Record<string, any> = {
      "decision-1": candidate,
      "wo-a": { _id: "wo-a", tenantId: "tenant-a", projectId: "project-a", repositoryId: "repo-a", currentRevisionNumber: 1 },
      "run-a": { _id: "run-a", workOrderId: "wo-a", workOrderRevisionNumber: 1, headSha: "head-a" },
      "project-a": { _id: "project-a", tenantId: "tenant-a" },
    };
    const ctx = {
      auth: { getUserIdentity: async () => null },
      db: {
        get: async (id: string) => records[id] ?? null,
        // The gate reads `featureFlags` by the `by_key` index and `operators`
        // by `by_active` (deployment provisioning is now part of resolving the
        // authorization mode — see lib/authorizationRollout.ts), so the double
        // has to answer both, and answer them through `withIndex`.
        query: (table: string) => {
          const rows =
            table === "featureFlags"
              ? [{ key: "control-plane.team-authorization", enabled: true, projectId: "project-a" }]
              : table === "operators"
                ? [{ _id: "operator-a", active: true }]
                : (() => {
                    throw new Error(`Unexpected query ${table}`);
                  })();
          const cursor = {
            withIndex: () => cursor,
            collect: async () => rows,
            first: async () => rows[0] ?? null,
          };
          return cursor;
        },
      },
    } as any;
    try {
      await expect(functionHandler(decideCandidate)(ctx, {
        decisionCandidateId: "decision-1", status: "ACCEPTED_FOR_REVISION", reason: "Approve",
      })).rejects.toThrow(/unavailable or unauthorized/);
    } finally {
      if (originalDemo === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemo;
    }
  });

  it("keeps Decision Candidate acceptance separate from governed revision creation", () => {
    const reviewSource = source("convex/reviewIntelligence.ts");
    const decisionBlock = reviewSource.slice(
      reviewSource.indexOf("export const decideCandidate"),
      reviewSource.indexOf("export const linkGovernedRevision"),
    );
    expect(decisionBlock).toContain("ACCEPTED_FOR_REVISION");
    expect(decisionBlock).not.toContain('insert("missionSpecRevisions"');
    expect(decisionBlock).not.toContain('insert("missionPlans"');
    expect(decisionBlock).not.toContain('insert("workOrderRevisions"');
    const linkBlock = reviewSource.slice(reviewSource.indexOf("export const linkGovernedRevision"), reviewSource.indexOf("export const recordReviewJudgment"));
    expect(linkBlock).toContain("record.revisionNumber > original.revisionNumber");
    expect(linkBlock).toContain("record.revisionNumber > candidate.workOrderRevisionNumber");
    expect(linkBlock).toContain("record.createdAt >= acceptedAt");
  });

  it("lets only the already-signed service boundary bypass human delivery authorization", () => {
    const reviewSource = source("convex/reviewIntelligence.ts");
    for (const exportName of ["recordAgentDecisionCandidate", "recordResidualAnalysis"]) {
      const start = reviewSource.indexOf(`export const ${exportName}`);
      const end = reviewSource.indexOf("\nexport const ", start + 1);
      const block = reviewSource.slice(start, end === -1 ? undefined : end);
      expect(block).toContain("loadReviewSubject");
      expect(block).not.toContain("requireReviewSubject");
    }
  });
});
