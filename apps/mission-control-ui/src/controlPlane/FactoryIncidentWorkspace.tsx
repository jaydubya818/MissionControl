import { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/factory/badges";

const PHASES = [
  "CLARIFY", "CONTAIN", "OBSERVE", "ISOLATE", "RESTORE",
  "CORRECT", "PREVENT", "MEASURE", "RESOLVED",
] as const;

const CONTAINMENT_ACTIONS = [
  "PAUSE_REPOSITORY_DISPATCH",
  "PAUSE_WORKSPACE_DISPATCH",
  "CANCEL_ATTEMPT",
  "REVOKE_ATTEMPT_CREDENTIALS",
  "QUARANTINE_WORKER",
  "QUARANTINE_HARNESS",
  "QUARANTINE_MODEL_ROUTE",
  "QUARANTINE_TOOL",
  "QUARANTINE_FACTORY_VERSION",
  "DISABLE_GUARDED_AUTO",
  "HOLD_PUBLICATION",
  "HOLD_RELEASE",
] as const;

type Phase = (typeof PHASES)[number];
type ContainmentAction = (typeof CONTAINMENT_ACTIONS)[number];

function nextPhase(current: Phase): Phase | null {
  const index = PHASES.indexOf(current);
  return index < 0 || index === PHASES.length - 1 ? null : PHASES[index + 1];
}

function incidentTone(status: string) {
  if (status === "RESOLVED") return "success" as const;
  if (status === "CONTAINED") return "warning" as const;
  if (status === "RECOVERING" || status === "MONITORING") return "info" as const;
  return "error" as const;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256=${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function FactoryIncidentWorkspace({ projectId }: { projectId: Id<"projects"> }) {
  const incidents = useQuery(api.factory.incidents.list, { projectId, limit: 100 });
  const [selectedId, setSelectedId] = useState<Id<"factoryIncidents"> | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!selectedId && incidents?.[0]) setSelectedId(incidents[0]._id);
    if (selectedId && incidents && !incidents.some((incident) => incident._id === selectedId)) {
      setSelectedId(incidents[0]?._id ?? null);
    }
  }, [incidents, selectedId]);

  if (incidents === undefined) return <IncidentLoadingState />;

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto 2xl:grid-cols-[340px_minmax(0,1fr)] 2xl:overflow-hidden">
      <Card className="flex min-h-[280px] max-h-[420px] flex-col overflow-hidden 2xl:max-h-none">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Incident queue</h2>
            <p className="text-[12px] text-ink-muted">{incidents.length} retained incident{incidents.length === 1 ? "" : "s"}</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate((value) => !value)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> File
          </Button>
        </div>
        {showCreate ? (
          <IncidentCreateForm
            projectId={projectId}
            onCreated={(incidentId) => {
              setSelectedId(incidentId);
              setShowCreate(false);
            }}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {incidents.length === 0 ? (
            <IncidentEmptyState onCreate={() => setShowCreate(true)} />
          ) : incidents.map((incident) => (
            <button
              type="button"
              key={incident._id}
              onClick={() => setSelectedId(incident._id)}
              className={`mb-2 w-full rounded-lg border p-3 text-left transition-colors ${selectedId === incident._id ? "border-ring bg-surface-2" : "border-line hover:bg-surface-2"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-muted">{incident.incidentKey}</span>
                <StatusBadge tone={incidentTone(incident.status)}>{incident.status}</StatusBadge>
              </div>
              <div className="mt-2 text-[13px] font-medium text-ink">{incident.title}</div>
              <div className="mt-1 line-clamp-2 text-[12px] text-ink-secondary">{incident.summary}</div>
              <div className="mt-2 text-[11px] text-ink-muted">{incident.severity} · {label(incident.phase)}</div>
            </button>
          ))}
        </div>
      </Card>

      {selectedId ? (
        <IncidentDetail incidentId={selectedId} />
      ) : (
        <Card className="flex min-h-[360px] items-center justify-center p-8 text-center text-ink-muted">
          Select or file an incident to begin command.
        </Card>
      )}
    </div>
  );
}

function IncidentLoadingState() {
  return (
    <div className="grid flex-1 gap-4 2xl:grid-cols-[340px_minmax(0,1fr)]" role="status" aria-label="Loading incidents">
      <Card className="h-[520px] animate-pulse bg-surface-2" />
      <Card className="h-[520px] animate-pulse bg-surface-2" />
    </div>
  );
}

function IncidentEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-5 py-12 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
      <div className="mt-3 text-[14px] font-medium text-ink">No incidents recorded</div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        This means the canonical incident queue is empty, not that alerts or failures never occurred.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onCreate}>File an incident</Button>
    </div>
  );
}

function IncidentCreateForm({
  projectId,
  onCreated,
}: {
  projectId: Id<"projects">;
  onCreated: (incidentId: Id<"factoryIncidents">) => void;
}) {
  const createIncident = useMutation(api.factory.incidents.create);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [impact, setImpact] = useState("");
  const [objective, setObjective] = useState("");
  const [commander, setCommander] = useState("");
  const [severity, setSeverity] = useState<"SEV1" | "SEV2" | "SEV3" | "SEV4">("SEV3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const sourceFingerprint = await sha256(`${projectId}:${title.trim()}:${summary.trim()}`);
      const result = await createIncident({
        projectId,
        sourceFingerprint,
        title,
        summary,
        severity,
        commanderActorId: commander.trim() || undefined,
        businessImpact: impact,
        recoveryObjective: objective,
        evidenceRefs: [],
        idempotencyKey: `incident-ui:${crypto.randomUUID()}`,
      });
      onCreated(result.incident._id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Incident creation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-line bg-surface-2 p-3">
      <Input aria-label="Incident title" placeholder="Incident title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea aria-label="Incident summary" placeholder="What happened?" value={summary} onChange={(event) => setSummary(event.target.value)} />
      <Textarea aria-label="Business impact" placeholder="Business impact" value={impact} onChange={(event) => setImpact(event.target.value)} />
      <Textarea aria-label="Recovery objective" placeholder="Known-safe recovery objective" value={objective} onChange={(event) => setObjective(event.target.value)} />
      <Input aria-label="Incident commander" placeholder="Incident commander identity" value={commander} onChange={(event) => setCommander(event.target.value)} />
      <select aria-label="Severity" className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[13px] text-ink" value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}>
        <option value="SEV1">SEV1</option><option value="SEV2">SEV2</option><option value="SEV3">SEV3</option><option value="SEV4">SEV4</option>
      </select>
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
      <Button size="sm" disabled={submitting} onClick={submit}>{submitting ? "Filing…" : "File incident"}</Button>
    </div>
  );
}

function IncidentDetail({ incidentId }: { incidentId: Id<"factoryIncidents"> }) {
  const detail = useQuery(api.factory.incidents.get, { incidentId });
  const advance = useMutation(api.factory.incidents.advance);
  const assignCommander = useMutation(api.factory.incidents.assignCommander);
  const decideProposal = useMutation(api.factory.incidents.decideProposal);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [selectedActions, setSelectedActions] = useState<ContainmentAction[]>([]);
  const [restoreAuthority, setRestoreAuthority] = useState(false);
  const [commander, setCommander] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const incident = detail?.incident;
  const upcoming = incident ? nextPhase(incident.phase as Phase) : null;
  const phaseIndex = incident ? PHASES.indexOf(incident.phase as Phase) : -1;
  const acceptedProposals = useMemo(
    () => detail?.proposals.filter((proposal) => proposal.status === "ACCEPTED") ?? [],
    [detail?.proposals],
  );

  if (!detail || !incident) return <Card className="h-[520px] animate-pulse bg-surface-2" role="status" aria-label="Loading incident detail" />;

  const recordProposalDecision = async (proposalId: Id<"factoryIncidentProposals">, decision: "ACCEPTED" | "REJECTED") => {
    setError(null);
    try {
      await decideProposal({
        proposalId,
        decision,
        reason: decision === "ACCEPTED"
          ? "Reviewed and accepted as advisory incident input."
          : "Reviewed and rejected as advisory incident input.",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Proposal decision failed.");
    }
  };

  const submit = async () => {
    if (!upcoming) return;
    setSubmitting(true);
    setError(null);
    try {
      const controlReferences = reference.split("\n").map((item) => item.trim()).filter(Boolean);
      const evidenceRefs = reference.trim()
        ? [{ kind: upcoming === "MEASURE" ? "EVIDENCE" as const : "AUDIT" as const, recordId: reference.trim(), relationship: upcoming === "RESTORE" ? "known-safe-restoration" : "phase-evidence" }]
        : [];
      await advance({
        incidentId,
        expectedSequence: incident.currentSequence,
        nextPhase: upcoming,
        reason,
        evidenceRefs,
        containmentActions: upcoming === "CONTAIN" ? selectedActions : [],
        controlReferences,
        restoreAuthority: upcoming === "RESTORE" ? restoreAuthority : undefined,
        idempotencyKey: `incident-ui:${incidentId}:${incident.currentSequence + 1}:${crypto.randomUUID()}`,
      });
      setReason("");
      setReference("");
      setSelectedActions([]);
      setRestoreAuthority(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Incident transition failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="min-h-0 overflow-y-auto p-5" aria-label="Incident command workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] text-ink-muted">{incident.incidentKey}</div>
          <h2 className="mt-1 text-xl font-semibold text-ink">{incident.title}</h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-secondary">{incident.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone="error">{incident.severity}</StatusBadge>
          <StatusBadge tone={incidentTone(incident.status)}>{incident.status}</StatusBadge>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2" aria-label="Incident lifecycle">
        <ol className="flex min-w-[780px] items-center gap-1">
          {PHASES.map((phase, index) => (
            <li key={phase} className={`flex-1 rounded-md border px-2 py-2 text-center text-[10px] font-semibold tracking-wide ${index === phaseIndex ? "border-ring bg-surface-2 text-ink" : index < phaseIndex ? "border-success/40 text-success" : "border-line text-ink-muted"}`}>
              {label(phase)}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Fact label="Commander" value={incident.commanderActorId ?? "Unassigned — containment blocked"} />
        <Fact label="Containment" value={label(incident.containmentState)} />
        <Fact label="Authority" value={incident.authorityRestored ? "Explicitly restored" : "Not restored"} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Fact label="Business impact" value={incident.businessImpact} />
        <Fact label="Recovery objective" value={incident.recoveryObjective} />
      </div>

      {!incident.commanderActorId ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-[11px] font-medium text-ink-muted">Incident commander
            <Input className="mt-1" aria-label="Assign incident commander" placeholder="Named human identity" value={commander} onChange={(event) => setCommander(event.target.value)} />
          </label>
          <Button size="sm" variant="outline" onClick={async () => {
            setError(null);
            try {
              await assignCommander({
                incidentId,
                expectedSequence: incident.currentSequence,
                commanderActorId: commander,
                reason: "Assign named human incident commander before containment.",
                idempotencyKey: `incident-ui:${incidentId}:commander:${crypto.randomUUID()}`,
              });
              setCommander("");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Commander assignment failed.");
            }
          }}>Assign commander</Button>
        </div>
      ) : null}

      {detail.proposals.length > 0 ? (
        <div className="mt-5 rounded-lg border border-line p-4">
          <h3 className="text-[13px] font-semibold text-ink">Agent and service proposals</h3>
          <p className="mt-1 text-[12px] text-ink-muted">Advisory only. Accepted proposals still require a separate incident decision.</p>
          <div className="mt-3 space-y-2">
            {detail.proposals.map((proposal) => (
              <div key={proposal._id} className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink-secondary">
                <div><span className="font-medium text-ink">{label(proposal.kind)}</span> · {proposal.status} · {proposal.summary}</div>
                {proposal.status === "OPEN" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void recordProposalDecision(proposal._id, "ACCEPTED")}>Accept proposal</Button>
                    <Button size="sm" variant="ghost" onClick={() => void recordProposalDecision(proposal._id, "REJECTED")}>Reject proposal</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {acceptedProposals.length > 0 ? <p className="mt-2 text-[11px] text-ink-muted">{acceptedProposals.length} accepted proposal(s) await separate execution or phase authority.</p> : null}
        </div>
      ) : null}

      {upcoming ? (
        <div className="mt-5 rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2">
            {upcoming === "CONTAIN" || upcoming === "RESTORE" || upcoming === "RESOLVED" ? <ShieldAlert className="h-4 w-4 text-warning" /> : <RefreshCw className="h-4 w-4 text-info" />}
            <h3 className="text-[14px] font-semibold text-ink">Advance to {label(upcoming)}</h3>
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">This immutable decision expects sequence {incident.currentSequence}. Refresh conflicts fail closed.</p>
          {upcoming === "CONTAIN" ? (
            <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-[12px] font-medium text-ink">Applied bounded controls</legend>
              {CONTAINMENT_ACTIONS.map((action) => (
                <label key={action} className="flex items-center gap-2 text-[12px] text-ink-secondary">
                  <input type="checkbox" checked={selectedActions.includes(action)} onChange={(event) => setSelectedActions((current) => event.target.checked ? [...current, action] : current.filter((item) => item !== action))} />
                  {label(action)}
                </label>
              ))}
            </fieldset>
          ) : null}
          {upcoming === "RESTORE" ? (
            <label className="mt-3 flex items-center gap-2 text-[12px] font-medium text-ink">
              <input type="checkbox" checked={restoreAuthority} onChange={(event) => setRestoreAuthority(event.target.checked)} />
              I explicitly authorize restoration to the known-safe state
            </label>
          ) : null}
          <Textarea className="mt-3" aria-label="Incident transition reason" placeholder="Decision reason and current facts" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Textarea className="mt-2" aria-label="Evidence or control reference" placeholder={upcoming === "CONTAIN" ? "One exact applied-control receipt per line (required per action)" : upcoming === "MEASURE" ? "Measurement evidence reference (required)" : "Evidence or control reference"} value={reference} onChange={(event) => setReference(event.target.value)} />
          {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p> : null}
          <Button className="mt-3" size="sm" disabled={submitting} onClick={submit}>{submitting ? "Recording…" : `Record ${label(upcoming)} decision`}</Button>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-4 text-[13px] text-success">
          <CheckCircle2 className="h-4 w-4" /> Resolved after explicit restoration and measurement. Evidence remains immutable.
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-ink">Immutable command log</h3>
        <div className="mt-2 space-y-2">
          {detail.transitions.slice().reverse().map((transition) => (
            <div key={transition._id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
                <span>#{transition.sequence} · {label(transition.decisionKind)} · {transition.actorType}</span>
                <time>{new Date(transition.createdAt).toLocaleString()}</time>
              </div>
              <div className="mt-1 text-[12px] text-ink-secondary">{transition.fromPhase ? `${label(transition.fromPhase)} → ` : ""}{label(transition.toPhase)} · {transition.reason}</div>
              <div className="mt-1 text-[11px] text-ink-muted">{transition.evidenceRefs.length} evidence ref(s) · {transition.controlReferences.length} control ref(s)</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{factLabel}</div>
      <div className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{value}</div>
    </div>
  );
}

export function IncidentPermissionState({ message }: { message?: string }) {
  return (
    <Card className="flex min-h-[360px] items-center justify-center p-8 text-center" role="alert">
      <div>
        <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
        <h2 className="mt-3 text-[15px] font-semibold text-ink">Incident command unavailable</h2>
        <p className="mt-1 max-w-md text-[13px] text-ink-muted">{message ?? "You do not have permission to inspect or command incidents in this workspace."}</p>
      </div>
    </Card>
  );
}

export class FactoryIncidentBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <IncidentPermissionState message={this.state.error.message} />;
    }
    return this.props.children;
  }
}
