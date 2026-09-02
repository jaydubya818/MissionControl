import { useState } from "react";
import { useMutation } from "convex/react";
import { CalendarClock, Eye, PlayCircle } from "lucide-react";
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

export function AutomationSchedule({
  projectId,
  definitions,
  onSelectDefinition,
}: {
  projectId: Id<"projects">;
  definitions: any[];
  onSelectDefinition: (definitionId: string) => void;
}) {
  const evaluate = useMutation(api.automationScheduler.evaluateNow);
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const scheduled = definitions.filter((definition) => definition.triggerType === "SCHEDULE");
  const now = Date.now();
  const endOfToday = new Date().setHours(23, 59, 59, 999);
  const endOfWeek = now + 7 * 24 * 60 * 60 * 1000;
  const groups = [
    ["Due today", scheduled.filter((item) => item.status === "ACTIVE" && item.nextRunAt && item.nextRunAt <= endOfToday)],
    ["Due this week", scheduled.filter((item) => item.status === "ACTIVE" && item.nextRunAt && item.nextRunAt > endOfToday && item.nextRunAt <= endOfWeek)],
    ["Paused", scheduled.filter((item) => item.status === "PAUSED")],
    ["Suspended", scheduled.filter((item) => item.status === "SUSPENDED")],
    ["Schedule conflict", scheduled.filter((item) => item.scheduleConflict)],
  ] as const;
  const groupedIds = new Set(groups.flatMap(([, items]) => items.map((item) => item._id)));
  const later = scheduled.filter((item) => !groupedIds.has(item._id));

  async function evaluateNow() {
    if (!selected || reason.trim().length < 5) return;
    setBusyId(selected._id);
    setMessage(null);
    try {
      const result = await evaluate({
        projectId,
        automationDefinitionId: selected._id,
        reason: reason.trim(),
      });
      setMessage({
        text: result.created === 1
          ? "Exactly one read-only review-gate WorkOrder was created in AWAITING_APPROVAL."
          : `No duplicate WorkOrder was created (${result.skipped} idempotent skip).`,
      });
      setSelected(null);
      setReason("");
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Evaluation failed" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-err" : "text-sm text-ok"}>{message.text}</p> : null}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-4 w-4 text-registry-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Authoritative schedule list</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Times use each Definition’s configured time zone. Manual evaluation is idempotent and still creates only an approval-gated WorkOrder.
            </p>
          </div>
        </div>
      </Card>
      {scheduled.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">No scheduled Automation Definitions.</Card>
      ) : (
        <>
          {groups.map(([label, items]) => items.length > 0 ? (
            <ScheduleGroup key={label} label={label} definitions={items} busyId={busyId} onSelect={onSelectDefinition} onEvaluate={setSelected} />
          ) : null)}
          {later.length > 0 ? <ScheduleGroup label="Later / disabled" definitions={later} busyId={busyId} onSelect={onSelectDefinition} onEvaluate={setSelected} /> : null}
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Evaluate {selected?.name} now</DialogTitle>
            <DialogDescription>
              This may create one read-only WorkOrder in AWAITING_APPROVAL. It does not approve, dispatch, or execute the Workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-3 text-sm text-muted-foreground">
            {humanizeCron(selected?.triggerConfig?.cron)} · {selected?.scope} · next {formatDate(selected?.nextRunAt)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-evaluation-reason">Evaluation reason</Label>
            <Textarea id="manual-evaluation-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this review gate be evaluated now?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button disabled={busyId !== null || reason.trim().length < 5} onClick={() => void evaluateNow()}>
              {busyId ? "Evaluating…" : "Evaluate now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleGroup({
  label,
  definitions,
  busyId,
  onSelect,
  onEvaluate,
}: {
  label: string;
  definitions: any[];
  busyId: string | null;
  onSelect: (definitionId: string) => void;
  onEvaluate: (definition: any) => void;
}) {
  return (
    <section aria-labelledby={`schedule-${label.replace(/\W+/g, "-").toLowerCase()}`}>
      <h2 id={`schedule-${label.replace(/\W+/g, "-").toLowerCase()}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</h2>
      <div className="overflow-hidden rounded-xl border border-[var(--panel-line)]">
        <ul className="divide-y divide-[var(--panel-line)]">
          {definitions.map((definition) => (
            <li key={`${label}:${definition._id}`} className="grid gap-4 bg-card/30 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onSelect(definition._id)} className="font-medium text-foreground hover:text-registry-accent">{definition.name}</button>
                  <Badge variant="outline" className={statusTone(definition.status)}>{definition.status}</Badge>
                  {definition.scheduleConflict ? <Badge variant="outline" className="border-warn/30 text-warn">CONFLICT</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{humanizeCron(definition.triggerConfig?.cron)} · {definition.triggerConfig?.timezone ?? "UTC"}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{definition.triggerConfig?.cron}</p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-registry-accent">Next five projected evaluations</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-4">
                    {Array.from({ length: 5 }, (_, index) => {
                      const first = definition.nextRunAt ?? Date.now();
                      const cadenceMs = Number(definition.triggerConfig?.intervalMs) || 7 * 24 * 60 * 60 * 1000;
                      return <li key={index}>{formatDate(first + cadenceMs * index)} ({definition.triggerConfig?.timezone ?? "UTC"})</li>;
                    })}
                  </ol>
                </details>
              </div>
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div><dt>Next evaluation</dt><dd className="mt-1 text-foreground">{formatDate(definition.nextRunAt)}</dd></div>
                <div><dt>Last evaluation</dt><dd className="mt-1 text-foreground">{formatDate(definition.lastRunAt)}</dd></div>
                <div><dt>Workflow / scope</dt><dd className="mt-1 text-foreground">{definition.workflowId}@{definition.workflowVersion} · {definition.scope}</dd></div>
                <div><dt>Policies</dt><dd className="mt-1 text-foreground">{definition.overlapPolicy} · {definition.catchUpPolicy}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button size="sm" variant="outline" onClick={() => onSelect(definition._id)}><Eye className="h-3.5 w-3.5" /> Preview</Button>
                <Button size="sm" variant="outline" disabled={definition.status !== "ACTIVE" || busyId === definition._id} onClick={() => onEvaluate(definition)}>
                  <PlayCircle className="h-3.5 w-3.5" /> Evaluate now
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
