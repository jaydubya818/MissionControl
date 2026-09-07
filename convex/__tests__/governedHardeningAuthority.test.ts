import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (["node_modules", "_generated", "__tests__"].includes(entry)) continue;
    const target = path.join(directory, entry);
    if (statSync(target).isDirectory()) files.push(...walk(target));
    else if (entry.endsWith(".ts")) files.push(target);
  }
  return files;
}

describe("Governed Hardening authority invariants", () => {
  it("keeps WorkOrder acceptance human-controlled and canonical", () => {
    const convexFiles = walk(path.join(repoRoot, "convex"));
    const eventWriters = convexFiles
      .filter((file) => /eventType:\s*["']WORK_ORDER_ACCEPTED["']/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(repoRoot, file));
    expect(eventWriters).toEqual(["convex/workOrders.ts"]);

    const workOrders = read("convex/workOrders.ts");
    expect(workOrders).toContain('if (args.actorType !== "HUMAN")');
    expect(workOrders).toContain("FACTORY_PERMISSIONS.APPROVE");
    expect(workOrders).toContain("localDemoOperatorAcceptanceEnabled()");
    expect(workOrders).toContain('? "development:local-operator"');
    const companyAccess = read("convex/lib/companyAccess.ts");
    expect(companyAccess).toContain('process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT === "1"');
    expect(companyAccess).toContain('process.env.MC_ALLOW_LOCAL_OPERATOR_GOVERNED_ACCEPTANCE === "1"');

    const orchestration = read("apps/orchestration-server/src/index.ts");
    const verificationRouteStart = orchestration.indexOf("automation-verification");
    const verificationRouteEnd = orchestration.indexOf('app.post("/workorders/:workOrderId/approvals"', verificationRouteStart);
    const verificationRoute = orchestration.slice(verificationRouteStart, verificationRouteEnd);
    expect(verificationRoute).not.toContain("workOrders.accept");
    expect(verificationRoute).toContain('body.status !== "PASSED"');
    expect(verificationRoute).toContain("evidenceLocation is required");
    expect(verificationRoute).toContain("accepted: false");
    expect(orchestration).toMatch(/app\.post\("\/workorders\/:workOrderId\/accept"[\s\S]{0,300}\}, 410\)/);
  });

  it("keeps execution, review, learning, and routing below governed authority", () => {
    for (const surface of [
      "apps/orchestration-server/src/factoryAttemptWorker.ts",
      "apps/orchestration-server/src/durableCodexWorker.ts",
    ]) {
      expect(read(surface)).not.toMatch(/workOrders[:.]accept\b/);
    }
    expect(read("apps/orchestration-server/src/factoryAttemptWorker.ts")).toContain('acceptanceAuthority: "NONE"');
    expect(read("convex/reviewIntelligence.ts")).toContain("acceptanceAuthority: false");
    expect(read("convex/factory/learning.ts")).toContain("acceptanceAuthority: false");
    const routing = read("convex/lib/executionRouting.ts");
    expect(routing).toContain("resolveExecutionRoute");
    expect(routing).toContain("frozenFactoryModelRouteEligible");
    expect(routing).toContain("sandboxProfileProductionEligible");
    expect(routing).toContain("factoryWorkerEligibility");
  });

  it("derives independent verification and refuses candidate-defined authority", () => {
    const attempts = read("convex/factory/attempts.ts");
    expect(attempts).toContain("serverDerivedIndependence");
    expect(attempts).toContain("verificationAuthorityStatusFromPacket");
    expect(attempts).toContain("deriveVerificationIndependence");

    const verification = read("packages/workflow-engine/src/verification.ts");
    expect(verification).toContain("new VerificationAuthorityVerifier()");
    expect(verification).toContain('definitionAuthority !== "INDEPENDENT"');

    const commandVerifier = read("apps/orchestration-server/src/factoryVerification.ts");
    expect(commandVerifier).toContain("resolveCheckIndependence");
    expect(commandVerifier).toContain("mkdtemp");
    expect(commandVerifier).not.toMatch(/const allowed = \[[^\]]*"HOME"/);

    const validators = read("convex/lib/workOrderSpecificationValidators.ts");
    expect(validators).toContain('v.literal("INDEPENDENT_REQUIRED")');
    expect(validators).toContain("authorityPolicy: v.optional(verificationAuthorityPolicyValidator)");
  });

  it("keeps CI observation authority external and candidate-current", () => {
    const prChecks = read("convex/factory/prChecks.ts");
    expect(prChecks).toContain("evaluateCiMergeAuthority");
    expect(prChecks).toContain("ciAuthoritySatisfied: ciAuthority.satisfied");
    expect(prChecks).toContain("expectedHeadSha: workflowRun.headSha");
    expect(prChecks).toContain("expectedProviderRepositoryId: repository.providerRepositoryId");
    expect(prChecks).not.toMatch(/ciStatus:\s*row\.status\s*===\s*"COMPLETED"\s*\?\s*"PASS"/);
    expect(prChecks).not.toMatch(/ciStatus:\s*run\.status\s*===\s*"COMPLETED"\s*\?\s*"PASS"/);

    const authority = read("convex/lib/evidenceAuthority.ts");
    for (const field of ["installationId", "providerRepositoryId", "headSha", "sourceEventId"]) {
      expect(authority).toContain(field);
    }
    const evaluation = read("convex/lib/prEvaluation.ts");
    expect(evaluation).toContain("ciAuthoritySatisfied: boolean");
    expect(evaluation).not.toContain("ciAuthoritySatisfied ??");
  });

  it("supersedes every non-completing Verification Attempt", () => {
    const runs = read("convex/workflowRuns.ts");
    expect(runs).toContain("markVerificationAttemptSuperseded");
    expect(runs).toContain('markVerificationAttemptSuperseded(run, "CANCELED", now)');
    expect(runs).toContain("markVerificationAttemptSuperseded(run, args.status");
    expect(runs).toContain("verificationSupersededAt");
  });

  it("preserves failed Attempt history by creating a linked local-candidate recovery Attempt", () => {
    const attempts = read("convex/factory/attempts.ts");
    const recoveryStart = attempts.indexOf("export const recoverLocalCandidate");
    const recoveryEnd = attempts.indexOf("export const retryVerification", recoveryStart);
    const recovery = attempts.slice(recoveryStart, recoveryEnd);
    expect(recovery).toContain("failedAttempt.failureCode !== LOCAL_CANDIDATE_RECOVERY_FAILURE_CODE");
    expect(recovery).toContain('withIndex("by_run_type"');
    expect(recovery).toContain('artifactType", "CODE_DIFF"');
    expect(recovery).toContain('ctx.db.insert("workflowRuns", recoveryAttempt)');
    expect(recovery).toContain("sourceAttemptId: failedAttempt._id");
    expect(recovery).not.toContain('ctx.db.patch(failedAttempt._id, {\n      status: "PENDING"');
  });
});
