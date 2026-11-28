import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getCurrentVerificationRoutingOutcome } from "./currentVerification";
import { assertReplayManifest, compareReplayCases, deriveReplayCase } from "./factoryReplay";
import { assertAuthorizedDeliveryRecord, requireAuthorizedDeliveryScope } from "./deliveryAuthorization";

type ReplayReadCtx = QueryCtx | MutationCtx;

/** A frozen dataset never widens the caller's canonical delivery visibility. */
export async function requireReplayDeliveryVisibility(ctx: ReplayReadCtx, manifest: Doc<"factoryReplayManifests">) {
  const access = await requireAuthorizedDeliveryScope(ctx, manifest.projectId);
  const bindings = await ctx.db.query("factoryReplayCases")
    .withIndex("by_manifest", (q) => q.eq("manifestId", manifest._id)).take(101);
  if (bindings.length > manifest.definition.cases.length * 2) throw new Error("Replay case bindings are ambiguous.");
  for (const frozen of manifest.definition.cases) assertAuthorizedDeliveryRecord(access, frozen.workload);
  const ids = [...new Set([...manifest.definition.cases.map((item) => item.sourceWorkOrderId), ...bindings.map((item) => item.workOrderId)])];
  for (const id of ids) {
    const workOrder = await ctx.db.get(id);
    if (!workOrder || workOrder.projectId !== manifest.projectId) throw new Error("Replay delivery record is unavailable or unauthorized.");
    assertAuthorizedDeliveryRecord(access, workOrder);
  }
  return bindings;
}

export async function loadReplayReview(ctx: ReplayReadCtx, experimentId: Id<"experiments">, now = Date.now()) {
  const manifest = await ctx.db.query("factoryReplayManifests")
    .withIndex("by_experiment", (q) => q.eq("experimentId", experimentId)).unique();
  if (!manifest) return null;
  assertReplayManifest(manifest);
  const experiment = await ctx.db.get(experimentId);
  if (!experiment || experiment.projectId !== manifest.projectId
    || experiment.metadata?.factoryReplayManifestId !== manifest._id) throw new Error("Replay experiment binding is invalid.");
  const bindings = await requireReplayDeliveryVisibility(ctx, manifest);
  if (bindings.length > manifest.definition.cases.length * 2
    || new Set(bindings.map((item) => `${item.variantId}:${item.caseKey}`)).size !== bindings.length
    || new Set(bindings.map((item) => String(item.workOrderId))).size !== bindings.length
    || bindings.some((item) => item.projectId !== manifest.projectId
      || !manifest.definition.cases.some((entry) => entry.key === item.caseKey)
      || !manifest.definition.variants.some((entry) => entry.id === item.variantId))) {
    throw new Error("Replay case bindings are ambiguous.");
  }
  const definitions = (await Promise.all(manifest.definition.evaluators.map((item) => ctx.db.get(item.id))))
    .filter((item): item is Doc<"evalDefinitions"> => Boolean(item));
  const cases = [];
  for (const variant of manifest.definition.variants) {
    for (const caseDefinition of manifest.definition.cases) {
      const binding = bindings.find((item) => item.variantId === variant.id && item.caseKey === caseDefinition.key);
      const workOrder = binding ? await ctx.db.get(binding.workOrderId) : null;
      const [attempts, verificationRuns, receipts, evidence, reports] = binding ? await Promise.all([
        ctx.db.query("workflowRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(201),
        ctx.db.query("verificationRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(201),
        ctx.db.query("verificationReceipts").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(1001),
        ctx.db.query("evidenceEnvelopes").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(1001),
        ctx.db.query("factoryReplayInterventionReports").withIndex("by_case", (q) => q.eq("caseId", binding._id)).take(201),
      ]) : [[], [], [], [], []];
      if (attempts.length > 200 || verificationRuns.length > 200 || receipts.length > 1000
        || evidence.length > 1000 || reports.length > 200) throw new Error("Replay evidence exceeds its bounded read; partial results are not comparable.");
      const scoreGroups = await Promise.all(attempts.map((attempt) => ctx.db.query("evalScores")
        .withIndex("by_attempt", (q) => q.eq("workflowRunId", attempt._id)).take(201)));
      if (scoreGroups.some((group) => group.length > 200)) throw new Error("Replay scores exceed their bounded read.");
      const scores = scoreGroups.flat();
      const observations = (await Promise.all(scores.flatMap((score) => score.observationId ? [ctx.db.get(score.observationId)] : [])))
        .filter((item): item is Doc<"traceObservations"> => Boolean(item));
      const source = attempts.filter((attempt) => attempt.attemptPurpose === "IMPLEMENTATION")
        .sort((a, b) => b.startedAt - a.startedAt || String(b._id).localeCompare(String(a._id)))[0];
      const currentVerification = workOrder && source?.verificationSubject
        ? await getCurrentVerificationRoutingOutcome(ctx, workOrder, now,
          source.verificationSubject.version === 2 ? "PREPUBLICATION" : "ACCEPTANCE")
        : undefined;
      cases.push(deriveReplayCase({ manifest, variant, caseDefinition, binding, workOrder,
        attempts, verificationRuns, receipts, evidence, scores, definitions, observations, reports,
        currentVerification, now }));
    }
  }
  return {
    manifest, cases, comparison: compareReplayCases(manifest.definition, cases),
    evidenceScope: "CURRENT_CANONICAL_RECORDS" as const,
    releaseAcceptanceEstablished: false as const,
    unattendedCompletionEstablished: false as const,
  };
}
