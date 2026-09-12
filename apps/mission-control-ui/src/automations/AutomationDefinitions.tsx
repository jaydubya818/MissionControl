import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { Eye, Pause, Play, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, humanizeCron, statusTone } from "./automationModel";

type DefinitionAction = "activate" | "pause" | "retire";
const FILTER_KEYS = ["status", "health", "workflow", "repository", "risk", "owner", "verification", "approval"] as const;

export function AutomationDefinitions({
  projectId,
  definitions,
  onSelect,
}: {
  projectId: Id<"projects">;
  definitions: any[];
  onSelect: (definitionId: string) => void;
}) {
  const activate = useMutation(api.automations.activate);
  const pause = useMutation(api.automations.pause);
  const retire = useMutation(api.automations.retire);
  const [searchParams, setSearchParams] = useSearchParams();
  const [action, setAction] = useState<{ type: DefinitionAction; definition: any } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => definitions.filter((definition) => {
    const values: Record<(typeof FILTER_KEYS)[number], string> = {
      status: definition.status,
      health: definition.health,
      workflow: definition.workflowId,
      repository: definition.repositoryIds?.[0] ?? "",
      risk: definition.riskLevel,
      owner: definition.ownerId,
      verification: definition.verificationStatus,
      approval: definition.approvalStatus,
    };
    return FILTER_KEYS.every((key) => {
      const expected = searchParams.get(key);
      return !expected || expected === "all" || values[key] === expected;
    });
  }), [definitions, searchParams]);

  function updateFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  async function confirm() {
    if (!action || reason.trim().length < 5) return;
    setBusy(true);
    setMessage(null);
    try {
      const args = {
        projectId,
        automationDefinitionId: action.definition._id,
        reason: reason.trim(),
      };
      if (action.type === "activate") await activate(args);
      else if (action.type === "pause") await pause(args);
      else await retire(args);
      setMessage({ tone: "ok", text: `${action.definition.name} ${pastTense(action.type)}.` });
      setAction(null);
      setReason("");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Automation transition failed" });
    } finally {
      setBusy(false);
    }
  }

  if (definitions.length === 0) {
    return (
      <Card className="border-dashed p-8 text-center">
        <h2 className="text-sm font-semibold text-foreground">No Automation Definitions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Accept an eligible Candidate to create a disabled Automation Definition.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "ok" ? "text-sm text-ok" : "text-sm text-err"}>
            {message.text}
          </p>
        ) : null}
      </div>
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Filter label="Status" value={searchParams.get("status") ?? "all"} options={unique(definitions, "status")} onChange={(value) => updateFilter("status", value)} />
          <Filter label="Health" value={searchParams.get("health") ?? "all"} options={unique(definitions, "health")} onChange={(value) => updateFilter("health", value)} />
          <Filter label="Workflow" value={searchParams.get("workflow") ?? "all"} options={[...new Set(definitions.map((item) => item.workflowId))]} onChange={(value) => updateFilter("workflow", value)} />
          <Filter label="Repository" value={searchParams.get("repository") ?? "all"} options={[...new Set(definitions.flatMap((item) => item.repositoryIds ?? []).filter(Boolean))]} onChange={(value) => updateFilter("repository", value)} />
          <Filter label="Risk" value={searchParams.get("risk") ?? "all"} options={unique(definitions, "riskLevel")} onChange={(value) => updateFilter("risk", value)} />
          <Filter label="Owner" value={searchParams.get("owner") ?? "all"} options={unique(definitions, "ownerId")} onChange={(value) => updateFilter("owner", value)} />
          <Filter label="Verification" value={searchParams.get("verification") ?? "all"} options={unique(definitions, "verificationStatus")} onChange={(value) => updateFilter("verification", value)} />
          <Filter label="Approval" value={searchParams.get("approval") ?? "all"} options={unique(definitions, "approvalStatus")} onChange={(value) => updateFilter("approval", value)} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} of {definitions.length} Definitions</span>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              FILTER_KEYS.forEach((key) => next.delete(key));
              setSearchParams(next);
            }}
          >
            Clear filters
          </button>
        </div>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-[var(--panel-line)]">
        <table className="min-w-[1760px] w-full text-left text-sm">
          <thead className="bg-card/70 text-[11px] uppercase tracking-[0.13em] text-muted-foreground">
            <tr>
              {[
                "Name", "Status / health", "Reliability", "Policy", "Workflow", "Trigger",
                "Scope", "Risk", "Owner", "Next / last", "Last result", "Approval",
                "Verification", "Cost", "Updated", "Actions",
              ].map((label) => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--panel-line)]">
            {filtered.map((definition) => (
              <tr key={definition._id} className="bg-card/30 align-top">
                <td className="px-3 py-3">
                  <button type="button" onClick={() => onSelect(definition._id)} className="font-medium text-foreground hover:text-registry-accent">
                    {definition.name}
                  </button>
                  <div className="mt-1 text-xs text-muted-foreground">{definition.runCount} review gates</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1.5">
                    <Badge variant="outline" className={statusTone(definition.status)}>{definition.status}</Badge>
                    <Badge variant="outline" className={statusTone(definition.health)}>{definition.health}</Badge>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{definition.reliabilityState}</td>
                <td className="px-3 py-3">
                  <div className="text-foreground">{definition.autonomyLevel}</div>
                  <div className={definition.isMutating ? "text-err" : "text-ok"}>{definition.isMutating ? "Mutating" : "Read-only"}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="text-foreground">{definition.workflow?.name ?? definition.workflowId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{definition.workflowId}@{definition.workflowVersion}</div>
                  {!definition.workflowActive || definition.workflowVersionMismatch ? <div className="mt-1 text-xs text-warn">{!definition.workflowActive ? "Workflow inactive" : "Version mismatch"}</div> : null}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  <div>{humanizeCron(definition.triggerConfig?.cron)}</div>
                  <div className="mt-1 text-xs">{definition.triggerConfig?.cron} · {definition.triggerConfig?.timezone}</div>
                  {definition.scheduleConflict ? <div className="mt-1 text-xs text-warn">Schedule conflict</div> : null}
                </td>
                <td className="max-w-[220px] px-3 py-3 text-muted-foreground">{definition.scope}<div className="mt-1 text-xs">{definition.repositoryIds?.join(", ") || "No repository"}</div></td>
                <td className="px-3 py-3">{definition.riskLevel}</td>
                <td className="px-3 py-3 text-muted-foreground">{definition.ownerId}</td>
                <td className="px-3 py-3 text-muted-foreground"><div>{formatDate(definition.nextRunAt)}</div><div className="mt-1 text-xs">Last: {formatDate(definition.lastRunAt)}</div></td>
                <td className="px-3 py-3 text-muted-foreground">{definition.lastResult ?? "Not evaluated"}</td>
                <td className="px-3 py-3">{definition.approvalStatus}</td>
                <td className="px-3 py-3">{definition.verificationStatus}</td>
                <td className="px-3 py-3"><div>${definition.actualCostUsd.toFixed(2)}</div><div className="mt-1 text-xs text-muted-foreground">limit ${definition.maxCostUsd.toFixed(2)}</div></td>
                <td className="px-3 py-3 text-muted-foreground"><div>{formatDate(definition.updatedAt)}</div><div className="mt-1 text-xs">Created {formatDate(definition.createdAt)}</div></td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onSelect(definition._id)}><Eye className="h-3.5 w-3.5" /> Open</Button>
                    {definition.status === "ACTIVE" ? (
                      <Button size="sm" variant="outline" onClick={() => setAction({ type: "pause", definition })}><Pause className="h-3.5 w-3.5" /> Pause</Button>
                    ) : ["DISABLED", "PAUSED"].includes(definition.status) ? (
                      <Button size="sm" onClick={() => setAction({ type: "activate", definition })}><Play className="h-3.5 w-3.5" /> {definition.status === "PAUSED" ? "Resume" : "Activate"}</Button>
                    ) : null}
                    {definition.status !== "ACTIVE" && definition.status !== "RETIRED" ? (
                      <Button size="sm" variant="outline" onClick={() => setAction({ type: "retire", definition })}><Trash2 className="h-3.5 w-3.5" /> Retire</Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">No Definitions match the current filters.</Card>
      ) : null}

      <Dialog open={!!action} onOpenChange={(open) => { if (!open) { setAction(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionLabel(action?.type)} {action?.definition.name}</DialogTitle>
            <DialogDescription>{actionDescription(action?.type)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="automation-decision-reason">Decision reason</Label>
            <Textarea id="automation-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this governed transition appropriate?" />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Recorded with actor label, policy, timestamp, and Definition version.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button disabled={busy || reason.trim().length < 5} onClick={() => void confirm()}>{busy ? "Recording…" : `Confirm ${action?.type}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-[var(--panel-line)] bg-card px-2 text-sm text-foreground outline-none focus:border-registry-accent"
      >
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function unique(items: any[], key: string): string[] {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))] as string[];
}

function actionLabel(action?: DefinitionAction) {
  if (action === "pause") return "Pause";
  if (action === "retire") return "Retire";
  return "Activate";
}

function actionDescription(action?: DefinitionAction) {
  if (action === "pause") return "Pausing stops future gates and leaves every existing WorkOrder unchanged.";
  if (action === "retire") return "Retirement permanently removes this Definition from future evaluation. Existing WorkOrders remain unchanged.";
  return "Activation schedules approval-gated review WorkOrders only. It never approves, dispatches, or executes them.";
}

function pastTense(action: DefinitionAction) {
  if (action === "activate") return "activated";
  if (action === "pause") return "paused";
  return "retired";
}
