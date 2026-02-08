import { CSSProperties, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface MemoryViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  bgInput: "#0f172a",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
  accentRed: "#ef4444",
};

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
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>
            {mode === "create" ? "Add Memory" : "Edit Memory"}
          </h2>
          <button style={modalStyles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div style={modalStyles.body}>
          {mode === "create" && (
            <>
              <label style={modalStyles.label}>Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                style={modalStyles.select}
              >
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.emoji ?? ""} {a.name}
                  </option>
                ))}
              </select>

              <label style={modalStyles.label}>Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                style={modalStyles.select}
              >
                <option value="SESSION_MEMORY">Session Memory</option>
                <option value="WORKING_MD">Working Doc</option>
                <option value="DAILY_NOTE">Daily Note</option>
              </select>
            </>
          )}

          <label style={modalStyles.label}>Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={modalStyles.textarea}
            rows={8}
            placeholder="Enter memory content..."
            autoFocus
          />
        </div>

        <div style={modalStyles.footer}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.saveBtn,
              opacity: saving || !content.trim() || (mode === "create" && !agentId) ? 0.5 : 1,
            }}
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
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>
            {mode === "create" ? "Add Pattern" : "Edit Pattern"}
          </h2>
          <button style={modalStyles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div style={modalStyles.body}>
          {mode === "create" && (
            <>
              <label style={modalStyles.label}>Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                style={modalStyles.select}
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

          <label style={modalStyles.label}>Pattern</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            style={modalStyles.input}
            placeholder="e.g., strength:content-writing"
          />

          <label style={modalStyles.label}>
            Confidence: {(confidence * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            style={{ width: "100%", marginBottom: 16 }}
          />

          <label style={modalStyles.label}>Evidence (one per line)</label>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            style={modalStyles.textarea}
            rows={4}
            placeholder="Task completed successfully&#10;High quality output"
          />
        </div>

        <div style={modalStyles.footer}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...modalStyles.saveBtn,
              opacity: saving || !pattern.trim() || (mode === "create" && !agentId) ? 0.5 : 1,
            }}
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
    <div style={modalStyles.overlay} onClick={onCancel}>
      <div
        style={{ ...modalStyles.modal, maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={modalStyles.header}>
          <h2 style={{ ...modalStyles.title, color: colors.accentRed }}>
            Confirm Delete
          </h2>
        </div>
        <div style={modalStyles.body}>
          <p style={{ color: colors.textSecondary, margin: 0, lineHeight: 1.5 }}>
            {message}
          </p>
        </div>
        <div style={modalStyles.footer}>
          <button style={modalStyles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={{ ...modalStyles.saveBtn, background: colors.accentRed }}
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

  // Queries
  const agentDocs = useQuery(api.agentDocuments.list, {
    projectId: projectId ?? undefined,
  });
  const agentPatterns = useQuery(api.agentLearning.listPatterns, {
    projectId: projectId ?? undefined,
  });
  const agents = useQuery(api.agents.list, {
    projectId: projectId ?? undefined,
  });

  // Mutations
  const removeDoc = useMutation(api.agentDocuments.remove);
  const removePattern = useMutation(api.agentLearning.removePattern);

  const agentsList = agents ?? [];
  const agentMap = new Map(agentsList.map((a) => [a._id, a]));

  const getAgentLabel = (agentId: Id<"agents">) => {
    const a = agentMap.get(agentId);
    return a ? `${a.emoji ?? ""} ${a.name}`.trim() : String(agentId).slice(0, 8);
  };

  // Filter docs by type
  const sessionDocs = (agentDocs ?? []).filter(
    (d) => d.type === "SESSION_MEMORY"
  );
  const globalDocs = (agentDocs ?? []).filter(
    (d) => d.type === "WORKING_MD"
  );

  // Agent memories: group all docs by agent
  const agentDocsByAgent = new Map<string, typeof agentDocs>();
  for (const doc of agentDocs ?? []) {
    const key = doc.agentId;
    if (!agentDocsByAgent.has(key)) agentDocsByAgent.set(key, []);
    agentDocsByAgent.get(key)!.push(doc);
  }

  const filteredAgentDocs =
    agentFilter === "all"
      ? agentDocs ?? []
      : (agentDocs ?? []).filter((d) => d.agentId === agentFilter);

  // Delete handlers
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
    <main style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Memory</h1>
          <p style={styles.subtitle}>Agent learning and document browser</p>
        </div>
        <div style={styles.headerActions}>
          {(activeTier === "session" ||
            activeTier === "agent" ||
            activeTier === "global") && (
            <button
              style={styles.addBtn}
              onClick={() =>
                setMemoryModal({ open: true, mode: "create" })
              }
            >
              + Add Memory
            </button>
          )}
          {activeTier === "project" && (
            <button
              style={styles.addBtn}
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
      <div style={styles.tierNav}>
        {tiers.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTier(t.key)}
            style={{
              ...styles.tierButton,
              ...(activeTier === t.key && styles.tierButtonActive),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ SESSION MEMORY ============ */}
      {activeTier === "session" && (
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.contentTitle}>Session Documents</h2>
            <span style={styles.countBadge}>{sessionDocs.length}</span>
          </div>
          {sessionDocs.length === 0 && (
            <EmptyState icon="clock" text="No session memories yet" />
          )}
          <div style={styles.docList}>
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
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.contentTitle}>Learned Patterns</h2>
            <span style={styles.countBadge}>
              {(agentPatterns ?? []).length}
            </span>
          </div>
          {(agentPatterns ?? []).length === 0 && (
            <EmptyState icon="brain" text="No patterns discovered yet" />
          )}
          <div style={styles.docList}>
            {(agentPatterns ?? []).map((p) => (
              <div key={p._id} style={styles.docCard}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.patternTitle}>{p.pattern}</div>
                    <div style={styles.cardMeta}>
                      Agent: {getAgentLabel(p.agentId)}
                    </div>
                  </div>
                  <div style={styles.cardRight}>
                    <div
                      style={{
                        ...styles.confidenceBadge,
                        background:
                          p.confidence > 0.7
                            ? colors.accentGreen
                            : p.confidence > 0.4
                              ? colors.accentOrange
                              : colors.textMuted,
                      }}
                    >
                      {(p.confidence * 100).toFixed(0)}%
                    </div>
                    <div style={styles.cardActions}>
                      <button
                        style={styles.iconBtn}
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
                        style={{ ...styles.iconBtn, color: colors.accentRed }}
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
                <div style={styles.evidenceRow}>
                  Evidence: {p.evidence?.length ?? 0} instances
                </div>
                <div style={styles.docTime}>
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
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.contentTitle}>Agent Memories</h2>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              style={styles.filterSelect}
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
          <div style={styles.docList}>
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
        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.contentTitle}>Global Knowledge Base</h2>
            <span style={styles.countBadge}>{globalDocs.length}</span>
          </div>
          {globalDocs.length === 0 && (
            <EmptyState
              icon="globe"
              text="Global memory aggregates knowledge across all projects. Add Working Docs to populate."
            />
          )}
          <div style={styles.docList}>
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
  const typeLabels: Record<string, { label: string; color: string }> = {
    SESSION_MEMORY: { label: "Session", color: colors.accentBlue },
    WORKING_MD: { label: "Working Doc", color: colors.accentPurple },
    DAILY_NOTE: { label: "Daily Note", color: colors.accentOrange },
  };
  const tl = typeLabels[type] ?? { label: type, color: colors.textMuted };

  return (
    <div style={styles.docCard}>
      <div style={styles.cardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.cardTopRow}>
            <span style={styles.agentName}>{agent}</span>
            <span
              style={{ ...styles.typeBadge, background: tl.color }}
            >
              {tl.label}
            </span>
          </div>
          <div style={styles.docContent}>
            {content.length > 280 ? content.slice(0, 280) + "..." : content}
          </div>
          <div style={styles.docTime}>
            Updated: {new Date(updatedAt).toLocaleString()}
          </div>
        </div>
        <div style={styles.cardActions}>
          <button style={styles.iconBtn} title="Edit" onClick={onEdit}>
            &#9998;
          </button>
          <button
            style={{ ...styles.iconBtn, color: colors.accentRed }}
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
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>{emojiMap[icon] ?? "\uD83D\uDCE6"}</div>
      <div style={styles.emptyText}>{text}</div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "24px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "1rem",
    color: colors.textSecondary,
    marginTop: 0,
  },
  headerActions: {
    display: "flex",
    gap: "8px",
    paddingTop: "4px",
  },
  addBtn: {
    padding: "8px 18px",
    background: colors.accentBlue,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  tierNav: {
    display: "flex",
    gap: "8px",
    marginBottom: "24px",
    flexWrap: "wrap" as const,
  },
  tierButton: {
    padding: "10px 20px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tierButtonActive: {
    background: colors.accentBlue,
    borderColor: colors.accentBlue,
    color: "#fff",
  },
  content: {
    marginTop: "8px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },
  contentTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
  },
  countBadge: {
    padding: "2px 10px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    fontSize: "0.8rem",
    fontWeight: 600,
    color: colors.textSecondary,
  },
  filterSelect: {
    padding: "6px 12px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.85rem",
    marginLeft: "auto",
    cursor: "pointer",
  },
  docList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  docCard: {
    padding: "16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    transition: "border-color 0.15s",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  cardTopRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
  },
  agentName: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  typeBadge: {
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#fff",
  },
  docContent: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: "8px",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  docTime: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  cardRight: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    gap: "8px",
  },
  cardActions: {
    display: "flex",
    gap: "4px",
  },
  iconBtn: {
    padding: "4px 8px",
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    color: colors.textSecondary,
    fontSize: "0.85rem",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  cardMeta: {
    fontSize: "0.8rem",
    color: colors.textMuted,
    marginBottom: "4px",
  },
  patternTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  confidenceBadge: {
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#fff",
  },
  evidenceRow: {
    fontSize: "0.85rem",
    color: colors.textSecondary,
    marginTop: "8px",
    marginBottom: "4px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    textAlign: "center" as const,
  },
  emptyIcon: {
    fontSize: "3.5rem",
    marginBottom: "16px",
  },
  emptyText: {
    fontSize: "1rem",
    color: colors.textSecondary,
    maxWidth: 320,
    lineHeight: 1.5,
  },
};

const modalStyles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    width: "100%",
    maxWidth: 520,
    maxHeight: "85vh",
    overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: "1.15rem",
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: colors.textMuted,
    fontSize: "1.5rem",
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: 1,
  },
  body: {
    padding: "20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  label: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: colors.textSecondary,
    marginTop: "8px",
    marginBottom: "4px",
  },
  select: {
    padding: "8px 12px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    width: "100%",
    marginBottom: "4px",
  },
  input: {
    padding: "8px 12px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    width: "100%",
    boxSizing: "border-box" as const,
    marginBottom: "4px",
  },
  textarea: {
    padding: "10px 12px",
    background: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    width: "100%",
    resize: "vertical" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    padding: "16px 20px",
    borderTop: `1px solid ${colors.border}`,
  },
  cancelBtn: {
    padding: "8px 16px",
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.875rem",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 20px",
    background: colors.accentBlue,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
