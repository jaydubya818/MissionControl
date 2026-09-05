import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, ClipboardList, ExternalLink, MoreHorizontal, PlayCircle, Plus, RotateCcw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import {
  countByQuickFilter,
  DEFAULT_WORK_ORDER_FILTERS,
  deriveAcceptanceReadinessPresentation,
  deriveNextAction,
  filterWorkOrders,
  parseVerificationArguments,
  summarizeRequiredAttention,
  type WorkOrderQueueFilters,
  type WorkOrderQuickFilter,
} from "./workOrdersModel";
import { CandidateRecoveryPanel } from "./CandidateRecoveryPanel";
import { ExecutionRunInspector } from "./ExecutionRunInspector";
import { ReviewEvidencePackage, type ReviewEvidencePackageData } from "./ReviewEvidencePackage";
import { splitCurrentAndHistoricalRevisions, summarizeRevisionEffects } from "./workOrderLifecycleModel";
import { CreateTaskModal } from "../CreateTaskModal";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { normalizeNarrativeText } from "@/lib/displayText";

const RISK_STYLES: Record<string, string> = {
  LOW: "border-success/40 text-ink",
  MEDIUM: "border-registry-accent/30 text-registry-accent",
  HIGH: "border-warning/30 text-warning",
  CRITICAL: "border-danger/30 text-danger",
};

const STATE_STYLES: Record<string, string> = {
  DRAFT: "border-border text-muted-foreground",
  READY: "border-registry-accent/30 text-registry-accent",
  DISPATCHED: "border-registry-accent/30 text-registry-accent",
  IN_PROGRESS: "border-primary/30 text-primary",
  BLOCKED: "border-danger/30 text-danger",
  AWAITING_APPROVAL: "border-warning/30 text-warning",
  AWAITING_VERIFICATION: "border-warning/30 text-warning",
  REOPENED: "border-info/30 text-info",
  DONE: "border-success/30 text-success",
  CANCELED: "border-border text-muted-foreground",
  SUPERSEDED: "border-line text-ink-muted",
};

const QUICK_FILTERS: Array<{ id: WorkOrderQuickFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "blocked", label: "Blocked" },
  { id: "awaiting_approval", label: "Awaiting approval" },
  { id: "ready_to_dispatch", label: "Ready to dispatch" },
];

type WorkOrderDetailTab = "overview" | "review" | "scope" | "tasks" | "audit";

const WORK_ORDER_DETAIL_TABS: Array<{ id: WorkOrderDetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "review", label: "Review" },
  { id: "scope", label: "Scope" },
  { id: "tasks", label: "Tasks & runs" },
  { id: "audit", label: "Audit trail" },
];

const SECTION_DETAIL_TAB: Record<string, WorkOrderDetailTab> = {
  Outcome: "overview",
  "Required attention": "overview",
  "Independent verification": "review",
  "Candidate decision": "review",
  "Acceptance readiness": "review",
  "Verification traceability matrix": "audit",
  "Executable specification": "scope",
  "Governed execution scope": "scope",
  "Automation lineage": "scope",
  "Source of truth": "scope",
  "Child Tasks": "tasks",
  "Execution setup": "tasks",
  "Linked execution runs": "tasks",
  "Approval decisions": "audit",
  "Governance status": "audit",
  "Revision history": "audit",
  "Reopen and replacement lineage": "audit",
  "Lifecycle events": "audit",
};

const WorkOrderDetailTabContext = createContext<WorkOrderDetailTab | null>(null);

function prettyLabel(value: string | undefined | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function projectedTaskStatus(task: { status: string; attempt?: { currentAttemptStatus?: string | null } }) {
  const attemptStatus = task.attempt?.currentAttemptStatus;
  if (["PENDING", "RUNNING", "PAUSED"].includes(attemptStatus ?? "")) return "IN_PROGRESS";
  if (attemptStatus === "COMPLETED") return "REVIEW";
  if (attemptStatus === "FAILED") return "BLOCKED";
  if (attemptStatus === "CANCELED") return "CANCELED";
  return task.status;
}

function criteriaFromText(value: string, existingCriteria: Array<{ id: string; title: string; description?: string; verificationMethod?: string }> = []) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => {
      const existing = existingCriteria[index];
      return {
        ...existing,
        id: existing?.id ?? `ac-${index + 1}`,
        title,
        description: existing?.description,
        verificationMethod: (existing?.verificationMethod as "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST" | undefined) ?? "MANUAL",
        status: "PENDING" as const,
      };
    });
}

function latestByCriterion<T extends { acceptanceCriterionId?: string; receiptScope?: string; recordedAt: number }>(receipts: T[]) {
  const latest = new Map<string, T>();
  [...receipts].sort((a, b) => b.recordedAt - a.recordedAt).forEach((receipt) => {
    if (!receipt.acceptanceCriterionId || receipt.receiptScope === "WORK_ORDER") return;
    if (!latest.has(receipt.acceptanceCriterionId)) latest.set(receipt.acceptanceCriterionId, receipt);
  });
  return latest;
}

function nonEmptyLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function WorkOrdersView({ projectId }: { projectId: Id<"projects"> | null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hadRequestedWorkOrder = useRef(Boolean(searchParams.get("workOrder")));
  const mobileDetailPanelRef = useRef<HTMLDivElement>(null);
  const mobileBackButtonRef = useRef<HTMLButtonElement>(null);
  const [filters, setFilters] = useState<WorkOrderQueueFilters>(DEFAULT_WORK_ORDER_FILTERS);
  const [detailTab, setDetailTab] = useState<WorkOrderDetailTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("workOrder"));
  const [mobileDetailOpen, setMobileDetailOpen] = useState(() => Boolean(searchParams.get("workOrder")));
  const [createOpen, setCreateOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [createRequestKey, setCreateRequestKey] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [syncingGithubEvidence, setSyncingGithubEvidence] = useState(false);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [supersedingId, setSupersedingId] = useState<string | null>(null);
  const [retryingVerificationId, setRetryingVerificationId] = useState<string | null>(null);
  const requestedInspectorRunId = searchParams.get("run") as Id<"workflowRuns"> | null;
  const inspectorReceiptId = searchParams.get("receipt") as Id<"verificationReceipts"> | null;
  const inspectorCriterionId = searchParams.get("criterion");
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchTaskSelections, setDispatchTaskSelections] = useState<Record<string, string>>({});
  const [dispatchCodeScopeSelections, setDispatchCodeScopeSelections] = useState<Record<string, string>>({});
  const [dispatchFactorySelections, setDispatchFactorySelections] = useState<Record<string, string>>({});
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workOrders = useQuery(api.workOrders.list, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const accessibleSelectedId =
    selectedId && workOrders?.some((workOrder) => workOrder._id === selectedId)
      ? selectedId
      : null;
  const selected = useQuery(
    api.workOrders.get,
    accessibleSelectedId
      ? { workOrderId: accessibleSelectedId as Id<"workOrders"> }
      : "skip"
  );
  const selectedDetailId = selected?.workOrder._id ?? null;
  const hasReviewPackage = Boolean(selected?.reviewPackage);
  const inspectorRunId = selected?.executionRuns.some((run) => run._id === requestedInspectorRunId)
    ? requestedInspectorRunId
    : null;
  const inspectorUnavailable = Boolean(requestedInspectorRunId && selected !== undefined && !inspectorRunId);
  const repositoryRows = useQuery(
    api.projects.listRepositories,
    projectId ? { projectId } : "skip"
  );
  const dispatchRepositoryId = selected?.workOrder.repositoryId
    ?? repositoryRows?.find((repository) => repository.isDefault)?.repositoryId
    ?? repositoryRows?.[0]?.repositoryId;
  const dispatchCodeScopes = useQuery(
    api.projects.listCodeScopes,
    dispatchRepositoryId ? { repositoryId: dispatchRepositoryId } : "skip"
  );
  const activeFactory = useQuery(
    api["factory/configuration"].getActiveForWorkOrder,
    accessibleSelectedId
      ? { workOrderId: accessibleSelectedId as Id<"workOrders"> }
      : "skip"
  );
  const activeFactoryVersionId = activeFactory?.version._id;
  const activeFactoryHostId = activeFactory?.host?.hostId;

  useEffect(() => {
    const requested = searchParams.get("workOrder");
    if (requested) {
      if (requested !== selectedId) setSelectedId(requested);
      setMobileDetailOpen(true);
      hadRequestedWorkOrder.current = true;
    } else if (!requested && hadRequestedWorkOrder.current) {
      setMobileDetailOpen(false);
      hadRequestedWorkOrder.current = false;
    }
  }, [searchParams, selectedId]);

  useEffect(() => {
    if (!selectedDetailId) return;
    setDetailTab(hasReviewPackage ? "review" : "overview");
  }, [hasReviewPackage, selectedDetailId]);

  const openRunInspector = (input: {
    runId: Id<"workflowRuns">;
    receiptId?: Id<"verificationReceipts"> | null;
    criterionId?: string | null;
  }) => {
    const next = new URLSearchParams(searchParams);
    next.set("run", input.runId);
    if (input.receiptId) next.set("receipt", input.receiptId);
    else next.delete("receipt");
    if (input.criterionId) next.set("criterion", input.criterionId);
    else next.delete("criterion");
    setSearchParams(next, { replace: true });
  };

  const closeRunInspector = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("run");
    next.delete("receipt");
    next.delete("criterion");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!mobileDetailOpen || !selectedDetailId || !globalThis.matchMedia?.("(max-width: 1279px)").matches) return;
    const frame = requestAnimationFrame(() => {
      mobileDetailPanelRef.current?.scrollIntoView({ block: "start" });
      mobileBackButtonRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileDetailOpen, selectedDetailId]);

  const createWorkOrder = useMutation(api.workOrders.create);
  const dispatchWorkOrder = useMutation(api.workOrders.dispatch);
  const requestApprovalDecision = useMutation(api.workOrders.requestApprovalDecision);
  const recordVerificationReceipt = useMutation(api.workOrders.recordVerificationReceipt);
  const acceptWorkOrder = useMutation(api.workOrders.accept);
  const requestWorkOrderRevision = useMutation(api.workOrders.requestWorkOrderRevision);
  const approveWorkOrderRevision = useMutation(api.workOrders.approveWorkOrderRevision);
  const reopenWorkOrder = useMutation(api.workOrders.reopenWorkOrder);
  const supersedeWorkOrder = useMutation(api.workOrders.supersedeWorkOrder);
  const expireGovernanceRecords = useMutation(api.workOrders.expireGovernanceRecords);
  const retryVerificationAttempt = useMutation(api["factory/attempts"].retryVerification);
  const retryCandidateVerification = useMutation(api["factory/attempts"].retryCandidateVerification);
  const retryPublicationReconciliation = useMutation(api["factory/attempts"].retryPublicationReconciliation);
  const recordReviewJudgment = useMutation(api.reviewIntelligence.recordReviewJudgment);
  const seedDemo = useMutation(api.workOrders.seedDemo);

  const filtered = useMemo(() => filterWorkOrders(workOrders ?? [], filters), [workOrders, filters]);

  useEffect(() => {
    if (workOrders === undefined) return;
    if (filtered.length === 0) {
      setMobileDetailOpen(false);
      return;
    }
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0]._id);
    }
    if (selectedId && filtered.length > 0 && !filtered.some((item) => item._id === selectedId)) {
      setSelectedId(filtered[0]._id);
      const next = new URLSearchParams(searchParams);
      next.set("workOrder", filtered[0]._id);
      setSearchParams(next, { replace: true });
    }
  }, [filtered, searchParams, selectedId, setSearchParams, workOrders]);

  const selectWorkOrder = (workOrderId: string, history: "push" | "replace" = "push") => {
    setSelectedId(workOrderId);
    const next = new URLSearchParams(searchParams);
    next.set("workOrder", workOrderId);
    setSearchParams(next, { replace: history === "replace" });
  };

  const closeMobileDetail = () => {
    setMobileDetailOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("workOrder");
    setSearchParams(next, { replace: true });
    requestAnimationFrame(() => {
      const selectedRow = document.querySelector<HTMLButtonElement>(`[data-work-order-id="${selectedId ?? ""}"]`);
      selectedRow?.scrollIntoView({ block: "nearest" });
      selectedRow?.focus({ preventScroll: true });
    });
  };

  const repositories = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.repository).filter(Boolean))).sort(),
    [workOrders]
  );
  const assignedAgents = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.assignedAgent).filter(Boolean))).sort(),
    [workOrders]
  );
  const requestors = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.requestedBy).filter(Boolean))).sort(),
    [workOrders]
  );

  const counts = useMemo(() => {
    const rows = workOrders ?? [];
    return {
      total: rows.length,
      active: rows.filter((row) => ["READY", "DISPATCHED", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED"].includes(row.state)).length,
      blocked: rows.filter((row) => row.state === "BLOCKED").length,
      attention: rows.filter((row) => !!row.requiredHumanAction || ["PENDING", "REVISION_REQUESTED"].includes(row.approvalStatus) || ["FAIL", "STALE"].includes(row.verificationStatus)).length,
    };
  }, [workOrders]);

  const quickFilterCounts = useMemo(() => {
    const rows = workOrders ?? [];
    return Object.fromEntries(
      QUICK_FILTERS.map((filter) => [filter.id, filter.id === "all" ? rows.length : countByQuickFilter(rows, filter.id)])
    ) as Record<WorkOrderQuickFilter, number>;
  }, [workOrders]);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemo({});
    } finally {
      setSeeding(false);
    }
  }

  const canDispatchSelected = !!selected && ["READY", "BLOCKED", "DISPATCHED", "IN_PROGRESS", "REOPENED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION"].includes(selected.workOrder.state)
    && !!selected.workOrder.workflowId
    && (selected.workOrder.approvalStatus === "APPROVED" || selected.workOrder.approvalStatus === "CONDITIONAL" || selected.workOrder.approvalStatus === "NOT_REQUIRED")
    && !selected.executionRuns.some((run) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status));

  const canAcceptSelected = !!selected
    && !["DONE", "SUPERSEDED", "CANCELED"].includes(selected.workOrder.state)
    && !selected.executionRuns.some((run) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status))
    && selected.executionRuns[0]?.status === "COMPLETED"
    && (selected.currentVerification
      ? selected.currentVerification.eligible
        && ["APPROVED", "CONDITIONAL", "NOT_REQUIRED"].includes(selected.workOrder.approvalStatus)
      : selected.acceptanceSummary?.eligible);

  const acceptanceReadinessPresentation = deriveAcceptanceReadinessPresentation(
    canAcceptSelected,
    selected?.currentVerification?.reasons ?? []
  );
  const nextActionText = canAcceptSelected
    ? acceptanceReadinessPresentation.heading
    : acceptanceReadinessPresentation.reasons[0]
      ?? acceptanceReadinessPresentation.summary
      ?? selected?.workOrder.requiredHumanAction
      ?? "Review the current Work Order state.";

  const latestReceiptMap = useMemo(
    () => latestByCriterion((selected?.verificationReceipts ?? []).map((receipt) => ({
      ...receipt,
      recordedAt: receipt.recordedAt ?? receipt._creationTime ?? 0,
    }))),
    [selected]
  );
  const latestWorkOrderReceipt = useMemo(
    () => [...(selected?.verificationReceipts ?? [])]
      .filter((receipt) => receipt.receiptScope === "WORK_ORDER")
      .sort((a, b) => (b.recordedAt ?? b._creationTime) - (a.recordedAt ?? a._creationTime))[0] ?? null,
    [selected]
  );
  const revisionSplit = useMemo(
    () => splitCurrentAndHistoricalRevisions((selected?.revisions ?? []) as any[], selected?.workOrder.currentRevisionId),
    [selected]
  );
  const pendingRevision = useMemo(
    () => [...(selected?.revisions ?? [])]
      .filter((revision) => revision.status === "PENDING_APPROVAL")
      .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null,
    [selected]
  );
  const latestVerificationAttempt = useMemo(
    () => selected?.executionRuns.find((run) => run.attemptPurpose === "VERIFICATION") ?? null,
    [selected]
  );
  const failedVerificationAttempt = latestVerificationAttempt
    && ["FAILED", "CANCELED"].includes(latestVerificationAttempt.status)
    && latestVerificationAttempt.verificationSupersededAt
    ? latestVerificationAttempt
    : null;
  const activeVerificationAttempt = useMemo(
    () => selected?.executionRuns.find((run) => run.attemptPurpose === "VERIFICATION"
      && ["PENDING", "RUNNING", "PAUSED"].includes(run.status)) ?? null,
    [selected]
  );
  const pausedCandidate = selected?.executionRuns.find(run => run._id === selected.workOrder.currentExecutionRunId
    && run.status === "PAUSED" && run.verificationSubjectVersion === 2);
  const publicationUncertain = pausedCandidate?.factoryContinuationStatus === "PUBLICATION_AUTHORIZED";
  const candidateDispatchBlocked = pausedCandidate?.executionPhase === "AWAITING_VERIFICATION"
    && !activeVerificationAttempt && !failedVerificationAttempt && Boolean(selected?.workOrder.blockingIssue);
  const agentMap = useMemo(
    () =>
      new Map<Id<"agents">, Doc<"agents">>(
        (agents ?? []).map((agent) => [agent._id, agent])
      ),
    [agents]
  );
  const childTaskSummary = useMemo(() => {
    const tasks = selected?.childTasks ?? [];
    const statuses = tasks.map(projectedTaskStatus);
    return {
      total: tasks.length,
      active: statuses.filter((status) => ["READY", "ASSIGNED", "IN_PROGRESS"].includes(status)).length,
      review: statuses.filter((status) => ["REVIEW", "NEEDS_APPROVAL"].includes(status)).length,
      blocked: statuses.filter((status) => status === "BLOCKED").length,
      completed: statuses.filter((status) => status === "DONE").length,
    };
  }, [selected]);
  const selectedDispatchTaskId = selected
    ? dispatchTaskSelections[selected.workOrder._id] ?? ""
    : "";
  const selectedDispatchCodeScopeId = selected
    ? dispatchCodeScopeSelections[selected.workOrder._id]
      ?? (selected.workOrder.codeScopeIds?.length === 1 ? selected.workOrder.codeScopeIds[0] : "")
    : "";
  const selectedDispatchCodeScopeIds = selected
    ? dispatchCodeScopeSelections[selected.workOrder._id]
      ? [dispatchCodeScopeSelections[selected.workOrder._id] as Id<"repositoryCodeScopes">]
      : selected.workOrder.codeScopeIds ?? []
    : [];
  const selectedDispatchFactoryVersionId = selected
    ? dispatchFactorySelections[selected.workOrder._id] ?? ""
    : "";
  const activeLocalCodeScopes = (dispatchCodeScopes ?? []).filter((scope) =>
    scope.active
    && scope.allowedEnvironments.includes("LOCAL")
    && Boolean(activeFactory?.version.codeScopeIds?.includes(scope._id))
  );
  const governedFactoryRequired = Boolean(selected?.workOrder.repositoryId || selected?.workOrder.missionId);
  const factoryScopeMatches = selectedDispatchCodeScopeIds.length > 0
    && selectedDispatchCodeScopeIds.every((scopeId) => activeFactory?.version.codeScopeIds?.includes(scopeId));
  const verifiedCriteriaCount = selected
    ? Math.max(
        0,
        selected.workOrder.acceptanceCriteria.length -
          (selected.acceptanceSummary?.missingCriteriaIds?.length ?? 0) -
          (selected.acceptanceSummary?.failedCriteriaIds?.length ?? 0) -
          (selected.acceptanceSummary?.staleCriteriaIds?.length ?? 0)
      )
    : 0;
  const scopePolicyRequirements = selected
    ? (selected.workOrder.metadata as {
        scopePolicyRequirements?: {
          owningTeamIds: string[];
          requiredReviewers: string[];
          verificationPolicies: string[];
          approvalPolicies: string[];
          requiresCrossTeamReview: boolean;
        };
      } | undefined)?.scopePolicyRequirements
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Software factory"
        title="Work Orders"
        description="Requested outcomes, acceptance criteria, and governed execution in one queue."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {counts.total === 0 ? (
              <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {seeding ? "Seeding…" : "Seed example data"}
              </Button>
            ) : null}
            <Button className={mobileDetailOpen ? "hidden xl:inline-flex" : undefined} size="sm" onClick={() => {
              setCreateRequestKey(globalThis.crypto?.randomUUID?.() ?? `work-order-${Date.now()}`);
              setCreateOpen(true);
            }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New WorkOrder
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className={mobileDetailOpen ? "hidden xl:block" : "block"}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="WorkOrders" value={counts.total} />
          <StatCard label="Active" value={counts.active} />
          <StatCard label="Blocked" value={counts.blocked} tone={counts.blocked > 0 ? "bad" : "default"} />
          <StatCard label="Needs attention" value={counts.attention} tone={counts.attention > 0 ? "warn" : "good"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_FILTERS.map((filter) => {
            const active = filters.quickFilter === filter.id;
            return (
              <Button
                key={filter.id}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilters((current) => ({ ...current, quickFilter: filter.id }))}
                className="gap-2"
              >
                {filter.label}
                <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[11px] leading-none">
                  {quickFilterCounts[filter.id] ?? 0}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-[var(--panel-line)] bg-card/40 p-4 lg:grid-cols-6">
          <FilterSelect label="Repository" value={filters.repository} onChange={(value) => setFilters((current) => ({ ...current, repository: value }))} options={repositories} />
          <FilterSelect label="State" value={filters.state} onChange={(value) => setFilters((current) => ({ ...current, state: value }))} options={["READY", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED", "DONE", "SUPERSEDED"]} />
          <FilterSelect label="Risk" value={filters.riskLevel} onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]} />
          <FilterSelect label="Assigned" value={filters.assignedAgent} onChange={(value) => setFilters((current) => ({ ...current, assignedAgent: value }))} options={assignedAgents} />
          <FilterSelect label="Requested by" value={filters.requestedBy} onChange={(value) => setFilters((current) => ({ ...current, requestedBy: value }))} options={requestors} />
          <FilterSelect label="Verification" value={filters.verificationStatus} onChange={(value) => setFilters((current) => ({ ...current, verificationStatus: value }))} options={["PENDING", "PASS", "FAIL", "WAIVED", "STALE"]} />
        </div>
        </div>

        <div className={`${mobileDetailOpen ? "mt-0 xl:mt-4" : "mt-4"} grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr))]`}>
          <div className={`${mobileDetailOpen ? "hidden xl:block" : "block"} min-w-0 space-y-3`}>
            {filtered.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No work orders match the current filters.
              </Card>
            ) : (
              filtered.map((item) => {
                const selectedRow = item._id === selectedId;
                return (
                  <button
                    key={item._id}
                    type="button"
                    data-work-order-id={item._id}
                    onClick={() => {
                      selectWorkOrder(item._id);
                      setMobileDetailOpen(true);
                    }}
                    aria-label={`${item.title} — next action: ${deriveNextAction(item)}`}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedRow ? "border-registry-accent/40 bg-registry-accent-soft" : "border-[var(--panel-line)] bg-card/40 hover:border-registry-accent/20"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{item.title}</div>
                        <div className={`mt-1 whitespace-pre-line text-xs line-clamp-2 ${selectedRow ? "text-foreground/75" : "text-muted-foreground"}`}>{normalizeNarrativeText(item.desiredOutcome)}</div>
                      </div>
                      <Badge variant="outline" className={RISK_STYLES[item.riskLevel] ?? ""}>{item.riskLevel}</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={STATE_STYLES[item.state] ?? ""}>{prettyLabel(item.state)}</Badge>
                      <Badge variant="outline">{item.repository ?? "No repo"}</Badge>
                      <Badge variant="outline">Workflow: {item.workflowId ?? "—"}</Badge>
                      <Badge variant="outline">Verification: {item.verificationStatus}</Badge>
                      {item.metadata?.automationDefinitionId ? <Badge variant="outline" className="border-registry-accent/30 text-registry-accent">Automation review gate</Badge> : null}
                      {item.latestExecutionRun ? (
                        <Badge variant="outline">
                          Run: {item.latestExecutionRun.status} · {item.latestExecutionRun.workflowId}
                        </Badge>
                      ) : null}
                    </div>

                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-2 ${selectedRow ? "text-foreground/75" : "text-muted-foreground"}`}>
                      <div>
                        <span className="text-foreground/80">Assigned:</span> {item.assignedAgent ?? item.assignedSquad ?? "Unassigned"}
                      </div>
                      <div>
                        <span className="text-foreground/80">Requestor:</span> {item.requestedBy ?? "Unknown"}
                      </div>
                      <div>
                        <span className="text-foreground/80">Next action:</span> {deriveNextAction(item)}
                      </div>
                      <div className="md:col-span-2 truncate">
                        <span className="text-foreground/80">Attention:</span> {summarizeRequiredAttention(item)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Card ref={mobileDetailPanelRef} className={`${mobileDetailOpen ? "block" : "hidden xl:block"} min-h-[420px] min-w-0 scroll-mt-4 p-5`}>
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a work order to inspect requested outcome, criteria, and linked execution.</div>
            ) : (
              <div className="flex flex-col gap-5">
                <Button
                  ref={mobileBackButtonRef}
                  size="sm"
                  variant="outline"
                  className="xl:hidden"
                  onClick={closeMobileDetail}
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back to work orders
                </Button>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold text-foreground">{selected.workOrder.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{selected.workOrder.repository ?? "No repository declared"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={RISK_STYLES[selected.workOrder.riskLevel] ?? ""}>{selected.workOrder.riskLevel}</Badge>
                      <Badge variant="outline" className={STATE_STYLES[selected.workOrder.state] ?? ""}>{prettyLabel(selected.workOrder.state)}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" aria-label="More Work Order actions">
                          <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          More
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onSelect={() => { setGovernanceError(null); setRevisionOpen(true); }}>
                          Request revision
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => { setGovernanceError(null); setReopenOpen(true); }}
                          disabled={selected.workOrder.state === "SUPERSEDED"}
                        >
                          Reopen Work Order
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={async () => {
                          try {
                            setGovernanceError(null);
                            await expireGovernanceRecords({ workOrderId: selected.workOrder._id });
                          } catch (err) {
                            setGovernanceError(err instanceof Error ? err.message : "Failed to expire governance records");
                          }
                        }}>
                          Refresh governance
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-danger focus:text-danger"
                          onSelect={() => { setGovernanceError(null); setSupersedeOpen(true); }}
                          disabled={selected.workOrder.state === "SUPERSEDED"}
                        >
                          Supersede Work Order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${canAcceptSelected ? "border-success/30 bg-success/10" : selected.workOrder.requiredHumanAction ? "border-warning/30 bg-warning/10" : "border-[var(--panel-line)] bg-background/30"}`}>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Next action</div>
                      <p className={`mt-1 text-sm font-medium ${canAcceptSelected ? "text-success" : "text-foreground"}`}>
                        {nextActionText}
                      </p>
                    </div>
                    {selected.reviewPackage && detailTab !== "review" ? (
                      <Button size="sm" className="shrink-0" onClick={() => setDetailTab("review")}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Review evidence
                      </Button>
                    ) : null}
                  </div>
                </div>

                <WorkOrderDetailTabs
                  active={detailTab}
                  onChange={setDetailTab}
                  taskCount={selected.childTasks.length}
                  auditCount={(selected.approvalDecisions?.length ?? 0) + (selected.events?.length ?? 0)}
                  reviewReady={Boolean(selected.reviewPackage)}
                />

                {pendingRevision ? (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-4" role="status" aria-label={`Revision ${pendingRevision.revisionNumber} approval required`}>
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <TriangleAlert className="h-4 w-4 text-warning" aria-hidden />
                          <span className="text-sm font-semibold text-foreground">Action required: approve revision r{pendingRevision.revisionNumber}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{pendingRevision.changeSummary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{summarizeRevisionEffects(pendingRevision)}</p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={async () => {
                          try {
                            setGovernanceError(null);
                            setRevisingId(pendingRevision._id);
                            await approveWorkOrderRevision({
                              workOrderRevisionId: pendingRevision._id as Id<"workOrderRevisions">,
                              approvedBy: "operator",
                            });
                          } catch (err) {
                            setGovernanceError(err instanceof Error ? err.message : "Failed to approve revision");
                          } finally {
                            setRevisingId(null);
                          }
                        }}
                        disabled={revisingId === pendingRevision._id}
                      >
                        {revisingId === pendingRevision._id ? "Applying revision…" : `Approve revision r${pendingRevision.revisionNumber}`}
                      </Button>
                    </div>
                    {governanceError ? <div className="mt-3 text-xs text-danger">{governanceError}</div> : null}
                  </div>
                ) : null}

                {pausedCandidate && (publicationUncertain || verificationDispatchBlocked) ? (
                  <CandidateRecoveryPanel key={`${pausedCandidate._id}:${publicationUncertain}`}
                    candidateRevision={pausedCandidate.candidateRevision} publicationUncertain={publicationUncertain}
                    onRecover={async () => {
                      const input = { sourceAttemptId: pausedCandidate._id };
                      if (publicationUncertain) await retryPublicationReconciliation(input);
                      else await retryCandidateVerification(input);
                    }} />
                ) : null}
                {failedVerificationAttempt && !activeVerificationAttempt ? (
                  <div className="rounded-xl border border-danger/35 bg-danger/5 p-4" role="alert" aria-label="Independent verification recovery required">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <TriangleAlert className="h-4 w-4 text-danger" aria-hidden />
                          <span className="text-sm font-semibold text-foreground">Independent verification failed before acceptance</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Attempt {failedVerificationAttempt.runId} remains immutable. Retry creates a new read-only verifier bound to the same exact candidate.
                        </p>
                        {failedVerificationAttempt.failureReason ? <p className="mt-1 line-clamp-2 text-xs text-danger">{failedVerificationAttempt.failureReason}</p> : null}
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={async () => {
                          try {
                            setGovernanceError(null);
                            setRetryingVerificationId(failedVerificationAttempt._id);
                            await retryVerificationAttempt({
                              workOrderId: selected.workOrder._id,
                              failedVerificationAttemptId: failedVerificationAttempt._id,
                              reason: `Retry exact candidate after resolving verifier infrastructure failure from ${failedVerificationAttempt.runId}.`,
                            });
                          } catch (err) {
                            setGovernanceError(err instanceof Error ? err.message : "Failed to retry independent verification");
                          } finally {
                            setRetryingVerificationId(null);
                          }
                        }}
                        disabled={retryingVerificationId === failedVerificationAttempt._id}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        {retryingVerificationId === failedVerificationAttempt._id ? "Starting verifier…" : "Retry independent verification"}
                      </Button>
                    </div>
                    {governanceError ? <div className="mt-3 text-xs text-danger">{governanceError}</div> : null}
                  </div>
                ) : null}

                <WorkOrderDetailTabContext.Provider value={detailTab}>
                <Section title="Outcome">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{normalizeNarrativeText(selected.workOrder.desiredOutcome)}</p>
                  {selected.workOrder.context ? (
                    <details className="mt-3 rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">Background context</summary>
                      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{normalizeNarrativeText(selected.workOrder.context)}</p>
                    </details>
                  ) : null}
                </Section>

                <ExecutableSpecificationPanel workOrder={selected.workOrder} />

                <IndependentVerificationPanel
                  receipt={latestWorkOrderReceipt}
                  verificationRuns={selected.verificationRuns ?? []}
                  onInspect={(workflowRunId, receiptId) => {
                    openRunInspector({
                      runId: workflowRunId as Id<"workflowRuns">,
                      receiptId: receiptId as Id<"verificationReceipts">,
                    });
                  }}
                />

                {selected.reviewPackage ? (
                  <Section title="Candidate decision">
                    <ReviewEvidencePackage
                      review={selected.reviewPackage as ReviewEvidencePackageData}
                      onInspectEvidence={(criterion) => {
                        openRunInspector({
                          runId: selected.reviewPackage.reviewIntelligence.exactLineage.workflowRunId as Id<"workflowRuns">,
                          receiptId: criterion.receiptId as Id<"verificationReceipts">,
                          criterionId: criterion.id,
                        });
                      }}
                      onRecordJudgment={async (judgment) => {
                        await recordReviewJudgment({
                          workOrderId: judgment.workOrderId as Id<"workOrders">,
                          workflowRunId: judgment.workflowRunId as Id<"workflowRuns">,
                          expectedWorkOrderRevisionNumber: judgment.workOrderRevisionNumber,
                          expectedCandidateRevision: judgment.candidateRevision,
                          reviewPackageDigest: judgment.reviewPackageDigest,
                          action: judgment.action,
                          correctionCategory: judgment.correctionCategory,
                          summary: judgment.summary,
                          sourceReference: `work-order:${judgment.workOrderId}`,
                          idempotencyKey: `ui-review:${judgment.workOrderId}:${crypto.randomUUID()}`,
                        });
                      }}
                    />
                  </Section>
                ) : null}

                {scopePolicyRequirements ? (
                  <Section title="Governed execution scope">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selected.workOrder.codeScopeIds?.length ?? 0} code scopes</Badge>
                      <Badge variant="outline">{scopePolicyRequirements.owningTeamIds.length} owning teams</Badge>
                      {scopePolicyRequirements.requiresCrossTeamReview ? <Badge variant="outline" className="border-warning/30 text-warning">Cross-team review required</Badge> : null}
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                      <MetaRow label="Required reviewers" value={scopePolicyRequirements.requiredReviewers.join(", ") || "No additional reviewer policy"} />
                      <MetaRow label="Approval policies" value={scopePolicyRequirements.approvalPolicies.join("; ") || "No additional approval policy"} />
                      <MetaRow label="Verification policies" value={scopePolicyRequirements.verificationPolicies.join("; ") || "No additional verification policy"} />
                      <MetaRow label="Policy source" value="Union of every selected repository code scope" />
                    </dl>
                  </Section>
                ) : null}

                {selected.workOrder.metadata?.automationDefinitionId ? (
                  <Section title="Automation lineage">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="border-registry-accent/30 text-registry-accent">Automation review gate</Badge>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {selected.workOrder.metadata.automationDefinitionName ?? selected.workOrder.metadata.automationDefinitionId}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/v2/automations?tab=runs&definition=${selected.workOrder.metadata.automationDefinitionId}${projectId ? `&workspace=${projectId}` : ""}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open Automation
                      </Button>
                    </div>
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      <MetaRow label="Definition ID" value={selected.workOrder.metadata.automationDefinitionId} />
                      <MetaRow label="Workflow version" value={selected.workOrder.metadata.automationWorkflowVersion} />
                      <MetaRow label="Cadence window" value={selected.workOrder.metadata.automationCadenceWindow} />
                      <MetaRow
                        label="Trigger"
                        value={selected.workOrder.metadata.automationTrigger
                          ? `${selected.workOrder.metadata.automationTrigger}${selected.workOrder.metadata.automationCadence?.cron ? ` · ${selected.workOrder.metadata.automationCadence.cron}` : ""}`
                          : "Not recorded"}
                      />
                      <MetaRow label="Scope" value={selected.workOrder.metadata.automationScope} />
                      <MetaRow label="Autonomy" value={selected.workOrder.metadata.automationPolicy?.autonomyLevel ?? "LEVEL_1"} />
                      <MetaRow label="Mutation policy" value={selected.workOrder.metadata.automationPolicy?.isMutating ? "Mutating" : "Read-only"} />
                      <MetaRow label="Approval" value={selected.workOrder.metadata.automationPolicy?.approvalRequired ? "Required" : "Not configured"} />
                      <MetaRow label="Verification" value={selected.workOrder.metadata.automationPolicy?.independentReceiptRequired ? "Independent receipt required" : "Not configured"} />
                    </dl>
                    <ol className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-5" aria-label="Automation governance sequence">
                      {["Automation evaluated", "Review gate created", "Approval required", "Explicit dispatch required", "Independent verification required"].map((step, index) => (
                        <li key={step} className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-2">
                          <span className="mr-1 font-mono text-registry-accent">{index + 1}.</span> {step}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-xs text-warning">
                      This WorkOrder has not been automatically executed. The originating Automation cannot approve it.
                    </p>
                  </Section>
                ) : null}

                <Section title="Child Tasks">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                    <StatCard label="Total Tasks" value={childTaskSummary.total} />
                    <StatCard label="Active Tasks" value={childTaskSummary.active} />
                    <StatCard label="Review Tasks" value={childTaskSummary.review} />
                    <StatCard label="Blocked Tasks" value={childTaskSummary.blocked} tone={childTaskSummary.blocked > 0 ? "warn" : "default"} />
                    <StatCard label="Completed Tasks" value={childTaskSummary.completed} tone="good" />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Execution progress</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {childTaskSummary.completed} of {childTaskSummary.total} Tasks complete
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Acceptance readiness</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {verifiedCriteriaCount} of {selected.workOrder.acceptanceCriteria.length} criteria verified
                      </div>
                    </Card>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selected.childTasks.length > 0 ? selected.childTasks.map((task) => {
                      const taskStatus = projectedTaskStatus(task);
                      const assignedAgent = task.assigneeIds
                        .map((agentId) => agentMap.get(agentId)?.name)
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <div key={task._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">{task.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {assignedAgent || "Unassigned"} · Priority P{task.priority}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{taskStatus}</Badge>
                              <Badge variant="outline">{task.parentDelivery.governanceStatus}</Badge>
                              {taskStatus === "BLOCKED" ? <Badge variant="outline" className="border-danger/30 text-danger">Blocked</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Current Attempt: {task.attempt.currentAttemptNumber || "None"}
                            {task.attempt.currentAttemptStatus ? ` (${task.attempt.currentAttemptStatus})` : ""}
                            {" · "}Retries: {task.attempt.retryCount}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-lg border border-dashed border-[var(--panel-line)] p-4 text-sm text-muted-foreground">
                        No Tasks are linked to this Work Order yet.
                      </div>
                    )}
                  </div>
                  <Button className="mt-3" size="sm" onClick={() => setCreateTaskOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Task
                  </Button>
                </Section>

                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Execution setup">
                    <dl className="space-y-2 text-sm">
                      <MetaRow label="Branch / worktree strategy" value={selected.workOrder.branchStrategy} />
                      <MetaRow label="Workflow" value={selected.workOrder.workflowId} />
                      <MetaRow label="Assigned" value={selected.workOrder.assignedAgent ?? selected.workOrder.assignedSquad} />
                      <MetaRow label="Requested by" value={selected.workOrder.requestedBy} />
                      <MetaRow label="Approval" value={selected.workOrder.approvalStatus} />
                      <MetaRow label="Verification" value={selected.workOrder.verificationStatus} />
                    </dl>
                  </Section>
                  <Section title="Required attention">
                    {selected.workOrder.requiredHumanAction ? (
                      <p className="text-sm text-warning">{selected.workOrder.requiredHumanAction}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active human action recorded.</p>
                    )}
                    {selected.workOrder.blockingIssue ? (
                      <div className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                        <TriangleAlert className="mr-2 inline h-4 w-4" />
                        {selected.workOrder.blockingIssue}
                      </div>
                    ) : null}
                  </Section>
                </div>

                <Section title="Acceptance readiness">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Approval status</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">{selected.workOrder.approvalStatus}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Verification status</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">{selected.workOrder.verificationStatus}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Missing approvals</div>
                      <div className="mt-2 text-lg font-semibold text-warning">{selected.acceptanceSummary?.missingApprovalTypes?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Criteria blocked</div>
                      <div className="mt-2 text-lg font-semibold text-danger">{(selected.acceptanceSummary?.failedCriteriaIds?.length ?? 0) + (selected.acceptanceSummary?.staleCriteriaIds?.length ?? 0) + (selected.acceptanceSummary?.missingCriteriaIds?.length ?? 0)}</div>
                    </Card>
                  </div>

                  <div className="mt-3 rounded-xl border border-[var(--panel-line)] bg-background/40 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">{acceptanceReadinessPresentation.heading}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setApprovalOpen(true); }}>
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          Request approval
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setGovernanceError(null); setReceiptOpen(true); }}
                          disabled={selected.workOrder.verificationContract?.enforcementMode === "ENFORCED"}
                          title={selected.workOrder.verificationContract?.enforcementMode === "ENFORCED" ? "Enforced Work Orders require a server-generated independent receipt." : undefined}
                        >
                          Record legacy receipt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            syncingGithubEvidence
                            || !projectId
                            || !selected.workOrder.repositoryId
                            || !selected.reviewPackage?.identity?.pullRequestUrl
                            || !selected.currentVerification?.sourceAttemptId
                          }
                          title="Fetch authoritative GitHub state through the repository-scoped App boundary without exposing credentials to the browser."
                          onClick={async () => {
                            const prUrl = selected.reviewPackage?.identity?.pullRequestUrl;
                            const repositoryId = selected.workOrder.repositoryId;
                            const sourceAttemptId = selected.currentVerification?.sourceAttemptId;
                            if (!projectId || !repositoryId || !prUrl || !sourceAttemptId) return;
                            try {
                              setGovernanceError(null);
                              setSyncingGithubEvidence(true);
                              const response = await fetch(`${getOrchestrationBaseUrl()}/orchestration/workorders/${selected.workOrder._id}/github-pr-evidence`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  projectId,
                                  repositoryId,
                                  workflowRunId: sourceAttemptId,
                                  prUrl,
                                }),
                              });
                              const result = await response.json().catch(() => ({}));
                              if (!response.ok) throw new Error(result.error ?? "GitHub evidence sync failed");
                            } catch (err) {
                              setGovernanceError(err instanceof Error ? err.message : "GitHub evidence sync failed");
                            } finally {
                              setSyncingGithubEvidence(false);
                            }
                          }}
                        >
                          {syncingGithubEvidence ? "Syncing GitHub CI…" : "Sync exact GitHub CI"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              setGovernanceError(null);
                              setAcceptingId(selected.workOrder._id);
                              await acceptWorkOrder({
                                workOrderId: selected.workOrder._id,
                                actorType: "HUMAN",
                                actorId: "operator",
                                idempotencyKey: `ui-accept:${selected.workOrder._id}:${selected.workOrder.updatedAt}`,
                              });
                            } catch (err) {
                              setGovernanceError(err instanceof Error ? err.message : "Acceptance failed");
                            } finally {
                              setAcceptingId(null);
                            }
                          }}
                          disabled={!canAcceptSelected || acceptingId === selected.workOrder._id}
                        >
                          {acceptingId === selected.workOrder._id ? "Accepting…" : "Accept WorkOrder"}
                        </Button>
                      </div>
                    </div>
                    {governanceError ? <div className="mb-3 text-xs text-danger">{governanceError}</div> : null}
                    {acceptanceReadinessPresentation.reasons.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {acceptanceReadinessPresentation.reasons.map((reason: string, index: number) => (
                          <li key={`${selected.workOrder._id}-blocker-${index}`}>{reason}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className={`text-sm ${canAcceptSelected ? "text-success" : "text-warning"}`}>{acceptanceReadinessPresentation.summary}</p>
                    )}
                  </div>
                </Section>

                <Section title="Approval decisions">
                  <div className="space-y-2">
                    {selected.approvalDecisions?.length ? selected.approvalDecisions.map((approval) => (
                      <div key={approval._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">{approval.approvalType}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{approval.requestedAction}</div>
                          </div>
                          <Badge variant="outline">{approval.status}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                          <div>Risk: <span className="text-foreground/85">{approval.riskLevel}</span></div>
                          <div>Requested by: <span className="text-foreground/85">{approval.requestedBy ?? "—"}</span></div>
                          <div>Approver: <span className="text-foreground/85">{approval.approver ?? "—"}</span></div>
                          <div>Decided: <span className="text-foreground/85">{approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : "—"}</span></div>
                        </div>
                        {approval.reason ? <div className="mt-2 text-xs text-muted-foreground">Reason: {approval.reason}</div> : null}
                        {approval.conditions?.length ? <div className="mt-2 text-xs text-registry-accent">Conditions: {approval.conditions.join("; ")}</div> : null}
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded yet.</p>
                    )}
                  </div>
                </Section>

                <Section title="Governance status">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Current revision</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">r{selected.workOrder.currentRevisionNumber ?? 1}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Expiring approvals</div>
                      <div className="mt-2 text-lg font-semibold text-warning">{selected.governanceStatus?.expiringApprovals?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Expired approvals</div>
                      <div className="mt-2 text-lg font-semibold text-danger">{selected.governanceStatus?.expiredApprovals?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Stale receipts</div>
                      <div className="mt-2 text-lg font-semibold text-danger">{selected.governanceStatus?.staleReceipts?.length ?? 0}</div>
                    </Card>
                  </div>
                  <div className="mt-3 rounded-xl border border-[var(--panel-line)] bg-background/30 p-4 text-sm text-muted-foreground">
                    <div>Required reapproval: <span className="text-foreground/85">{selected.governanceStatus?.requiredReapproval ? "Yes" : "No"}</span></div>
                    <div className="mt-1">Required reverification: <span className="text-foreground/85">{selected.governanceStatus?.requiredReverification ? "Yes" : "No"}</span></div>
                    <div className="mt-1">Latest accepted revision: <span className="text-foreground/85">{selected.governanceStatus?.acceptedRevisionNumber ? `r${selected.governanceStatus.acceptedRevisionNumber}` : "—"}</span></div>
                    <div className="mt-2">Blocking reason: <span className="text-foreground/85">{selected.governanceStatus?.blockingReasons?.[0] ?? "—"}</span></div>
                  </div>
                </Section>

                <Section title="Revision history">
                  <div className="space-y-2">
                    {revisionSplit.current ? (
                      <div className="rounded-lg border border-registry-accent/30 bg-registry-accent-soft px-3 py-3">
                        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-foreground">Current revision r{revisionSplit.current.revisionNumber}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{revisionSplit.current.changeSummary}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{revisionSplit.current.status}</Badge>
                            {revisionSplit.current.status === "PENDING_APPROVAL" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    setGovernanceError(null);
                                    setRevisingId(revisionSplit.current._id);
                                    await approveWorkOrderRevision({ workOrderRevisionId: revisionSplit.current._id as Id<"workOrderRevisions">, approvedBy: "operator" });
                                  } catch (err) {
                                    setGovernanceError(err instanceof Error ? err.message : "Failed to approve revision");
                                  } finally {
                                    setRevisingId(null);
                                  }
                                }}
                                disabled={revisingId === revisionSplit.current._id}
                              >
                                {revisingId === revisionSplit.current._id ? "Applying…" : "Approve & apply"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{summarizeRevisionEffects(revisionSplit.current)}</div>
                      </div>
                    ) : null}
                    {revisionSplit.historical.length ? revisionSplit.historical.map((revision: any) => (
                      <div key={revision._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-foreground">Historical revision r{revision.revisionNumber}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{revision.changeSummary}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{revision.status}</Badge>
                            {revision.status === "PENDING_APPROVAL" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    setGovernanceError(null);
                                    setRevisingId(revision._id);
                                    await approveWorkOrderRevision({ workOrderRevisionId: revision._id as Id<"workOrderRevisions">, approvedBy: "operator" });
                                  } catch (err) {
                                    setGovernanceError(err instanceof Error ? err.message : "Failed to approve revision");
                                  } finally {
                                    setRevisingId(null);
                                  }
                                }}
                                disabled={revisingId === revision._id}
                              >
                                {revisingId === revision._id ? "Applying…" : "Approve & apply"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">Changed: {revision.changedFields.join(", ") || "—"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Impact: {summarizeRevisionEffects(revision)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Actor: {revision.approvedBy ?? revision.requestedBy ?? "—"} · {revision.effectiveAt ? new Date(revision.effectiveAt).toLocaleString() : new Date(revision.createdAt).toLocaleString()}</div>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">No historical revisions yet.</p>
                    )}
                  </div>
                </Section>

                <Section title="Reopen and replacement lineage">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div>Prior accepted revision: <span className="text-foreground/85">{selected.governanceStatus?.latestAcceptedRevision ? `r${selected.governanceStatus.latestAcceptedRevision.revisionNumber}` : "—"}</span></div>
                    <div>Reopen reason: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.reason ?? "—"}</span></div>
                    <div>Source defect / issue: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.sourceIssueOrDefect ?? "—"}</span></div>
                    <div>Invalidated evidence: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.invalidatedReceiptIds?.length ?? 0}</span></div>
                    <div>Replacement WorkOrder: <span className="text-foreground/85">{selected.supersession?.replacementWorkOrderId ?? selected.workOrder.supersededByWorkOrderId ?? "—"}</span></div>
                  </div>
                </Section>

                <Section title="Verification traceability matrix">
                  <div className="space-y-2">
                    {selected.workOrder.acceptanceCriteria.map((criterion) => {
                      const receipt = latestReceiptMap.get(criterion.id) as any;
                      const blockingReason = receipt?.status === "FAILED"
                        ? "Latest receipt failed"
                        : receipt?.status === "STALE"
                          ? "Superseded by newer execution evidence"
                          : receipt?.status === "WAIVED" && !receipt.waiverApprovalDecisionId
                            ? "Waiver approval missing"
                            : !receipt
                              ? "Missing verification receipt"
                              : "—";
                      return (
                        <div key={criterion.id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">{criterion.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">Method: {criterion.verificationMethod ?? "MANUAL"}</div>
                              {criterion.description ? <div className="mt-1 text-xs text-muted-foreground">{criterion.description}</div> : null}
                            </div>
                            <Badge variant="outline">{receipt?.status ?? "MISSING"}</Badge>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                            <div>Evidence: <span className="text-foreground/85">{receipt?.evidenceLocation ?? receipt?.artifactReference ?? "—"}</span></div>
                            <div>Run: <span className="text-foreground/85">{selected.executionRuns.find((run) => run._id === receipt?.workflowRunId)?.runId ?? "—"}</span></div>
                            <div>Verifier: <span className="text-foreground/85">{receipt?.verifier ?? "—"}</span></div>
                            <div>Timestamp: <span className="text-foreground/85">{receipt?.recordedAt ? new Date(receipt.recordedAt).toLocaleString() : "—"}</span></div>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <div>Waiver / exception: <span className="text-foreground/85">{receipt?.exceptionOrWaiver ?? "—"}</span></div>
                            <div>Blocking reason: <span className="text-foreground/85">{blockingReason}</span></div>
                          </div>
                          {receipt?.commandOrCheck ? <div className="mt-2 text-xs text-muted-foreground">Check: {receipt.commandOrCheck}</div> : null}
                          {receipt?.result ? <div className="mt-1 text-xs text-muted-foreground">Result: {receipt.result}</div> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!receipt?.workflowRunId}
                              onClick={() => {
                                if (!receipt?.workflowRunId) return;
                                openRunInspector({
                                  runId: receipt.workflowRunId,
                                  receiptId: receipt._id,
                                  criterionId: receipt.acceptanceCriterionId ?? criterion.id,
                                });
                              }}
                            >
                              Inspect evidence
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Source of truth">
                  {selected.workOrder.sourceOfTruthRefs?.length ? (
                    <div className="space-y-2">
                      {selected.workOrder.sourceOfTruthRefs.map((ref) => (
                        <div key={`${ref.kind}-${ref.location}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--panel-line)] px-3 py-2 text-sm">
                          <div>
                            <div className="text-foreground">{ref.label}</div>
                            <div className="text-xs text-muted-foreground">{ref.kind} · {ref.location}</div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No source-of-truth references declared.</p>
                  )}
                </Section>

                <Section title="Linked execution runs">
                  <div className="mb-3 grid gap-3 rounded-lg border border-[var(--panel-line)] bg-background/30 p-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`dispatch-scope-${selected.workOrder._id}`}>
                        Approved code scope
                      </Label>
                      {activeLocalCodeScopes.length > 0 ? (
                        <>
                          <Select
                            value={selectedDispatchCodeScopeId}
                            onValueChange={(scopeId) =>
                              setDispatchCodeScopeSelections((current) => ({
                                ...current,
                                [selected.workOrder._id]: scopeId,
                              }))
                            }
                            disabled={Boolean(selected.workOrder.scopeEnforcementVersion && selected.workOrder.codeScopeIds?.length)}
                          >
                            <SelectTrigger
                              id={`dispatch-scope-${selected.workOrder._id}`}
                              className="mt-2"
                            >
                              <SelectValue placeholder="Select the approved file boundary" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeLocalCodeScopes.map((scope) => (
                                <SelectItem key={scope._id} value={scope._id}>
                                  {scope.name} · {scope.includePaths.join(", ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {selected.workOrder.scopeEnforcementVersion && selected.workOrder.codeScopeIds?.length
                              ? "This repository-relative boundary was frozen when the WorkOrder was created."
                              : "The worker rejects changed files outside this repository-relative boundary before push."}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-xs text-warning">
                          Add an active local code scope to the default repository before dispatch.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`dispatch-task-${selected.workOrder._id}`}>
                        Task to execute
                      </Label>
                      {selected.childTasks.length > 0 ? (
                        <>
                          <Select
                            value={selectedDispatchTaskId}
                            onValueChange={(taskId) =>
                              setDispatchTaskSelections((current) => ({
                                ...current,
                                [selected.workOrder._id]: taskId,
                              }))
                            }
                          >
                            <SelectTrigger
                              id={`dispatch-task-${selected.workOrder._id}`}
                              className="mt-2"
                            >
                              <SelectValue placeholder="Select a governed Child Task" />
                            </SelectTrigger>
                            <SelectContent>
                              {selected.childTasks
                                .filter((task) => ["READY", "ASSIGNED", "IN_PROGRESS"].includes(projectedTaskStatus(task)))
                                .map((task) => (
                                  <SelectItem key={task._id} value={task._id}>
                                    {task.identifier ? `${task.identifier} · ` : ""}
                                    {task.title}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Assign a Child Task, then select it explicitly. Dispatch creates one Attempt under that Task.
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          No canonical Child Tasks exist. This Work Order will use its legacy execution relationship.
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-[var(--panel-line)] bg-background/40 px-3 py-3 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Frozen Factory binding</div>
                          <div className="mt-1 text-sm text-foreground">
                            {activeFactory
                              ? `${activeFactory.repository.repository} · Factory v${activeFactory.version.version}`
                              : "No active Factory binding"}
                          </div>
                        </div>
                        <Badge variant="outline" className={activeFactory?.readyForBrowserDispatch ? "border-success/30 text-success" : "border-warning/30 text-warning"}>
                          {activeFactory?.readyForBrowserDispatch ? "Ready" : "Blocked"}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>Workflow: <span className="text-foreground/85">{activeFactory?.workflow?.workflowId ?? "Unavailable"}</span></span>
                        <span>Environment: <span className="text-foreground/85">{selected.workOrder.executionEnvironment ?? "LOCAL"}</span></span>
                        <span>Host: <span className="text-foreground/85">{activeFactory?.host?.hostId ?? "No current clean host"}</span></span>
                      </div>
                      {governedFactoryRequired ? <div className="mt-3 max-w-md space-y-1.5">
                        <Label htmlFor={`dispatch-factory-${selected.workOrder._id}`}>Factory version for this Attempt</Label>
                        <Select
                          value={selectedDispatchFactoryVersionId}
                          onValueChange={(versionId) => setDispatchFactorySelections((current) => ({ ...current, [selected.workOrder._id]: versionId }))}
                          disabled={!activeFactoryVersionId}
                        >
                          <SelectTrigger id={`dispatch-factory-${selected.workOrder._id}`} aria-label="Factory version for this Attempt">
                            <SelectValue placeholder="Select the current approved Factory version" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeFactoryVersionId ? <SelectItem value={activeFactoryVersionId}>Factory v{activeFactory?.version.version} · {activeFactoryVersionId}</SelectItem> : null}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Selection is revalidated and frozen into the immutable Attempt manifest at dispatch.</p>
                      </div> : null}
                    </div>
                    <div className="flex items-end justify-end md:col-span-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setDispatchError(null);
                          setDispatchingId(selected.workOrder._id);
                          const result = await dispatchWorkOrder({
                            workOrderId: selected.workOrder._id,
                            taskId: selectedDispatchTaskId
                              ? selectedDispatchTaskId as Id<"tasks">
                              : undefined,
                            workflowId: selected.workOrder.workflowId,
                            actorType: "HUMAN",
                            actorId: "operator",
                            idempotencyKey: `ui-dispatch:${selected.workOrder._id}:${selected.workOrder.updatedAt}`,
                            runtime: "Mission Control UI",
                            repositoryId: dispatchRepositoryId,
                            codeScopeIds: selectedDispatchCodeScopeIds,
                            executionEnvironment: selected.workOrder.executionEnvironment ?? "LOCAL",
                            executorHostId: governedFactoryRequired ? activeFactoryHostId : undefined,
                            factoryDefinitionVersionId: governedFactoryRequired
                              ? selectedDispatchFactoryVersionId as Id<"factoryDefinitionVersions">
                              : undefined,
                          });
                          if (result.reason === "routing-exhausted") {
                            throw new Error("Dispatch blocked: no safe model route satisfies this Work Order.");
                          }
                        } catch (err) {
                          setDispatchError(err instanceof Error ? err.message : "Dispatch failed");
                        } finally {
                          setDispatchingId(null);
                        }
                      }}
                      disabled={
                        !canDispatchSelected ||
                        dispatchingId === selected.workOrder._id ||
                        (selected.childTasks.length > 0 && !selectedDispatchTaskId) ||
                        (governedFactoryRequired && !factoryScopeMatches) ||
                        (governedFactoryRequired && !activeFactoryVersionId) ||
                        (governedFactoryRequired && selectedDispatchFactoryVersionId !== activeFactoryVersionId) ||
                        (governedFactoryRequired && !activeFactoryHostId) ||
                        (governedFactoryRequired && !activeFactory?.readyForBrowserDispatch)
                      }
                    >
                      {dispatchingId === selected.workOrder._id ? "Dispatching…" : "Dispatch"}
                    </Button>
                    </div>
                  </div>
                  {governedFactoryRequired && !factoryScopeMatches ? (
                    <div className="mb-3 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                      Select a code scope frozen into the active Factory version before dispatch.
                    </div>
                  ) : null}
                  {governedFactoryRequired && !activeFactoryVersionId ? (
                    <div className="mb-3 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                      Activate a passing Factory version for this repository before dispatch.
                    </div>
                  ) : null}
                  {governedFactoryRequired && activeFactoryVersionId && selectedDispatchFactoryVersionId !== activeFactoryVersionId ? (
                    <div className="mb-3 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                      Select the current approved Factory version before dispatch. The server freezes and revalidates this exact version.
                    </div>
                  ) : null}
                  {governedFactoryRequired && activeFactoryVersionId && !activeFactoryHostId ? (
                    <div className="mb-3 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                      Report a current clean local host binding for this exact repository before dispatch.
                    </div>
                  ) : null}
                  {dispatchError ? (
                    <div className="mb-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                      {dispatchError}
                    </div>
                  ) : null}
                  {selected.executionRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No execution runs linked yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selected.executionRuns.map((run) => (
                        <div key={run._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PlayCircle className="h-4 w-4 text-registry-accent" />
                              <span className="text-sm font-medium text-foreground">{run.workflowId}</span>
                              <Badge variant="outline">{run.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-muted-foreground">{run.runId}</div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openRunInspector({ runId: run._id })}
                              >
                                Inspect run
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <div>
                              Task:{" "}
                              <span className="text-foreground/85">
                                {selected.childTasks.find((task) => task._id === run.parentTaskId)?.title ??
                                  (run.parentTaskId ? "Legacy Task" : "Work Order run")}
                              </span>
                            </div>
                            <div>Runtime: <span className="text-foreground/85">{run.runtime ?? "—"}</span></div>
                            <div>Model: <span className="text-foreground/85">{run.model ?? "—"}</span></div>
                            <div>Worktree: <span className="font-mono text-foreground/85">{run.worktree ?? "—"}</span></div>
                            <div>Current step: <span className="text-foreground/85">{run.currentStepLabel ?? "—"}</span></div>
                            <div>Retries: <span className="text-foreground/85">{run.retryCount}</span></div>
                            <div>Human interventions: <span className="text-foreground/85">{run.humanInterventions}</span></div>
                          </div>
                          {run.failureReason ? (
                            <div className="mt-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
                              {run.failureReason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Lifecycle events">
                  {selected.events?.length ? (
                    <div className="space-y-2">
                      {selected.events.slice(0, 6).map((event) => (
                        <div key={event._id} className="rounded-lg border border-[var(--panel-line)] px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-foreground">{event.summary}</div>
                            <Badge variant="outline">{event.eventType}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {event.fromState ? `${prettyLabel(event.fromState)} → ` : ""}{event.toState ? prettyLabel(event.toState) : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No lifecycle events recorded yet.</p>
                  )}
                </Section>
                </WorkOrderDetailTabContext.Provider>
              </div>
            )}
          </Card>
        </div>
      </div>

      <CreateWorkOrderDialog
        open={createOpen}
        projectId={projectId}
        error={error}
        creating={creating}
        onClose={() => {
          setCreateOpen(false);
          setCreateRequestKey(null);
          setError(null);
        }}
        onCreate={async (payload) => {
          setCreating(true);
          setError(null);
          try {
            const result = await createWorkOrder({
              projectId: projectId ?? undefined,
              title: payload.title,
              desiredOutcome: payload.desiredOutcome,
              context: payload.context || undefined,
              workflowId: payload.workflowId,
              repository: payload.repository,
              repositoryId: payload.repositoryId as Id<"workspaceRepositories">,
              codeScopeIds: [payload.codeScopeId as Id<"repositoryCodeScopes">],
              owningTeamId: payload.owningTeamId as Id<"scrumTeams">,
              ownerMemberId: payload.ownerMemberId as Id<"orgMembers">,
              executionEnvironment: "LOCAL",
              branchStrategy: payload.branchStrategy || undefined,
              priority: Number(payload.priority) as 1 | 2 | 3 | 4,
              riskLevel: payload.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              requestedBy: payload.requestedBy || undefined,
              assignedAgent: payload.assignedAgent || undefined,
              requirements: nonEmptyLines(payload.requirements || payload.acceptanceCriteria).map((description, index) => ({
                id: `req-${index + 1}`,
                title: description,
                description,
                type: "FUNCTIONAL" as const,
                priority: "MUST" as const,
              })),
              acceptanceCriteria: criteriaFromText(payload.acceptanceCriteria).map((criterion, index) => ({
                ...criterion,
                requirementIds: [`req-${Math.min(index + 1, nonEmptyLines(payload.requirements || payload.acceptanceCriteria).length)}`],
                requiredEvidence: [{ category: payload.evidenceCategory as any, minimumCount: 1, independent: true }],
                verificationMethod: "COMMAND" as const,
              })),
              positiveConstraints: ["Implement only the declared outcome and preserve unrelated behavior."],
              negativeConstraints: [
                { id: "no-plaintext-secrets", type: "NO_PLAINTEXT_SECRETS" as const, description: "Do not introduce plaintext credentials or secrets." },
                { id: "no-assertion-weakening", type: "NO_ASSERTION_WEAKENING" as const, description: "Do not weaken or skip existing assertions." },
                { id: "no-test-removal", type: "NO_TEST_REMOVAL" as const, description: "Do not remove existing tests." },
                ...nonEmptyLines(payload.deniedPaths).map((path, index) => ({ id: `protected-path-${index + 1}`, type: "PROTECTED_PATH" as const, description: `Do not modify ${path}.`, paths: [path] })),
              ],
              dataBoundaries: nonEmptyLines(payload.deniedPaths).map((path, index) => ({ id: `protected-file-${index + 1}`, kind: "PROTECTED_FILE" as const, description: `Protected repository path: ${path}`, paths: [path] })),
              changeBudget: {
                maxFilesChanged: Number(payload.maxFilesChanged),
                maxLinesChanged: Number(payload.maxLinesChanged),
                allowedPaths: nonEmptyLines(payload.allowedPaths),
                deniedPaths: nonEmptyLines(payload.deniedPaths),
                allowedCommandClasses: [payload.commandClass as any],
                prohibitedCommandClasses: ["DESTRUCTIVE" as const, "PRODUCTION_ACCESS" as const, "SECRETS_ACCESS" as const, "PUBLISH" as const],
                allowDependencyChanges: false,
                allowSchemaChanges: false,
                allowMigrations: false,
                allowInfrastructureChanges: false,
              },
              verificationContract: {
                schemaVersion: 1,
                enforcementMode: payload.enforcementMode as "ENFORCED" | "OBSERVE_ONLY",
                requireHumanReview: payload.requireHumanReview === "yes",
                checks: [{
                  id: "independent-command",
                  name: "Independent verification command",
                  category: payload.verificationCategory as any,
                  verifierId: "factory-command/v1",
                  mandatory: true,
                  acceptanceCriterionIds: criteriaFromText(payload.acceptanceCriteria).map((criterion) => criterion.id),
                  evidenceCategory: payload.evidenceCategory as any,
                  command: {
                    executable: payload.verificationExecutable,
                    args: payload.verificationArgs,
                    commandClass: payload.commandClass as any,
                    timeoutMs: 10 * 60_000,
                  },
                }],
              },
              autonomyLevel: "LEVEL_2",
              requiredApprovals: payload.requireHumanReview === "yes" ? ["HUMAN_REVIEW"] : undefined,
              sourceOfTruthRefs: [{ kind: "REPO", label: payload.repository, location: `github.com/${payload.repository}` }],
              idempotencyKey: createRequestKey ?? undefined,
            });
            if (result.workOrder?._id) selectWorkOrder(result.workOrder._id);
            setMobileDetailOpen(true);
            setCreateOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create work order");
          } finally {
            setCreating(false);
          }
        }}
      />

      {createTaskOpen && selected && (
        <CreateTaskModal
          projectId={projectId}
          defaultWorkOrderId={selected.workOrder._id}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}

      <RequestApprovalDialog
        open={approvalOpen}
        workOrder={selected?.workOrder ?? null}
        creating={creating}
        onClose={() => setApprovalOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await requestApprovalDecision({
              workOrderId: selected.workOrder._id,
              workflowRunId: payload.workflowRunId ? payload.workflowRunId as Id<"workflowRuns"> : undefined,
              approvalType: payload.approvalType,
              requestedAction: payload.requestedAction,
              requestedBy: payload.requestedBy || undefined,
              riskLevel: selected.workOrder.riskLevel,
              idempotencyKey: `ui-approval:${selected.workOrder._id}:${payload.approvalType}:${payload.requestedAction}`,
            });
            setApprovalOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to request approval");
          } finally {
            setCreating(false);
          }
        }}
      />

      <RecordVerificationReceiptDialog
        open={receiptOpen}
        workOrder={selected?.workOrder ?? null}
        executionRuns={selected?.executionRuns ?? []}
        approvalDecisions={selected?.approvalDecisions ?? []}
        creating={creating}
        onClose={() => setReceiptOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await recordVerificationReceipt({
              workOrderId: selected.workOrder._id,
              workflowRunId: payload.workflowRunId as Id<"workflowRuns">,
              acceptanceCriterionId: payload.acceptanceCriterionId,
              verificationMethod: payload.verificationMethod as "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST",
              commandOrCheck: payload.commandOrCheck || undefined,
              result: payload.result || undefined,
              evidenceLocation: payload.evidenceLocation || undefined,
              artifactReference: payload.artifactReference || undefined,
              verifier: payload.verifier || undefined,
              status: payload.status as "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE",
              exceptionOrWaiver: payload.exceptionOrWaiver || undefined,
              waiverApprovalDecisionId: payload.waiverApprovalDecisionId ? payload.waiverApprovalDecisionId as Id<"approvalDecisions"> : undefined,
              idempotencyKey: `ui-receipt:${selected.workOrder._id}:${payload.acceptanceCriterionId}:${payload.workflowRunId}:${payload.status}`,
            });
            setReceiptOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to record verification receipt");
          } finally {
            setCreating(false);
          }
        }}
      />

      <RequestRevisionDialog
        open={revisionOpen}
        workOrder={selected?.workOrder ?? null}
        codeScopes={dispatchCodeScopes ?? []}
        creating={creating}
        onClose={() => setRevisionOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await requestWorkOrderRevision({
              workOrderId: selected.workOrder._id,
              idempotencyKey: `ui-revision:${selected.workOrder._id}:${Date.now()}`,
              changeSummary: payload.changeSummary,
              reason: payload.reason,
              requestedBy: payload.requestedBy || undefined,
              patch: {
                desiredOutcome: payload.desiredOutcome || undefined,
                workflowId: payload.workflowId || undefined,
                repository: payload.repository || undefined,
                codeScopeIds: payload.codeScopeIds,
                riskLevel: payload.riskLevel as any,
                requiredApprovals: payload.requiredApprovals,
                acceptanceCriteria: criteriaFromText(payload.acceptanceCriteria, selected.workOrder.acceptanceCriteria as any),
                changeBudget: payload.changeBudget,
                verificationContract: payload.verificationContract,
                metadata: {
                  ...(selected.workOrder.metadata ?? {}),
                  implementationPolicy: {
                    ...(selected.workOrder.metadata?.implementationPolicy ?? {}),
                    maxCostUsd: payload.maxTotalCostUsd,
                  },
                },
              },
            });
            setRevisionOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to request revision");
          } finally {
            setCreating(false);
          }
        }}
      />

      <ReopenWorkOrderDialog
        open={reopenOpen}
        workOrder={selected?.workOrder ?? null}
        creating={creating}
        onClose={() => setReopenOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await reopenWorkOrder({
              workOrderId: selected.workOrder._id,
              idempotencyKey: `ui-reopen:${selected.workOrder._id}:${Date.now()}`,
              reason: payload.reason,
              sourceIssueOrDefect: payload.sourceIssueOrDefect || undefined,
              requestedBy: payload.requestedBy || undefined,
              approvedBy: payload.approvedBy || undefined,
              reopenScope: payload.reopenScope,
              acceptanceCriteriaImpacted: payload.acceptanceCriteriaImpacted,
              newRequiredActions: payload.newRequiredActions,
            });
            setReopenOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to reopen WorkOrder");
          } finally {
            setCreating(false);
          }
        }}
      />

      <SupersedeWorkOrderDialog
        open={supersedeOpen}
        workOrders={workOrders ?? []}
        currentWorkOrderId={selected?.workOrder._id ?? null}
        creating={creating}
        onClose={() => setSupersedeOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await supersedeWorkOrder({
              workOrderId: selected.workOrder._id,
              replacementWorkOrderId: payload.replacementWorkOrderId as Id<"workOrders">,
              idempotencyKey: `ui-supersede:${selected.workOrder._id}:${payload.replacementWorkOrderId}`,
              reason: payload.reason,
              actorType: "HUMAN",
              actorId: payload.actorId || undefined,
            });
            setSupersedeOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to supersede WorkOrder");
          } finally {
            setCreating(false);
          }
        }}
      />

      <ExecutionRunInspector
        open={Boolean(requestedInspectorRunId && selected !== undefined)}
        workflowRunId={inspectorRunId}
        verificationReceiptId={inspectorReceiptId}
        acceptanceCriterionId={inspectorCriterionId}
        unavailable={inspectorUnavailable}
        retrying={!!selected && dispatchingId === selected.workOrder._id}
        onRetryFailedRun={selected
            ? async ({ workflowRunId, reason, runtime, model }) => {
              setDispatchError(null);
              setDispatchingId(selected.workOrder._id);
              try {
                const retryRun = selected.executionRuns.find((run) => run._id === workflowRunId);
                if (retryRun?.attemptPurpose === "VERIFICATION") {
                  await retryVerificationAttempt({
                    workOrderId: selected.workOrder._id,
                    failedVerificationAttemptId: workflowRunId,
                    reason,
                  });
                  return;
                }
                const result = await dispatchWorkOrder({
                  workOrderId: selected.workOrder._id,
                  workflowId: selected.workOrder.workflowId,
                  actorType: "HUMAN",
                  actorId: "operator",
                  idempotencyKey: `ui-retry:${workflowRunId}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
                  runtime: runtime ?? "Mission Control UI",
                  model,
                  retryOfWorkflowRunId: workflowRunId,
                  retryReason: reason,
                  repositoryId: selected.workOrder.repositoryId,
                  codeScopeIds: selected.workOrder.codeScopeIds,
                  executionEnvironment: selected.workOrder.executionEnvironment ?? "LOCAL",
                  executorHostId: governedFactoryRequired ? activeFactoryHostId : undefined,
                  factoryDefinitionVersionId: governedFactoryRequired
                    ? activeFactoryVersionId
                    : undefined,
                });
                if (result.reason === "routing-exhausted") {
                  throw new Error("Retry blocked: no safe model route satisfies this Work Order.");
                }
              } finally {
                setDispatchingId(null);
              }
            }
          : undefined}
        onClose={closeRunInspector}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={`${label} filter`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WorkOrderDetailTabs({
  active,
  onChange,
  taskCount,
  auditCount,
  reviewReady,
}: {
  active: WorkOrderDetailTab;
  onChange: (tab: WorkOrderDetailTab) => void;
  taskCount: number;
  auditCount: number;
  reviewReady: boolean;
}) {
  const counts: Partial<Record<WorkOrderDetailTab, number>> = {
    tasks: taskCount,
    audit: auditCount,
  };
  return (
    <div
      role="tablist"
      aria-label="Work Order detail"
      className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--panel-line)] bg-background/30 p-1 sm:grid-cols-5"
    >
      {WORK_ORDER_DETAIL_TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${selected ? "bg-card text-foreground shadow-sm ring-1 ring-[var(--panel-line)]" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}
          >
            <span>{tab.label}</span>
            {counts[tab.id] != null ? <span className="font-mono text-[10px] text-muted-foreground">{counts[tab.id]}</span> : null}
            {tab.id === "review" && reviewReady ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-label="Review package ready" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element | null {
  const activeTab = useContext(WorkOrderDetailTabContext);
  const sectionTab = SECTION_DETAIL_TAB[title] ?? "overview";
  if (activeTab && activeTab !== sectionTab) return null;
  const reviewOrder = title === "Acceptance readiness"
    ? "order-1"
    : title === "Independent verification"
      ? "order-2"
      : title === "Candidate decision"
        ? "order-3"
        : "";
  return (
    <section className={activeTab === "review" ? reviewOrder : undefined} data-work-order-section={sectionTab}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function ExecutableSpecificationPanel({ workOrder }: { workOrder: any }) {
  const contract = workOrder.verificationContract;
  const budget = workOrder.changeBudget;
  return (
    <Section title="Executable specification">
      <div className="overflow-hidden rounded-xl border border-[var(--panel-line)] bg-background/30">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--panel-line)] px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Specification v{workOrder.specificationVersion ?? 1}</div>
            <p className="mt-1 text-xs text-muted-foreground">Frozen requirements, negative space, budget, and proof obligations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Autonomy {workOrder.autonomyLevel ?? "Not declared"}</Badge>
            <Badge variant="outline">{contract?.enforcementMode ?? "NO CONTRACT"}</Badge>
          </div>
        </div>
        <div className="grid gap-px bg-[var(--panel-line)]">
          <div className="bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Requirements</div>
            {workOrder.requirements?.length ? (
              <ol className="mt-3 space-y-2">
                {workOrder.requirements.map((requirement: any) => (
                  <li key={requirement.id} className="text-sm text-foreground/85">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{requirement.id}</span>{requirement.title}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-warning">No first-class requirements were declared.</p>}
          </div>
          <div className="bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Risk classification</div>
            <div className="mt-3 flex items-center gap-2"><Badge variant="outline" className={RISK_STYLES[workOrder.riskLevel] ?? ""}>{workOrder.riskLevel}</Badge><span className="text-xs text-muted-foreground">server classified</span></div>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {(workOrder.riskReasons ?? ["No classification reasons recorded."]).map((reason: string) => <li key={reason}>• {reason}</li>)}
            </ul>
          </div>
          <div className="bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Change budget</div>
            {budget ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <MetaRow label="Maximum files" value={String(budget.maxFilesChanged)} />
                <MetaRow label="Maximum lines" value={String(budget.maxLinesChanged)} />
                <MetaRow className="col-span-2" label="Allowed paths" value={budget.allowedPaths.join(", ") || "None"} />
                <MetaRow className="col-span-2" label="Denied paths" value={budget.deniedPaths.join(", ") || "None"} />
              </dl>
            ) : <p className="mt-3 text-sm text-warning">No change budget configured.</p>}
          </div>
          <div className="bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Negative-space constraints</div>
            {workOrder.negativeConstraints?.length ? (
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                {workOrder.negativeConstraints.map((constraint: any) => <li key={constraint.id} className="break-words"><span className="font-mono text-foreground/75 [overflow-wrap:anywhere]">{constraint.type}</span> · {constraint.description}</li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-warning">No negative constraints declared.</p>}
          </div>
        </div>
        <div className="border-t border-[var(--panel-line)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mandatory verification checks</div>
          {contract?.checks?.length ? (
            <div className="mt-3 space-y-2">
              {contract.checks.map((check: any) => (
                <div key={check.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--panel-line)] px-3 py-2 text-xs">
                  <div><span className="font-medium text-foreground">{check.name}</span><span className="ml-2 text-muted-foreground">{check.category} · {check.verifierId}</span></div>
                  <code className="max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]">{check.command ? `${check.command.executable} ${check.command.args.join(" ")}` : "No command configured"}</code>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-warning">No executable verification checks configured.</p>}
        </div>
      </div>
    </Section>
  );
}

function IndependentVerificationPanel({ receipt, verificationRuns, onInspect }: { receipt: any; verificationRuns: any[]; onInspect: (workflowRunId: string, receiptId: string) => void }) {
  const verdict = receipt?.verdict ?? "NOT_VERIFIED";
  const successful = verdict === "VERIFIED";
  return (
    <Section title="Independent verification">
      <div className={`rounded-xl border p-4 ${successful ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`text-lg font-semibold ${successful ? "text-success" : "text-warning"}`}>{receipt ? verdict : "No Work Order receipt"}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {receipt ? receipt.verdictReasons?.join(" ") : "This Work Order has not produced server-recomputed proof. Agent-reported commands do not count as verification."}
            </p>
          </div>
          {receipt ? <Badge variant="outline">{receipt.requirementsPassed ?? 0} passed · {receipt.requirementsFailed ?? 0} missing</Badge> : null}
        </div>
        {receipt?.checks?.length ? (
          <details className="mt-4 rounded-lg border border-[var(--panel-line)] bg-card" open={!successful}>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {successful ? `Show ${receipt.checks.length} passing checks` : `Inspect ${receipt.checks.length} verification checks`}
            </summary>
          <div className="overflow-x-auto border-t border-[var(--panel-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label="Verification check results">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--panel-line)] text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Check</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Evidence</th><th className="px-3 py-2 font-medium">Summary</th></tr></thead>
              <tbody className="divide-y divide-[var(--panel-line)]">
                {receipt.checks.map((check: any) => <tr key={check.checkId}><td className="px-3 py-2 text-foreground">{check.name}</td><td className={`px-3 py-2 font-medium ${check.status === "PASS" ? "text-success" : "text-danger"}`}>{check.status}</td><td className="px-3 py-2 text-muted-foreground">{check.evidenceIds?.length ?? 0}</td><td className="max-w-md px-3 py-2 text-muted-foreground">{check.summary}</td></tr>)}
              </tbody>
            </table>
          </div>
          </details>
        ) : null}
        {receipt?.violations?.length ? <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{receipt.violations.join(" ")}</div> : null}
        {receipt?.workflowRunId ? <Button className="mt-3" size="sm" variant="outline" onClick={() => onInspect(receipt.workflowRunId, receipt._id)}>Inspect evidence lineage</Button> : null}
        {verificationRuns.length > 1 ? <p className="mt-3 text-xs text-muted-foreground">{verificationRuns.length - 1} prior verification run{verificationRuns.length === 2 ? "" : "s"} retained for audit.</p> : null}
      </div>
    </Section>
  );
}

function MetaRow({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={`flex min-w-0 items-start justify-between gap-3 ${className}`}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-foreground/85 [overflow-wrap:anywhere]">{value ?? "—"}</dd>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-danger" : "text-foreground"}`}>
        {value}
      </div>
    </Card>
  );
}

function RequestApprovalDialog({
  open,
  workOrder,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: { approvalType: string; requestedAction: string; requestedBy: string; workflowRunId: string }) => Promise<void>;
}) {
  const defaultType = workOrder?.requiredApprovals?.[0] ?? (["HIGH", "CRITICAL"].includes(workOrder?.riskLevel) ? "RISK_REVIEW" : "OPERATOR_REVIEW");
  const [approvalType, setApprovalType] = useState(defaultType);
  const [requestedAction, setRequestedAction] = useState("Approve protected implementation dispatch");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [workflowRunId, setWorkflowRunId] = useState("");

  useEffect(() => {
    setApprovalType(defaultType);
    setRequestedAction("Approve protected implementation dispatch");
    setRequestedBy("operator");
    setWorkflowRunId("");
  }, [defaultType, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Request approval</DialogTitle>
          <DialogDescription>Create an auditable ApprovalDecision linked to this WorkOrder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Approval type</Label><Input value={approvalType} onChange={(event) => setApprovalType(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Requested action</Label><Textarea value={requestedAction} onChange={(event) => setRequestedAction(event.target.value)} rows={3} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Execution run ID (optional)</Label><Input value={workflowRunId} onChange={(event) => setWorkflowRunId(event.target.value)} placeholder="w57..." /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ approvalType, requestedAction, requestedBy, workflowRunId })} disabled={creating || !approvalType.trim() || !requestedAction.trim()}>{creating ? "Requesting…" : "Request approval"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordVerificationReceiptDialog({
  open,
  workOrder,
  executionRuns,
  approvalDecisions,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  executionRuns: any[];
  approvalDecisions: any[];
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    acceptanceCriterionId: string;
    workflowRunId: string;
    verificationMethod: string;
    commandOrCheck: string;
    result: string;
    evidenceLocation: string;
    artifactReference: string;
    verifier: string;
    status: string;
    exceptionOrWaiver: string;
    waiverApprovalDecisionId: string;
  }) => Promise<void>;
}) {
  const [acceptanceCriterionId, setAcceptanceCriterionId] = useState("");
  const [workflowRunId, setWorkflowRunId] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("MANUAL");
  const [commandOrCheck, setCommandOrCheck] = useState("");
  const [result, setResult] = useState("");
  const [evidenceLocation, setEvidenceLocation] = useState("");
  const [artifactReference, setArtifactReference] = useState("");
  const [verifier, setVerifier] = useState("operator");
  const [status, setStatus] = useState("PASSED");
  const [exceptionOrWaiver, setExceptionOrWaiver] = useState("");
  const [waiverApprovalDecisionId, setWaiverApprovalDecisionId] = useState("");

  useEffect(() => {
    setAcceptanceCriterionId(workOrder?.acceptanceCriteria?.[0]?.id ?? "");
    setWorkflowRunId((executionRuns?.[0]?._id as string | undefined) ?? "");
  }, [workOrder, executionRuns, open]);

  const waiverOptions = approvalDecisions.filter((approval) => approval.status === "APPROVED" || approval.status === "CONDITIONAL");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Record verification receipt</DialogTitle>
          <DialogDescription>Attach evidence to one acceptance criterion and mark whether it passed, failed, or was waived.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Acceptance criterion</Label>
              <Select value={acceptanceCriterionId} onValueChange={setAcceptanceCriterionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(workOrder?.acceptanceCriteria ?? []).map((criterion: any) => <SelectItem key={criterion.id} value={criterion.id}>{criterion.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Execution run</Label>
              <Select value={workflowRunId} onValueChange={setWorkflowRunId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {executionRuns.map((run) => <SelectItem key={run._id} value={run._id}>{run.runId} · {run.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['MANUAL', 'COMMAND', 'TEST', 'CHECKLIST'].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['PASSED', 'FAILED', 'WAIVED', 'PENDING'].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Verifier</Label><Input value={verifier} onChange={(event) => setVerifier(event.target.value)} /></div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Command or check</Label><Input value={commandOrCheck} onChange={(event) => setCommandOrCheck(event.target.value)} placeholder="pnpm --filter mission-control-ui build" /></div>
            <div className="space-y-1.5"><Label>Result</Label><Textarea value={result} onChange={(event) => setResult(event.target.value)} rows={3} placeholder="Build completed successfully" /></div>
            <div className="space-y-1.5"><Label>Evidence location</Label><Input value={evidenceLocation} onChange={(event) => setEvidenceLocation(event.target.value)} placeholder="docs/software-factory/verification-receipt.md" /></div>
            <div className="space-y-1.5"><Label>Artifact reference</Label><Input value={artifactReference} onChange={(event) => setArtifactReference(event.target.value)} placeholder="tmp/screenshot.png or PR URL" /></div>
            <div className="space-y-1.5"><Label>Exception / waiver note</Label><Input value={exceptionOrWaiver} onChange={(event) => setExceptionOrWaiver(event.target.value)} placeholder="Why a waiver is acceptable" /></div>
            {status === "WAIVED" ? (
              <div className="space-y-1.5">
                <Label>Waiver approval</Label>
                <Select value={waiverApprovalDecisionId} onValueChange={setWaiverApprovalDecisionId}>
                  <SelectTrigger><SelectValue placeholder="Select approved decision" /></SelectTrigger>
                  <SelectContent>
                    {waiverOptions.map((approval) => <SelectItem key={approval._id} value={approval._id}>{approval.approvalType} · {approval.status}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ acceptanceCriterionId, workflowRunId, verificationMethod, commandOrCheck, result, evidenceLocation, artifactReference, verifier, status, exceptionOrWaiver, waiverApprovalDecisionId })} disabled={creating || !acceptanceCriterionId || !workflowRunId}>{creating ? "Recording…" : "Record receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestRevisionDialog({
  open,
  workOrder,
  codeScopes,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  codeScopes: Array<Doc<"repositoryCodeScopes">>;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    changeSummary: string;
    reason: string;
    requestedBy: string;
    desiredOutcome: string;
    workflowId: string;
    repository: string;
    codeScopeIds: Array<Id<"repositoryCodeScopes">>;
    riskLevel: string;
    requiredApprovals: string[];
    acceptanceCriteria: string;
    changeBudget: NonNullable<Doc<"workOrders">["changeBudget"]>;
    maxTotalCostUsd: number;
    verificationContract: Doc<"workOrders">["verificationContract"];
  }) => Promise<void>;
}) {
  const [changeSummary, setChangeSummary] = useState("Clarify or revise WorkOrder scope");
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [repository, setRepository] = useState("");
  const [codeScopeIds, setCodeScopeIds] = useState<Array<Id<"repositoryCodeScopes">>>([]);
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [requiredApprovalsText, setRequiredApprovalsText] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [maxFilesChanged, setMaxFilesChanged] = useState("");
  const [maxLinesChanged, setMaxLinesChanged] = useState("");
  const [maxTotalCostUsd, setMaxTotalCostUsd] = useState("");
  const [allowedPathsText, setAllowedPathsText] = useState("");
  const [deniedPathsText, setDeniedPathsText] = useState("");
  const [allowSchemaChanges, setAllowSchemaChanges] = useState(false);
  const [verificationCommands, setVerificationCommands] = useState<Array<{
    id: string;
    name: string;
    executable: string;
    argsText: string;
  }>>([]);

  useEffect(() => {
    if (!open || !workOrder) return;
    setDesiredOutcome(workOrder.desiredOutcome ?? "");
    setWorkflowId(workOrder.workflowId ?? "");
    setRepository(workOrder.repository ?? "");
    setCodeScopeIds(workOrder.codeScopeIds ?? []);
    setRiskLevel(workOrder.riskLevel ?? "MEDIUM");
    setRequiredApprovalsText((workOrder.requiredApprovals ?? []).join("\n"));
    setAcceptanceCriteria((workOrder.acceptanceCriteria ?? []).map((criterion: any) => criterion.title).join("\n"));
    setMaxFilesChanged(workOrder.changeBudget?.maxFilesChanged?.toString() ?? "");
    setMaxLinesChanged(workOrder.changeBudget?.maxLinesChanged?.toString() ?? "");
    setMaxTotalCostUsd(workOrder.metadata?.implementationPolicy?.maxCostUsd?.toString() ?? "0");
    setAllowedPathsText((workOrder.changeBudget?.allowedPaths ?? []).join("\n"));
    setDeniedPathsText((workOrder.changeBudget?.deniedPaths ?? []).join("\n"));
    setAllowSchemaChanges(Boolean(workOrder.changeBudget?.allowSchemaChanges));
    setVerificationCommands((workOrder.verificationContract?.checks ?? []).map((check: any) => ({
      id: check.id,
      name: check.name,
      executable: check.command?.executable ?? "",
      argsText: JSON.stringify(check.command?.args ?? [], null, 2),
    })));
  }, [open, workOrder]);

  const parsedMaxTotalCostUsd = Number(maxTotalCostUsd);
  const hasValidTotalCostCap = maxTotalCostUsd.trim().length > 0
    && Number.isFinite(parsedMaxTotalCostUsd)
    && parsedMaxTotalCostUsd >= 0;
  const parsedVerificationCommands = verificationCommands.map((command) => ({
    ...command,
    parsedArgs: parseVerificationArguments(command.argsText),
  }));
  const hasInvalidVerificationCommand = parsedVerificationCommands.some((command) =>
    !command.executable.trim() || !command.parsedArgs.ok
  );
  const revisedVerificationContract = workOrder?.verificationContract
    ? {
        ...workOrder.verificationContract,
        checks: (workOrder.verificationContract.checks ?? []).map((check: any, index: number) => {
          const draft = parsedVerificationCommands[index];
          if (!draft || !draft.parsedArgs.ok) return check;
          return {
            ...check,
            command: {
              ...check.command,
              executable: draft.executable.trim(),
              args: draft.parsedArgs.args,
            },
          };
        }),
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Request WorkOrder revision</DialogTitle>
          <DialogDescription>Version a controlled revision. Accepted work stays immutable until a revision is explicitly applied.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Change summary</Label><Input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Why does this revision need to happen?" /></div>
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Desired outcome</Label><Textarea value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} rows={4} /></div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Workflow</Label><Input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Repository</Label><Input value={repository} onChange={(event) => setRepository(event.target.value)} /></div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Approved code scopes</legend>
              <div className="space-y-2 rounded-lg border border-[var(--panel-line)] bg-background/40 p-3">
                {codeScopes.filter((scope) => scope.active).map((scope) => {
                  const checked = codeScopeIds.includes(scope._id);
                  return (
                    <label key={scope._id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={(event) => setCodeScopeIds((current) => event.target.checked
                          ? [...new Set([...current, scope._id])]
                          : current.filter((scopeId) => scopeId !== scope._id))}
                      />
                      <span><span className="font-medium text-foreground">{scope.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{scope.includePaths.join(", ")}</span></span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label>Risk level</Label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Required approvals</Label><Textarea value={requiredApprovalsText} onChange={(event) => setRequiredApprovalsText(event.target.value)} rows={3} placeholder="One per line" /></div>
            <div className="space-y-1.5"><Label>Acceptance criteria</Label><Textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} rows={5} placeholder="One criterion per line" /></div>
          </div>
          <div className="space-y-3 md:col-span-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Change budget</div>
              <p className="mt-1 text-xs text-muted-foreground">Revise the cumulative cost cap and exact repository boundary the executor must enforce. Material budget or scope changes require separate approval.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5"><Label>Total implementation cap (USD)</Label><Input aria-label="Total implementation cap (USD)" type="number" min={0} step="0.01" value={maxTotalCostUsd} onChange={(event) => setMaxTotalCostUsd(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Maximum files</Label><Input type="number" min={1} value={maxFilesChanged} onChange={(event) => setMaxFilesChanged(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Maximum lines</Label><Input type="number" min={1} value={maxLinesChanged} onChange={(event) => setMaxLinesChanged(event.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">This is the cumulative WorkOrder authorization across attempts. The Factory still enforces its per-attempt cap.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Allowed paths</Label><Textarea aria-label="Allowed paths" value={allowedPathsText} onChange={(event) => setAllowedPathsText(event.target.value)} rows={7} placeholder="One repository-relative path pattern per line" /></div>
              <div className="space-y-1.5"><Label>Denied paths</Label><Textarea aria-label="Denied paths" value={deniedPathsText} onChange={(event) => setDeniedPathsText(event.target.value)} rows={7} placeholder="One repository-relative path pattern per line" /></div>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-[var(--panel-line)] bg-background/40 p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={allowSchemaChanges} onChange={(event) => setAllowSchemaChanges(event.target.checked)} />
              <span><span className="font-medium text-foreground">Allow schema changes</span><span className="mt-0.5 block text-xs text-muted-foreground">Required only when the approved outcome explicitly includes a bounded schema change.</span></span>
            </label>
          </div>
          {verificationCommands.length > 0 ? (
            <div className="space-y-3 md:col-span-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">Independent verification contract</div>
                <p className="mt-1 text-xs text-muted-foreground">Revise exact executable and argv values without shell expansion. Changing this frozen contract requires the governance resets calculated by policy.</p>
              </div>
              <div className="space-y-3">
                {parsedVerificationCommands.map((command, index) => (
                  <div key={command.id} className="rounded-lg border border-[var(--panel-line)] bg-background/40 p-3">
                    <div className="text-sm font-medium text-foreground">{command.name}</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[0.6fr_1.4fr]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`revision-verification-executable-${index}`}>Executable</Label>
                        <Input
                          id={`revision-verification-executable-${index}`}
                          aria-label={`Verification executable for ${command.name}`}
                          value={command.executable}
                          onChange={(event) => setVerificationCommands((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, executable: event.target.value } : item))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`revision-verification-arguments-${index}`}>Arguments (exact JSON argv)</Label>
                        <Textarea
                          id={`revision-verification-arguments-${index}`}
                          aria-label={`Verification arguments for ${command.name}`}
                          value={command.argsText}
                          onChange={(event) => setVerificationCommands((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, argsText: event.target.value } : item))}
                          rows={4}
                          spellCheck={false}
                          className="font-mono text-xs"
                        />
                        {"error" in command.parsedArgs ? <p role="alert" className="text-xs text-danger">{command.parsedArgs.error}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({
            changeSummary,
            reason,
            requestedBy,
            desiredOutcome,
            workflowId,
            repository,
            codeScopeIds,
            riskLevel,
            requiredApprovals: requiredApprovalsText.split("\n").map((line) => line.trim()).filter(Boolean),
            acceptanceCriteria,
            maxTotalCostUsd: parsedMaxTotalCostUsd,
            verificationContract: revisedVerificationContract,
            changeBudget: {
              maxFilesChanged: maxFilesChanged ? Number(maxFilesChanged) : workOrder.changeBudget?.maxFilesChanged ?? 1,
              maxLinesChanged: maxLinesChanged ? Number(maxLinesChanged) : workOrder.changeBudget?.maxLinesChanged ?? 1,
              allowedPaths: nonEmptyLines(allowedPathsText),
              deniedPaths: nonEmptyLines(deniedPathsText),
              allowedCommandClasses: workOrder.changeBudget?.allowedCommandClasses ?? [],
              prohibitedCommandClasses: workOrder.changeBudget?.prohibitedCommandClasses ?? [],
              allowSchemaChanges,
              allowMigrations: Boolean(workOrder.changeBudget?.allowMigrations),
              allowDependencyChanges: Boolean(workOrder.changeBudget?.allowDependencyChanges),
              allowInfrastructureChanges: Boolean(workOrder.changeBudget?.allowInfrastructureChanges),
            },
          })} disabled={creating || !changeSummary.trim() || !reason.trim() || !hasValidTotalCostCap || hasInvalidVerificationCommand}>{creating ? "Saving…" : "Request revision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenWorkOrderDialog({
  open,
  workOrder,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    reason: string;
    sourceIssueOrDefect: string;
    requestedBy: string;
    approvedBy: string;
    reopenScope: string;
    acceptanceCriteriaImpacted: string[];
    newRequiredActions: string[];
  }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [sourceIssueOrDefect, setSourceIssueOrDefect] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [approvedBy, setApprovedBy] = useState("operator");
  const [reopenScope, setReopenScope] = useState("full-workorder");
  const [acceptanceCriteriaImpactedText, setAcceptanceCriteriaImpactedText] = useState("");
  const [newRequiredActionsText, setNewRequiredActionsText] = useState("Review defect\nRecord replacement evidence\nRedispatch if implementation must change");

  useEffect(() => {
    if (!open || !workOrder) return;
    setAcceptanceCriteriaImpactedText((workOrder.acceptanceCriteria ?? []).map((criterion: any) => criterion.id).join("\n"));
  }, [open, workOrder]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Reopen WorkOrder</DialogTitle>
          <DialogDescription>Preserve prior evidence and explicitly mark what became invalid and what must happen next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Defect discovered, evidence invalidated, reviewer requested correction…" /></div>
          <div className="space-y-1.5"><Label>Source issue or defect</Label><Input value={sourceIssueOrDefect} onChange={(event) => setSourceIssueOrDefect(event.target.value)} placeholder="Issue / defect / incident reference" /></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Approved by</Label><Input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reopen scope</Label><Input value={reopenScope} onChange={(event) => setReopenScope(event.target.value)} /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Impacted criteria IDs</Label><Textarea value={acceptanceCriteriaImpactedText} onChange={(event) => setAcceptanceCriteriaImpactedText(event.target.value)} rows={4} /></div>
            <div className="space-y-1.5"><Label>New required actions</Label><Textarea value={newRequiredActionsText} onChange={(event) => setNewRequiredActionsText(event.target.value)} rows={4} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({
            reason,
            sourceIssueOrDefect,
            requestedBy,
            approvedBy,
            reopenScope,
            acceptanceCriteriaImpacted: acceptanceCriteriaImpactedText.split("\n").map((line) => line.trim()).filter(Boolean),
            newRequiredActions: newRequiredActionsText.split("\n").map((line) => line.trim()).filter(Boolean),
          })} disabled={creating || !reason.trim()}>{creating ? "Reopening…" : "Reopen WorkOrder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupersedeWorkOrderDialog({
  open,
  workOrders,
  currentWorkOrderId,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrders: any[];
  currentWorkOrderId: string | null;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: { replacementWorkOrderId: string; reason: string; actorId: string }) => Promise<void>;
}) {
  const [replacementWorkOrderId, setReplacementWorkOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [actorId, setActorId] = useState("operator");

  const options = (workOrders ?? []).filter((item) => item._id !== currentWorkOrderId);

  useEffect(() => {
    if (!open) return;
    setReplacementWorkOrderId(options[0]?._id ?? "");
  }, [open, currentWorkOrderId]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Supersede WorkOrder</DialogTitle>
          <DialogDescription>Link this WorkOrder to its authoritative replacement without losing unresolved obligations or evidence history.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Replacement WorkOrder</Label>
            <Select value={replacementWorkOrderId} onValueChange={setReplacementWorkOrderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((option) => <SelectItem key={option._id} value={option._id}>{option.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></div>
          <div className="space-y-1.5"><Label>Actor</Label><Input value={actorId} onChange={(event) => setActorId(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ replacementWorkOrderId, reason, actorId })} disabled={creating || !replacementWorkOrderId || !reason.trim()}>{creating ? "Superseding…" : "Supersede WorkOrder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkOrderDialog({
  open,
  projectId,
  creating,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  projectId: Id<"projects"> | null;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    desiredOutcome: string;
    context: string;
    workflowId: string;
    repositoryId: string;
    repository: string;
    codeScopeId: string;
    owningTeamId: string;
    ownerMemberId: string;
    branchStrategy: string;
    priority: string;
    riskLevel: string;
    requestedBy: string;
    assignedAgent: string;
    requirements: string;
    acceptanceCriteria: string;
    allowedPaths: string;
    deniedPaths: string;
    maxFilesChanged: string;
    maxLinesChanged: string;
    enforcementMode: string;
    verificationCategory: string;
    evidenceCategory: string;
    commandClass: string;
    verificationExecutable: string;
    verificationArgs: string[];
    requireHumanReview: string;
  }) => Promise<void>;
}) {
  const repositories = useQuery(
    api.projects.listRepositories,
    open && projectId ? { projectId } : "skip",
  );
  const structure = useQuery(
    api.softwareFactoryControlPlane.listWorkspaceStructure,
    open && projectId ? { projectId } : "skip",
  );
  const [title, setTitle] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [context, setContext] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [codeScopeId, setCodeScopeId] = useState("");
  const [owningTeamId, setOwningTeamId] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [branchStrategy, setBranchStrategy] = useState("isolated feature branch and worktree");
  const [priority, setPriority] = useState("2");
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [requestedBy, setRequestedBy] = useState("Hermes");
  const [assignedAgent, setAssignedAgent] = useState("Pi");
  const [requirements, setRequirements] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [allowedPaths, setAllowedPaths] = useState("apps/mission-control-ui/src/**");
  const [deniedPaths, setDeniedPaths] = useState("convex/schema.ts\n.github/workflows/**\n.env*");
  const [maxFilesChanged, setMaxFilesChanged] = useState("8");
  const [maxLinesChanged, setMaxLinesChanged] = useState("400");
  const [enforcementMode, setEnforcementMode] = useState("ENFORCED");
  const [verificationCategory, setVerificationCategory] = useState("TYPECHECK");
  const [evidenceCategory, setEvidenceCategory] = useState("STATIC_ANALYSIS");
  const [commandClass, setCommandClass] = useState("TYPECHECK");
  const [verificationExecutable, setVerificationExecutable] = useState("");
  const [verificationArgsText, setVerificationArgsText] = useState("[]");
  const [requireHumanReview, setRequireHumanReview] = useState("yes");
  const factoryContext = useQuery(
    api["factory/configuration"].getActiveForRepository,
    open && projectId && repositoryId
      ? { projectId, repositoryId: repositoryId as Id<"workspaceRepositories"> }
      : "skip",
  );
  const readyRepositories = (repositories ?? []).filter((repository) => repository.repositoryId && repository.status === "READY");
  const approvedLocalScopes = (factoryContext?.codeScopes ?? []).filter((scope) =>
    scope.active && scope.allowedEnvironments.includes("LOCAL")
  );
  const selectedRepository = readyRepositories.find((repository) => repository.repositoryId === repositoryId);
  const selectedScope = approvedLocalScopes.find((scope) => scope._id === codeScopeId);
  const selectedTeamMemberIds = useMemo(
    () => new Set((structure?.memberships ?? [])
      .filter((membership) => membership.active && membership.teamId === owningTeamId)
      .map((membership) => membership.memberId)),
    [owningTeamId, structure],
  );
  const eligibleOwners = (structure?.members ?? []).filter((member) => member.active && selectedTeamMemberIds.has(member._id));
  const parsedVerificationArgs = parseVerificationArguments(verificationArgsText);
  const verificationArgsError = "error" in parsedVerificationArgs ? parsedVerificationArgs.error : null;

  useEffect(() => {
    if (!open || readyRepositories.length === 0) return;
    if (!readyRepositories.some((repository) => repository.repositoryId === repositoryId)) {
      const nextRepository = readyRepositories.find((repository) => repository.isDefault) ?? readyRepositories[0];
      setRepositoryId(nextRepository.repositoryId ?? "");
      setCodeScopeId("");
      setOwningTeamId("");
      setOwnerMemberId("");
    }
  }, [open, readyRepositories, repositoryId]);

  useEffect(() => {
    if (!open || approvedLocalScopes.length !== 1 || codeScopeId) return;
    const scope = approvedLocalScopes[0];
    setCodeScopeId(scope._id);
    setOwningTeamId(scope.owningTeamId ?? "");
    setOwnerMemberId("");
    setAllowedPaths(scope.includePaths.join("\n"));
    setDeniedPaths([...scope.excludePaths, "convex/schema.ts", ".github/workflows/**", ".env*"].join("\n"));
  }, [approvedLocalScopes, codeScopeId, open]);

  const configurationIssue = !projectId
    ? "Select a workspace before creating governed work."
    : repositories === undefined || structure === undefined || (repositoryId && factoryContext === undefined)
      ? "Loading governed Factory configuration…"
      : readyRepositories.length === 0
        ? "Connect and validate a ready workspace repository first."
        : !repositoryId
          ? "Select a ready repository."
          : !factoryContext
            ? "Create, assess, and activate a Factory for this repository first."
            : !factoryContext.workflow?.active
              ? "Activate the workflow frozen into the Factory version."
            : !factoryContext.assessment || factoryContext.assessment.status !== "PASS" || factoryContext.assessment.expiresAt <= Date.now()
              ? "Run a current passing readiness assessment for the active Factory version."
              : !factoryContext.host
                ? "Report a current clean local host binding for this repository."
                : approvedLocalScopes.length === 0
                  ? "Add a local code scope and include it in a new active Factory version."
                  : null;

  const chooseScope = (nextScopeId: string) => {
    const scope = approvedLocalScopes.find((candidate) => candidate._id === nextScopeId);
    setCodeScopeId(nextScopeId);
    setOwningTeamId(scope?.owningTeamId ?? "");
    setOwnerMemberId("");
    if (scope) {
      setAllowedPaths(scope.includePaths.join("\n"));
      setDeniedPaths([...scope.excludePaths, "convex/schema.ts", ".github/workflows/**", ".env*"].join("\n"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Create WorkOrder</DialogTitle>
          <DialogDescription>Define an executable contract: intent, bounded change authority, and independent proof before pull-request creation.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input aria-label="Work Order title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Work order title" />
            </div>
            <div className="space-y-1.5">
              <Label>Desired outcome</Label>
              <Textarea aria-label="Desired outcome" value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} rows={4} placeholder="What value should be delivered?" />
            </div>
            <div className="space-y-1.5">
              <Label>Context</Label>
              <Textarea aria-label="Context" value={context} onChange={(event) => setContext(event.target.value)} rows={4} placeholder="Business or engineering context" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Repository</Label>
              <Select value={repositoryId} onValueChange={(nextRepositoryId) => {
                setRepositoryId(nextRepositoryId);
                setCodeScopeId("");
                setOwningTeamId("");
                setOwnerMemberId("");
              }}>
                <SelectTrigger aria-label="Repository"><SelectValue placeholder="Select a ready repository" /></SelectTrigger>
                <SelectContent>
                  {readyRepositories.map((repository) => (
                    <SelectItem key={repository.repositoryId!} value={repository.repositoryId!}>{repository.repository}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Approved code scope</Label>
              <Select value={codeScopeId} onValueChange={chooseScope} disabled={!factoryContext}>
                <SelectTrigger aria-label="Approved code scope"><SelectValue placeholder="Select a Factory-approved scope" /></SelectTrigger>
                <SelectContent>
                  {approvedLocalScopes.map((scope) => (
                    <SelectItem key={scope._id} value={scope._id}>{scope.name} · {scope.includePaths.join(", ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-2 text-xs text-muted-foreground">
              <div>Factory: <span className="text-foreground/85">{factoryContext ? `v${factoryContext.version.version}` : "Unavailable"}</span></div>
              <div className="mt-1">Workflow: <span className="text-foreground/85">{factoryContext?.workflow?.workflowId ?? "Unavailable"}</span></div>
              <div className="mt-1">Environment / host: <span className="text-foreground/85">LOCAL · {factoryContext?.host?.hostId ?? "No current host"}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Owning team</Label>
                <Select value={owningTeamId} onValueChange={(teamId) => {
                  setOwningTeamId(teamId);
                  setOwnerMemberId("");
                }} disabled={Boolean(selectedScope?.owningTeamId)}>
                  <SelectTrigger aria-label="Owning team"><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>
                    {(structure?.teams ?? []).filter((team) => team.status === "ACTIVE").map((team) => (
                      <SelectItem key={team._id} value={team._id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accountable owner</Label>
                <Select value={ownerMemberId} onValueChange={setOwnerMemberId} disabled={!owningTeamId}>
                  <SelectTrigger aria-label="Accountable owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    {eligibleOwners.map((member) => <SelectItem key={member._id} value={member._id}>{member.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Branch strategy</Label>
              <Input aria-label="Branch strategy" value={branchStrategy} onChange={(event) => setBranchStrategy(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Critical</SelectItem>
                    <SelectItem value="2">High</SelectItem>
                    <SelectItem value="3">Normal</SelectItem>
                    <SelectItem value="4">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Risk</Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger aria-label="Risk"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Requested by</Label>
                <Input aria-label="Requested by" value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned agent</Label>
                <Input aria-label="Assigned agent" value={assignedAgent} onChange={(event) => setAssignedAgent(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Requirements</Label>
              <Textarea aria-label="Requirements" value={requirements} onChange={(event) => setRequirements(event.target.value)} rows={4} placeholder={"One requirement per line\nThe Work Order shows its proof verdict"} />
            </div>
            <div className="space-y-1.5">
              <Label>Acceptance criteria</Label>
              <Textarea aria-label="Acceptance criteria" value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} rows={6} placeholder={"One criterion per line\nBuild passes\nQueue renders\nLinked run is visible"} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--panel-line)] bg-background/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Change authority and proof contract</div>
              <p className="mt-1 text-xs text-muted-foreground">Commands execute directly without shell expansion. Protected classes and paths fail closed.</p>
            </div>
            <Badge variant="outline">Verification-first</Badge>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-3 md:col-span-1">
              <div className="space-y-1.5"><Label>Allowed paths</Label><Textarea aria-label="Allowed paths" value={allowedPaths} onChange={(event) => setAllowedPaths(event.target.value)} rows={4} placeholder="src/**" /></div>
              <div className="space-y-1.5"><Label>Denied / protected paths</Label><Textarea aria-label="Denied or protected paths" value={deniedPaths} onChange={(event) => setDeniedPaths(event.target.value)} rows={4} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Max files</Label><Input aria-label="Maximum files changed" type="number" min="1" value={maxFilesChanged} onChange={(event) => setMaxFilesChanged(event.target.value)} /></div>
                <div className="space-y-1.5"><Label>Max lines</Label><Input aria-label="Maximum changed lines" type="number" min="1" value={maxLinesChanged} onChange={(event) => setMaxLinesChanged(event.target.value)} /></div>
              </div>
            </div>
            <div className="space-y-3 md:col-span-2">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5"><Label>Enforcement</Label><Select value={enforcementMode} onValueChange={setEnforcementMode}><SelectTrigger aria-label="Verification enforcement"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ENFORCED">Enforced</SelectItem><SelectItem value="OBSERVE_ONLY">Observe only</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Check category</Label><Select value={verificationCategory} onValueChange={setVerificationCategory}><SelectTrigger aria-label="Verification check category"><SelectValue /></SelectTrigger><SelectContent>{["BUILD", "TYPECHECK", "UNIT_TEST", "INTEGRATION_TEST", "CONTRACT_TEST", "SECURITY"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Command class</Label><Select value={commandClass} onValueChange={setCommandClass}><SelectTrigger aria-label="Verification command class"><SelectValue /></SelectTrigger><SelectContent>{["BUILD", "TYPECHECK", "TEST", "LINT", "SECURITY_SCAN", "DEPENDENCY_SCAN"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid gap-3 md:grid-cols-[0.6fr_1.4fr]">
                <div className="space-y-1.5"><Label>Executable</Label><Input aria-label="Verification executable" value={verificationExecutable} onChange={(event) => setVerificationExecutable(event.target.value)} placeholder="node" /></div>
                <div className="space-y-1.5">
                  <Label>Arguments (exact JSON argv)</Label>
                  <Textarea aria-label="Verification arguments" value={verificationArgsText} onChange={(event) => setVerificationArgsText(event.target.value)} rows={5} spellCheck={false} className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">No command is inferred. Enter an executable and exact JSON argv that work inside the clean frozen worktree.</p>
                  {verificationArgsError ? <p role="alert" className="text-xs text-danger">{verificationArgsError}</p> : null}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Evidence category</Label><Select value={evidenceCategory} onValueChange={setEvidenceCategory}><SelectTrigger aria-label="Required evidence category"><SelectValue /></SelectTrigger><SelectContent>{["TEST_RESULT", "BUILD_RESULT", "STATIC_ANALYSIS", "SECURITY_SCAN", "BROWSER_RESULT", "CI_RESULT"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>Human approval gates</Label><Select value={requireHumanReview} onValueChange={setRequireHumanReview}><SelectTrigger aria-label="Require human review"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="no">No additional human gate</SelectItem><SelectItem value="yes">Before dispatch and publication</SelectItem></SelectContent></Select></div>
              </div>
            </div>
          </div>
        </div>

        {configurationIssue ? (
          <div role="status" className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-warning">
            {configurationIssue}
          </div>
        ) : null}
        {error ? <div className="text-sm text-danger">{error}</div> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!selectedRepository?.repositoryId || !factoryContext?.workflow || !parsedVerificationArgs.ok) return;
              void onCreate({
                title,
                desiredOutcome,
                context,
                workflowId: factoryContext.workflow.workflowId,
                repositoryId: selectedRepository.repositoryId,
                repository: selectedRepository.repository,
                codeScopeId,
                owningTeamId,
                ownerMemberId,
                branchStrategy,
                priority,
                riskLevel,
                requestedBy,
                assignedAgent,
                requirements,
                acceptanceCriteria,
                allowedPaths,
                deniedPaths,
                maxFilesChanged,
                maxLinesChanged,
                enforcementMode,
                verificationCategory,
                evidenceCategory,
                commandClass,
                verificationExecutable,
                verificationArgs: parsedVerificationArgs.args,
                requireHumanReview,
              });
            }}
            disabled={creating || Boolean(configurationIssue) || !codeScopeId || !owningTeamId || !ownerMemberId || !title.trim() || !desiredOutcome.trim() || !acceptanceCriteria.trim() || !allowedPaths.trim() || !verificationExecutable.trim() || !parsedVerificationArgs.ok || Number(maxFilesChanged) < 1 || Number(maxLinesChanged) < 1}
          >
            {creating ? "Creating…" : "Create WorkOrder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
