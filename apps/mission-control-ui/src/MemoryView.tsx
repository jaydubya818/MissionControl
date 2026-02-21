import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface MemoryViewProps {
  projectId: Id<"projects"> | null;
}

type MemoryTier = "session" | "project" | "global" | "agent";
type DocType = "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";

// ============================================================================
// MEMORY MODAL
// ============================================================================

interface MemoryModalProps {
  mode: "create" | "edit";
  initialValues?: {
    id?: string;
    agentId?: string;
    type?: DocType;
    content?: string;
  };
  agents: Array<{ _id: Id<"agents">; name: string; emoji?: string }>;
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

function MemoryModal({
  mode,
  initialValues,
  agents,
  projectId,
  onClose,
}: MemoryModalProps) {
  const [agentId, setAgentId] = useState(initialValues?.agentId ?? "");
  const [docType, setDocType] = useState<DocType>(
    initialValues?.type ?? "SESSION_MEMORY"
  );
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [saving, setSaving] = useState(false);

  const createDoc = useMutation(api.agentDocuments.create);
  const updateDoc = useMutation(api.agentDocuments.update);

  const handleSave = async () => {
    if (!content.trim()) return;
    if (mode === "create" && !agentId) return;
    setSaving(true);
    try {
      if (mode === "create") {
        await createDoc({
          agentId: agentId as Id<"agents">,
          projectId: projectId ?? undefined,
          type: docType,
          content: content.trim(),
        });
      } else if (initialValues?.id) {
        await updateDoc({
          documentId: initialValues.id as Id<"agentDocuments">,
          content: content.trim(),
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
      <div className="bg-card border border-border rounded-[10px] w-full max-w-[520px] max-h-[85vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground m-0">
            {mode === "create" ? "Add Memory" : "Edit Memory"}
          </h2>
          <button className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer px-1 leading-none" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-5 flex flex-col gap-1">
          {mode === "create" && (
            <>
              <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm w-full mb-1"
              >
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.emoji ?? ""} {a.name}
                  </option>
                ))}
              </select>

              <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm w-full mb-1"
              >
                <option value="SESSION_MEMORY">Session Memory</option>
                <option value="WORKING_MD">Working Doc</option>
                <option value="DAILY_NOTE">Daily Note</option>
              </select>
            </>
          )}

          <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="px-3 py-2.5 bg-background border border-border rounded-md text-foreground text-sm w-full resize-y font-[system-ui,-apple-system,sans-serif] leading-relaxed box-border"
            rows={8}
            placeholder="Enter memory content..."
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button className="px-4 py-2 bg-transparent border border-border rounded-md text-muted-foreground text-sm cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            className={cn(
              "px-5 py-2 bg-primary border-none rounded-md text-white text-sm font-semibold cursor-pointer",
              (saving || !content.trim() || (mode === "create" && !agentId)) && "opacity-50 cursor-not-allowed"
            )}
            onClick={handleSave}
            disabled={saving || !content.trim() || (mode === "create" && !agentId)}
          >
            {saving ? "Saving..." : mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PATTERN MODAL
// ============================================================================

interface PatternModalProps {
  mode: "create" | "edit";
  initialValues?: {
    id?: string;
    agentId?: string;
    pattern?: string;
    confidence?: number;
    evidence?: string[];
  };
  agents: Array<{ _id: Id<"agents">; name: string; emoji?: string }>;
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

function PatternModal({
  mode,
  initialValues,
  agents,
  projectId,
  onClose,
}: PatternModalProps) {
  const [agentId, setAgentId] = useState(initialValues?.agentId ?? "");
  const [pattern, setPattern] = useState(initialValues?.pattern ?? "");
  const [confidence, setConfidence] = useState(
    initialValues?.confidence ?? 0.5
  );
  const [evidenceText, setEvidenceText] = useState(
    (initialValues?.evidence ?? []).join("\n")
  );
  const [saving, setSaving] = useState(false);

  const createPattern = useMutation(api.agentLearning.createPattern);
  const updatePattern = useMutation(api.agentLearning.updatePattern);

  const handleSave = async () => {
    if (!pattern.trim()) return;
    if (mode === "create" && !agentId) return;
    setSaving(true);
    try {
      const evidence = evidenceText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (mode === "create") {
        await createPattern({
          agentId: agentId as Id<"agents">,
          projectId: projectId ?? undefined,
          pattern: pattern.trim(),
          confidence,
          evidence,
        });
      } else if (initialValues?.id) {
        await updatePattern({
          patternId: initialValues.id as Id<"agentPatterns">,
          pattern: pattern.trim(),
          confidence,
          evidence,
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onClose}>
      <div className="bg-card border border-border rounded-[10px] w-full max-w-[520px] max-h-[85vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground m-0">
            {mode === "create" ? "Add Pattern" : "Edit Pattern"}
          </h2>
          <button className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer px-1 leading-none" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-5 flex flex-col gap-1">
          {mode === "create" && (
            <>
              <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm w-full mb-1"
              >
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.emoji ?? ""} {a.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Pattern</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm w-full box-border mb-1"
            placeholder="e.g., strength:content-writing"
          />

          <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">
            Confidence: {(confidence * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="w-full mb-4"
          />

          <label className="text-xs font-semibold text-muted-foreground mt-2 mb-1">Evidence (one per line)</label>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            className="px-3 py-2.5 bg-background border border-border rounded-md text-foreground text-sm w-full resize-y font-[system-ui,-apple-system,sans-serif] leading-relaxed box-border"
            rows={4}
            placeholder="Task completed successfully&#10;High quality output"
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button className="px-4 py-2 bg-transparent border border-border rounded-md text-muted-foreground text-sm cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            className={cn(
              "px-5 py-2 bg-primary border-none rounded-md text-white text-sm font-semibold cursor-pointer",
              (saving || !pattern.trim() || (mode === "create" && !agentId)) && "opacity-50 cursor-not-allowed"
            )}
            onClick={handleSave}
            disabled={saving || !pattern.trim() || (mode === "create" && !agentId)}
          >
            {saving ? "Saving..." : mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DELETE CONFIRM DIALOG
// ============================================================================

function DeleteConfirm({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]" onClick={onCancel}>
      <div
        className="bg-card border border-border rounded-[10px] w-full max-w-[420px] max-h-[85vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-red-400 m-0">
            Confirm Delete
          </h2>
        </div>
        <div className="p-5 flex flex-col gap-1">
          <p className="text-muted-foreground m-0 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button className="px-4 py-2 bg-transparent border border-border rounded-md text-muted-foreground text-sm cursor-pointer" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="px-5 py-2 bg-red-500 border-none rounded-md text-white text-sm font-semibold cursor-pointer"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function MemoryView({ projectId }: MemoryViewProps) {
  const [activeTier, setActiveTier] = useState<MemoryTier>("session");
  const [memoryModal, setMemoryModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    values?: {
      id?: string;
      agentId?: string;
      type?: DocType;
      content?: string;
    };
  }>({ open: false, mode: "create" });
  const [patternModal, setPatternModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    values?: {
      id?: string;
      agentId?: string;
      pattern?: string;
      confidence?: number;
      evidence?: string[];
    };
  }>({ open: false, mode: "create" });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "memory" | "pattern";
    id: string;
    label: string;
  } | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const agentDocs = useQuery(api.agentDocuments.list, {
    projectId: projectId ?? undefined,
  });
  const agentPatterns = useQuery(api.agentLearning.listPatterns, {
    projectId: projectId ?? undefined,
  });
  const agents = useQuery(api.agents.list, {
    projectId: projectId ?? undefined,
  });

  const removeDoc = useMutation(api.agentDocuments.remove);
  const removePattern = useMutation(api.agentLearning.removePattern);

  const agentsList = agents ?? [];
  const agentMap = new Map(agentsList.map((a) => [a._id, a]));

  const getAgentLabel = (agentId: Id<"agents">) => {
    const a = agentMap.get(agentId);
    return a ? `${a.emoji ?? ""} ${a.name}`.trim() : String(agentId).slice(0, 8);
  };

  const sessionDocs = (agentDocs ?? []).filter(
    (d) => d.type === "SESSION_MEMORY"
  );
  const globalDocs = (agentDocs ?? []).filter(
    (d) => d.type === "WORKING_MD"
  );

  const filteredAgentDocs =
    agentFilter === "all"
      ? agentDocs ?? []
      : (agentDocs ?? []).filter((d) => d.agentId === agentFilter);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "memory") {
        await removeDoc({
          documentId: deleteConfirm.id as Id<"agentDocuments">,
        });
      } else {
        await removePattern({
          patternId: deleteConfirm.id as Id<"agentPatterns">,
        });
      }
    } catch (e) {
      console.error(e);
    }
    setDeleteConfirm(null);
  };

  const tiers: { key: MemoryTier; label: string; icon: string }[] = [
    { key: "session", label: "Session", icon: "clock" },
    { key: "project", label: "Patterns", icon: "brain" },
    { key: "agent", label: "Agent Memories", icon: "robot" },
    { key: "global", label: "Knowledge Base", icon: "globe" },
  ];

  return (
    <main className="flex-1 overflow-auto bg-background p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mt-0 mb-1">Memory</h1>
          <p className="text-base text-muted-foreground mt-0">Agent learning and document browser</p>
        </div>
        <div className="flex gap-2 pt-1">
          {(activeTier === "session" ||
            activeTier === "agent" ||
            activeTier === "global") && (
            <button
              className="px-4 py-2 bg-primary border-none rounded-md text-white text-sm font-semibold cursor-pointer transition-opacity"
              onClick={() =>
                setMemoryModal({ open: true, mode: "create" })
              }
            >
              + Add Memory
            </button>
          )}
          {activeTier === "project" && (
            <button
              className="px-4 py-2 bg-primary border-none rounded-md text-white text-sm font-semibold cursor-pointer transition-opacity"
              onClick={() =>
                setPatternModal({ open: true, mode: "create" })
              }
            >
              + Add Pattern
            </button>
          )}
        </div>
      </div>

      {/* Tier Navigation */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tiers.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTier(t.key)}
            className={cn(
              "px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all border",
              activeTier === t.key
                ? "bg-primary border-primary text-white"
                : "bg-card border-border text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ SESSION MEMORY ============ */}
      {activeTier === "session" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-foreground m-0">Session Documents</h2>
            <span className="px-2.5 py-0.5 bg-card border border-border rounded-xl text-xs font-semibold text-muted-foreground">{sessionDocs.length}</span>
          </div>
          {sessionDocs.length === 0 && (
            <EmptyState icon="clock" text="No session memories yet" />
          )}
          <div className="flex flex-col gap-3">
            {sessionDocs.map((doc) => (
              <MemoryCard
                key={doc._id}
                agent={getAgentLabel(doc.agentId)}
                type={doc.type}
                content={doc.content}
                updatedAt={doc.updatedAt}
                onEdit={() =>
                  setMemoryModal({
                    open: true,
                    mode: "edit",
                    values: {
                      id: doc._id,
                      agentId: doc.agentId,
                      type: doc.type as DocType,
                      content: doc.content,
                    },
                  })
                }
                onDelete={() =>
                  setDeleteConfirm({
                    open: true,
                    type: "memory",
                    id: doc._id,
                    label: `${doc.type} for ${getAgentLabel(doc.agentId)}`,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ PATTERNS (PROJECT) ============ */}
      {activeTier === "project" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-foreground m-0">Learned Patterns</h2>
            <span className="px-2.5 py-0.5 bg-card border border-border rounded-xl text-xs font-semibold text-muted-foreground">
              {(agentPatterns ?? []).length}
            </span>
          </div>
          {(agentPatterns ?? []).length === 0 && (
            <EmptyState icon="brain" text="No patterns discovered yet" />
          )}
          <div className="flex flex-col gap-3">
            {(agentPatterns ?? []).map((p) => (
              <div key={p._id} className="p-4 bg-card border border-border rounded-lg transition-colors">
                <div className="flex items-start gap-3">
                  <div>
                    <div className="text-base font-semibold text-foreground mb-1">{p.pattern}</div>
                    <div className="text-sm text-muted-foreground mb-1">
                      Agent: {getAgentLabel(p.agentId)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-auto">
                    <div
                      className={cn(
                        "px-2.5 py-[3px] rounded-xl text-xs font-semibold text-white",
                        p.confidence > 0.7
                          ? "bg-emerald-500"
                          : p.confidence > 0.4
                            ? "bg-amber-500"
                            : "bg-muted-foreground"
                      )}
                    >
                      {(p.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="px-2 py-1 bg-transparent border border-border rounded text-muted-foreground text-sm cursor-pointer transition-all"
                        title="Edit"
                        onClick={() =>
                          setPatternModal({
                            open: true,
                            mode: "edit",
                            values: {
                              id: p._id,
                              agentId: p.agentId,
                              pattern: p.pattern,
                              confidence: p.confidence,
                              evidence: p.evidence,
                            },
                          })
                        }
                      >
                        &#9998;
                      </button>
                      <button
                        className="px-2 py-1 bg-transparent border border-border rounded text-red-400 text-sm cursor-pointer transition-all"
                        title="Delete"
                        onClick={() =>
                          setDeleteConfirm({
                            open: true,
                            type: "pattern",
                            id: p._id,
                            label: p.pattern,
                          })
                        }
                      >
                        &#128465;
                      </button>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-2 mb-1">
                  Evidence: {p.evidence?.length ?? 0} instances
                </div>
                <div className="text-xs text-muted-foreground">
                  Discovered:{" "}
                  {new Date(p.discoveredAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ AGENT MEMORIES ============ */}
      {activeTier === "agent" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-foreground m-0">Agent Memories</h2>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-sm ml-auto cursor-pointer"
            >
              <option value="all">All Agents</option>
              {agentsList.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.emoji ?? ""} {a.name}
                </option>
              ))}
            </select>
          </div>
          {filteredAgentDocs.length === 0 && (
            <EmptyState icon="robot" text="No agent memories found" />
          )}
          <div className="flex flex-col gap-3">
            {filteredAgentDocs.map((doc) => (
              <MemoryCard
                key={doc._id}
                agent={getAgentLabel(doc.agentId)}
                type={doc.type}
                content={doc.content}
                updatedAt={doc.updatedAt}
                onEdit={() =>
                  setMemoryModal({
                    open: true,
                    mode: "edit",
                    values: {
                      id: doc._id,
                      agentId: doc.agentId,
                      type: doc.type as DocType,
                      content: doc.content,
                    },
                  })
                }
                onDelete={() =>
                  setDeleteConfirm({
                    open: true,
                    type: "memory",
                    id: doc._id,
                    label: `${doc.type} for ${getAgentLabel(doc.agentId)}`,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ GLOBAL / KNOWLEDGE BASE ============ */}
      {activeTier === "global" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-foreground m-0">Global Knowledge Base</h2>
            <span className="px-2.5 py-0.5 bg-card border border-border rounded-xl text-xs font-semibold text-muted-foreground">{globalDocs.length}</span>
          </div>
          {globalDocs.length === 0 && (
            <EmptyState
              icon="globe"
              text="Global memory aggregates knowledge across all projects. Add Working Docs to populate."
            />
          )}
          <div className="flex flex-col gap-3">
            {globalDocs.map((doc) => (
              <MemoryCard
                key={doc._id}
                agent={getAgentLabel(doc.agentId)}
                type={doc.type}
                content={doc.content}
                updatedAt={doc.updatedAt}
                onEdit={() =>
                  setMemoryModal({
                    open: true,
                    mode: "edit",
                    values: {
                      id: doc._id,
                      agentId: doc.agentId,
                      type: doc.type as DocType,
                      content: doc.content,
                    },
                  })
                }
                onDelete={() =>
                  setDeleteConfirm({
                    open: true,
                    type: "memory",
                    id: doc._id,
                    label: `${doc.type} for ${getAgentLabel(doc.agentId)}`,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ MODALS ============ */}
      {memoryModal.open && (
        <MemoryModal
          mode={memoryModal.mode}
          initialValues={memoryModal.values}
          agents={agentsList}
          projectId={projectId}
          onClose={() => setMemoryModal({ open: false, mode: "create" })}
        />
      )}

      {patternModal.open && (
        <PatternModal
          mode={patternModal.mode}
          initialValues={patternModal.values}
          agents={agentsList}
          projectId={projectId}
          onClose={() => setPatternModal({ open: false, mode: "create" })}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirm
          message={`Are you sure you want to delete "${deleteConfirm.label}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </main>
  );
}

// ============================================================================
// REUSABLE SUB-COMPONENTS
// ============================================================================

function MemoryCard({
  agent,
  type,
  content,
  updatedAt,
  onEdit,
  onDelete,
}: {
  agent: string;
  type: string;
  content: string;
  updatedAt: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeLabels: Record<string, { label: string; twBg: string }> = {
    SESSION_MEMORY: { label: "Session", twBg: "bg-blue-500" },
    WORKING_MD: { label: "Working Doc", twBg: "bg-blue-500" },
    DAILY_NOTE: { label: "Daily Note", twBg: "bg-amber-500" },
  };
  const tl = typeLabels[type] ?? { label: type, twBg: "bg-muted-foreground" };

  return (
    <div className="p-4 bg-card border border-border rounded-lg transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-foreground">{agent}</span>
            <span className={cn("px-2 py-0.5 rounded-lg text-[0.7rem] font-semibold text-white", tl.twBg)}>
              {tl.label}
            </span>
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed mb-2 whitespace-pre-wrap break-words">
            {content.length > 280 ? content.slice(0, 280) + "..." : content}
          </div>
          <div className="text-xs text-muted-foreground">
            Updated: {new Date(updatedAt).toLocaleString()}
          </div>
        </div>
        <div className="flex gap-1">
          <button className="px-2 py-1 bg-transparent border border-border rounded text-muted-foreground text-sm cursor-pointer transition-all" title="Edit" onClick={onEdit}>
            &#9998;
          </button>
          <button
            className="px-2 py-1 bg-transparent border border-border rounded text-red-400 text-sm cursor-pointer transition-all"
            title="Delete"
            onClick={onDelete}
          >
            &#128465;
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const emojiMap: Record<string, string> = {
    clock: "\u23F0",
    brain: "\uD83E\uDDE0",
    robot: "\uD83E\uDD16",
    globe: "\uD83C\uDF10",
  };
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-4">{emojiMap[icon] ?? "\uD83D\uDCE6"}</div>
      <div className="text-base text-muted-foreground max-w-xs leading-relaxed">{text}</div>
    </div>
  );
}
