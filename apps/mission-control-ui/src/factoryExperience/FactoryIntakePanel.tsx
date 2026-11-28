import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/factory/badges";
import { FactoryPreviewBoundary } from "./FactoryPreviewBoundary";

export function FactoryIntakePanel({ projectId, onOpenMission }: {
  projectId: Id<"projects">;
  onOpenMission: (missionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-xl border border-line bg-surface-1 p-4" aria-label="External work intake">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-ink">External work intake <span className="ml-2 text-xs font-normal text-ink-muted">Preview</span></h2>
        <p className="mt-1 text-xs text-ink-secondary">Signed issues and application errors enter the existing Mission planning flow through an opted-in repository policy.</p></div>
      <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide intake" : "Review intake"}</Button>
    </div>
    {open ? <FactoryPreviewBoundary key={projectId} label="Intake"><IntakeDeliveries projectId={projectId} onOpenMission={onOpenMission} /></FactoryPreviewBoundary> : null}
  </section>;
}

function IntakeDeliveries({ projectId, onOpenMission }: {
  projectId: Id<"projects">; onOpenMission: (missionId: string) => void;
}) {
  const deliveries = useQuery(api.factory.intake.listDeliveries, { projectId, limit: 50 });
  const retry = useMutation(api.factory.intake.retryDelivery);
  const requestPlanning = useAction(api.factory.intake.requestPlanning);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  async function act(id: string, operation: () => Promise<unknown>, success: string) {
    setBusy(id); setMessage(null);
    try { await operation(); setMessage({ error: false, text: success }); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : "The intake action failed." }); }
    finally { setBusy(null); }
  }
  return <div className="mt-4 space-y-3">
    {message ? <p role={message.error ? "alert" : "status"} className="break-words text-xs text-ink-secondary">{message.text}</p> : null}
    {deliveries === undefined ? <p role="status" className="text-xs text-ink-muted">Loading authorized intake deliveries…</p>
      : deliveries.length === 0 ? <p className="text-xs text-ink-muted">No visible deliveries. An authorized repository policy and verified source connection are required before intake can create a draft.</p>
      : <ul className="divide-y divide-line">{deliveries.map((delivery) => <li key={delivery._id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-medium text-ink">{delivery.source.title}</h3>
          <StatusBadge tone={delivery.status === "FAILED" ? "error" : "neutral"}>{delivery.status}</StatusBadge>
        </div>
        <p className="text-xs text-ink-muted">{delivery.source.kind === "GITHUB_ISSUE" ? "GitHub issue" : "Application error"} · {delivery.attempts} processing attempts · {delivery.outcome ?? "Awaiting processing"}</p>
        {delivery.reason ? <p className="break-words text-xs text-ink-secondary">{delivery.reason}</p> : null}
        {delivery.source.kind === "PRODUCT_ERROR" ? <p className="text-xs text-ink-secondary">{delivery.restorationReceiptId ? "Independent restoration evidence is linked." : "Restoration has not been established."}</p> : null}
        <div className="flex flex-wrap gap-2">
          {delivery.missionId ? <Button size="sm" variant="outline" onClick={() => onOpenMission(String(delivery.missionId))}>Open Mission</Button> : null}
          {delivery.missionId && delivery.status === "PROCESSED" ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(delivery._id,
            () => requestPlanning({ deliveryId: delivery._id }), "Planning was requested through the existing Mission gate. Inspect the Mission for its current plan and execution state.")}>Request planning</Button> : null}
          {["RECEIVED", "FAILED"].includes(delivery.status) && delivery.attempts < 3 ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(delivery._id,
            () => retry({ deliveryId: delivery._id }), "Processing retry was scheduled. This does not dispatch application work.")}>Retry processing</Button> : null}
        </div>
      </li>)}</ul>}
    <p className="text-xs text-ink-muted">Showing up to 50 authorized deliveries. Draft creation, planning, execution, and restoration are separate recorded outcomes.</p>
  </div>;
}
