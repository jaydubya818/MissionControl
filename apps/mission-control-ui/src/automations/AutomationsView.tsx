import { useEffect } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { Bot, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { AutomationCandidates } from "./AutomationCandidates";
import { AutomationDecisions } from "./AutomationDecisions";
import { AutomationDefinitionDetail } from "./AutomationDefinitionDetail";
import { AutomationDefinitions } from "./AutomationDefinitions";
import { AutomationOverview } from "./AutomationOverview";
import { AutomationReceipts } from "./AutomationReceipts";
import { AutomationRuns } from "./AutomationRuns";
import { AutomationSchedule } from "./AutomationSchedule";
import { AUTOMATION_TABS, normalizeAutomationTab, type AutomationTab } from "./automationModel";

const TAB_LABELS: Record<AutomationTab, string> = {
  overview: "Overview",
  definitions: "Definitions",
  runs: "Runs",
  schedule: "Schedule",
  candidates: "Candidates",
  receipts: "Receipts",
  decisions: "Decisions",
};

const TAB_DESCRIPTIONS: Record<AutomationTab, string> = {
  overview: "Operating posture, measurable value, and exceptions requiring attention.",
  candidates: "Evidence-backed recurring-work opportunities awaiting a governed decision.",
  definitions: "Versioned Automation policies, Workflows, schedules, limits, and lifecycle controls.",
  runs: "Automation-created review-gate WorkOrders. WorkOrders remain the governed execution boundary.",
  schedule: "Authoritative evaluation cadence and manual idempotent review-gate controls.",
  receipts: "Independent evidence proving or blocking Automation-created WorkOrders.",
  decisions: "Chronological governance history with explicit attribution, reason, policy, and Definition version.",
};

export function AutomationsView({
  projectId,
  forceRuns = false,
}: {
  projectId: Id<"projects"> | null;
  forceRuns?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = forceRuns ? "runs" : normalizeAutomationTab(searchParams.get("tab"));
  const data = useQuery(api.automations.getControlPlane, projectId ? { projectId } : "skip");
  const selectedDefinitionId = searchParams.get("definition");
  const selectedDefinition = data?.definitions.find((definition: any) => definition._id === selectedDefinitionId);
  const selectedDecisions = (data?.decisions ?? []).filter((decision: any) => decision.automationDefinitionId === selectedDefinitionId);

  useEffect(() => {
    if (!forceRuns || searchParams.get("tab") === "runs") return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "runs");
    setSearchParams(next, { replace: true });
  }, [forceRuns, searchParams, setSearchParams]);

  function setTab(nextTab: AutomationTab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next);
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentTab: AutomationTab) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = AUTOMATION_TABS.indexOf(currentTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? AUTOMATION_TABS.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + AUTOMATION_TABS.length) % AUTOMATION_TABS.length;
    const nextTab = AUTOMATION_TABS[nextIndex];
    setTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`automation-tab-${nextTab}`)?.focus());
  }

  function selectDefinition(definitionId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "definitions");
    next.set("definition", definitionId);
    setSearchParams(next);
  }

  function closeDefinition() {
    const next = new URLSearchParams(searchParams);
    next.delete("definition");
    setSearchParams(next);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        eyebrow="Operations"
        title="Automations"
        description="Governed recurring work powered by approved Workflows, explicit activation, normal WorkOrder approval, and independent verification."
        icon={<Bot className="h-5 w-5" />}
      />
      <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
        <Card className="border-ok/20 bg-ok-soft p-4" role="note" aria-label="Automation V1 safety boundary">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">V1 safety boundary</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {["LEVEL_1 only", "Read-only", "Approval required", "No automatic dispatch", "Independent receipt required"].map((label) => (
                  <span key={label} className="rounded-full border border-ok/20 px-2.5 py-1 text-xs text-ok">{label}</span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
                Controls require workspace Automation authority. Audit attribution is derived from the authenticated operator on the server; local demo actions are labeled separately.
              </p>
            </div>
          </div>
        </Card>
        {!projectId ? (
          <StateCard title="Workspace required" body="Select a workspace before opening Automations." tone="error" headingLevel={2} />
        ) : (
          <>
            <div role="tablist" aria-label="Automation control plane" className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--panel-line)] bg-card/40 p-1">
              {AUTOMATION_TABS.map((item) => (
                <button
                  key={item}
                  id={`automation-tab-${item}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  aria-controls={`automation-panel-${item}`}
                  tabIndex={tab === item ? 0 : -1}
                  onClick={() => setTab(item)}
                  onKeyDown={(event) => handleTabKeyDown(event, item)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === item ? "bg-registry-accent-soft text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {TAB_LABELS[item]}
                </button>
              ))}
            </div>

            {selectedDefinitionId ? (
              selectedDefinition ? (
                <AutomationDefinitionDetail
                  projectId={projectId}
                  definition={selectedDefinition}
                  runs={data?.runs ?? []}
                  receipts={data?.receipts ?? []}
                  decisions={selectedDecisions}
                  onClose={closeDefinition}
                  onTabChange={setTab}
                />
              ) : data ? <StateCard title="Automation scope error" body="This Automation does not exist in the selected workspace." tone="error" headingLevel={2} /> : null
            ) : null}

            <div id={`automation-panel-${tab}`} role="tabpanel" aria-labelledby={`automation-tab-${tab}`} tabIndex={0} className="space-y-4">
              {!data ? (
                <StateCard title="Loading Automations" body="Reading workspace definitions, candidates, review gates, and receipts." headingLevel={2} />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{TAB_DESCRIPTIONS[tab]}</p>
                  {tab === "overview" ? <AutomationOverview data={data} onTabChange={setTab} onSelectDefinition={selectDefinition} /> : null}
                  {tab === "definitions" ? <AutomationDefinitions projectId={projectId} definitions={data.definitions} onSelect={selectDefinition} /> : null}
                  {tab === "runs" ? <AutomationRuns projectId={projectId} runs={data.runs} onSelectDefinition={selectDefinition} /> : null}
                  {tab === "schedule" ? <AutomationSchedule projectId={projectId} definitions={data.definitions} onSelectDefinition={selectDefinition} /> : null}
                  {tab === "candidates" ? <AutomationCandidates projectId={projectId} candidates={data.candidates} /> : null}
                  {tab === "receipts" ? <AutomationReceipts projectId={projectId} receipts={data.receipts} /> : null}
                  {tab === "decisions" ? <AutomationDecisions decisions={data.decisions} definitions={data.definitions} onSelectDefinition={selectDefinition} /> : null}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function StateCard({
  title,
  body,
  tone = "default",
  headingLevel = 1,
}: {
  title: string;
  body: string;
  tone?: "default" | "error";
  headingLevel?: 1 | 2;
}) {
  return <div className="flex flex-1 items-center justify-center bg-app p-6">
    <Card className={`max-w-lg p-6 text-center ${tone === "error" ? "border-err/30" : ""}`}>
      <RefreshCw className="mx-auto h-5 w-5 text-muted-foreground" />
      {headingLevel === 1
        ? <h1 className="mt-3 text-lg font-semibold text-foreground">{title}</h1>
        : <h2 className="mt-3 text-lg font-semibold text-foreground">{title}</h2>}
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </Card>
  </div>;
}
