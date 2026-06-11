import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  Sparkles,
  Pencil,
  Target,
  Rocket,
  Package,
  GitBranch,
  ShieldCheck,
  Siren,
  Factory,
  Plug,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MissionBannerProps {
  projectId: Id<"projects"> | null;
  onEditClick: () => void;
  onReversePromptClick: () => void;
  /** Navigate to the gateway/integration settings (Import from Jira). */
  onImportFromJira?: () => void;
  /** Navigate to the agent registry (Connect Agent Fleet). */
  onConnectFleet?: () => void;
  brief?: {
    stageLabel: string;
    stageEyebrow: string;
    artifact: string;
    rule: string;
  };
  className?: string;
}

interface MissionTemplate {
  id: string;
  label: string;
  icon: LucideIcon;
  statement: string;
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "product-delivery",
    label: "Product Delivery",
    icon: Package,
    statement:
      "Deliver the next product release end-to-end: plan epics, assign agents to implementation tracks, gate risky changes behind human approval, and ship with full audit visibility.",
  },
  {
    id: "engineering-epic",
    label: "Engineering Epic",
    icon: GitBranch,
    statement:
      "Launch and monitor 20 enterprise epics across agents, branches, PRs, and approvals — with blockers, cycle time, and spend visible from one console.",
  },
  {
    id: "qa-release",
    label: "QA / Release Readiness",
    icon: ShieldCheck,
    statement:
      "Drive the release to green: run autonomous test, review, and verification loops across the codebase, surfacing every failed gate for operator decision before ship.",
  },
  {
    id: "incident-response",
    label: "Incident Response",
    icon: Siren,
    statement:
      "Coordinate incident response: triage signals, dispatch diagnostic agents, propose mitigations with human approval on production-touching actions, and document the timeline.",
  },
  {
    id: "agentic-factory",
    label: "Agentic Dev Factory",
    icon: Factory,
    statement:
      "Run autonomous implementation loops with human approval gates for risky actions — agents claim tasks, open branches, and report progress while the operator governs the pipeline.",
  },
];

const PLACEHOLDER_EXAMPLE =
  "e.g. Launch and monitor 20 enterprise epics across agents, branches, PRs, and approvals.";

export function MissionBanner({
  projectId,
  onEditClick,
  onReversePromptClick,
  onImportFromJira,
  onConnectFleet,
  brief,
  className,
}: MissionBannerProps) {
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});
  const setMission = useMutation(api.mission.setMission);

  const [draft, setDraft] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  if (!missionData) {
    return null;
  }

  const hasMission = !!missionData.missionStatement;
  const missionPreview = missionData.missionStatement?.trim() ?? "";
  const missionLead = missionPreview.split(/(?<=[.!?])\s+/)[0] ?? missionPreview;
  const missionSupport =
    missionPreview.length > missionLead.length
      ? missionPreview.slice(missionLead.length).trim()
      : "";
  const missionSupportPreview =
    missionSupport.length > 180 ? `${missionSupport.slice(0, 177).trimEnd()}...` : missionSupport;
  const compressedMission =
    missionPreview.length > 220 ? `${missionPreview.slice(0, 217).trimEnd()}...` : missionPreview;

  const applyTemplate = (template: MissionTemplate) => {
    setDraft(template.statement);
    setActiveTemplate(template.id);
  };

  const launchMission = async () => {
    const statement = draft.trim();
    if (!statement || launching) return;
    setLaunching(true);
    try {
      await setMission({ missionStatement: statement, projectId: projectId ?? undefined });
      setDraft("");
      setActiveTemplate(null);
    } finally {
      setLaunching(false);
    }
  };

  // ── Guided mission builder (no mission yet) ────────────────────────────────
  if (!hasMission) {
    return (
      <Card className={cn("mb-6 overflow-hidden", className)}>
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.10),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.07),transparent_30%)]" />
          <div className="relative px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-100 shadow-[var(--glow-cyan)]">
                  <Target className="h-4.5 w-4.5" strokeWidth={1.65} />
                </div>
                <div className="min-w-0">
                  <div className="mc-kicker">North star</div>
                  <div className="mt-1 font-[family:var(--font-display)] text-base font-semibold text-foreground">
                    Define the mission before launching autonomous work.
                  </div>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    The mission is the single intent every agent, task, and approval gate aligns to.
                    Write your own or start from a template.
                  </p>
                </div>
              </div>
              <div className="hidden rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/90 md:inline-flex">
                Setup required
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)]">
              {/* Builder */}
              <div className="rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_92%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] p-4">
                <label
                  htmlFor="mission-builder-input"
                  className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Mission statement
                </label>
                <textarea
                  id="mission-builder-input"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setActiveTemplate(null);
                  }}
                  placeholder={PLACEHOLDER_EXAMPLE}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel-strong)] px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                />

                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
                    Quick mission templates
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MISSION_TEMPLATES.map((template) => {
                      const Icon = template.icon;
                      const isActive = activeTemplate === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-150",
                            isActive
                              ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 shadow-[var(--glow-cyan)]"
                              : "border-[var(--panel-line)] bg-[color:var(--shell-panel)] text-muted-foreground hover:border-cyan-300/25 hover:bg-cyan-400/8 hover:text-foreground"
                          )}
                          aria-pressed={isActive}
                        >
                          <Icon className="h-3 w-3" strokeWidth={1.7} />
                          {template.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="neon-cyan"
                    size="sm"
                    className="gap-1.5"
                    disabled={!draft.trim() || launching}
                    onClick={() => void launchMission()}
                  >
                    <Rocket className="h-3.5 w-3.5" strokeWidth={1.6} />
                    {launching ? "Launching…" : "Launch Mission"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => applyTemplate(MISSION_TEMPLATES[0])}
                  >
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Use Template
                  </Button>
                  {onImportFromJira && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onImportFromJira}>
                      <Plug className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Import from Jira
                    </Button>
                  )}
                  {onConnectFleet && (
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onConnectFleet}>
                      <GitBranch className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Connect Agent Fleet
                    </Button>
                  )}
                </div>
              </div>

              {/* Why it matters */}
              <div className="rounded-2xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Why the mission matters
                </div>
                <ul className="mt-3 space-y-3">
                  {[
                    "Agents use it to score whether claimed work advances the objective.",
                    "Reverse prompting generates next tasks from the mission, not guesswork.",
                    "Approval gates and autonomy thresholds are calibrated against it.",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" />
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel-strong)] px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground/80">
                  Example: “Run autonomous implementation loops with human approval gates for risky
                  actions.”
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // ── Operator brief (mission set) ──────────────────────────────────────────
  return (
    <Card className={cn("mb-6 overflow-hidden", className)}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.06),transparent_28%)]" />
        <div className="relative px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-100 shadow-[var(--glow-cyan)]">
                <Target className="h-4.5 w-4.5" strokeWidth={1.65} />
              </div>
              <div className="min-w-0">
                <div className="mc-kicker">North star</div>
                <div className="mt-1 text-sm font-semibold text-foreground">Operator brief</div>
              </div>
            </div>
            <div className="hidden rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80 md:inline-flex">
              Strategic source of truth
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
            <div className="rounded-2xl border border-[var(--panel-line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--shell-panel)_90%,transparent),color-mix(in_srgb,var(--background)_88%,transparent))] px-5 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mission statement
              </div>
              <p className="mt-3 max-w-3xl font-[family:var(--font-display)] text-[1.18rem] leading-8 text-foreground/94">
                {missionLead}
              </p>
              {missionSupportPreview || compressedMission !== missionLead ? (
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {missionSupportPreview || compressedMission}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mission check
              </div>
              <div className="mt-3 rounded-lg border border-[var(--panel-line)] bg-[color:var(--shell-panel-strong)] px-4 py-4">
                <div className="text-sm font-semibold text-foreground">
                  Would I ship a screen under this mission?
                </div>
                <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Every new task, screen, and routing decision should still feel aligned with this
                  statement. If not, the UI is drifting.
                </div>
              </div>
            </div>
          </div>

          {brief && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {brief.stageEyebrow}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{brief.stageLabel}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Next artifact
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">{brief.artifact}</div>
              </div>
              <div className="rounded-xl border border-[var(--panel-line)] bg-[color:var(--shell-panel)] px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Operating rule
                </div>
                <div className="mt-1 text-sm leading-relaxed text-foreground/88">{brief.rule}</div>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="neon-cyan" size="sm" onClick={onReversePromptClick} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
              Reverse prompt
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onEditClick}
              className="gap-1.5"
              title="Edit mission statement"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              Edit mission
            </Button>
            <div className="ml-auto hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:flex">
              Edit mission controls
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
