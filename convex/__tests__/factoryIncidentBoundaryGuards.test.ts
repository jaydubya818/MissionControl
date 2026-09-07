import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("Incident Command integration boundary guards", () => {
  it("gates the effective and persisted WorkOrder repository before Attempt creation", () => {
    const workOrders = source("workOrders.ts");
    const effectiveScope = workOrders.indexOf("const effectiveScope = {");
    const effectiveGate = workOrders.indexOf(
      "requireRepositoryDispatchAdmission(ctx, refreshedWorkOrder.projectId, effectiveScope.repositoryId, refreshedWorkOrder.repository)",
      effectiveScope,
    );
    const persistedGate = workOrders.indexOf(
      "requireRepositoryDispatchAdmission(ctx, refreshedWorkOrder.projectId, refreshedWorkOrder.repositoryId, refreshedWorkOrder.repository)",
      effectiveGate,
    );
    const attemptInsert = workOrders.indexOf('ctx.db.insert("workflowRuns"', persistedGate);
    expect(effectiveScope).toBeGreaterThan(-1);
    expect(effectiveGate).toBeGreaterThan(effectiveScope);
    expect(persistedGate).toBeGreaterThan(effectiveGate);
    expect(attemptInsert).toBeGreaterThan(persistedGate);
  });

  it("gates automatic Verification Attempts before their first durable write", () => {
    const attempts = source("factory/attempts.ts");
    const scheduler = attempts.indexOf("async function schedulePolicyV2VerificationAttempt");
    const gate = attempts.indexOf("requireRepositoryDispatchAdmission(ctx, workOrder.projectId, sourceAttempt.repositoryId)", scheduler);
    const insert = attempts.indexOf('ctx.db.insert("workflowRuns"', scheduler);
    expect(scheduler).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(scheduler);
    expect(insert).toBeGreaterThan(gate);
  });

  it("requires canonical receipts for repository pause before legacy evidence handling", () => {
    const incidents = source("factory/incidents.ts");
    const mandatory = incidents.indexOf('execution.controlKey === "PAUSE_REPOSITORY_DISPATCH"');
    const legacy = incidents.indexOf('receipt.kind === "EVIDENCE"', mandatory);
    expect(mandatory).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(mandatory);
  });
});
