/**
 * Agent Hiring Pipeline — Comms > Hiring
 * Stage 0–5: role specs, candidates, screen, assessments, panel, decision.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import {
  UserPlus,
  Briefcase,
  ChevronRight,
  Plus,
  ClipboardList,
  FileCheck,
  Users,
  Gavel,
} from "lucide-react";
import { PageHeader } from "./components/PageHeader";

const STAGES = [
  { id: 0, label: "Role", icon: Briefcase },
  { id: 1, label: "Candidates", icon: UserPlus },
  { id: 2, label: "Screen", icon: ClipboardList },
  { id: 3, label: "Assessments", icon: FileCheck },
  { id: 4, label: "Panel", icon: Users },
  { id: 5, label: "Decision", icon: Gavel },
] as const;

const STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  draft: "neutral",
  screening: "warning",
  assessed: "info",
  panel: "info",
  offer: "success",
  no_hire: "error",
};

const SELECT_CLASS =
  "mt-1 w-full h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface HiringViewProps {
  projectId: Id<"projects"> | null;
}

export function HiringView({ projectId }: HiringViewProps) {
  const [selectedRoleSpecId, setSelectedRoleSpecId] = useState<Id<"agentRoleSpecs"> | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<Id<"hiringCandidates"> | null>(null);
  const [showNewRoleForm, setShowNewRoleForm] = useState(false);
  const [showAddCandidateForm, setShowAddCandidateForm] = useState(false);

  const roleSpecs = useQuery(
    api.agentHiring.listRoleSpecs,
    projectId ? { projectId } : "skip"
  );
  const candidates = useQuery(
    api.agentHiring.listCandidates,
    selectedRoleSpecId ? { roleSpecId: selectedRoleSpecId } : "skip"
  );
  const selectedRole = useQuery(
    api.agentHiring.getRoleSpec,
    selectedRoleSpecId ? { id: selectedRoleSpecId } : "skip"
  );
  const selectedCandidate = useQuery(
    api.agentHiring.getCandidate,
    selectedCandidateId ? { id: selectedCandidateId } : "skip"
  );

  const createRoleSpec = useMutation(api.agentHiring.createRoleSpec);
  const createCandidate = useMutation(api.agentHiring.createCandidate);
  const saveScreenReport = useMutation(api.agentHiring.saveScreenReport);
  const saveAssessmentPacket = useMutation(api.agentHiring.saveAssessmentPacket);
  const savePanelPacket = useMutation(api.agentHiring.savePanelPacket);
  const saveDecisionRecord = useMutation(api.agentHiring.saveDecisionRecord);
  const roleCount = roleSpecs?.length ?? 0;
  const candidateCount = candidates?.length ?? 0;
  const selectedStage = selectedCandidate ? "evaluation" : selectedRoleSpecId ? "candidate review" : "role definition";

  if (!projectId) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PageHeader
          title="Hiring"
          description="Define role specs, compare candidates, and record an explicit hire or no-hire decision."
          eyebrow="Comms"
          icon={<UserPlus className="h-4.5 w-4.5" strokeWidth={1.7} />}
        />
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <EmptyState
            icon={Briefcase}
            title="Select a project first"
            description="Hiring is scoped to a project so role specs, candidates, and evaluation records stay attached to a real operating context."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Hiring"
        description="Role specs, candidates, and decision records for building a reliable operator-grade agent bench."
        eyebrow="Comms"
        icon={<UserPlus className="h-4.5 w-4.5" strokeWidth={1.7} />}
        status={<StatusBadge tone="neutral">{roleCount} roles</StatusBadge>}
        actions={
          <Button size="sm" onClick={() => setShowNewRoleForm(true)}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Role specs"
              value={roleCount}
              detail="Distinct operator or agent roles currently defined"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Candidates"
              value={candidateCount}
              detail="Candidates attached to the currently selected role"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Current stage"
              value={selectedStage}
              detail="The hiring flow state currently surfaced in this workspace"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Decision standard"
              value="Explicit"
              detail="Every role should end with a recorded hire or no-hire outcome"
            />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="text-[15px] font-semibold text-ink">Roles</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setShowNewRoleForm(true)}
                aria-label="New role"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3">
              {!roleSpecs ? (
                <div className="flex flex-col gap-2 rounded-lg border border-line px-4 py-6">
                  <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                  <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                </div>
              ) : roleSpecs.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No role specs yet"
                  description="Start with the role definition so candidates are judged against a real mandate instead of instinct."
                  action={
                    <Button size="sm" onClick={() => setShowNewRoleForm(true)}>
                      Create role
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {roleSpecs.map((role) => (
                    <button
                      key={role._id}
                      type="button"
                      onClick={() => {
                        setSelectedRoleSpecId(role._id);
                        setSelectedCandidateId(null);
                      }}
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150",
                        selectedRoleSpecId === role._id
                          ? "border-line-strong bg-surface-2"
                          : "border-line bg-surface-1 hover:border-line-strong"
                      )}
                    >
                      <div className="text-[13.5px] font-medium text-ink">{role.name}</div>
                      <div className="mt-1 text-[11.5px] font-mono text-ink-muted">{role.slug}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="text-[11.5px] font-medium text-ink-muted">Candidates</div>
                <div className="mt-1 text-[13.5px] font-semibold text-ink">{selectedRole?.name ?? "Select a role"}</div>
              </div>
              {selectedRoleSpecId ? (
                <Button variant="outline" size="sm" onClick={() => setShowAddCandidateForm(true)}>
                  <UserPlus className="h-4 w-4" />
                  Add candidate
                </Button>
              ) : null}
            </div>
            <div className="p-3">
              {!selectedRoleSpecId ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Choose a role"
                  description="Candidate review begins after the target role is clearly defined."
                />
              ) : !candidates ? (
                <div className="flex flex-col gap-2 rounded-lg border border-line px-4 py-6">
                  <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                  <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                </div>
              ) : candidates.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="No candidates yet"
                  description="Add a candidate to begin screening, assessments, panel review, and the final decision record."
                  action={
                    <Button size="sm" onClick={() => setShowAddCandidateForm(true)}>
                      Add candidate
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate._id}
                      type="button"
                      onClick={() => setSelectedCandidateId(candidate._id)}
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150",
                        selectedCandidateId === candidate._id
                          ? "border-line-strong bg-surface-2"
                          : "border-line bg-surface-1 hover:border-line-strong"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium text-ink">{candidate.label}</div>
                          <div className="mt-1 text-[11.5px] text-ink-muted">{candidate.source}</div>
                        </div>
                        <StatusBadge tone={STATUS_TONE[candidate.status] ?? "neutral"}>
                          {candidate.status}
                        </StatusBadge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            {!selectedCandidateId ? (
              <EmptyState
                icon={ClipboardList}
                title="Select a candidate"
                description="Once a candidate is selected, record screen outcomes, assessments, panel notes, and the final hire decision here."
              />
            ) : (
              <CandidatePipelineDetail
                projectId={projectId}
                roleSpecId={selectedRoleSpecId!}
                candidate={selectedCandidate}
                onSaveScreenReport={saveScreenReport}
                onSaveAssessmentPacket={saveAssessmentPacket}
                onSavePanelPacket={savePanelPacket}
                onSaveDecisionRecord={saveDecisionRecord}
              />
            )}
          </Card>
        </div>
      </div>

      {/* New role form (Stage 0) — minimal for now */}
      {showNewRoleForm && (
        <NewRoleSpecForm
          projectId={projectId}
          onClose={() => setShowNewRoleForm(false)}
          onCreated={(id) => {
            setSelectedRoleSpecId(id);
            setShowNewRoleForm(false);
          }}
          createRoleSpec={createRoleSpec}
        />
      )}

      {/* Add candidate form (Stage 1) */}
      {showAddCandidateForm && selectedRoleSpecId && (
        <AddCandidateForm
          projectId={projectId}
          roleSpecId={selectedRoleSpecId}
          onClose={() => setShowAddCandidateForm(false)}
          onCreated={() => {
            setShowAddCandidateForm(false);
          }}
          createCandidate={createCandidate}
        />
      )}
    </main>
  );
}

function NewRoleSpecForm({
  projectId,
  onClose,
  onCreated,
  createRoleSpec,
}: {
  projectId: Id<"projects">;
  onClose: () => void;
  onCreated: (id: Id<"agentRoleSpecs">) => void;
  createRoleSpec: ReturnType<typeof useMutation<typeof api.agentHiring.createRoleSpec>>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcomesText, setOutcomesText] = useState("");
  const [includesText, setIncludesText] = useState("");
  const [excludesText, setExcludesText] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [forbiddenTools, setForbiddenTools] = useState("");
  const [redlinesText, setRedlinesText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = (slug || name.toLowerCase().replace(/\s+/g, "_")).replace(/[^a-z0-9_]/gi, "");
    if (!s || !name.trim() || !purpose.trim()) return;
    setSaving(true);
    try {
      const id = await createRoleSpec({
        projectId,
        name: name.trim(),
        slug: s,
        purpose: purpose.trim(),
        outcomes: outcomesText.trim() ? outcomesText.trim().split("\n").filter(Boolean) : [],
        scope: {
          includes: includesText.trim() ? includesText.trim().split("\n").filter(Boolean) : [],
          excludes: excludesText.trim() ? excludesText.trim().split("\n").filter(Boolean) : [],
        },
        tooling: {
          allowed_tools: allowedTools.trim() ? allowedTools.split(",").map((t) => t.trim()).filter(Boolean) : [],
          forbidden_tools: forbiddenTools.trim() ? forbiddenTools.split(",").map((t) => t.trim()).filter(Boolean) : [],
        },
        policyEnvelope: {
          redlines: redlinesText.trim() ? redlinesText.trim().split("\n").filter(Boolean) : [],
        },
      });
      onCreated(id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-[15px] font-semibold text-ink mb-4">New role spec (Stage 0)</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support Triage Agent" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="support_triage_agent" />
          </div>
          <div>
            <Label>Purpose</Label>
            <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} placeholder="Own intake, triage..." />
          </div>
          <div>
            <Label>Outcomes (one per line)</Label>
            <Textarea value={outcomesText} onChange={(e) => setOutcomesText(e.target.value)} rows={2} placeholder="Issue classification..." />
          </div>
          <div>
            <Label>Scope includes (one per line)</Label>
            <Textarea value={includesText} onChange={(e) => setIncludesText(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Scope excludes (one per line)</Label>
            <Textarea value={excludesText} onChange={(e) => setExcludesText(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Allowed tools (comma-separated)</Label>
            <Input value={allowedTools} onChange={(e) => setAllowedTools(e.target.value)} placeholder="ticketing.read, kb.search" />
          </div>
          <div>
            <Label>Forbidden tools (comma-separated)</Label>
            <Input value={forbiddenTools} onChange={(e) => setForbiddenTools(e.target.value)} placeholder="billing, mass_messaging" />
          </div>
          <div>
            <Label>Redlines (one per line)</Label>
            <Textarea value={redlinesText} onChange={(e) => setRedlinesText(e.target.value)} rows={2} placeholder="No production DB modifications" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !purpose.trim()}>
              {saving ? "Creating…" : "Create role"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function AddCandidateForm({
  projectId,
  roleSpecId,
  onClose,
  onCreated,
  createCandidate,
}: {
  projectId: Id<"projects">;
  roleSpecId: Id<"agentRoleSpecs">;
  onClose: () => void;
  onCreated: () => void;
  createCandidate: ReturnType<typeof useMutation<typeof api.agentHiring.createCandidate>>;
}) {
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<"model_provider" | "template" | "internal">("model_provider");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await createCandidate({ projectId, roleSpecId, label: label.trim(), source });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6">
        <h3 className="text-[15px] font-semibold text-ink mb-4">Add candidate (Stage 1)</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Claude Opus + triage prompt" />
          </div>
          <div>
            <Label>Source</Label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "model_provider" | "template" | "internal")}
              className={SELECT_CLASS}
            >
              <option value="model_provider">Model / provider</option>
              <option value="template">Template</option>
              <option value="internal">Internal</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !label.trim()}>
              {saving ? "Adding…" : "Add candidate"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function CandidatePipelineDetail({
  roleSpecId,
  candidate,
  onSaveScreenReport,
  onSaveAssessmentPacket,
  onSavePanelPacket,
  onSaveDecisionRecord,
}: {
  projectId: Id<"projects">;
  roleSpecId: Id<"agentRoleSpecs">;
  candidate: ReturnType<typeof useQuery<typeof api.agentHiring.getCandidate>>;
  onSaveScreenReport: ReturnType<typeof useMutation<typeof api.agentHiring.saveScreenReport>>;
  onSaveAssessmentPacket: ReturnType<typeof useMutation<typeof api.agentHiring.saveAssessmentPacket>>;
  onSavePanelPacket: ReturnType<typeof useMutation<typeof api.agentHiring.savePanelPacket>>;
  onSaveDecisionRecord: ReturnType<typeof useMutation<typeof api.agentHiring.saveDecisionRecord>>;
}) {
  const [activeTab, setActiveTab] = useState("screen");
  if (!candidate || !("_id" in candidate)) {
    return <p className="text-[13.5px] text-ink-muted">Loading candidate…</p>;
  }
  const candidateId = candidate._id;

  return (
    <div className="space-y-4">
      {/* Pipeline stepper */}
      <div className="flex items-center gap-1 flex-wrap">
        {STAGES.map((s, i) => {
          const tab = i === 2 ? "screen" : i === 3 ? "assessments" : i === 4 ? "panel" : i === 5 ? "decision" : null;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => tab && setActiveTab(tab)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150",
                  activeTab === tab ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink",
                  !tab && "cursor-default"
                )}
              >
                {s.label}
              </button>
              {i < STAGES.length - 1 && <ChevronRight className="h-3 w-3 text-ink-muted" />}
            </div>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="screen">Screen</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="panel">Panel</TabsTrigger>
          <TabsTrigger value="decision">Decision</TabsTrigger>
        </TabsList>
        <TabsContent value="screen" className="mt-4">
          <ScreenReportForm
            candidateId={candidateId}
            roleSpecId={roleSpecId}
            existing={candidate.screenReport}
            onSave={onSaveScreenReport}
          />
        </TabsContent>
        <TabsContent value="assessments" className="mt-4">
          <AssessmentPacketForm
            candidateId={candidateId}
            roleSpecId={roleSpecId}
            existing={candidate.assessmentPacket}
            onSave={onSaveAssessmentPacket}
          />
        </TabsContent>
        <TabsContent value="panel" className="mt-4">
          <PanelPacketForm
            candidateId={candidateId}
            roleSpecId={roleSpecId}
            existing={candidate.panelPacket}
            onSave={onSavePanelPacket}
          />
        </TabsContent>
        <TabsContent value="decision" className="mt-4">
          <DecisionRecordForm
            candidateId={candidateId}
            roleSpecId={roleSpecId}
            existing={candidate.decisionRecord}
            onSave={onSaveDecisionRecord}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScreenReportForm({
  candidateId,
  roleSpecId,
  existing,
  onSave,
}: {
  candidateId: Id<"hiringCandidates">;
  roleSpecId: Id<"agentRoleSpecs">;
  existing: { pass: boolean; scores: unknown; disqualifiers: string[] } | null;
  onSave: ReturnType<typeof useMutation<typeof api.agentHiring.saveScreenReport>>;
}) {
  const [pass, setPass] = useState(existing?.pass ?? true);
  const [disqualifiersText, setDisqualifiersText] = useState((existing?.disqualifiers ?? []).join("\n"));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        candidateId,
        roleSpecId,
        pass,
        scores: existing?.scores ?? { structure: 4, triage: 4, policy: 4, tool_reliability: 4, collaboration: 4 },
        disqualifiers: disqualifiersText.trim() ? disqualifiersText.trim().split("\n").filter(Boolean) : [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h4 className="text-[13.5px] font-medium text-ink mb-3">Stage 2 — Recruiter screen</h4>
      {existing && <p className="text-[12.5px] text-ink-muted mb-2">Previously: {existing.pass ? "Pass" : "Fail"}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="pass" checked={pass} onChange={(e) => setPass(e.target.checked)} />
          <Label htmlFor="pass">Pass</Label>
        </div>
        <div>
          <Label>Disqualifiers (one per line)</Label>
          <Textarea value={disqualifiersText} onChange={(e) => setDisqualifiersText(e.target.value)} rows={2} />
        </div>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save screen report"}</Button>
      </form>
    </Card>
  );
}

function AssessmentPacketForm({
  candidateId,
  roleSpecId,
  existing,
  onSave,
}: {
  candidateId: Id<"hiringCandidates">;
  roleSpecId: Id<"agentRoleSpecs">;
  existing: { assessments: unknown[]; overallScores?: unknown } | null;
  onSave: ReturnType<typeof useMutation<typeof api.agentHiring.saveAssessmentPacket>>;
}) {
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        candidateId,
        roleSpecId,
        assessments: existing?.assessments ?? [{ id: "A1", name: "Triage work sample", score: 4 }, { id: "A2", name: "Evidence correlation", score: 4 }, { id: "A3", name: "Duplicate detection", score: 4 }, { id: "A4", name: "Policy escalation", score: 4 }],
        overallScores: existing?.overallScores ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h4 className="text-[13.5px] font-medium text-ink mb-3">Stage 3 — Competency assessments</h4>
      {existing && <p className="text-[12.5px] text-ink-muted mb-2">Saved: {existing.assessments?.length ?? 0} assessments</p>}
      <form onSubmit={handleSubmit}>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save assessment packet"}</Button>
      </form>
    </Card>
  );
}

function PanelPacketForm({
  candidateId,
  roleSpecId,
  existing,
  onSave,
}: {
  candidateId: Id<"hiringCandidates">;
  roleSpecId: Id<"agentRoleSpecs">;
  existing: { panelNotes: unknown; hireDecisionDraft: string } | null;
  onSave: ReturnType<typeof useMutation<typeof api.agentHiring.savePanelPacket>>;
}) {
  const [draft, setDraft] = useState<"strong_hire" | "hire" | "no_hire">((existing?.hireDecisionDraft as "strong_hire" | "hire" | "no_hire") ?? "hire");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        candidateId,
        roleSpecId,
        panelNotes: existing?.panelNotes ?? { CTO: "", Orchestrator: "", Peer: "" },
        hireDecisionDraft: draft,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h4 className="text-[13.5px] font-medium text-ink mb-3">Stage 4 — Panel roundtable</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Hire decision draft</Label>
          <select value={draft} onChange={(e) => setDraft(e.target.value as "strong_hire" | "hire" | "no_hire")} className={SELECT_CLASS}>
            <option value="strong_hire">Strong Hire</option>
            <option value="hire">Hire</option>
            <option value="no_hire">No Hire</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save panel packet"}</Button>
      </form>
    </Card>
  );
}

function DecisionRecordForm({
  candidateId,
  roleSpecId,
  existing,
  onSave,
}: {
  candidateId: Id<"hiringCandidates">;
  roleSpecId: Id<"agentRoleSpecs">;
  existing: { decision: string; autonomyLevel: number; decidedBy?: string } | null;
  onSave: ReturnType<typeof useMutation<typeof api.agentHiring.saveDecisionRecord>>;
}) {
  const [decision, setDecision] = useState<"strong_hire" | "hire" | "no_hire">((existing?.decision as "strong_hire" | "hire" | "no_hire") ?? "hire");
  const [autonomyLevel, setAutonomyLevel] = useState<1 | 2 | 3>((existing?.autonomyLevel as 1 | 2 | 3) ?? 1);
  const [decidedBy, setDecidedBy] = useState(existing?.decidedBy ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        candidateId,
        roleSpecId,
        decision,
        autonomyLevel,
        decidedBy: decidedBy.trim() || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <h4 className="text-[13.5px] font-medium text-ink mb-3">Stage 5 — Hiring decision</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Decision</Label>
          <select value={decision} onChange={(e) => setDecision(e.target.value as "strong_hire" | "hire" | "no_hire")} className={SELECT_CLASS}>
            <option value="strong_hire">Strong Hire</option>
            <option value="hire">Hire</option>
            <option value="no_hire">No Hire</option>
          </select>
        </div>
        <div>
          <Label>Autonomy level (L1–L3)</Label>
          <select value={autonomyLevel} onChange={(e) => setAutonomyLevel(Number(e.target.value) as 1 | 2 | 3)} className={SELECT_CLASS}>
            <option value={1}>L1 — Human-approved</option>
            <option value={2}>L2 — Sandbox autonomous</option>
            <option value={3}>L3 — Policy-bounded</option>
          </select>
        </div>
        <div>
          <Label>Decided by</Label>
          <Input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} placeholder="Operator or user ID" />
        </div>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save decision record"}</Button>
      </form>
    </Card>
  );
}
