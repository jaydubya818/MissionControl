import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  History,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDate,
  formatDuration,
  humanizeCron,
  statusTone,
  workspacePath,
  type AutomationTab,
} from "./automationModel";

export function AutomationDefinitionDetail({
  projectId,
  definition,
  runs,
  receipts,
  decisions,
  onClose,
  onTabChange,
}: {
  projectId: Id<"projects">;
  definition: any;
  runs: any[];
  receipts: any[];
  decisions: any[];
  onClose: () => void;
  onTabChange: (tab: AutomationTab) => void;
}) {
  const preview = useQuery(api.automations.previewNextRun, {
    projectId,
    automationDefinitionId: definition._id,
  });
  const submitForReview = useMutation(api.skillAutomations.submitForReview);
  const approve = useMutation(api.skillAutomations.approve);
  const validateDefinition = useMutation(api.skillAutomations.validateDefinition);
  const updateDefinition = useMutation(api.skillAutomations.updateDefinition);
  const activate = useMutation(api.automations.activate);
  const evaluateNow = useMutation(api.automationScheduler.evaluateNow);
  const transition = useMutation(api.skillAutomations.transitionDefinition);
  const clone = useMutation(api.skillAutomations.cloneDefinition);
  const [governanceMessage, setGovernanceMessage] = useState("");
  async function validate() {
    const reason = window.prompt("Reason for validating this Definition");
    if (!reason || reason.trim().length < 5) return;
    try {
      const result = await validateDefinition({ definitionId: definition._id, actorId: "operator", reason: reason.trim() });
      setGovernanceMessage(result.status === "PASSED" ? "All activation gates passed validation." : `Validation failed: ${result.findings.join("; ")}`);
    } catch (error) {
      setGovernanceMessage(error instanceof Error ? error.message : "Validation failed");
    }
  }
  async function edit() {
    const name = window.prompt("Automation name", definition.name);
    if (!name) return;
    const description = window.prompt("Automation description", definition.description);
    if (!description) return;
    const runtime = window.prompt("Maximum runtime in seconds", String(definition.maxDurationSeconds));
    const cost = window.prompt("Maximum estimated cost in USD", String(definition.maxCostUsd));
    const reason = window.prompt("Reason for editing this Definition");
    if (!runtime || !cost || !reason || reason.trim().length < 5) return;
    try {
      await updateDefinition({
        definitionId: definition._id, name, description,
        maxDurationSeconds: Number(runtime), maxCostUsd: Number(cost),
        actorId: "operator", reason: reason.trim(),
      });
      setGovernanceMessage("Definition updated. Validation was reset and must pass again.");
    } catch (error) {
      setGovernanceMessage(error instanceof Error ? error.message : "Definition update failed");
    }
  }
  async function decideReview(action: "SUBMIT" | "APPROVE") {
    const reason = window.prompt(action === "SUBMIT" ? "Reason for requesting review" : "Approval reason");
    if (!reason || reason.trim().length < 5) return;
    try {
      if (action === "SUBMIT") await submitForReview({ definitionId: definition._id, actorId: "operator", reason: reason.trim() });
      else await approve({ definitionId: definition._id, actorId: "operator", reason: reason.trim() });
      setGovernanceMessage(action === "SUBMIT" ? "Review requested and recorded." : "Definition approved. Activation remains separate.");
    } catch (error) {
      setGovernanceMessage(error instanceof Error ? error.message : "Review decision failed");
    }
  }
  async function lifecycle(action: "ACTIVATE" | "EVALUATE" | "PAUSE" | "RESUME" | "SUSPEND" | "DISABLE" | "ARCHIVE" | "CLONE" | "NEW_VERSION") {
    const reason = window.prompt(`Reason for ${action.toLowerCase().replace("_", " ")}`);
    if (!reason || reason.trim().length < 5) return;
    try {
      if (action === "ACTIVATE") {
        await activate({ projectId, automationDefinitionId: definition._id, reason: reason.trim() });
      } else if (action === "EVALUATE") {
        await evaluateNow({ projectId, automationDefinitionId: definition._id, reason: reason.trim() });
      } else if (action === "CLONE" || action === "NEW_VERSION") {
        const result = await clone({ definitionId: definition._id, mode: action, actorId: "operator", reason: reason.trim() });
        window.location.href = workspacePath(`/v2/automations?tab=definitions&definition=${result.definitionId}`, projectId);
        return;
      } else {
        await transition({ definitionId: definition._id, action, actorId: "operator", reason: reason.trim() });
      }
      setGovernanceMessage(`${action.toLowerCase().replace("_", " ")} completed and audited.`);
    } catch (error) {
      setGovernanceMessage(error instanceof Error ? error.message : "Lifecycle action failed");
    }
  }
  const definitionRuns = runs.filter((run) => run.definition?._id === definition._id);
  const definitionReceipts = receipts.filter((receipt) => receipt.automationDefinitionId === definition._id);
  const definitionDecisions = decisions.filter((decision) => decision.automationDefinitionId === definition._id);

  return (
    <Card className="overflow-hidden border-registry-accent/30" aria-label={`Automation Definition ${definition.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--panel-line)] bg-registry-accent-soft/40 p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-registry-accent">Automation Definition</div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{definition.name}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{definition.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className={statusTone(definition.status)}>{definition.status}</Badge>
            <Badge variant="outline" className={statusTone(definition.health)}>{definition.health}</Badge>
            <Badge variant="outline">{definition.reliabilityState}</Badge>
            <Badge variant="outline" className={definition.isMutating ? "border-err/30 text-err" : "border-ok/30 text-ok"}>
              {definition.isMutating ? "Mutating" : "Read-only"}
            </Badge>
            {definition.sourceSkillId ? <Badge variant="outline">Skill v{definition.sourceSkillVersion}</Badge> : null}
            {definition.reviewStatus ? <Badge variant="outline">Review: {definition.reviewStatus}</Badge> : null}
          </div>
          {definition.sourceSkillId ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {definition.reviewStatus === "DRAFT" ? <Button size="sm" variant="outline" onClick={() => void edit()}>Edit</Button> : null}
              {["DRAFT", "REJECTED"].includes(definition.reviewStatus) ? <Button size="sm" variant="outline" onClick={() => void validate()}>Validate</Button> : null}
              {definition.reviewStatus === "DRAFT" ? <Button size="sm" onClick={() => void decideReview("SUBMIT")}>Submit for review</Button> : null}
              {definition.reviewStatus === "READY_FOR_REVIEW" ? <Button size="sm" onClick={() => void decideReview("APPROVE")}>Approve Definition</Button> : null}
              {definition.status === "DISABLED" && definition.reviewStatus === "APPROVED" ? <Button size="sm" onClick={() => void lifecycle("ACTIVATE")}>Activate</Button> : null}
              {definition.status === "ACTIVE" ? <Button size="sm" onClick={() => void lifecycle("EVALUATE")}>Run evaluation now</Button> : null}
              {definition.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => void lifecycle("PAUSE")}>Pause</Button> : null}
              {definition.status === "PAUSED" ? <Button size="sm" onClick={() => void lifecycle("RESUME")}>Resume</Button> : null}
              {["ACTIVE", "PAUSED"].includes(definition.status) ? <Button size="sm" variant="outline" onClick={() => void lifecycle("SUSPEND")}>Suspend</Button> : null}
              {["ACTIVE", "PAUSED", "SUSPENDED"].includes(definition.status) ? <Button size="sm" variant="outline" onClick={() => void lifecycle("DISABLE")}>Disable</Button> : null}
              {["DISABLED", "RETIRED"].includes(definition.status) ? <Button size="sm" variant="outline" onClick={() => void lifecycle("ARCHIVE")}>Archive</Button> : null}
              <Button size="sm" variant="outline" onClick={() => void lifecycle("CLONE")}>Clone</Button>
              <Button size="sm" variant="outline" onClick={() => void lifecycle("NEW_VERSION")}>New version</Button>
              <span className="text-xs text-muted-foreground">Validation: {definition.validationStatus ?? "PENDING"} · activation requires approval</span>
            </div>
          ) : null}
          {governanceMessage ? <p role="status" className="mt-2 text-xs text-ok">{governanceMessage}</p> : null}
        </div>
        <Button size="sm" variant="outline" onClick={onClose} aria-label="Close Automation Definition details">
          <X className="h-4 w-4" /> Close
        </Button>
      </div>

      <div className="grid gap-px bg-[var(--panel-line)] xl:grid-cols-2">
        <DetailSection icon={ShieldCheck} title="Overview">
          <DetailGrid items={[
            ["Status", definition.status],
            ["Health", definition.health],
            ["Reliability", definition.reliabilityState],
            ["Owner", definition.ownerId],
            ["Scope", definition.scope],
            ["Risk", definition.riskLevel],
            ["Autonomy", definition.autonomyLevel],
            ["Mutation policy", definition.isMutating ? "Mutating" : "Read-only"],
            ["Source skill version", definition.sourceSkillVersion],
            ["Adapter", definition.adapterType],
            ["Artifact path", definition.artifactPath],
            ["Validation", definition.validationStatus],
            ["Definition review", definition.reviewStatus],
          ]} />
        </DetailSection>
        <DetailSection icon={Workflow} title="Workflow">
          <DetailGrid items={[
            ["Name", definition.workflow?.name ?? "Workflow unavailable"],
            ["Workflow ID", definition.workflowId],
            ["Pinned version", definition.workflowVersion],
            ["Current version", definition.workflow ? `v${definition.workflow.version}` : "Unavailable"],
            ["Active", definition.workflowActive ? "Yes" : "No"],
            ["Version posture", definition.workflowVersionMismatch ? "Mismatch — review required" : "Current"],
          ]} />
          <a href={workspacePath(`/v2/harness-workshop?workflow=${definition.workflowId}`, projectId)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-registry-accent hover:text-foreground">
            Open Workflow <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </DetailSection>
        <DetailSection icon={CalendarClock} title="Trigger">
          <DetailGrid items={[
            ["Type", definition.triggerType],
            ["Cadence", humanizeCron(definition.triggerConfig?.cron)],
            ["Cron", definition.triggerConfig?.cron],
            ["Time zone", definition.triggerConfig?.timezone],
            ["Next evaluation", formatDate(preview?.nextRunAt ?? definition.nextRunAt)],
            ["Last evaluation", formatDate(definition.lastRunAt)],
            ["Catch-up", definition.catchUpPolicy],
            ["Overlap", definition.overlapPolicy],
            ["Concurrency", String(definition.concurrencyLimit)],
            ["Idempotency", definition.idempotencyStrategy],
          ]} />
          {definition.scheduleConflict ? <p role="alert" className="mt-3 text-xs text-warn">Schedule conflict detected for the same scope and cadence.</p> : null}
        </DetailSection>
        <DetailSection icon={ShieldCheck} title="Governance">
          <DetailGrid items={[
            ["Approvals", definition.requiredApprovalTypes.join(", ")],
            ["Receipt required", definition.verificationContract?.receiptRequired ? "Yes" : "No"],
            ["Independent validator", definition.verificationContract?.independentValidatorRequired ? "Yes" : "No"],
            ["Evidence", definition.evidenceRequirements.join(", ")],
            ["Cost limit", `$${definition.maxCostUsd.toFixed(2)}`],
            ["Actual cost", `$${definition.actualCostUsd.toFixed(2)}`],
            ["Duration limit", formatDuration(definition.maxDurationSeconds * 1000)],
            ["Retry limit", String(definition.maxRetries)],
            ["Policy", definition.activationPolicyVersion ?? "automation-v1"],
            ["Identity", "Trusted-operator label (not authenticated)"],
          ]} />
        </DetailSection>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-3">
        <SummaryBlock
          title="Runs"
          value={`${definitionRuns.length} review gates`}
          body={definitionRuns[0] ? `${definitionRuns[0].workOrder.state} · ${definitionRuns[0].workOrder.approvalStatus}` : "No WorkOrders created"}
          action="Open Runs"
          onClick={() => onTabChange("runs")}
        />
        <SummaryBlock
          title="Receipts"
          value={`${definitionReceipts.filter((receipt) => receipt.evidenceState === "FRESH").length} fresh`}
          body={`${definitionReceipts.filter((receipt) => ["MISSING", "STALE", "EXPIRED"].includes(receipt.evidenceState)).length} missing or stale`}
          action="Open Receipts"
          onClick={() => onTabChange("receipts")}
        />
        <SummaryBlock
          title="Decisions"
          value={`${definitionDecisions.length} recorded`}
          body={definitionDecisions[0] ? `${definitionDecisions[0].decisionType} · ${formatDate(definitionDecisions[0].decidedAt)}` : "No history"}
          action="Open Decisions"
          onClick={() => onTabChange("decisions")}
        />
      </div>

      {definitionDecisions.length > 0 ? (
        <div className="border-t border-[var(--panel-line)] px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            <History className="h-4 w-4" /> Complete chronological audit trail
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {definitionDecisions.map((decision) => (
              <li key={decision._id} className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className={statusTone(decision.decisionType)}>{decision.decisionType}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(decision.decidedAt)}</span>
                </div>
                <p className="mt-2 text-sm text-foreground">{decision.reason}</p>
                <p className="mt-2 text-xs text-warn">{decision.actorId} · {decision.actorIdentitySource ?? "SYSTEM"}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}

function DetailSection({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card/40 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-registry-accent" /> {title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailGrid({ items }: { items: Array<[string, string | undefined]> }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-foreground">{value ?? "Not configured"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryBlock({ title, value, body, action, onClick }: { title: string; value: string; body: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 text-lg font-semibold text-foreground">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      <button type="button" onClick={onClick} className="mt-3 text-xs font-medium text-registry-accent hover:text-foreground">{action}</button>
    </div>
  );
}
