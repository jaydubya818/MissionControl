import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { computeCanonicalHash } from "./lib/genomeHash";

const CONFIRMATION = "POST_RELAY_SYNTHETIC_QUALIFICATION";
const RUN_KEY = "post-relay-hardening-qualification-v1";

type CheckStatus = "PASS" | "FAIL" | "TIMED_OUT" | "BLOCKED_BY_DEPENDENCY" | "NOT_EVALUATED" | "ERROR";

export const seedBrowserEvidence = mutation({
  args: {
    projectId: v.id("projects"),
    confirmation: v.literal(CONFIRMATION),
    candidates: v.array(v.object({ commit: v.string(), tree: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Qualification workspace not found.");
    if (args.candidates.length !== 3 || args.candidates.some((candidate) => !/^[0-9a-f]{40}$/.test(candidate.commit) || !/^[0-9a-f]{40}$/.test(candidate.tree))) {
      throw new Error("Exactly three real Git candidate commit/tree identities are required.");
    }
    const existing = await ctx.db.query("factoryRuns").withIndex("by_run_key", (q) => q.eq("runKey", RUN_KEY)).first();
    if (existing) {
      const members = await ctx.db.query("factoryRunWorkOrders").withIndex("by_run", (q) => q.eq("factoryRunId", existing._id)).collect();
      return { factoryRunId: existing._id, workOrderIds: members.sort((left, right) => left.sequence - right.sequence).map((member) => member.workOrderId), reused: true };
    }

    const now = Date.now();
    const definitions = [
      { identifier: "WO-Q001", title: "Foundation", outcome: "Create a deterministic health function." },
      { identifier: "WO-Q002", title: "Feature", outcome: "Add a deterministic utility function." },
      { identifier: "WO-Q003", title: "Integration", outcome: "Integrate the functions behind a tiny CLI." },
    ];
    const workOrderIds: Id<"workOrders">[] = [];
    for (const [index, definition] of definitions.entries()) {
      const workOrderId = await ctx.db.insert("workOrders", {
        projectId: args.projectId,
        idempotencyKey: `${RUN_KEY}:${definition.identifier}`,
        title: `${definition.identifier} — ${definition.title}`,
        kind: "SOFTWARE_CHANGE",
        desiredOutcome: definition.outcome,
        context: "Disposable post-Relay lifecycle qualification. No product workload or publication authority.",
        repository: "local-disposable/post-relay-hardening-qualification",
        priority: 2,
        riskLevel: "LOW",
        isMutating: true,
        requirements: [],
        acceptanceCriteria: [],
        dependencies: index === 0 ? [] : [definitions[index - 1].identifier],
        requiredApprovals: [],
        state: "DONE",
        verificationStatus: "PASS",
        approvalStatus: "NOT_REQUIRED",
        currentRevisionNumber: 1,
        acceptedRevisionNumber: 1,
        createdAt: now + index * 1_000,
        updatedAt: now + index * 1_000 + 900,
        metadata: { qualification: RUN_KEY, synthetic: true, dispatchSequence: index + 1 },
      });
      workOrderIds.push(workOrderId);
      for (let taskIndex = 0; taskIndex < 2; taskIndex += 1) {
        await ctx.db.insert("tasks", {
          projectId: args.projectId,
          workOrderId,
          identifier: `${definition.identifier}-T${taskIndex + 1}`,
          title: taskIndex === 0 ? `Implement ${definition.title.toLowerCase()}` : `Verify ${definition.title.toLowerCase()}`,
          description: "Synthetic, bounded qualification task.",
          type: "ENGINEERING",
          status: "DONE",
          stateEnteredAt: now + index * 1_000 + taskIndex,
          priority: 2,
          assigneeIds: [],
          reviewCycles: 0,
          actualCost: 0,
          source: "SEED",
          createdBy: "SYSTEM",
          completedAt: now + index * 1_000 + 800,
          metadata: { qualification: RUN_KEY, synthetic: true },
        });
      }
    }

    const membershipSnapshot = workOrderIds.map((workOrderId, index) => ({
      workOrderId: String(workOrderId), workOrderRevisionNumber: 1, sourcePlanRevision: 1, sequence: index + 1,
    }));
    const membershipDigest = `sha256:${computeCanonicalHash(membershipSnapshot)}`;
    const factoryRunId = await ctx.db.insert("factoryRuns", {
      projectId: args.projectId,
      sourcePlanRevision: 1,
      runKey: RUN_KEY,
      title: "Post-Relay Hardening — Disposable Qualification",
      state: "ACCEPTED",
      terminalReasonCode: "EXACT_REVISION_ACCEPTED",
      terminalSummary: "All three explicit members passed independent verification and exact-revision acceptance.",
      membershipDigest,
      createdBy: "post-relay-qualification",
      createdAt: now,
      updatedAt: now + 4_000,
      startedAt: now,
      completedAt: now + 4_000,
    });
    for (const [index, workOrderId] of workOrderIds.entries()) {
      await ctx.db.insert("factoryRunWorkOrders", {
        projectId: args.projectId,
        factoryRunId,
        workOrderId,
        workOrderRevisionNumber: 1,
        sourcePlanRevision: 1,
        sequence: index + 1,
        addedAt: now,
        addedBy: "post-relay-qualification",
        membershipDigest,
      });
    }
    for (let index = 1; index < workOrderIds.length; index += 1) {
      await ctx.db.insert("workOrderDependencies", {
        projectId: args.projectId,
        factoryRunId,
        workOrderId: workOrderIds[index],
        dependsOnWorkOrderId: workOrderIds[index - 1],
        dependencyType: "ACCEPTED_OUTPUT_REQUIRED",
        requiredRevisionNumber: 1,
        sourcePlanRevision: 1,
        createdBy: "post-relay-qualification",
        createdAt: now + index,
      });
    }

    const insertAttempt = async (input: {
      workOrderId: typeof workOrderIds[number];
      runId: string;
      purpose: "IMPLEMENTATION" | "VERIFICATION";
      status: "COMPLETED" | "FAILED";
      at: number;
      candidate?: { commit: string; tree: string };
      failureReason?: string;
    }) => ctx.db.insert("workflowRuns", {
      runId: input.runId,
      workflowId: "post-relay-synthetic-qualification",
      workflowVersion: 1,
      projectId: args.projectId,
      workOrderId: input.workOrderId,
      workOrderRevisionNumber: 1,
      factoryPurpose: input.purpose === "IMPLEMENTATION" ? "SOFTWARE" : "VERIFICATION",
      attemptPurpose: input.purpose,
      executorInvocationId: `${input.runId}-invocation`,
      executorAdapter: input.purpose === "IMPLEMENTATION" ? "synthetic-git" : "node",
      status: input.status,
      currentStepIndex: 1,
      totalSteps: 1,
      steps: [{ stepId: "qualification", status: input.status === "COMPLETED" ? "DONE" : "FAILED", retryCount: 0 }],
      context: { qualification: RUN_KEY, synthetic: true },
      initialInput: "Bounded synthetic lifecycle qualification",
      executionPhase: "TERMINAL",
      candidateReadyAt: input.candidate ? input.at + 100 : undefined,
      headSha: input.candidate?.commit,
      treeSha: input.candidate?.tree,
      failureReason: input.failureReason,
      failureClass: input.status === "FAILED" ? "RETRYABLE_INFRA" : undefined,
      failureCode: input.status === "FAILED" ? "VERIFIER_PROCESS_FAILED" : undefined,
      startedAt: input.at,
      completedAt: input.at + 100,
      metadata: { qualification: RUN_KEY, synthetic: true },
    });

    const insertVerification = async (input: {
      workOrderId: typeof workOrderIds[number];
      sourceAttemptId: Awaited<ReturnType<typeof insertAttempt>>;
      ordinal: number;
      status: "COMPLETED" | "FAILED";
      verdict: "VERIFIED" | "NOT_VERIFIED" | "BLOCKED";
      checks: Array<{ id: string; status: CheckStatus; summary: string }>;
      candidate: { commit: string; tree: string };
    }) => {
      const at = now + input.ordinal * 100;
      const verifierAttemptId = await insertAttempt({
        workOrderId: input.workOrderId,
        runId: `WO-Q-verifier-${input.ordinal}`,
        purpose: "VERIFICATION",
        status: input.status,
        at,
        failureReason: input.status === "FAILED" ? "Factory verifier process exited before producing product evidence." : undefined,
      });
      const verificationRunId = await ctx.db.insert("verificationRuns", {
        projectId: args.projectId,
        workOrderId: input.workOrderId,
        workflowRunId: verifierAttemptId,
        sourceAttemptId: input.sourceAttemptId,
        idempotencyKey: `${RUN_KEY}:verification:${input.ordinal}`,
        engineVersion: "post-relay-qualification/v1",
        workOrderRevisionNumber: 1,
        sourceRevision: "qualification-base",
        candidateRevision: input.candidate.commit,
        status: input.status,
        checks: input.checks.map((check) => ({
          checkId: check.id,
          name: check.summary,
          category: check.id === "install" ? "DEPENDENCY" : "UNIT_TEST",
          verifierId: `synthetic-verifier-${input.ordinal}`,
          mandatory: true,
          status: check.status,
          summary: check.summary,
          acceptanceCriterionIds: [],
          startedAt: at,
          completedAt: at + 50,
          durationMs: 50,
          evidenceIds: [],
          violations: check.status === "FAIL" ? ["SYNTHETIC_ASSERTION_FAILED"] : [],
        })),
        criterionCoverage: [],
        requirementsPassed: input.verdict === "VERIFIED" ? 1 : 0,
        requirementsFailed: input.checks.some((check) => check.status === "FAIL") ? 1 : 0,
        violations: input.checks.some((check) => check.status === "FAIL") ? ["SYNTHETIC_ASSERTION_FAILED"] : [],
        approvalRequirements: [],
        riskLevel: "LOW",
        riskReasons: [],
        verdict: input.verdict,
        verdictReasons: [input.checks.map((check) => check.summary).join(" ")],
        independenceValid: true,
        startedAt: at,
        completedAt: at + 50,
        durationMs: 50,
        createdAt: at,
      });
      const evidenceIds: Id<"evidenceEnvelopes">[] = [];
      for (const check of input.checks) {
        evidenceIds.push(await ctx.db.insert("evidenceEnvelopes", {
          projectId: args.projectId,
          workOrderId: input.workOrderId,
          workflowRunId: verifierAttemptId,
          verificationRunId,
          sourceAttemptId: input.sourceAttemptId,
          verificationAttemptId: verifierAttemptId,
          workOrderRevisionNumber: 1,
          idempotencyKey: `${RUN_KEY}:evidence:${input.ordinal}:${check.id}`,
          evidenceKey: `${input.ordinal}:${check.id}`,
          checkId: check.id,
          category: "TEST_RESULT",
          result: check.status,
          summary: check.summary,
          acceptanceCriterionIds: [],
          producer: {
            actorType: "AGENT",
            actorId: `synthetic-verifier-${input.ordinal}`,
            role: "INDEPENDENT_VERIFIER",
            independent: true,
            factoryPurpose: "VERIFICATION",
            attemptId: verifierAttemptId,
            executorInvocationId: `WO-Q-verifier-${input.ordinal}-invocation`,
            executorAdapter: "node",
          },
          artifactIds: [],
          artifactReferences: [`.audit/post-relay-hardening/synthetic-qualification.json#${check.id}`],
          sourceRevision: "qualification-base",
          candidateRevision: input.candidate.commit,
          provenance: "SYNTHETIC",
          recordedAt: at + 50,
          metadata: { qualification: RUN_KEY, synthetic: true, immutable: true },
        }));
      }
      const verificationRun = await ctx.db.get(verificationRunId);
      await ctx.db.patch(verificationRunId, {
        checks: verificationRun!.checks.map((check, index) => ({ ...check, evidenceIds: [evidenceIds[index]] })),
      });
      return verificationRunId;
    };

    const producerAttempts = [];
    for (const [index, workOrderId] of workOrderIds.entries()) {
      producerAttempts.push(await insertAttempt({
        workOrderId,
        runId: `${definitions[index].identifier}-producer`,
        purpose: "IMPLEMENTATION",
        status: "COMPLETED",
        at: now + index * 1_000 + 10,
        candidate: args.candidates[index],
      }));
    }

    await insertVerification({
      workOrderId: workOrderIds[0], sourceAttemptId: producerAttempts[0], ordinal: 1, status: "COMPLETED", verdict: "BLOCKED", candidate: args.candidates[0],
      checks: [
        { id: "timeout", status: "TIMED_OUT", summary: "Verifier exceeded its bounded timeout." },
        { id: "dependent", status: "BLOCKED_BY_DEPENDENCY", summary: "Causal downstream check was blocked by dependency." },
        { id: "candidate", status: "NOT_EVALUATED", summary: "Candidate requirement was not evaluated after timeout." },
      ],
    });
    await insertVerification({
      workOrderId: workOrderIds[0], sourceAttemptId: producerAttempts[0], ordinal: 2, status: "COMPLETED", verdict: "NOT_VERIFIED", candidate: args.candidates[0],
      checks: [{ id: "product-test", status: "FAIL", summary: "Synthetic product assertion failed." }],
    });
    await insertVerification({
      workOrderId: workOrderIds[0], sourceAttemptId: producerAttempts[0], ordinal: 3, status: "FAILED", verdict: "BLOCKED", candidate: args.candidates[0],
      checks: [{ id: "factory-process", status: "ERROR", summary: "Factory verifier process failed without product evidence." }],
    });
    await insertVerification({
      workOrderId: workOrderIds[0], sourceAttemptId: producerAttempts[0], ordinal: 4, status: "COMPLETED", verdict: "VERIFIED", candidate: args.candidates[0],
      checks: [{ id: "unit-test", status: "PASS", summary: "Foundation test passed on exact-candidate retry." }],
    });
    await insertVerification({
      workOrderId: workOrderIds[1], sourceAttemptId: producerAttempts[1], ordinal: 5, status: "COMPLETED", verdict: "VERIFIED", candidate: args.candidates[1],
      checks: [{ id: "unit-test", status: "PASS", summary: "Feature test passed after predecessor acceptance." }],
    });
    await insertVerification({
      workOrderId: workOrderIds[2], sourceAttemptId: producerAttempts[2], ordinal: 6, status: "COMPLETED", verdict: "VERIFIED", candidate: args.candidates[2],
      checks: [{ id: "integration-test", status: "PASS", summary: "Integration test passed after predecessor acceptance." }],
    });

    return { factoryRunId, workOrderIds, reused: false };
  },
});
