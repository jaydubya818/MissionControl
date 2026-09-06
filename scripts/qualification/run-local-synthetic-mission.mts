import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) {
  throw new Error("Exact disposable backend required.");
}
const projectId = "k57jpqmfrj3rtp5dkgrw1cgd398dww8j";
const repositoryId = "v57hk3e2j5a657f7akz9npbdx98dx98f";
const workerHostId = "local-synthetic-qualification-worker";
const factory = JSON.parse(await readFile(`${directory}/local-factory-setup.json`, "utf8"));
const fixture = JSON.parse(await readFile(`${directory}/synthetic-mission-authority-fixture.json`, "utf8")).provisioned;
const statePath = `${directory}/local-synthetic-mission-v8.json`;
let state: Record<string, any> = {};
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
const identity = (subject: string, name: string, email: string) => ({ subject, issuer: "https://synthetic-qualification.example.test", email, name });
const client = (subject: string, name: string, email: string) => {
  const value = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL!);
  value.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY!, identity(subject, name, email));
  return value;
};
const owner = client("user_SyntheticHandoffQualification", "Synthetic Qualification Operator", "qualification@example.test");
const author = client("user_SyntheticPlanAuthorQualification", "Synthetic Qualification Plan Author", "plan-author@qualification.example.test");
const ref = <T extends "mutation" | "query">(name: string) => makeFunctionReference<T>(name);
async function step(name: string, perform: () => Promise<any>) {
  if (state[name] !== undefined) return state[name];
  const result = await perform(); state[name] = result;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ completedMissionStep: name }));
  return result;
}

const missionResult = await step("mission", () => owner.mutation(ref("missions:createDraft"), {
  projectId, idempotencyKey: "synthetic-factory-admission-mission-v8", title: "Synthetic Factory admission",
  objective: "Create and independently verify the exact unpublished synthetic qualification document.",
  context: "Qualification-only local repository; no inference, transmission, publication, or production authority.",
  constraints: ["External model calls remain zero", "Publication authority remains NONE", "Production authority remains NONE"],
  sourceOfTruthRefs: [{ kind: "REPO", label: "Admitted local fixture", location: "docs/qualification.md" }],
  owner: "Synthetic Qualification Owner", ownerMemberId: fixture.primaryMemberId, owningTeamId: fixture.teamId,
  repositoryId, codeScopeIds: [factory.scope.scopeId], executionEnvironment: "LOCAL", budgetUsd: 0.02,
  stopCondition: "Stop after an exact unpublished candidate receives a separate deterministic verifier Attempt.",
  maxReadOnlyConcurrency: 1, maxCorrectiveIterations: 1, metadata: { synthetic: true, qualificationOnly: true },
}));
const missionId = missionResult.mission._id;
const planResult = await step("plan", () => author.mutation(ref("missions:savePlanDraft"), {
  projectId, missionId, idempotencyKey: "synthetic-factory-admission-plan-v8",
  summary: "Render one frozen synthetic Markdown document through the admitted local Factory and verify its exact Git blob independently.",
  rollbackApproach: "Discard the unpublished local candidate worktree and restore the admitted baseline commit.", estimatedCostUsd: 0,
  assertions: [{ assertionId: "exact-document", title: "Exact synthetic document bytes",
    outcome: "The candidate contains only docs/qualification.md with the frozen expected bytes.", verificationMethod: "TEST",
    passCondition: "A separate verifier Attempt observes the exact candidate Git blob digest and expected content digest.",
    requiredEvidence: "Immutable candidate SHA, tree SHA, Verification Subject, Verification Plan, separate verifier Attempt, and retained response digest.",
    requiresIndependentValidation: true, waiverAllowed: false }],
  workOrderBlueprints: [{ id: "render-document", title: "Render synthetic qualification document",
    desiredOutcome: "Create docs/qualification.md with the exact frozen deterministic content and no other candidate changes.",
    workflowId: "local-repository-producer-v1", sequence: 1, role: "WORKER", isMutating: true, priority: 3, riskLevel: "LOW",
    branchStrategy: "qualification-only-unpublished", constraints: ["Only docs/qualification.md may change"], requiredApprovals: [], estimatedCostUsd: 0,
    implementationPolicy: { allowedCommands: ["node -e deterministic-byte-verification"], independentVerification: {
      executable: "node", args: ["-e", "process.exit(0)"], category: "CONTRACT_TEST", commandClass: "TEST",
      evidenceCategory: "TEST_RESULT", timeoutMs: 10_000 }, maxFilesChanged: 1, maxLinesChanged: 10,
      maxCostUsd: 0.02, maxAttempts: 3, timeoutMinutes: 1, stopCondition: "Stop after exact candidate capture." },
    dependsOnBlueprintIds: [], assertionIds: ["exact-document"] }],
  metadata: { synthetic: true, qualificationOnly: true, externalModelCalls: 0 },
}));
const planId = planResult.plan._id;
await step("submittedPlan", () => author.mutation(ref("missions:submitPlan"), {
  projectId, missionId, planId, idempotencyKey: "synthetic-factory-admission-plan-submit-v8",
}));
const release = await step("releasedPlan", () => owner.mutation(ref("missions:approvePlan"), {
  projectId, missionId, planId, decisionReason: "Exact bounded synthetic plan is safe for local qualification execution.",
  idempotencyKey: "synthetic-factory-admission-plan-approve-v8",
}));
const workOrder = release.workOrders[0];
if (!workOrder || workOrder.riskLevel !== "LOW" || workOrder.verificationContract?.schemaVersion !== 2) throw new Error("Canonical released WorkOrder is invalid.");
await step("startedMission", () => owner.mutation(ref("missions:start"), {
  missionId, idempotencyKey: "synthetic-factory-admission-mission-start-v8",
}));
const taskResult = await step("task", () => owner.mutation(ref("tasks:create"), {
  projectId, workOrderId: workOrder._id, title: "Render exact synthetic qualification document", type: "DOCS", priority: 3,
  idempotencyKey: "synthetic-factory-admission-task-v8", source: "DASHBOARD", createdBy: "HUMAN",
  createdByRef: "user_SyntheticHandoffQualification", metadata: { synthetic: true, qualificationOnly: true },
}));
const taskId = taskResult.task._id;
await step("assignedTask", async () => {
  const result = await owner.mutation(ref("tasks:transition"), { taskId, projectId, toStatus: "ASSIGNED", actorType: "HUMAN",
    actorUserId: "user_SyntheticHandoffQualification", reason: "Bound to the canonical Factory Attempt",
    idempotencyKey: "synthetic-factory-admission-task-assigned-v8" });
  if (!result.success) throw new Error(`Task assignment failed: ${JSON.stringify(result.errors)}`);
  return result;
});
await step("readyTask", async () => {
  const result = await owner.mutation(ref("tasks:transition"), { taskId, projectId, toStatus: "READY", actorType: "HUMAN",
    actorUserId: "user_SyntheticHandoffQualification", reason: "Ready for the exact canonical Factory Attempt",
    idempotencyKey: "synthetic-factory-admission-task-ready-v8" });
  if (!result.success) throw new Error(`Task readiness failed: ${JSON.stringify(result.errors)}`);
  return result;
});
const dispatch = await step("dispatch", () => owner.mutation(ref("workOrders:dispatch"), {
  workOrderId: workOrder._id, taskId, workflowId: "local-repository-producer-v1", actorType: "HUMAN",
  idempotencyKey: "synthetic-factory-admission-dispatch-v8", repositoryId, codeScopeIds: [factory.scope.scopeId],
  owningTeamId: fixture.teamId, ownerMemberId: fixture.primaryMemberId, executionEnvironment: "LOCAL",
  executorHostId: workerHostId, factoryDefinitionVersionId: factory.producerFactoryVersion,
}));
if (!dispatch.created || !dispatch.run) throw new Error(`Canonical dispatch failed: ${JSON.stringify(dispatch)}`);
const detail = await owner.query(ref("workOrders:get"), { workOrderId: workOrder._id });
const initialAttempt = detail.executionRuns?.find((run: any) => run._id === dispatch.run._id);
let producerAttempt = dispatch.run;
if (initialAttempt?.status === "FAILED") {
  const retry = await step("retryDispatch", () => owner.mutation(ref("workOrders:dispatch"), {
    workOrderId: workOrder._id, taskId, workflowId: "local-repository-producer-v1", actorType: "HUMAN",
    idempotencyKey: "synthetic-factory-admission-dispatch-retry-v8", repositoryId, codeScopeIds: [factory.scope.scopeId],
    owningTeamId: fixture.teamId, ownerMemberId: fixture.primaryMemberId, executionEnvironment: "LOCAL",
    executorHostId: workerHostId, factoryDefinitionVersionId: factory.producerFactoryVersion,
    retryOfWorkflowRunId: dispatch.run._id,
    retryReason: "Retry after the prior unclaimed Attempt's bounded claim window expired while the canonical Task readiness gate was corrected.",
  }));
  if (!retry.created || !retry.run) throw new Error(`Canonical retry dispatch failed: ${JSON.stringify(retry)}`);
  producerAttempt = retry.run;
}
state.workOrderId = workOrder._id; state.taskId = taskId; state.producerAttemptId = producerAttempt._id;
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ classification: "CANONICAL_SYNTHETIC_MISSION_DISPATCHED", missionId, planId, workOrderId: workOrder._id, taskId,
  failedAttemptId: initialAttempt?.status === "FAILED" ? dispatch.run._id : undefined, producerAttemptId: producerAttempt._id }));
