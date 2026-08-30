import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { MissionSpecContent } from "../../../../../convex/lib/missionSpec";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFlag } from "../../hooks/useFlag";
import { StatusBadge } from "../../components/factory/badges";
import {
  emptyAssertion,
  emptyBlueprint,
  emptyMissionPlan,
  factoryRecipeIdFromMission,
  missionPlanFromFactoryRecipe,
  defaultImplementationPolicy,
  missionPlanPayload,
  missionPlanValuesEqual,
  nextPlanItemId,
  planToMissionPlanValues,
  summarizePlanDiff,
  updateMissionPlanAssertion,
  validateMissionPlanValues,
  type MissionPlanValues,
  type MissionPlanWorkflowOption,
} from "../missionPlanModel";
import { getFactoryRecipe, resolveRecipeWorkflow } from "../../factoryExperience/recipeCatalog";
import { useFactoryExperienceLevel } from "../../factoryExperience/useFactoryExperienceLevel";
import {
  canApplyPlanningCandidate,
  shouldShowPlanReleaseReadOnlyNotice,
} from "./missionPlanningPresentation";

const newKey = (action: string) => `ui-mission-plan:${action}:${crypto.randomUUID()}`;

function planTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (["PROPOSED", "REJECTED"].includes(status)) return "warning" as const;
  if (status === "DRAFT") return "info" as const;
  return "neutral" as const;
}

function ErrorList({ errors }: { errors: Array<{ code: string; message: string }> }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="font-medium">Resolve these plan issues before submission:</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={`${error.code}:${error.message}`}>{error.message}</li>)}</ul>
    </div>
  );
}

function SourceMapping({ label, items, selected, onChange }: {
  label: string;
  items: Array<{ id: string; title: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return <fieldset className="rounded-lg border border-line p-3"><legend className="px-1 text-[11px] font-medium text-ink-muted">{label}</legend><div className="mt-1 grid gap-2 sm:grid-cols-2">{items.length ? items.map((item) => <label key={item.id} className="flex items-start gap-2 text-xs text-ink-secondary"><input className="mt-0.5" type="checkbox" checked={selected.includes(item.id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /><span><span className="font-mono text-[10px] text-ink-muted">{item.id}</span> {item.title}</span></label>) : <span className="text-xs text-ink-muted">No source records available.</span>}</div></fieldset>;
}

function PlanLineagePanel({ plan, specRevision, constitution, advanced }: {
  plan: Doc<"missionPlans"> | null;
  specRevision?: Doc<"missionSpecRevisions">;
  constitution?: Doc<"projectConstitutionRevisions">;
  advanced: boolean;
}) {
  if (plan && !plan.missionSpecRevisionId) {
    return <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-ink-secondary"><span className="font-medium text-ink">Legacy plan — no Mission Spec lineage.</span> Existing work remains readable and operational; no synthetic Spec was created.</div>;
  }
  if (!plan) {
    return specRevision ? <div className="rounded-xl border border-info-accent/25 bg-info-soft/35 p-3 text-sm text-ink-secondary">The first saved Plan revision will bind immutably to <span className="font-medium text-ink">Spec r{specRevision.revisionNumber}</span> and Constitution r{constitution?.revisionNumber ?? "?"}. A newer Spec will not rebind it.</div> : null;
  }
  return <section className="rounded-xl border border-line bg-surface-1 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[13px] font-semibold text-ink">Frozen planning lineage</h2><p className="mt-1 text-[12px] text-ink-muted">This Plan remains bound to the exact revisions below until an operator creates a new Plan revision.</p></div><StatusBadge tone={plan.requirementsCoverageProjection?.complete ? "success" : plan.status === "DRAFT" ? "info" : "warning"}>{plan.requirementsCoverageProjection?.complete ? "Coverage complete" : "Coverage pending"}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Mission Spec</div><div className="mt-1 text-sm font-medium text-ink">r{specRevision?.revisionNumber ?? "?"}</div>{advanced ? <div className="mt-1 break-all font-mono text-[10px] text-ink-muted">{plan.missionSpecDigest}</div> : null}</div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Constitution</div><div className="mt-1 text-sm font-medium text-ink">r{constitution?.revisionNumber ?? "?"}</div>{advanced ? <div className="mt-1 break-all font-mono text-[10px] text-ink-muted">{plan.projectConstitutionDigest}</div> : null}</div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Quality evaluation</div><div className="mt-1 break-all font-mono text-[10px] text-ink-secondary">{String(plan.missionSpecQualityEvaluationId)}</div></div></div>{advanced && plan.requirementsCoverageProjection ? <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label="Frozen planning lineage coverage matrix"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-ink-muted"><tr><th className="pb-2">Requirement</th><th className="pb-2">Assertions</th><th className="pb-2">WorkOrders</th><th className="pb-2">Criteria</th><th className="pb-2">Verification</th></tr></thead><tbody className="divide-y divide-line">{plan.requirementsCoverageProjection.rows.map((row) => <tr key={row.specRequirementId}><td className="py-2 font-mono text-[10px]">{row.specRequirementId}</td><td className="py-2 font-mono text-[10px]">{row.planAssertionIds.join(", ")}</td><td className="py-2 font-mono text-[10px]">{row.workOrderBlueprintIds.join(", ")}</td><td className="py-2 font-mono text-[10px]">{row.acceptanceCriterionIds.join(", ")}</td><td className="py-2 font-mono text-[10px]">{row.verificationCheckIds.join(", ")}</td></tr>)}</tbody></table></div> : null}{plan.specConsistencyFindings?.length ? <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3"><div className="text-xs font-medium text-ink">Consistency findings</div><ul className="mt-2 space-y-1 text-xs text-ink-secondary">{plan.specConsistencyFindings.map((finding, index) => <li key={`${finding.code}:${index}`}><span className="font-mono text-[10px] text-ink-muted">{finding.code}</span> {finding.message}</li>)}</ul></div> : null}</section>;
}

function planningTone(status: string) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED") return "warning" as const;
  if (["RESEARCHING", "GENERATING", "VALIDATING"].includes(status)) return "info" as const;
  return "neutral" as const;
}

function PlanningRepositoryBinding({ plan }: { plan: Doc<"missionPlans"> | null }) {
  if (!plan) return null;
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4" aria-label="Plan repository provenance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-muted">Planning repository revision</div>
          <div className="mt-1 break-all font-mono text-[11px] text-ink-secondary">
            {plan.planningRepositorySha ?? "No Planning Agent SHA — this is a manual or legacy Plan."}
          </div>
        </div>
        <StatusBadge tone={plan.planningRepositorySha ? "success" : "neutral"}>
          {plan.planningRepositorySha ? "Exact SHA bound" : "Not agent-bound"}
        </StatusBadge>
      </div>
      {plan.planningRepositorySha ? <p className="mt-2 text-xs text-ink-muted">Dispatch must use this same immutable revision. Repository drift fails closed before execution.</p> : null}
    </section>
  );
}

function PlanningAgentPanel({ run, relationshipLabel, requesting, requestError, candidateApplied, canApply, canRequest, showRequestAction, onRequest, onApply }: {
  run: any;
  relationshipLabel: "Bound to this Plan" | "Latest unadopted candidate" | "Current planning run";
  requesting: boolean;
  requestError: string | null;
  candidateApplied: boolean;
  canApply: boolean;
  canRequest: boolean;
  showRequestAction: boolean;
  onRequest: () => void;
  onApply: () => void;
}) {
  const active = run && ["QUEUED", "RESEARCHING", "GENERATING", "VALIDATING"].includes(run.status);
  return <section className="rounded-xl border border-line bg-surface-1 p-4" aria-label={`Planning Agent — ${relationshipLabel}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{relationshipLabel}</div><h2 className="mt-1 text-[13px] font-semibold text-ink">Planning Agent</h2><p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-muted">Researches one immutable repository revision in an enforced workspace-contained read-only harness, then returns an editable candidate. Submission and approval remain human decisions.</p></div>{run ? <StatusBadge tone={planningTone(run.status)}>{run.status.toLowerCase().replaceAll("_", " ")}</StatusBadge> : <StatusBadge tone="neutral">Not run</StatusBadge>}</div>{requestError ? <div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{requestError}</div> : null}{run ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Exact repository SHA</div><div className="mt-1 break-all font-mono text-[10px] text-ink-secondary">{run.planningRepositorySha}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Planner</div><div className="mt-1 text-xs text-ink-secondary">{run.plannerIdentity?.displayName ?? "Mission Planner"} · {run.plannerIdentity?.plannerId ?? "mission-planner"}/{run.plannerIdentity?.version ?? "v1"}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Model route</div><div className="mt-1 break-all font-mono text-[10px] text-ink-secondary">{run.modelProvider}/{run.modelId}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Attempt</div><div className="mt-1 text-xs text-ink-secondary">{run.attemptCount}/{run.maxAttempts}</div></div></div> : null}{active ? <div role="status" className="mt-4 rounded-lg border border-info-accent/25 bg-info-soft/35 p-3 text-sm text-ink-secondary">{run.status === "QUEUED" ? "Waiting for the repository-scoped planning worker." : run.status === "RESEARCHING" ? "Inspecting the exact checkout and collecting line-level citations." : run.status === "GENERATING" ? "Repository research passed validation. Generating the Plan candidate." : "Validating workflows, dependencies, assertions, budgets, and provenance before persistence."}</div> : null}{run?.status === "FAILED" ? <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-ink-secondary"><div className="font-medium text-ink">Planning stopped safely</div><p className="mt-1">{run.failure?.message ?? "The run failed without a validated candidate."}</p><p className="mt-2 text-xs text-ink-muted">Resolve the reported repository, Factory, model-route, or evidence issue, then generate a new candidate. Partial output cannot be submitted.</p></div> : null}{run?.status === "SUCCEEDED" ? <div className="mt-4 space-y-3"><div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-ink-secondary"><span className="font-medium text-ink">Candidate ready for human review.</span> {run.researchPacket?.files?.length ?? 0} files and {run.researchPacket?.citations?.length ?? 0} exact citations are bound to <span className="font-mono text-[11px]">{run.researchPacketDigest}</span>.</div>{run.researchPacket?.citations?.length ? <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-xs font-medium text-ink">Repository evidence</summary><ul className="mt-3 space-y-2 text-xs text-ink-secondary">{run.researchPacket.citations.slice(0, 8).map((citation: any) => <li key={citation.id}><span className="font-mono text-[10px] text-ink-muted">{citation.path}:{citation.startLine}-{citation.endLine}</span><div className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{citation.excerpt}</div></li>)}</ul></details> : null}</div> : null}{run?.harnessExecutions?.length ? <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer text-xs font-medium text-ink">Durable execution receipts</summary><ul className="mt-3 space-y-2 text-xs text-ink-secondary">{run.harnessExecutions.map((execution: any) => <li key={`${execution.phase}:${execution.executionId}`} className="rounded-md bg-surface-2 p-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{execution.phase === "RESEARCH" ? "Research" : "Generation"}</span><StatusBadge tone={execution.status === "COMPLETED" ? "success" : "warning"}>{String(execution.status).toLowerCase()}</StatusBadge></div><div className="mt-1 break-all font-mono text-[10px] text-ink-muted">{execution.executionId}</div><div className="mt-1 break-all font-mono text-[10px] text-ink-muted">{execution.promptIdentity?.version} · {execution.promptIdentity?.digest}</div></li>)}</ul></details> : null}<div className="mt-4 flex flex-wrap justify-end gap-2">{canApply && run?.status === "SUCCEEDED" && !candidateApplied ? <Button type="button" variant="outline" onClick={onApply}>Apply candidate to editor</Button> : null}{showRequestAction ? <Button type="button" onClick={onRequest} disabled={!canRequest || requesting || active}>{requesting ? "Queueing…" : run ? "Generate new candidate" : "Generate Plan candidate"}</Button> : null}</div></section>;
}

function PlanningRunHistory({ runs, events }: { runs: any[]; events: any[] }) {
  if (!runs.length) return null;
  return (
    <details className="rounded-xl border border-line bg-surface-1 p-4">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">Planning run history and audit events</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ol className="space-y-2">
          {runs.map((run) => (
            <li key={run._id} className="rounded-lg border border-line p-3 text-xs text-ink-secondary">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px]">{String(run._id)}</span>
                <StatusBadge tone={planningTone(run.status)}>{run.status.toLowerCase().replaceAll("_", " ")}</StatusBadge>
              </div>
              <div className="mt-2 font-mono text-[10px] text-ink-muted">{run.planningRepositorySha}</div>
              <div className="mt-1">{new Date(run.createdAt).toLocaleString()} · attempt {run.attemptCount}/{run.maxAttempts}</div>
            </li>
          ))}
        </ol>
        <ol className="space-y-2">
          {events.map((event) => (
            <li key={event._id} className="border-l-2 border-line pl-3 text-xs text-ink-secondary">
              <div className="font-medium text-ink">{event.eventType.toLowerCase().replaceAll("_", " ")}</div>
              <div className="mt-0.5">{event.summary}</div>
              <div className="mt-1 text-[10px] text-ink-muted">{event.actorType} · {new Date(event.timestamp).toLocaleString()}</div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function PlanEditor({
  values,
  workflows,
  errors,
  spec,
  onChange,
}: {
  values: MissionPlanValues;
  workflows: MissionPlanWorkflowOption[];
  errors: ReturnType<typeof validateMissionPlanValues>;
  spec?: MissionSpecContent;
  onChange: (values: MissionPlanValues) => void;
}) {
  const updateBlueprint = (index: number, patch: Record<string, unknown>) => {
    const workOrderBlueprints = [...values.workOrderBlueprints];
    workOrderBlueprints[index] = { ...workOrderBlueprints[index], ...patch };
    onChange({ ...values, workOrderBlueprints });
  };
  const updateAssertion = (index: number, patch: Record<string, unknown>) => {
    onChange(updateMissionPlanAssertion(values, index, patch as any));
  };
  const blueprintErrors = (id: string) => errors.filter((error) => error.blueprintId === id);
  const assertionErrors = (id: string) => errors.filter((error) => error.assertionId === id);

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
        <div><h3 className="text-[13px] font-semibold text-ink">Plan summary</h3><p className="mt-1 text-[12px] text-ink-muted">The operator should understand the delivery shape and recovery path before deciding.</p></div>
        <div className="space-y-1.5"><Label htmlFor="mission-plan-summary">Summary</Label><Textarea id="mission-plan-summary" value={values.summary} onChange={(event) => onChange({ ...values, summary: event.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="mission-plan-rollback">Rollback approach</Label><Textarea id="mission-plan-rollback" value={values.rollbackApproach} onChange={(event) => onChange({ ...values, rollbackApproach: event.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="mission-plan-cost">Estimated cost (USD)</Label><Input id="mission-plan-cost" type="number" min="0" step="0.01" value={values.estimatedCostUsd ?? ""} onChange={(event) => onChange({ ...values, estimatedCostUsd: event.target.value === "" ? undefined : Number(event.target.value) })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Repository scope</Label><div className="flex h-9 items-center rounded-md border border-line bg-surface-2 px-3 font-mono text-xs text-ink-secondary">{values.repository ?? "Repository not configured"}{values.repositoryBranch ? ` · ${values.repositoryBranch}` : ""}</div></div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ink">WorkOrder blueprints</h3><p className="mt-1 text-[12px] text-ink-muted">Ordered, bounded units released only after approval.</p></div><Button type="button" variant="outline" size="sm" onClick={() => {
          const id = nextPlanItemId("work-order", values.workOrderBlueprints.map((item) => item.id));
          onChange({ ...values, workOrderBlueprints: [...values.workOrderBlueprints, emptyBlueprint(id, values.workOrderBlueprints.length + 1, workflows[0])] });
        }}>Add WorkOrder</Button></div>
        {values.workOrderBlueprints.map((blueprint, index) => (
          <article key={`${blueprint.id}:${index}`} className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[11px] text-ink-muted">Sequence {blueprint.sequence}</div><h4 className="mt-1 text-[13px] font-semibold text-ink">{blueprint.title || blueprint.id || `WorkOrder ${index + 1}`}</h4></div><Button type="button" variant="outline" size="sm" disabled={values.workOrderBlueprints.length === 1} onClick={() => onChange({ ...values, workOrderBlueprints: values.workOrderBlueprints.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>ID</Label><Input aria-label={`WorkOrder ${index + 1} ID`} value={blueprint.id} onChange={(event) => updateBlueprint(index, { id: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Title</Label><Input aria-label={`WorkOrder ${index + 1} title`} value={blueprint.title} onChange={(event) => updateBlueprint(index, { title: event.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Desired outcome</Label><Textarea aria-label={`WorkOrder ${index + 1} desired outcome`} value={blueprint.desiredOutcome} onChange={(event) => updateBlueprint(index, { desiredOutcome: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Workflow</Label><select aria-label={`WorkOrder ${index + 1} workflow`} value={blueprint.workflowId ?? ""} onChange={(event) => {
                const workflow = workflows.find((item) => item.workflowId === event.target.value);
                updateBlueprint(index, { workflowId: workflow?.workflowId, workflowVersion: workflow?.version });
              }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select workflow</option>{workflows.map((workflow) => <option key={workflow.workflowId} value={workflow.workflowId}>{workflow.name} · v{workflow.version}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Branch strategy</Label><Input aria-label={`WorkOrder ${index + 1} branch strategy`} value={blueprint.branchStrategy ?? ""} disabled={!blueprint.isMutating} onChange={(event) => updateBlueprint(index, { branchStrategy: event.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Role</Label><select aria-label={`WorkOrder ${index + 1} role`} value={blueprint.role} onChange={(event) => updateBlueprint(index, { role: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="WORKER">Worker</option><option value="VALIDATOR">Validator</option></select></div>
                <div className="space-y-1.5"><Label>Risk</Label><select aria-label={`WorkOrder ${index + 1} risk`} value={blueprint.riskLevel} onChange={(event) => updateBlueprint(index, { riskLevel: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((risk) => <option key={risk}>{risk}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Priority</Label><select aria-label={`WorkOrder ${index + 1} priority`} value={blueprint.priority} onChange={(event) => updateBlueprint(index, { priority: Number(event.target.value) })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{[1, 2, 3, 4].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></div>
                <label className="mt-6 flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-secondary"><input type="checkbox" checked={blueprint.isMutating} onChange={(event) => updateBlueprint(index, { isMutating: event.target.checked, branchStrategy: event.target.checked ? blueprint.branchStrategy || "isolated-worktree" : undefined, implementationPolicy: event.target.checked ? blueprint.implementationPolicy ?? defaultImplementationPolicy() : undefined })} />Repository mutation</label>
              </div>
              <div className="space-y-1.5"><Label>Constraints (one per line)</Label><Textarea aria-label={`WorkOrder ${index + 1} constraints`} value={blueprint.constraints.join("\n")} onChange={(event) => updateBlueprint(index, { constraints: event.target.value.split("\n") })} /></div>
              <div className="space-y-1.5"><Label>Required approvals (one per line)</Label><Textarea aria-label={`WorkOrder ${index + 1} required approvals`} value={blueprint.requiredApprovals.join("\n")} onChange={(event) => updateBlueprint(index, { requiredApprovals: event.target.value.split("\n") })} /></div>
            </div>
            {blueprint.isMutating ? <fieldset className="rounded-lg border border-line p-3">
              <legend className="px-1 text-xs font-medium text-ink">Implementation and independent proof</legend>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label>Executor-visible approved commands (one per line)</Label><Textarea aria-label={`WorkOrder ${index + 1} verification commands`} className="font-mono" value={blueprint.implementationPolicy?.allowedCommands.join("\n") ?? ""} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), allowedCommands: event.target.value.split("\n") } })} /></div>
                <div className="space-y-1.5"><Label>Independent verifier executable</Label><Input aria-label={`WorkOrder ${index + 1} independent verifier executable`} className="font-mono" value={blueprint.implementationPolicy?.independentVerification?.executable ?? ""} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), executable: event.target.value } } })} /></div>
                <div className="space-y-1.5"><Label>Exact arguments (one argument per line)</Label><Textarea aria-label={`WorkOrder ${index + 1} independent verifier arguments`} className="font-mono" value={blueprint.implementationPolicy?.independentVerification?.args.join("\n") ?? ""} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), args: event.target.value.split("\n") } } })} /></div>
                <div className="space-y-1.5"><Label>Check category</Label><select aria-label={`WorkOrder ${index + 1} independent verifier category`} value={blueprint.implementationPolicy?.independentVerification?.category ?? "UNIT_TEST"} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), category: event.target.value as any } } })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{["BUILD", "TYPECHECK", "UNIT_TEST", "INTEGRATION_TEST", "CONTRACT_TEST", "SECURITY"].map((category) => <option key={category}>{category}</option>)}</select></div>
                <div className="space-y-1.5"><Label>Command class</Label><select aria-label={`WorkOrder ${index + 1} independent verifier command class`} value={blueprint.implementationPolicy?.independentVerification?.commandClass ?? "TEST"} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), commandClass: event.target.value as any } } })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{["BUILD", "TYPECHECK", "TEST", "LINT", "SECURITY_SCAN", "DEPENDENCY_SCAN"].map((commandClass) => <option key={commandClass}>{commandClass}</option>)}</select></div>
                <div className="space-y-1.5"><Label>Evidence category</Label><select aria-label={`WorkOrder ${index + 1} independent verifier evidence category`} value={blueprint.implementationPolicy?.independentVerification?.evidenceCategory ?? "TEST_RESULT"} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), evidenceCategory: event.target.value as any } } })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{["TEST_RESULT", "BUILD_RESULT", "STATIC_ANALYSIS", "SECURITY_SCAN", "COMMAND_LOG", "BROWSER_RESULT"].map((category) => <option key={category}>{category}</option>)}</select></div>
                <div className="space-y-1.5"><Label>Verifier timeout (minutes)</Label><Input aria-label={`WorkOrder ${index + 1} independent verifier timeout minutes`} type="number" min="1" max="30" step="1" value={(blueprint.implementationPolicy?.independentVerification?.timeoutMs ?? 1_800_000) / 60_000} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), independentVerification: { ...(blueprint.implementationPolicy?.independentVerification ?? defaultImplementationPolicy().independentVerification), timeoutMs: Number(event.target.value) * 60_000 } } })} /></div>
                <div className="space-y-1.5"><Label>Maximum changed files</Label><Input aria-label={`WorkOrder ${index + 1} maximum changed files`} type="number" min="1" step="1" value={blueprint.implementationPolicy?.maxFilesChanged ?? 40} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), maxFilesChanged: Number(event.target.value) } })} /></div>
                <div className="space-y-1.5"><Label>Maximum changed lines</Label><Input aria-label={`WorkOrder ${index + 1} maximum changed lines`} type="number" min="1" step="1" value={blueprint.implementationPolicy?.maxLinesChanged ?? 3000} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), maxLinesChanged: Number(event.target.value) } })} /></div>
                <div className="space-y-1.5"><Label>Maximum attempts</Label><Input aria-label={`WorkOrder ${index + 1} maximum attempts`} type="number" min="1" step="1" value={blueprint.implementationPolicy?.maxAttempts ?? 2} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), maxAttempts: Number(event.target.value) } })} /></div>
                <div className="space-y-1.5"><Label>Attempt timeout (minutes)</Label><Input aria-label={`WorkOrder ${index + 1} timeout minutes`} type="number" min="1" step="1" value={blueprint.implementationPolicy?.timeoutMinutes ?? 30} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), timeoutMinutes: Number(event.target.value) } })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Stop condition</Label><Textarea aria-label={`WorkOrder ${index + 1} stop condition`} value={blueprint.implementationPolicy?.stopCondition ?? ""} onChange={(event) => updateBlueprint(index, { implementationPolicy: { ...(blueprint.implementationPolicy ?? defaultImplementationPolicy()), stopCondition: event.target.value } })} /></div>
                <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-ink-muted sm:col-span-2">The local executor creates a candidate commit first. The server-owned verifier then runs this exact argv against that immutable SHA; it does not verify a moving branch or mutable worktree.</div>
              </div>
            </fieldset> : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <fieldset className="rounded-lg border border-line p-3"><legend className="px-1 text-xs font-medium text-ink">Dependencies</legend><div className="mt-2 space-y-2">{values.workOrderBlueprints.filter((candidate) => candidate.id !== blueprint.id && candidate.sequence < blueprint.sequence).map((candidate) => <label key={candidate.id} className="flex items-center gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={blueprint.dependsOnBlueprintIds.includes(candidate.id)} onChange={(event) => updateBlueprint(index, { dependsOnBlueprintIds: event.target.checked ? [...blueprint.dependsOnBlueprintIds, candidate.id] : blueprint.dependsOnBlueprintIds.filter((id) => id !== candidate.id) })} />{candidate.id}</label>)}{index === 0 ? <div className="text-xs text-ink-muted">No predecessor required.</div> : null}</div></fieldset>
              <fieldset className="rounded-lg border border-line p-3"><legend className="px-1 text-xs font-medium text-ink">Assertion coverage</legend><div className="mt-2 space-y-2">{values.assertions.map((assertion) => <label key={assertion.assertionId} className="flex items-center gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={blueprint.assertionIds.includes(assertion.assertionId)} onChange={(event) => updateBlueprint(index, { assertionIds: event.target.checked ? [...blueprint.assertionIds, assertion.assertionId] : blueprint.assertionIds.filter((id) => id !== assertion.assertionId) })} />{assertion.assertionId || "Unnamed assertion"}</label>)}{blueprint.assertionIds.filter((assertionId) => !values.assertions.some((assertion) => assertion.assertionId === assertionId)).map((assertionId) => <div key={assertionId} className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"><span>Stale assertion: {assertionId}</span><Button type="button" variant="outline" size="sm" onClick={() => updateBlueprint(index, { assertionIds: blueprint.assertionIds.filter((id) => id !== assertionId) })}>Remove stale assertion {assertionId}</Button></div>)}</div></fieldset>
            </div>
            {blueprintErrors(blueprint.id).length ? <div className="text-xs text-destructive">{blueprintErrors(blueprint.id).map((error) => error.message).join(" ")}</div> : null}
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ink">Validation assertions</h3><p className="mt-1 text-[12px] text-ink-muted">Observable outcomes and the evidence required to prove them.</p></div><Button type="button" variant="outline" size="sm" onClick={() => {
          const id = nextPlanItemId("assertion", values.assertions.map((item) => item.assertionId));
          onChange({ ...values, assertions: [...values.assertions, emptyAssertion(id)] });
        }}>Add assertion</Button></div>
        {values.assertions.map((assertion, index) => (
          <article key={`${assertion.assertionId}:${index}`} className="space-y-4 rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[11px] text-ink-muted">{assertion.assertionId || `Assertion ${index + 1}`}</div><h4 className="mt-1 text-[13px] font-semibold text-ink">{assertion.title || "Untitled assertion"}</h4></div><Button type="button" variant="outline" size="sm" disabled={values.assertions.length === 1} onClick={() => onChange({ ...values, assertions: values.assertions.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>ID</Label><Input aria-label={`Assertion ${index + 1} ID`} value={assertion.assertionId} onChange={(event) => updateAssertion(index, { assertionId: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Title</Label><Input aria-label={`Assertion ${index + 1} title`} value={assertion.title} onChange={(event) => updateAssertion(index, { title: event.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Observable outcome</Label><Textarea aria-label={`Assertion ${index + 1} observable outcome`} value={assertion.outcome} onChange={(event) => updateAssertion(index, { outcome: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Pass condition</Label><Textarea aria-label={`Assertion ${index + 1} pass condition`} value={assertion.passCondition} onChange={(event) => updateAssertion(index, { passCondition: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Required evidence</Label><Textarea aria-label={`Assertion ${index + 1} required evidence`} value={assertion.requiredEvidence} onChange={(event) => updateAssertion(index, { requiredEvidence: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Verification method</Label><select aria-label={`Assertion ${index + 1} verification method`} value={assertion.verificationMethod} onChange={(event) => updateAssertion(index, { verificationMethod: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{["COMMAND", "TEST", "BROWSER", "MANUAL", "CHECKLIST"].map((method) => <option key={method}>{method}</option>)}</select></div>
              <div className="flex flex-wrap items-end gap-4 pb-2"><label className="flex items-center gap-2 text-sm text-ink-secondary"><input type="checkbox" checked={assertion.requiresIndependentValidation} onChange={(event) => updateAssertion(index, { requiresIndependentValidation: event.target.checked })} />Independent validator</label><label className="flex items-center gap-2 text-sm text-ink-secondary"><input type="checkbox" checked={assertion.waiverAllowed} onChange={(event) => updateAssertion(index, { waiverAllowed: event.target.checked })} />Waiver allowed</label></div>
            </div>
            {spec ? <div className="grid gap-3 lg:grid-cols-3"><SourceMapping label="Spec requirements" items={[...spec.requirements, ...spec.nonFunctionalRequirements]} selected={assertion.sourceRequirementIds ?? []} onChange={(ids) => updateAssertion(index, { sourceRequirementIds: ids })} /><SourceMapping label="Acceptance expectations" items={spec.acceptanceExpectations} selected={assertion.sourceAcceptanceExpectationIds ?? []} onChange={(ids) => updateAssertion(index, { sourceAcceptanceExpectationIds: ids })} /><SourceMapping label="Evidence-bearing verification" items={spec.verificationExpectations} selected={assertion.sourceVerificationExpectationIds ?? []} onChange={(ids) => updateAssertion(index, { sourceVerificationExpectationIds: ids })} /></div> : null}
            {assertionErrors(assertion.assertionId).length ? <div className="text-xs text-destructive">{assertionErrors(assertion.assertionId).map((error) => error.message).join(" ")}</div> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

export function MissionPlanWorkspace({
  projectId,
  mission,
  project,
  plans,
}: {
  projectId: Id<"projects">;
  mission: any;
  project: any;
  plans: any[];
}) {
  const enabled = useFlag("missions.plan-release-v1", projectId);
  const [experienceLevel] = useFactoryExperienceLevel();
  const workflowsQuery = useQuery(api.workflows.list, { activeOnly: true });
  const repositories = useQuery(api.projects.listRepositories, { projectId });
  const specIntake = useQuery(api.missionSpecs.getMissionIntake, { projectId, missionId: mission._id });
  const planningState = useQuery(api.missionPlanning.getForMission, { projectId, missionId: mission._id });
  const workflows = useMemo<MissionPlanWorkflowOption[]>(() => (workflowsQuery ?? []).map((workflow: any) => ({ workflowId: workflow.workflowId, name: workflow.name, version: workflow.version })), [workflowsQuery]);
  const recipeId = factoryRecipeIdFromMission(mission);
  const recipe = getFactoryRecipe(recipeId);
  const recipeWorkflow = useMemo(() => resolveRecipeWorkflow(recipeId, workflows), [recipeId, workflows]);
  const orderedPlans = useMemo(() => [...plans].sort((left, right) => right.revisionNumber - left.revisionNumber), [plans]);
  const currentPlan = orderedPlans[0] ?? null;
  const missionRepository = repositories?.find(
    (repository: any) => String(repository._id) === String(mission.repositoryId),
  );
  const repositoryName = missionRepository?.repository ?? project?.githubRepo;
  const repositoryBranch = missionRepository?.defaultBranch ?? project?.githubBranch;
  const boundSpecRevision = currentPlan?.missionSpecRevisionId
    ? specIntake?.revisions.find((revision) => String(revision._id) === String(currentPlan.missionSpecRevisionId))
    : specIntake?.currentRevision;
  const boundConstitution = currentPlan?.projectConstitutionRevisionId
    ? specIntake?.constitutionRevisions.find((revision) => String(revision._id) === String(currentPlan.projectConstitutionRevisionId))
    : specIntake?.currentConstitution;
  const lineagePanel = <><PlanLineagePanel plan={currentPlan} specRevision={boundSpecRevision} constitution={boundConstitution} advanced={experienceLevel === "advanced"} /><PlanningRepositoryBinding plan={currentPlan} /></>;
  const basePlan = currentPlan?.basePlanId ? orderedPlans.find((plan) => plan._id === currentPlan.basePlanId) ?? null : null;
  const initialValues = useMemo(() => {
    const values = currentPlan
      ? planToMissionPlanValues(currentPlan, repositoryName, repositoryBranch)
      : recipe
        ? missionPlanFromFactoryRecipe({ recipe, missionTitle: mission.title, missionObjective: mission.objective, workflow: recipeWorkflow })
        : emptyMissionPlan(workflows[0]);
    return { ...values, repository: currentPlan?.repository ?? repositoryName, repositoryBranch: currentPlan?.repositoryBranch ?? repositoryBranch };
  }, [currentPlan?._id, currentPlan?.draftVersion, mission.objective, mission.title, recipe?.id, recipeWorkflow?.workflowId, repositoryBranch, repositoryName, workflows[0]?.workflowId]);
  const [values, setValues] = useState<MissionPlanValues>(initialValues);
  const [baseline, setBaseline] = useState<MissionPlanValues>(initialValues);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "acting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [showAbandon, setShowAbandon] = useState(false);
  const [planningRequesting, setPlanningRequesting] = useState(false);
  const [planningRequestError, setPlanningRequestError] = useState<string | null>(null);
  const [appliedPlanningRunId, setAppliedPlanningRunId] = useState<Id<"missionPlanningRuns"> | null>(null);
  const dirty = Boolean(appliedPlanningRunId) || !missionPlanValuesEqual(values, baseline);
  const errors = validateMissionPlanValues(values);

  const savePlanDraft = useMutation(api.missions.savePlanDraft);
  const submitPlan = useMutation(api.missions.submitPlan);
  const rejectPlan = useMutation(api.missions.rejectPlan);
  const approvePlan = useMutation(api.missions.approvePlan);
  const forkPlanRevision = useMutation(api.missions.forkPlanRevision);
  const abandonPlanDraft = useMutation(api.missions.abandonPlanDraft);
  const requestPlanningRun = useMutation(api.missionPlanning.request);

  useEffect(() => {
    if (!dirty) {
      setValues(initialValues);
      setBaseline(initialValues);
    }
  }, [dirty, initialValues]);

  const boundPlanningRun = planningState?.bound ?? null;
  const latestUnadoptedPlanningRun = planningState?.latestUnadopted ?? null;
  const currentPlanningRun = boundPlanningRun ?? latestUnadoptedPlanningRun ?? planningState?.latest ?? null;
  useEffect(() => {
    if (currentPlan
      || dirty
      || latestUnadoptedPlanningRun?.status !== "SUCCEEDED"
      || !latestUnadoptedPlanningRun.candidatePlan
      || appliedPlanningRunId === latestUnadoptedPlanningRun._id) return;
    setValues(planToMissionPlanValues(latestUnadoptedPlanningRun.candidatePlan, repositoryName, repositoryBranch));
    setAppliedPlanningRunId(latestUnadoptedPlanningRun._id);
    setStatus("idle");
    setMessage("The validated Planning Agent candidate was applied to the unsaved editor for human review.");
  }, [appliedPlanningRunId, currentPlan, dirty, latestUnadoptedPlanningRun?._id, latestUnadoptedPlanningRun?.status, repositoryBranch, repositoryName]);

  function applyPlanningCandidate(run: any) {
    if (!canApplyPlanningCandidate(currentPlan) || run?.status !== "SUCCEEDED" || !run.candidatePlan) return;
    if ((currentPlan || dirty) && !window.confirm("Replace the current unsaved editor content with this validated Planning Agent candidate? The saved Plan is unchanged until you save.")) return;
    setValues(planToMissionPlanValues(run.candidatePlan, repositoryName, repositoryBranch));
    setAppliedPlanningRunId(run._id);
    setShowValidation(false);
    setStatus("idle");
    setMessage("Planning Agent candidate applied. Review and save it before submission.");
  }

  async function generatePlanningCandidate() {
    if (planningRequesting || !enabled) return;
    setPlanningRequesting(true);
    setPlanningRequestError(null);
    try {
      const result = await requestPlanningRun({ projectId, missionId: mission._id, idempotencyKey: newKey("generate-candidate") });
      setMessage(result.created
        ? "Planning run queued against an exact repository revision."
        : "duplicateReason" in result && result.duplicateReason === "ACTIVE_RUN_EXISTS"
          ? "An active planning run already exists for this Mission. Its current state is shown here."
          : "This planning request was already queued.");
    } catch (error) {
      setPlanningRequestError(error instanceof Error ? error.message : "The Planning Agent run could not be queued.");
    } finally {
      setPlanningRequesting(false);
    }
  }

  async function save() {
    if (status === "saving" || !enabled) return null;
    setStatus("saving"); setMessage(null);
    try {
      const result = await savePlanDraft({
        projectId,
        missionId: mission._id,
        planId: currentPlan?.status === "DRAFT" ? currentPlan._id : undefined,
        expectedDraftVersion: currentPlan?.status === "DRAFT" ? currentPlan.draftVersion ?? 1 : undefined,
        planningRunId: appliedPlanningRunId ?? undefined,
        idempotencyKey: newKey("save"),
        ...missionPlanPayload(values),
      });
      const persisted = planToMissionPlanValues(result.plan, repositoryName, repositoryBranch);
      setValues(persisted); setBaseline(persisted); setAppliedPlanningRunId(null); setStatus("saved"); setMessage(result.created ? "Plan draft created." : "Plan draft saved.");
      return result.plan;
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Plan draft could not be saved."); return null;
    }
  }

  async function act(action: "submit" | "reject" | "approve" | "fork" | "abandon") {
    if (!enabled || status === "acting" || status === "saving") return;
    if (action === "submit" && (dirty || errors.length > 0 || !currentPlan)) { setShowValidation(true); setMessage(dirty ? "Save the current plan before submitting it." : "Resolve the plan errors before submission."); return; }
    if (["reject", "approve", "abandon"].includes(action) && !decisionReason.trim()) { setMessage("Record a decision reason before continuing."); return; }
    setStatus("acting"); setMessage(null);
    try {
      if (action === "submit") await submitPlan({ projectId, missionId: mission._id, planId: currentPlan._id, idempotencyKey: newKey("submit") });
      if (action === "reject") await rejectPlan({ projectId, missionId: mission._id, planId: currentPlan._id, reason: decisionReason.trim(), idempotencyKey: newKey("reject") });
      if (action === "approve") await approvePlan({ projectId, missionId: mission._id, planId: currentPlan._id, decisionReason: decisionReason.trim(), idempotencyKey: newKey("approve") });
      if (action === "fork") await forkPlanRevision({ projectId, missionId: mission._id, sourcePlanId: currentPlan._id, idempotencyKey: newKey("fork") });
      if (action === "abandon") await abandonPlanDraft({ projectId, missionId: mission._id, planId: currentPlan._id, reason: decisionReason.trim(), idempotencyKey: newKey("abandon") });
      setStatus("saved"); setDecisionReason(""); setShowAbandon(false);
      setMessage(action === "approve" ? "Plan approved. WorkOrders were released; execution did not start." : action === "reject" ? "Plan rejected. The reason is retained in revision history." : action === "submit" ? "Plan submitted for a human decision." : action === "fork" ? "A new editable revision was created." : "Plan draft abandoned. Mission definition is editable again.");
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Mission plan action failed.");
    }
  }

  if (workflowsQuery === undefined || repositories === undefined || specIntake === undefined || planningState === undefined) return <div className="rounded-xl border border-line bg-surface-1 px-4 py-10 text-center text-sm text-ink-muted">Loading plan workflows, lineage, and planning evidence…</div>;

  const readOnlyNotice = shouldShowPlanReleaseReadOnlyNotice(enabled, currentPlan) ? <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-ink-secondary">Mission plan release is read-only. Enable <code className="font-mono">missions.plan-release-v1</code> for a verified local/project scope to edit or decide.</div> : null;
  const statusMessage = message ? <div role={status === "error" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${status === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-line bg-surface-1 text-ink-secondary"}`}>{message}</div> : null;
  const canEditCandidate = canApplyPlanningCandidate(currentPlan);
  const canRequestCandidate = Boolean(enabled && canEditCandidate && ["DRAFT", "PLANNING"].includes(mission.state));
  const planningPanel = <>
    {boundPlanningRun ? <PlanningAgentPanel
      run={boundPlanningRun}
      relationshipLabel="Bound to this Plan"
      requesting={planningRequesting}
      requestError={latestUnadoptedPlanningRun ? null : planningRequestError}
      candidateApplied
      canApply={false}
      canRequest={canRequestCandidate}
      showRequestAction={!latestUnadoptedPlanningRun && canEditCandidate}
      onRequest={generatePlanningCandidate}
      onApply={() => undefined}
    /> : null}
    {latestUnadoptedPlanningRun ? <PlanningAgentPanel
      run={latestUnadoptedPlanningRun}
      relationshipLabel={currentPlan ? "Latest unadopted candidate" : "Current planning run"}
      requesting={planningRequesting}
      requestError={planningRequestError}
      candidateApplied={appliedPlanningRunId === latestUnadoptedPlanningRun._id}
      canApply={canEditCandidate}
      canRequest={canRequestCandidate}
      showRequestAction={canEditCandidate}
      onRequest={generatePlanningCandidate}
      onApply={() => applyPlanningCandidate(latestUnadoptedPlanningRun)}
    /> : !boundPlanningRun ? <PlanningAgentPanel
      run={currentPlanningRun}
      relationshipLabel="Current planning run"
      requesting={planningRequesting}
      requestError={planningRequestError}
      candidateApplied={Boolean(currentPlanningRun && appliedPlanningRunId === currentPlanningRun._id)}
      canApply={canEditCandidate}
      canRequest={canRequestCandidate}
      showRequestAction={canEditCandidate}
      onRequest={generatePlanningCandidate}
      onApply={() => applyPlanningCandidate(currentPlanningRun)}
    /> : null}
    <PlanningRunHistory runs={planningState.runs} events={planningState.events} />
  </>;

  if (currentPlan?.status === "PROPOSED") {
    const diff = summarizePlanDiff(basePlan ? planToMissionPlanValues(basePlan) : null, planToMissionPlanValues(currentPlan));
    return <div className="space-y-5">{readOnlyNotice}{statusMessage}{lineagePanel}{planningPanel}<section className="rounded-xl border border-warning/30 bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ink">Revision {currentPlan.revisionNumber} needs a decision</h3><p className="mt-1 text-[12px] text-ink-muted">Approval releases {currentPlan.workOrderBlueprints.length} WorkOrders. It does not start execution.</p></div><StatusBadge tone="warning">Awaiting approval</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Repository</div><div className="mt-1 font-mono text-xs text-ink">{currentPlan.repository ?? "Unknown"}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Estimated cost</div><div className="mt-1 text-sm text-ink">{currentPlan.estimatedCostUsd == null ? "Unknown" : `$${currentPlan.estimatedCostUsd.toFixed(2)}`}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Assertions</div><div className="mt-1 text-sm text-ink">{currentPlan.assertions.length}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Submitted by</div><div className="mt-1 text-sm text-ink">{currentPlan.submittedBy ?? currentPlan.createdBy}</div></div></div></section><section className="rounded-xl border border-line bg-surface-1 p-4"><h3 className="text-[13px] font-semibold text-ink">Revision comparison</h3><ul className="mt-3 space-y-1.5 text-sm text-ink-secondary">{diff.map((item) => <li key={item}>— {item}</li>)}</ul></section><section className="space-y-3 rounded-xl border border-line bg-surface-1 p-4"><div><Label htmlFor="mission-plan-decision">Decision rationale</Label><Textarea id="mission-plan-decision" className="mt-1.5" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Why is this plan safe to release, or what must change?" /></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={!enabled || status === "acting"} onClick={() => act("reject")}>Reject plan</Button><Button disabled={!enabled || status === "acting"} onClick={() => act("approve")}>{status === "acting" ? "Recording…" : `Approve and release ${currentPlan.workOrderBlueprints.length} WorkOrders`}</Button></div></section></div>;
  }

  if (currentPlan?.status === "REJECTED") {
    return <div className="space-y-5">{readOnlyNotice}{statusMessage}{lineagePanel}{planningPanel}<section className="rounded-xl border border-warning/30 bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ink">Revision {currentPlan.revisionNumber} was rejected</h3><p className="mt-2 text-sm text-ink-secondary">{currentPlan.decisionReason}</p><div className="mt-2 text-xs text-ink-muted">{currentPlan.decidedBy ?? "Unknown actor"} · {currentPlan.decidedAt ? new Date(currentPlan.decidedAt).toLocaleString() : "Unknown time"}</div></div><StatusBadge tone="warning">Rejected</StatusBadge></div><div className="mt-4 flex justify-end"><Button disabled={!enabled || status === "acting"} onClick={() => act("fork")}>Create revision</Button></div></section></div>;
  }

  if (currentPlan?.status === "APPROVED") {
    return <div className="space-y-5">{readOnlyNotice}{statusMessage}{lineagePanel}{planningPanel}<section className="rounded-xl border border-success/30 bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-[13px] font-semibold text-ink">Revision {currentPlan.revisionNumber} approved and released</h2><p className="mt-1 text-[12px] text-ink-muted">Execution remains a separate governed action.</p></div><StatusBadge tone="success">Approved</StatusBadge></div>{currentPlan.legacyRelease ? <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-ink-secondary">Legacy approval — release provenance unavailable. WorkOrders will not be materialized automatically.</div> : <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Released WorkOrders</div><div className="mt-1 text-lg font-semibold text-ink">{currentPlan.releasedWorkOrderIds?.length ?? 0}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Decision actor</div><div className="mt-1 break-words text-sm text-ink">{currentPlan.decidedBy ?? currentPlan.approvedBy}</div></div><div><div className="text-[10px] uppercase tracking-wide text-ink-muted">Released</div><div className="mt-1 text-sm text-ink">{currentPlan.releasedAt ? new Date(currentPlan.releasedAt).toLocaleString() : "Unknown"}</div></div></div>}<div className="mt-4 rounded-lg border border-line p-3 text-sm text-ink-secondary"><span className="font-medium text-ink">Decision rationale:</span> {currentPlan.decisionReason ?? "Not recorded"}</div></section></div>;
  }

  if (currentPlan?.status === "SUPERSEDED" && mission.state === "DRAFT") {
    return <div className="space-y-5">{readOnlyNotice}{statusMessage}{lineagePanel}{planningPanel}<section className="rounded-xl border border-line bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-ink">Plan draft closed</h3><p className="mt-2 text-sm text-ink-secondary">{currentPlan.decisionReason}</p></div><StatusBadge tone="neutral">Superseded</StatusBadge></div><p className="mt-4 text-sm text-ink-muted">Update the Mission definition, then create a new plan draft.</p></section></div>;
  }

  const editable = !currentPlan || currentPlan.status === "DRAFT";
  return <div className="space-y-5">{readOnlyNotice}{statusMessage}{lineagePanel}{planningPanel}{editable ? <>{recipe && !currentPlan ? <div className="rounded-xl border border-info-accent/25 bg-info-soft/35 p-3 text-[12.5px] text-ink-secondary"><span className="font-medium text-ink">Composed from {recipe.name}.</span> {recipeWorkflow ? `Matched active workflow ${recipeWorkflow.name} v${recipeWorkflow.version}.` : "No compatible active workflow matched; select one before saving."} This is an editable draft and still requires normal submission and human approval.</div> : null}<ErrorList errors={showValidation ? errors : []} /><PlanEditor values={values} workflows={workflows} errors={showValidation ? errors : []} spec={boundSpecRevision?.content} onChange={(next) => { setValues(next); setStatus("idle"); setMessage(null); }} /><div className="sticky bottom-0 rounded-xl border border-line bg-app/95 p-3 backdrop-blur"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-ink-muted">{dirty ? "Unsaved plan changes" : currentPlan ? `Revision ${currentPlan.revisionNumber} saved` : "Plan draft not yet saved"}</div><div className="flex flex-wrap gap-2">{currentPlan ? <Button type="button" variant="outline" onClick={() => setShowAbandon((value) => !value)} disabled={!enabled || status === "saving" || status === "acting"}>Abandon draft</Button> : null}<Button type="button" variant="outline" onClick={save} disabled={!enabled || !dirty || status === "saving"}>{status === "saving" ? "Saving…" : currentPlan ? "Save draft" : "Create plan draft"}</Button><Button type="button" onClick={() => { setShowValidation(true); act("submit"); }} disabled={!enabled || !currentPlan || dirty || status === "acting"}>Submit for approval</Button></div></div>{showAbandon ? <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_auto]"><Textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Reason for returning to Mission definition" /><Button variant="destructive" disabled={!decisionReason.trim() || status === "acting"} onClick={() => act("abandon")}>Confirm abandon</Button></div> : null}</div></> : <section className="rounded-xl border border-line bg-surface-1 p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-[13px] font-semibold text-ink">Revision {currentPlan?.revisionNumber}</h3><StatusBadge tone={planTone(currentPlan?.status ?? "UNKNOWN")}>{currentPlan?.status ?? "Unknown"}</StatusBadge></div></section>}</div>;
}
