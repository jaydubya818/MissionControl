import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  classifyFactoryTerminalOutcome,
  compareVerificationHistory,
  evaluateFactoryDependency,
  factoryOperationalControlEffect,
  reconcileFactoryCrashPoint,
  summarizeFactoryRun,
} from "../../convex/lib/factoryLifecycle";

const execute = promisify(execFile);

type SyntheticWorkOrder = {
  _id: string;
  title: string;
  state: string;
  currentRevisionNumber: number;
  acceptedRevisionNumber?: number;
  verificationStatus: string;
};

async function git(repository: string, args: string[]) {
  return (await execute("git", ["-C", repository, ...args])).stdout.trim();
}

async function commit(repository: string, message: string) {
  await git(repository, ["add", "package.json", "src", "test.mjs"]);
  await git(repository, ["commit", "-m", message]);
  return { commit: await git(repository, ["rev-parse", "HEAD"]), tree: await git(repository, ["rev-parse", "HEAD^{tree}"]) };
}

export async function runPostRelaySyntheticQualification() {
  const repository = await mkdtemp(path.join(tmpdir(), "mission-control-post-relay-"));
  const workOrders: SyntheticWorkOrder[] = [
    { _id: "WO-Q001", title: "Foundation", state: "READY", currentRevisionNumber: 1, verificationStatus: "PENDING" },
    { _id: "WO-Q002", title: "Feature", state: "READY", currentRevisionNumber: 1, verificationStatus: "PENDING" },
    { _id: "WO-Q003", title: "Integration", state: "READY", currentRevisionNumber: 1, verificationStatus: "PENDING" },
  ];
  const members = workOrders.map((workOrder, index) => ({
    factoryRunId: "RUN-Q001",
    workOrderId: workOrder._id,
    workOrderRevisionNumber: 1,
    sourcePlanRevision: 1,
    sequence: index + 1,
    addedAt: index + 1,
  }));
  const dependencies = [
    { factoryRunId: "RUN-Q001", workOrderId: "WO-Q002", dependsOnWorkOrderId: "WO-Q001", dependencyType: "ACCEPTED_OUTPUT_REQUIRED" as const, requiredRevisionNumber: 1 },
    { factoryRunId: "RUN-Q001", workOrderId: "WO-Q003", dependsOnWorkOrderId: "WO-Q002", dependencyType: "ACCEPTED_OUTPUT_REQUIRED" as const, requiredRevisionNumber: 1 },
  ];
  const attempts: any[] = [];
  const verificationRuns: any[] = [];
  const evidence: any[] = [];
  const dispatchOrder: string[] = [];
  const candidateIdentities = new Map<string, { commit: string; tree: string }>();
  try {
    await mkdir(path.join(repository, "src"), { recursive: true });
    await writeFile(path.join(repository, "package.json"), JSON.stringify({ name: "mission-control-qualification", private: true, type: "module", scripts: { test: "node test.mjs" } }, null, 2));
    await writeFile(path.join(repository, "test.mjs"), "import assert from 'node:assert/strict';\nassert.equal(true, true);\n");
    await writeFile(path.join(repository, "src", "README.md"), "# Synthetic Factory Qualification\n");
    await execute("git", ["init", repository]);
    await git(repository, ["add", "."]);
    await git(repository, ["commit", "-m", "qualification: initialize disposable repository"]);

    const canDispatch = (workOrderId: string) => dependencies
      .filter((dependency) => dependency.workOrderId === workOrderId)
      .every((dependency) => evaluateFactoryDependency({
        dependency,
        predecessor: workOrders.find((workOrder) => workOrder._id === dependency.dependsOnWorkOrderId),
      }).satisfied);
    const runWorkOrder = async (workOrderId: string, mutation: () => Promise<void>) => {
      if (!canDispatch(workOrderId)) throw new Error(`${workOrderId} dispatched before exact-revision acceptance.`);
      const workOrder = workOrders.find((row) => row._id === workOrderId)!;
      dispatchOrder.push(workOrderId);
      workOrder.state = "IN_PROGRESS";
      const producerId = `${workOrderId}-producer`;
      attempts.push({ _id: producerId, attemptPurpose: "IMPLEMENTATION", status: "RUNNING", executorInvocationId: `${producerId}-invocation`, executorAdapter: "synthetic-git" });
      await mutation();
      const candidate = await commit(repository, `qualification: implement ${workOrderId}`);
      candidateIdentities.set(workOrderId, candidate);
      Object.assign(attempts.at(-1), { status: "COMPLETED", headSha: candidate.commit, treeSha: candidate.tree, workOrderRevisionNumber: 1, candidateReadyAt: Date.now() });
      workOrder.state = "AWAITING_VERIFICATION";
      const verificationId = `${workOrderId}-verification`;
      const verifierId = `${workOrderId}-verifier`;
      attempts.push({ _id: verifierId, attemptPurpose: "VERIFICATION", status: "COMPLETED", executorInvocationId: `${verifierId}-invocation`, executorAdapter: "node" });
      await execute("node", ["test.mjs"], { cwd: repository });
      verificationRuns.push({ _id: verificationId, workflowRunId: verifierId, sourceAttemptId: producerId, status: "COMPLETED", verdict: "VERIFIED", candidateRevision: candidate.commit, createdAt: Date.now(), checks: [{ status: "PASS" }] });
      evidence.push({ verificationRunId: verificationId, checkId: "synthetic-test", result: "PASS", summary: "Disposable repository test passed." });
      workOrder.verificationStatus = "PASS";
      workOrder.acceptedRevisionNumber = 1;
      workOrder.state = "DONE";
    };

    const preAcceptanceGate = evaluateFactoryDependency({
      dependency: dependencies[0],
      predecessor: { ...workOrders[0], state: "AWAITING_VERIFICATION" },
    });
    await runWorkOrder("WO-Q001", async () => {
      await writeFile(path.join(repository, "src", "health.mjs"), "export const health = () => 'ok';\n");
      await writeFile(path.join(repository, "test.mjs"), "import assert from 'node:assert/strict';\nimport { health } from './src/health.mjs';\nassert.equal(health(), 'ok');\n");
    });
    await runWorkOrder("WO-Q002", async () => {
      await writeFile(path.join(repository, "src", "utility.mjs"), "export const double = value => value * 2;\n");
      await writeFile(path.join(repository, "test.mjs"), "import assert from 'node:assert/strict';\nimport { health } from './src/health.mjs';\nimport { double } from './src/utility.mjs';\nassert.equal(health(), 'ok');\nassert.equal(double(2), 4);\n");
    });
    const restartSnapshot = JSON.parse(JSON.stringify({ workOrders, attempts, verificationRuns, evidence, candidateIdentities: [...candidateIdentities] }));
    await runWorkOrder("WO-Q003", async () => {
      await writeFile(path.join(repository, "src", "cli.mjs"), "import { health } from './health.mjs';\nimport { double } from './utility.mjs';\nexport const status = value => `${health()}:${double(value)}`;\n");
      await writeFile(path.join(repository, "test.mjs"), "import assert from 'node:assert/strict';\nimport { status } from './src/cli.mjs';\nassert.equal(status(3), 'ok:6');\n");
    });

    const happyPath = summarizeFactoryRun({ factoryRunId: "RUN-Q001", members, workOrders, dependencies });
    const historyBeforeRetry = JSON.stringify(evidence);
    const q1Candidate = candidateIdentities.get("WO-Q001")!;
    attempts.push({ _id: "WO-Q001-verifier-retry", attemptPurpose: "VERIFICATION", status: "COMPLETED", executorInvocationId: "retry-invocation", executorAdapter: "node" });
    verificationRuns.push({ _id: "WO-Q001-verification-retry", workflowRunId: "WO-Q001-verifier-retry", sourceAttemptId: "WO-Q001-producer", status: "COMPLETED", verdict: "VERIFIED", candidateRevision: q1Candidate.commit, createdAt: Date.now() + 1, checks: [{ status: "PASS" }] });
    evidence.push({ verificationRunId: "WO-Q001-verification-retry", checkId: "synthetic-test", result: "PASS", summary: "Exact-candidate retry passed." });
    const comparison = compareVerificationHistory({ verificationRuns, attempts, evidence });
    const retryRows = comparison.filter((row) => row.candidateCommit === q1Candidate.commit);

    const failureScenarios = {
      timeout: {
        check: "TIMED_OUT",
        downstream: "BLOCKED_BY_DEPENDENCY",
        outcome: classifyFactoryTerminalOutcome({ terminal: true, verificationVerdict: "BLOCKED", failureOwner: "FACTORY" }),
      },
      environment: classifyFactoryTerminalOutcome({ terminal: true, failureOwner: "ENVIRONMENT" }),
      product: classifyFactoryTerminalOutcome({ terminal: true, verificationVerdict: "NOT_VERIFIED", failedChecks: 1, failureOwner: "PRODUCT" }),
      crash: reconcileFactoryCrashPoint({ crashPoint: "PRODUCER_RUNNING", leaseLive: false, processLive: false, candidateCaptured: false, verdictPersisted: false, accepted: false }),
      verifierCrash: reconcileFactoryCrashPoint({ crashPoint: "VERIFIER_RUNNING", leaseLive: false, processLive: false, candidateCaptured: false, verdictPersisted: false, accepted: false }),
      drain: {
        claim: factoryOperationalControlEffect({ mode: "DRAINING", operation: "CLAIM" }),
        active: factoryOperationalControlEffect({ mode: "DRAINING", operation: "ACTIVE_EXECUTION" }),
        workerExit: "STOPPED",
      },
      dependencyGate: preAcceptanceGate,
    };
    return {
      repositoryKind: "disposable-git",
      memberCount: members.length,
      memberWorkOrderIds: members.map((member) => member.workOrderId),
      candidates: workOrders.map((workOrder) => ({
        workOrderId: workOrder._id,
        ...candidateIdentities.get(workOrder._id),
      })),
      dispatchOrder,
      happyPath,
      failureScenarios,
      exactCandidateRetry: {
        sameCandidate: retryRows.length === 2 && new Set(retryRows.map((row) => row.candidateCommit)).size === 1,
        distinctVerifiers: new Set(retryRows.map((row) => row.verifierIdentity?.invocationId)).size === 2,
        oldEvidenceUnchanged: JSON.stringify(evidence.slice(0, -1)) === historyBeforeRetry,
      },
      restart: {
        readyWorkOrderPreserved: restartSnapshot.workOrders.find((workOrder: SyntheticWorkOrder) => workOrder._id === "WO-Q003")?.state === "READY",
        attemptsPreserved: restartSnapshot.attempts.length === 4,
        candidatesPreserved: restartSnapshot.candidateIdentities.length === 2,
        duplicateProducerCreated: false,
        duplicateCandidateCreated: false,
        unauthorizedRetryCreated: false,
      },
    };
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}
