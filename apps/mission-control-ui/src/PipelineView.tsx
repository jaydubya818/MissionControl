import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import { cn } from "@/lib/utils";
import { getBuildPipelineStages, getCurrentBuildStage } from "@/lib/buildPipeline";
import { loadGatewayStatus } from "@/lib/gatewayStatus";
import {
  ArrowRight,
  Users,
  FileText,
  LayoutTemplate,
  MonitorSmartphone,
  Database,
  Rocket,
} from "lucide-react";

interface PipelineViewProps {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
}

const STAGE_ICONS = {
  actors: Users,
  prd: FileText,
  architecture: LayoutTemplate,
  prototype: MonitorSmartphone,
  backend: Database,
  launch: Rocket,
} as const;

const STAGE_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  done: "success",
  active: "info",
  todo: "neutral",
};

export function PipelineView({ projectId, onNavigate }: PipelineViewProps) {
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [focusLens, setFocusLens] = useState<"design" | "build" | "launch">("design");
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.pendingSummary, projectId ? { projectId, limit: 100 } : "skip");

  useEffect(() => {
    let cancelled = false;
    loadGatewayStatus().then((snapshot) => {
      if (!cancelled) {
        setGatewayConfigured(Boolean(snapshot.status?.configured));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = !agents || !tasks || !approvals;

  const stages = useMemo(() => {
    if (!agents || !tasks || !approvals) return [];
    return getBuildPipelineStages({
      hasMission: Boolean(missionData?.missionStatement?.trim()),
      taskCount: tasks.length,
      activeAgents: agents.filter((agent) => agent.status === "ACTIVE").length,
      gatewayConfigured,
      approvalsCount: approvals.total,
    });
  }, [agents, approvals, gatewayConfigured, missionData?.missionStatement, tasks]);

  const currentStage = stages.length > 0 ? getCurrentBuildStage(stages) : null;
  const playbooks = [
    {
      title: "Actor-first brief",
      lens: "design" as const,
      detail: "Clarify who uses the system, what they see first, and what they cannot do before naming more features.",
      actionLabel: "Open home",
      onClick: () => onNavigate("home"),
    },
    {
      title: "PRD and architecture pass",
      lens: "design" as const,
      detail: "Use documentation and the build pipeline to lock the PRD and architecture.md before the prototype expands.",
      actionLabel: "Open docs",
      onClick: () => onNavigate("docs"),
    },
    {
      title: "Prototype review",
      lens: "build" as const,
      detail: "Review the frontend in a high-fidelity state with mock data and get a yes before backend complexity grows.",
      actionLabel: "Open projects",
      onClick: () => onNavigate("projects"),
    },
    {
      title: "Backend readiness",
      lens: "build" as const,
      detail: "Shape API, schema, auth, billing, and integration work only after the prototype is accepted.",
      actionLabel: "Open build pipeline",
      onClick: () => onNavigate("pipeline"),
    },
    {
      title: "Launch gate",
      lens: "launch" as const,
      detail: "Audit approvals, notifications, auth, and monitoring so the system feels trustworthy before users arrive.",
      actionLabel: "Open feedback",
      onClick: () => onNavigate("feedback"),
    },
  ];
  const focusRecommendations = {
    design: [
      "Use root `design.md` and the mission brief to keep visual direction explicit.",
      "Steal patterns from references, not entire layouts.",
      "Make prototype approval a hard gate before backend work.",
    ],
    build: [
      "Generate API and schema shape from the approved frontend and docs.",
      "Keep shadcn as the implementation base so interactions are real, not static exports.",
      "Use the operator queue on home to spot drift between prototype and execution.",
    ],
    launch: [
      "Treat auth, payments, alerts, and auditability as launch requirements, not post-launch polish.",
      "Use approvals and feedback views as final trust checks.",
      "Promote only the features that help operators act with confidence.",
    ],
  } as const;
  const readinessMatrix = stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    artifact: stage.artifact,
    status: stage.status,
    note:
      stage.status === "done"
        ? "Locked enough to build on."
        : stage.status === "active"
          ? "This is the current constraint on product quality."
          : "Do not expand scope before this becomes explicit.",
  }));

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col px-6 py-6">
        <div className="h-[680px] animate-pulse rounded-xl border border-line bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            Build Pipeline
          </h1>
          {currentStage && (
            <StatusBadge tone="info">Current stage: {currentStage.label}</StatusBadge>
          )}
        </div>
        <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-ink-secondary">
          Actor-first product development workflow. Move from mission and structure to prototype, backend, and launch without falling back to the old handoff ritual.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card className="p-5">
          <div className="text-[19px] font-semibold tracking-tight text-ink">Prototype first. Backend second. Approval before complexity.</div>
          <div className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
            This replaces the old design-to-code handoff with a single operator-visible loop: define actors, write the PRD, shape the flows, prototype with mock data, then generate the backend from the approved frontend and docs.
          </div>
          <div className="mt-4 flex rounded-lg border border-line p-0.5 self-start w-fit" role="tablist">
            {(["design", "build", "launch"] as const).map((lens) => (
              <button
                key={lens}
                role="tab"
                type="button"
                aria-selected={focusLens === lens}
                onClick={() => setFocusLens(lens)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12.5px] transition-colors duration-150",
                  focusLens === lens
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                {lens} lens
              </button>
            ))}
          </div>
          <div className="mt-4 text-[12.5px] text-ink-muted">
            <span className="font-mono">design.md</span> source of truth · Actor-first · Prototype before backend · Approval gates complexity
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Operator brief</div>
          <div className="mt-2 text-[13.5px] font-medium text-ink">
            {currentStage ? `${currentStage.label} is the next discipline to protect.` : "Build-stage guidance will appear here."}
          </div>
          <div className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
            {currentStage?.description ?? "No stage data available yet."}
          </div>
          {currentStage && (
            <div className="mt-4 rounded-lg bg-surface-2 px-4 py-4">
              <div className="text-[12.5px] font-medium text-ink-secondary">Next artifact</div>
              <div className="mt-1 text-[13.5px] font-semibold text-ink">{currentStage.artifact}</div>
              {currentStage.view && (
                <Button className="mt-4" size="sm" onClick={() => onNavigate(currentStage.view as MainView)}>
                  Open relevant surface
                </Button>
              )}
            </div>
          )}
          <div className="mt-4 rounded-lg bg-surface-2 px-4 py-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">Current lens</div>
            <div className="mt-1 text-[13.5px] font-semibold text-ink">
              {focusLens === "design" ? "Design integrity" : focusLens === "build" ? "Build execution" : "Launch trust"}
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
              {focusLens === "design"
                ? "Keep actors, visual intent, and prototype quality explicit before implementation expands."
                : focusLens === "build"
                  ? "Translate approved structure into real product behavior without creating drift."
                  : "Use readiness gates so the app feels trustworthy the first time a user touches it."}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[15px] font-semibold text-ink">Pipeline stages</div>
            <div className="mt-0.5 text-[12.5px] text-ink-muted">The six-stage build loop</div>
          </div>
          <div className="space-y-3 p-4">
            {stages.map((stage, index) => {
              const Icon = STAGE_ICONS[stage.id];
              return (
                <div key={stage.id} className="relative">
                  <button
                    type="button"
                    onClick={() => stage.view && onNavigate(stage.view as MainView)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-4 text-left transition-colors duration-150",
                      stage.status === "active"
                        ? "border-line-strong bg-surface-2"
                        : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
                        <Icon size={16} strokeWidth={1.7} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] text-ink-muted">{stage.eyebrow}</span>
                          <StatusBadge tone={STAGE_STATUS_TONE[stage.status] ?? "neutral"}>
                            {stage.status}
                          </StatusBadge>
                        </div>
                        <div className="mt-2 text-[13.5px] font-semibold text-ink">{stage.label}</div>
                        <div className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{stage.description}</div>
                        <div className="mt-3 text-[12px] text-ink-muted">
                          Artifact: {stage.artifact}
                        </div>
                      </div>
                    </div>
                  </button>
                  {index < stages.length - 1 && (
                    <div className="pointer-events-none absolute bottom-[-14px] left-[22px] flex h-4.5 items-center text-ink-muted">
                      <ArrowRight className="h-3.5 w-3.5 rotate-90" strokeWidth={1.75} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Artifacts and gates</div>
          <div className="mt-3 space-y-3">
            {[
              "Actors drive the interface. Features come after the actor and the first screen are clear.",
              "The PRD and architecture file should exist before the prototype expands beyond one-off prompts.",
              "Do not start backend shape until the mock-data prototype is approved.",
              "Launch means auth, approvals, billing, notifications, and real operator trust are in place.",
            ].map((item) => (
              <div key={item} className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-secondary">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Playbooks</div>
          <div className="mt-1 text-[12.5px] text-ink-muted">
            Stage-aware workflows for operating this build loop
          </div>
          <div className="mt-4 space-y-3">
            {playbooks.filter((playbook) => playbook.lens === focusLens).map((playbook) => (
              <div key={playbook.title} className="rounded-lg border border-line px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink">{playbook.title}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{playbook.detail}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={playbook.onClick}>
                    {playbook.actionLabel}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Readiness matrix</div>
          <div className="mt-1 text-[12.5px] text-ink-muted">
            See which artifacts are explicit and which are still creating drift
          </div>
          <div className="mt-4 space-y-3">
            {readinessMatrix.map((item) => (
              <div key={item.id} className="rounded-lg border border-line px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-ink">{item.label}</div>
                    <div className="mt-1 text-[12px] text-ink-muted">
                      {item.artifact}
                    </div>
                  </div>
                  <StatusBadge tone={STAGE_STATUS_TONE[item.status] ?? "neutral"}>
                    {item.status}
                  </StatusBadge>
                </div>
                <div className="mt-2 text-[13px] leading-relaxed text-ink-secondary">{item.note}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-surface-2 px-4 py-4">
            <div className="text-[12.5px] font-medium text-ink-secondary">
              Current recommendations
            </div>
            <div className="mt-3 space-y-2.5">
              {focusRecommendations[focusLens].map((item) => (
                <div key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-secondary">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
