import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { DetailLayout, MetadataPanel, type DetailTab } from "../../components/factory/DetailLayout";
import { MetricBlock, MetricRow } from "../../components/factory/MetricBlock";
import { StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Target } from "lucide-react";
import { ProvenanceBadge } from "../components";
import { missionIdFromLocation } from "../missionRoutes";
import { presentMissionState } from "../missionPresentation";
import { MissionDraftForm } from "./MissionDraftForm";
import { MissionPlanWorkspace } from "./MissionPlanWorkspace";
import { MissionExecutionWorkspace } from "./MissionExecutionWorkspace";
import { MissionSpecificationWorkspace } from "./MissionSpecificationWorkspace";
import { normalizeNarrativeText } from "../../lib/displayText";

export interface MissionDetailViewProps {
  projectId: Id<"projects">;
  onNavigate: (view: string) => void;
}

const TABS: DetailTab[] = [
  { id: "overview", label: "Overview" }, { id: "specification", label: "Specification" }, { id: "plan", label: "Plan" }, { id: "execution", label: "Execution" }, { id: "work-orders", label: "Work Orders" },
  { id: "evidence", label: "Validation" }, { id: "activity", label: "Activity" },
];

export const MISSION_VALIDATION_COVERAGE_TEXT_CLASS = "mt-2 break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-ink-secondary";

function tone(state: string): StatusBadgeProps["tone"] {
  if (state === "DONE") return "success";
  if (["BLOCKED", "AWAITING_PLAN_APPROVAL", "AWAITING_VALIDATION", "AWAITING_ACCEPTANCE"].includes(state)) return "warning";
  if (["IN_PROGRESS", "PLANNING", "READY"].includes(state)) return "info";
  return "neutral";
}

function AssertionList({ assertions }: { assertions: any[] }) {
  if (assertions.length === 0) return <div className="rounded-xl border border-line bg-surface-1 px-4 py-10 text-center text-[13px] text-ink-muted">No validation contract has been approved yet.</div>;
  return <div className="overflow-hidden rounded-xl border border-line bg-surface-1"><ul className="divide-y divide-line">{assertions.map((assertion) => <li key={assertion._id} className="flex items-start justify-between gap-4 px-4 py-3"><div><div className="text-[13px] font-medium text-ink">{assertion.title}</div><div className="mt-0.5 text-[12px] text-ink-muted">{assertion.verificationMethod} · {assertion.requiredEvidence}</div></div><StatusBadge tone={tone(assertion.status)}>{assertion.status}</StatusBadge></li>)}</ul></div>;
}

function WorkOrderList({ workOrders, projectId }: { workOrders: any[]; projectId: Id<"projects"> }) {
  if (workOrders.length === 0) return <div className="rounded-xl border border-line bg-surface-1 px-4 py-10 text-center text-[13px] text-ink-muted">Approved plan work orders will appear here. No execution has been released.</div>;
  return <div className="overflow-hidden rounded-xl border border-line bg-surface-1"><ul className="divide-y divide-line">{workOrders.map((workOrder) => <li key={workOrder._id}><a href={`/v2/control-work-orders?workspace=${encodeURIComponent(String(projectId))}&workOrder=${encodeURIComponent(String(workOrder._id))}`} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-2"><div><div className="text-[13px] font-medium text-ink">{workOrder.title}</div><div className="mt-0.5 text-[12px] text-ink-muted">{workOrder.missionRole ?? "WORKER"} · {workOrder.isMutating ? "repository change" : "read-only"}</div><div className={`mt-1 text-[11.5px] ${workOrder.missionEligibility?.eligible ? "text-success" : "text-warning"}`}>{workOrder.missionEligibility?.reason ?? "Eligibility not evaluated"}</div></div><StatusBadge tone={tone(workOrder.state)}>{workOrder.state}</StatusBadge></a></li>)}</ul></div>;
}

export function MissionDetailView({ projectId, onNavigate }: MissionDetailViewProps): JSX.Element {
  const [tab, setTab] = useState("overview");
  const location = useLocation();
  const missionId = missionIdFromLocation(location.pathname, location.search) as Id<"missions"> | null;
  const scopedResult = useQuery(api.missions.getScoped, missionId ? { missionId, projectId } : "skip");
  const startMission = useMutation(api.missions.start);
  const acceptMission = useMutation(api.missions.accept);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const navigateSafely = useCallback((view: string) => {
    if (draftDirty && !window.confirm("Discard unsaved Mission changes?")) return;
    onNavigate(view);
  }, [draftDirty, onNavigate]);

  if (!missionId) return <div className="flex flex-1 items-center justify-center bg-app"><EmptyState icon={Target} title="Select a Mission" description="Choose a Mission from the portfolio to inspect its plan, handoffs, and validation evidence." action={<Button onClick={() => onNavigate("missions")}>Open Missions</Button>} /></div>;
  if (scopedResult === undefined) return <div className="flex flex-1 items-center justify-center bg-app text-sm text-ink-muted">Loading Mission…</div>;
  if (scopedResult.status === "NOT_FOUND") return <div className="flex flex-1 items-center justify-center bg-app"><EmptyState icon={Target} title="Mission not found" description="No Mission exists for this stable ID." action={<Button onClick={() => onNavigate("missions")}>Back to Missions</Button>} /></div>;
  if (scopedResult.status === "SCOPE_MISMATCH") return <div className="flex flex-1 items-center justify-center bg-app"><EmptyState icon={Target} title="Mission outside active workspace" description="This Mission does not belong to the selected workspace. Switch to its workspace or return to the Mission portfolio." action={<Button onClick={() => onNavigate("missions")}>Back to Missions</Button>} /></div>;
  const detail = scopedResult.detail;
  const { mission, project, plans, assertions, workOrders, handoffs, events, acceptance } = detail;
  const presentation = presentMissionState(mission.state);
  const releasedPlan = plans.find((plan: any) => plan._id === mission.currentPlanId && plan.releaseIdempotencyKey);
  const canStart = mission.state === "READY" && !releasedPlan;
  const canReviewRelease = !["DRAFT", "PLANNING", "AWAITING_PLAN_APPROVAL"].includes(mission.state) && Boolean(releasedPlan);
  const canAccept = mission.state === "AWAITING_ACCEPTANCE" && acceptance.eligible;
  const act = async (action: "start" | "accept") => { setActing(true); setActionError(null); try { if (action === "start") await startMission({ missionId: mission._id, actorId: "operator", idempotencyKey: `ui-start:${crypto.randomUUID()}` }); else await acceptMission({ missionId: mission._id, acceptedBy: "operator", idempotencyKey: `ui-accept:${crypto.randomUUID()}` }); } catch (error: any) { setActionError(error.message ?? "Mission action failed."); } finally { setActing(false); } };
  const aside = <MetadataPanel entries={[
    { label: "Owner", value: mission.owner ?? "Unassigned" }, { label: "State", value: <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge> },
    { label: "Execution", value: "Serial mutations" }, { label: "Stop condition", value: mission.stopCondition },
    { label: "Data", value: <ProvenanceBadge provenance="convex" /> },
  ]} />;
  return <div className="relative flex-1 overflow-auto bg-app"><DetailLayout
    breadcrumbs={[{ label: "Strategy" }, { label: "Missions", onClick: () => navigateSafely("missions") }, { label: mission.title, current: true }]}
    title={mission.title} description={normalizeNarrativeText(mission.objective)}
    actions={<div className="flex items-center gap-2">{canReviewRelease && tab !== "execution" ? <Button onClick={() => setTab("execution")}>Open execution path</Button> : null}{canStart ? <Button onClick={() => act("start")} disabled={acting}>{acting ? "Starting…" : "Start Mission"}</Button> : null}{canAccept ? <Button onClick={() => act("accept")} disabled={acting}>{acting ? "Accepting…" : "Accept Mission"}</Button> : null}</div>}
    metrics={<MetricRow className="xl:grid-cols-4"><MetricBlock label="State" value={presentation.label} /><MetricBlock label="Work orders" value={workOrders.length} /><MetricBlock label="Assertions" value={`${assertions.filter((a) => a.status === "PASS" || a.status === "WAIVED").length}/${assertions.length}`} /><MetricBlock label="Corrective iterations" value={`${mission.correctiveIterations}/${mission.maxCorrectiveIterations}`} /></MetricRow>}
    tabs={TABS} activeTabId={tab} onTabChange={setTab} aside={aside}>
      <div className="flex flex-col gap-6"><div className="rounded-xl border border-line bg-surface-1 px-4 py-3 text-[12.5px] text-ink-secondary">Live Convex Mission record. Validation status is derived from durable assertions and independent validator evidence.</div>{actionError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div> : null}
        {tab === "overview" ? <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><section className="min-w-0 rounded-xl border border-line bg-surface-1 p-4"><h2 className="text-[13px] font-semibold text-ink">Current decision gate</h2><p className="mt-2 break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-ink-secondary">{mission.requiredHumanAction ?? presentation.health}</p></section><section className="min-w-0 rounded-xl border border-line bg-surface-1 p-4"><h2 className="text-[13px] font-semibold text-ink">Validation coverage</h2><p className={MISSION_VALIDATION_COVERAGE_TEXT_CLASS}>{assertions.length === 0 ? "Validation contract is not yet defined." : acceptance.eligible ? "All contract assertions have required evidence, including independent validation where required. Operator acceptance is the final gate." : acceptance.blockingReasons.join(" · ")}</p></section></div><MissionDraftForm mission={mission} projectId={projectId} onDirtyChange={setDraftDirty} /></div> : null}
        {tab === "specification" ? <MissionSpecificationWorkspace projectId={projectId} mission={mission} plans={plans} onOpenPlan={() => setTab("plan")} /> : null}
        {tab === "plan" ? <MissionPlanWorkspace projectId={projectId} mission={mission} project={project} plans={plans} /> : null}
        {tab === "execution" ? <MissionExecutionWorkspace projectId={projectId} mission={mission} workOrders={workOrders} /> : null}
        {tab === "work-orders" ? <WorkOrderList workOrders={workOrders} projectId={projectId} /> : null}
        {tab === "evidence" ? <AssertionList assertions={assertions} /> : null}
        {tab === "activity" ? <div className="overflow-hidden rounded-xl border border-line bg-surface-1"><ul className="divide-y divide-line">{events.length ? events.map((event) => <li key={event._id} className="px-4 py-3"><div className="text-[13px] text-ink">{event.summary}</div><div className="mt-0.5 font-mono text-[11px] text-ink-muted">{event.eventType} · {new Date(event.timestamp).toLocaleString()}</div></li>) : <li className="px-4 py-10 text-center text-[13px] text-ink-muted">No Mission events recorded yet.</li>}</ul></div> : null}
        {tab === "overview" && handoffs.length ? <section className="rounded-xl border border-line bg-surface-1 p-4"><div className="text-[13px] font-semibold text-ink">Latest handoff</div><p className="mt-2 text-[13px] text-ink-secondary">{handoffs[0].producingRole} → {handoffs[0].consumingRole}: {handoffs[0].nextAction}</p></section> : null}
      </div>
  </DetailLayout></div>;
}
