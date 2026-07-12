import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Bot, Brain, Clock, Globe, Package, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { KnowledgeGraphPanel } from "./KnowledgeGraphPanel";

interface MemoryViewProps {
  projectId: Id<"projects"> | null;
}

type MemoryTier = "session" | "project" | "global" | "agent" | "journal" | "graph";
type DocType = "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Detect lines like "9:00 AM - Label" or "9:00 AM - Qwen 3.5 Medium S" for schedule display */
function parseScheduleLines(content: string): Array<{ time: string; label: string }> {
  const lines = content.split(/\n/);
  const result: Array<{ time: string; label: string }> = [];
  const re = /^(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(.+)$/i;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (m) result.push({ time: m[1], label: m[2].trim() });
  }
  return result;
}

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
      <div className="bg-surface-3 border border-line rounded-xl w-full max-w-[520px] max-h-[85vh] overflow-auto shadow-[var(--shadow-elevation-2)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink m-0">
            {mode === "create" ? "Add Memory" : "Edit Memory"}
          </h2>
          <button aria-label="Close" className="bg-transparent border-none text-ink-muted hover:text-ink transition-colors duration-150 text-2xl cursor-pointer px-1 leading-none" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-5 flex flex-col gap-1">
          {mode === "create" && (
            <>
              <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] w-full mb-1"
              >
                <option value="">Select agent...</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.emoji ?? ""} {a.name}
                  </option>
                ))}
              </select>

              <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] w-full mb-1"
              >
                <option value="SESSION_MEMORY">Session Memory</option>
                <option value="WORKING_MD">Working Doc</option>
                <option value="DAILY_NOTE">Daily Note</option>
              </select>
            </>
          )}

          <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="px-3 py-2.5 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] placeholder:text-ink-muted w-full resize-y leading-relaxed box-border"
            rows={8}
            placeholder="Enter memory content..."
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button className="h-9 px-3 bg-transparent border border-line rounded-lg text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150 text-[13px] cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            className={cn(
              "h-9 px-3 bg-act border-none rounded-lg text-act-ink text-[13px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-90",
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
      <div className="bg-surface-3 border border-line rounded-xl w-full max-w-[520px] max-h-[85vh] overflow-auto shadow-[var(--shadow-elevation-2)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink m-0">
            {mode === "create" ? "Add Pattern" : "Edit Pattern"}
          </h2>
          <button aria-label="Close" className="bg-transparent border-none text-ink-muted hover:text-ink transition-colors duration-150 text-2xl cursor-pointer px-1 leading-none" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="p-5 flex flex-col gap-1">
          {mode === "create" && (
            <>
              <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] w-full mb-1"
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

          <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Pattern</label>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] placeholder:text-ink-muted w-full box-border mb-1"
            placeholder="e.g., strength:content-writing"
          />

          <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">
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

          <label className="text-[11.5px] font-medium text-ink-muted mt-2 mb-1">Evidence (one per line)</label>
          <textarea
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            className="px-3 py-2.5 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] placeholder:text-ink-muted w-full resize-y leading-relaxed box-border"
            rows={4}
            placeholder="Task completed successfully&#10;High quality output"
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button className="h-9 px-3 bg-transparent border border-line rounded-lg text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150 text-[13px] cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            className={cn(
              "h-9 px-3 bg-act border-none rounded-lg text-act-ink text-[13px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-90",
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
        className="bg-surface-3 border border-line rounded-xl w-full max-w-[420px] max-h-[85vh] overflow-auto shadow-[var(--shadow-elevation-2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-err m-0">
            Confirm Delete
          </h2>
        </div>
        <div className="p-5 flex flex-col gap-1">
          <p className="text-[13.5px] text-ink-secondary m-0 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <button className="h-9 px-3 bg-transparent border border-line rounded-lg text-ink-secondary hover:text-ink hover:border-line-strong transition-colors duration-150 text-[13px] cursor-pointer" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="h-9 px-3 bg-err-soft border border-transparent rounded-lg text-err text-[13px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-90"
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
// DAILY JOURNAL LAYOUT
// ============================================================================

type JournalDoc = {
  _id: Id<"agentDocuments">;
  agentId: Id<"agents">;
  type: string;
  content: string;
  updatedAt: number;
};

function formatRelativeDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const docDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (docDay.getTime() === today.getTime()) return "Today";
  if (docDay.getTime() === yesterday.getTime()) return "Yesterday";
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (docDay > weekAgo) return "This Week";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupByDate(docs: JournalDoc[]): Map<string, JournalDoc[]> {
  const map = new Map<string, JournalDoc[]>();
  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const doc of sorted) {
    const key = formatRelativeDate(doc.updatedAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(doc);
  }
  return map;
}

interface DailyJournalLayoutProps {
  dailyNoteDocs: JournalDoc[];
  globalDocs: JournalDoc[];
  journalSearch: string;
  setJournalSearch: (v: string) => void;
  selectedJournalDocId: Id<"agentDocuments"> | null;
  setSelectedJournalDocId: (id: Id<"agentDocuments"> | null) => void;
  getAgentLabel: (agentId: Id<"agents">) => string;
}

function DailyJournalLayout({
  dailyNoteDocs,
  globalDocs,
  journalSearch,
  setJournalSearch,
  selectedJournalDocId,
  setSelectedJournalDocId,
  getAgentLabel,
}: DailyJournalLayoutProps) {
  const filteredNotes = journalSearch.trim()
    ? dailyNoteDocs.filter(
        (d) =>
          d.content.toLowerCase().includes(journalSearch.toLowerCase())
      )
    : dailyNoteDocs;
  const grouped = groupByDate(filteredNotes);
  const ltmDoc = globalDocs[0];
  const selectedDoc = selectedJournalDocId
    ? dailyNoteDocs.find((d) => d._id === selectedJournalDocId)
    : null;
  const scheduleLines = selectedDoc ? parseScheduleLines(selectedDoc.content) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 mt-2">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        <input
          type="search"
          placeholder="Search journal..."
          aria-label="Search journal"
          value={journalSearch}
          onChange={(e) => setJournalSearch(e.target.value)}
          className="h-9 w-full px-3 bg-surface-1 border border-line rounded-lg text-[13.5px] text-ink placeholder:text-ink-muted"
        />
        {ltmDoc && (
          <div className="p-4 rounded-xl border border-line bg-surface-1">
            <h4 className="text-[13.5px] font-semibold text-ink mb-1">Long-Term Memory</h4>
            <p className="text-[12.5px] text-ink-muted">
              {wordCount(ltmDoc.content).toLocaleString()} words · Updated{" "}
              {(() => {
                const sec = (Date.now() - ltmDoc.updatedAt) / 1000;
                if (sec < 60) return "just now";
                if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
                if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
                return `${Math.floor(sec / 86400)}d ago`;
              })()}
            </p>
          </div>
        )}
        <div>
          <h4 className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">Daily Journal</h4>
          {filteredNotes.length === 0 ? (
            <p className="text-[13.5px] text-ink-muted">No daily notes yet.</p>
          ) : (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([dateLabel, docs]) => (
                <div key={dateLabel}>
                  <p className="text-[12.5px] font-medium text-ink-muted mb-2">
                    {dateLabel} · {docs.length} {docs.length === 1 ? "entry" : "entries"}
                  </p>
                  <ul className="space-y-1">
                    {docs.map((d) => (
                      <li key={d._id}>
                        <button
                          type="button"
                          onClick={() => setSelectedJournalDocId(d._id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-[13.5px] border transition-colors duration-150",
                            selectedJournalDocId === d._id
                              ? "bg-surface-2 border-line-strong text-ink"
                              : "border-transparent hover:bg-surface-2 text-ink"
                          )}
                        >
                          <span className="block font-medium truncate">
                            {new Date(d.updatedAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="text-[12.5px] text-ink-muted">
                            {wordCount(d.content)} words
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Right column: detail panel */}
      <div className="min-w-0">
        {selectedDoc ? (
          <div className="p-4 rounded-xl border border-line bg-surface-1 h-full">
            <h3 className="text-[15px] font-semibold text-ink mb-1">
              {new Date(selectedDoc.updatedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              – {new Date(selectedDoc.updatedAt).toLocaleDateString(undefined, { weekday: "long" })}
            </h3>
            <p className="text-[12.5px] text-ink-muted mb-4">
              {wordCount(selectedDoc.content)} words · {getAgentLabel(selectedDoc.agentId)}
            </p>
            {scheduleLines.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-surface-2 border border-line">
                <h5 className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">Schedule</h5>
                <ul className="space-y-1">
                  {scheduleLines.map((line, i) => (
                    <li key={i} className="text-[13.5px] flex gap-2">
                      <span className="text-ink font-medium tabular-nums shrink-0">{line.time}</span>
                      <span className="text-ink">{line.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="prose prose-sm dark:prose-invert max-w-none text-ink whitespace-pre-wrap font-sans">
              {selectedDoc.content}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-line bg-surface-2">
            <p className="text-[13.5px] text-ink-muted">Select an entry to view</p>
          </div>
        )}
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
  const [journalSearch, setJournalSearch] = useState("");
  const [selectedJournalDocId, setSelectedJournalDocId] = useState<Id<"agentDocuments"> | null>(null);

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
  const dailyNoteDocs = (agentDocs ?? []).filter(
    (d) => d.type === "DAILY_NOTE"
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
    { key: "journal", label: "Daily Journal", icon: "calendar" },
    { key: "project", label: "Patterns", icon: "brain" },
    { key: "graph", label: "Graph", icon: "network" },
    { key: "agent", label: "Agent Memories", icon: "robot" },
    { key: "global", label: "Knowledge Base", icon: "globe" },
  ];

  return (
    <main className="flex-1 overflow-auto bg-app p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink mt-0 mb-1">Memory</h1>
          <p className="text-[14px] text-ink-secondary mt-0">Agent learning and document browser</p>
        </div>
        <div className="flex gap-2 pt-1">
          {(activeTier === "session" ||
            activeTier === "agent" ||
            activeTier === "global") && (
            <button
              className="h-9 px-3 bg-act border-none rounded-lg text-act-ink text-[13px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-90"
              onClick={() =>
                setMemoryModal({ open: true, mode: "create" })
              }
            >
              Add Memory
            </button>
          )}
          {activeTier === "project" && (
            <button
              className="h-9 px-3 bg-act border-none rounded-lg text-act-ink text-[13px] font-medium cursor-pointer transition-opacity duration-150 hover:opacity-90"
              onClick={() =>
                setPatternModal({ open: true, mode: "create" })
              }
            >
              Add Pattern
            </button>
          )}
        </div>
      </div>

      {/* Tier Navigation */}
      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-line p-0.5">
        {tiers.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTier(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px] font-medium cursor-pointer transition-colors duration-150",
              activeTier === t.key
                ? "bg-surface-2 text-ink"
                : "text-ink-muted hover:text-ink-secondary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ DAILY JOURNAL ============ */}
      {activeTier === "journal" && (
        <DailyJournalLayout
          dailyNoteDocs={dailyNoteDocs}
          globalDocs={globalDocs}
          journalSearch={journalSearch}
          setJournalSearch={setJournalSearch}
          selectedJournalDocId={selectedJournalDocId}
          setSelectedJournalDocId={setSelectedJournalDocId}
          getAgentLabel={getAgentLabel}
        />
      )}

      {/* ============ SESSION MEMORY ============ */}
      {activeTier === "session" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink m-0">Session Documents</h2>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-secondary">{sessionDocs.length}</span>
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
            <h2 className="text-[19px] font-semibold tracking-tight text-ink m-0">Learned Patterns</h2>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-secondary">
              {(agentPatterns ?? []).length}
            </span>
          </div>
          {(agentPatterns ?? []).length === 0 && (
            <EmptyState icon="brain" text="No patterns discovered yet" />
          )}
          <div className="flex flex-col gap-3">
            {(agentPatterns ?? []).map((p) => (
              <div key={p._id} className="p-4 bg-surface-1 border border-line rounded-xl transition-colors duration-150 hover:border-line-strong">
                <div className="flex items-start gap-3">
                  <div>
                    <div className="text-[15px] font-semibold text-ink mb-1">{p.pattern}</div>
                    <div className="text-[13.5px] text-ink-secondary mb-1">
                      Agent: {getAgentLabel(p.agentId)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-auto">
                    <div
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-medium leading-none",
                        p.confidence > 0.7
                          ? "bg-ok-soft text-ok"
                          : p.confidence > 0.4
                            ? "bg-warn-soft text-warn"
                            : "bg-surface-2 text-ink-secondary border border-line"
                      )}
                    >
                      {(p.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="px-2 py-1 bg-transparent border border-line rounded-md text-ink-muted hover:text-ink hover:border-line-strong cursor-pointer transition-colors duration-150"
                        title="Edit"
                        aria-label="Edit pattern"
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
                        <Pencil size={14} strokeWidth={1.7} aria-hidden />
                      </button>
                      <button
                        className="px-2 py-1 bg-transparent border border-line rounded-md text-ink-muted hover:text-err hover:border-line-strong cursor-pointer transition-colors duration-150"
                        title="Delete"
                        aria-label="Delete pattern"
                        onClick={() =>
                          setDeleteConfirm({
                            open: true,
                            type: "pattern",
                            id: p._id,
                            label: p.pattern,
                          })
                        }
                      >
                        <Trash2 size={14} strokeWidth={1.7} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="text-[13.5px] text-ink-secondary mt-2 mb-1">
                  Evidence: {p.evidence?.length ?? 0} instances
                </div>
                <div className="text-[12.5px] text-ink-muted">
                  Discovered:{" "}
                  {new Date(p.discoveredAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ KNOWLEDGE GRAPH ============ */}
      {activeTier === "graph" && (
        <KnowledgeGraphPanel projectId={projectId} />
      )}

      {/* ============ AGENT MEMORIES ============ */}
      {activeTier === "agent" && (
        <div className="mt-2">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink m-0">Agent Memories</h2>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filter by agent"
              className="h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] ml-auto cursor-pointer"
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
            <h2 className="text-[19px] font-semibold tracking-tight text-ink m-0">Global Knowledge Base</h2>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-secondary">{globalDocs.length}</span>
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
    SESSION_MEMORY: { label: "Session", twBg: "bg-info-soft text-info-accent" },
    WORKING_MD: { label: "Working Doc", twBg: "bg-info-soft text-info-accent" },
    DAILY_NOTE: { label: "Daily Note", twBg: "bg-warn-soft text-warn" },
  };
  const tl = typeLabels[type] ?? { label: type, twBg: "bg-surface-2 text-ink-secondary border border-line" };

  return (
    <div className="p-4 bg-surface-1 border border-line rounded-xl transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[13.5px] font-semibold text-ink">{agent}</span>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-none", tl.twBg)}>
              {tl.label}
            </span>
          </div>
          <div className="text-[13.5px] text-ink-secondary leading-relaxed mb-2 whitespace-pre-wrap break-words">
            {content.length > 280 ? content.slice(0, 280) + "..." : content}
          </div>
          <div className="text-[12.5px] text-ink-muted">
            Updated: {new Date(updatedAt).toLocaleString()}
          </div>
        </div>
        <div className="flex gap-1">
          <button className="px-2 py-1 bg-transparent border border-line rounded-md text-ink-muted hover:text-ink hover:border-line-strong cursor-pointer transition-colors duration-150" title="Edit" aria-label="Edit memory" onClick={onEdit}>
            <Pencil size={14} strokeWidth={1.7} aria-hidden />
          </button>
          <button
            className="px-2 py-1 bg-transparent border border-line rounded-md text-ink-muted hover:text-err hover:border-line-strong cursor-pointer transition-colors duration-150"
            title="Delete"
            aria-label="Delete memory"
            onClick={onDelete}
          >
            <Trash2 size={14} strokeWidth={1.7} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const iconMap: Record<string, LucideIcon> = {
    clock: Clock,
    brain: Brain,
    robot: Bot,
    globe: Globe,
  };
  const Icon = iconMap[icon] ?? Package;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface-1 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-muted">
        <Icon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </div>
      <div className="text-[13.5px] text-ink-secondary max-w-xs leading-relaxed">{text}</div>
    </div>
  );
}
