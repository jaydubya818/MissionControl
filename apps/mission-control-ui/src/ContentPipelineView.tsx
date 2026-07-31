import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import {
  Filter, LayoutGrid, Package, FileText, CheckCircle2, XCircle,
  Eye, X, Plus, Sparkles, BarChart3, Tag, Clock, User,
  TrendingUp, Loader2, Send, Mail, MessageSquare, Clapperboard,
  Code, PenTool, File,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge as FactoryStatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { cn } from "@/lib/utils";

interface ContentPipelineViewProps {
  projectId: Id<"projects"> | null;
}

type TabMode = "drops" | "pipeline" | "metrics";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const PIPELINE_COLUMNS = [
  { id: "idea",      label: "Ideas"     },
  { id: "drafting",  label: "Drafting"  },
  { id: "review",    label: "Review"    },
  { id: "published", label: "Published" },
];

const STATUS_CONFIG: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error" | "info"; color: string; bar: string }> = {
  DRAFT:     { label: "Draft",     tone: "neutral", color: "text-ink-muted",   bar: "bg-line-strong"  },
  SUBMITTED: { label: "Submitted", tone: "info",    color: "text-info-accent", bar: "bg-info-accent"  },
  APPROVED:  { label: "Approved",  tone: "success", color: "text-ok",          bar: "bg-ok"           },
  REJECTED:  { label: "Rejected",  tone: "error",   color: "text-err",         bar: "bg-err"          },
  PUBLISHED: { label: "Published", tone: "success", color: "text-ok",          bar: "bg-ok"           },
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  BLOG_POST:    FileText,
  SOCIAL_POST:  MessageSquare,
  EMAIL_DRAFT:  Mail,
  SCRIPT:       Clapperboard,
  REPORT:       BarChart3,
  CODE_SNIPPET: Code,
  DESIGN:       PenTool,
  OTHER:        File,
};

const CONTENT_TYPES = ["BLOG_POST", "SOCIAL_POST", "EMAIL_DRAFT", "SCRIPT", "REPORT", "CODE_SNIPPET", "DESIGN", "OTHER"];
const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PUBLISHED"];

function TypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const Icon = TYPE_ICONS[type] ?? File;
  return <Icon size={size} strokeWidth={1.6} className="shrink-0 text-ink-muted" aria-hidden />;
}

// ---------------------------------------------------------------------------
// STATUS BADGE
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return <FactoryStatusBadge tone={cfg.tone}>{cfg.label}</FactoryStatusBadge>;
}

// ---------------------------------------------------------------------------
// STAT CARD
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-4">
      <MetricBlock label={label} value={value} detail={sub} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CONTENT DROP CARD
// ---------------------------------------------------------------------------

function ContentDropCard({
  drop, agents, onSelect,
}: {
  drop: Doc<"contentDrops">;
  agents: Doc<"agents">[];
  onSelect: (id: Id<"contentDrops">) => void;
}) {
  const agent = drop.agentId ? agents.find((a) => a._id === drop.agentId) : null;

  return (
    <Card
      className="group flex cursor-pointer flex-col gap-3 p-4"
      onClick={() => onSelect(drop._id)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="mt-0.5"><TypeIcon type={drop.contentType} /></span>
          <p className="line-clamp-2 flex-1 text-[13.5px] font-medium leading-relaxed text-ink">{drop.title}</p>
        </div>
        <StatusBadge status={drop.status} />
      </div>

      {/* Summary */}
      {drop.summary && (
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">{drop.summary}</p>
      )}

      {/* Tags */}
      {drop.tags && drop.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {drop.tags.map((tag) => (
            <FactoryStatusBadge key={tag} tone="neutral">
              {tag}
            </FactoryStatusBadge>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-line pt-2 text-[11.5px] text-ink-muted">
        <div className="flex items-center gap-2">
          <span>{drop.contentType.replace(/_/g, " ")}</span>
          {agent && (
            <>
              <span>·</span>
              <span>{agent.emoji ? `${agent.emoji} ` : ""}{agent.name}</span>
            </>
          )}
        </div>
        <span>{new Date(drop._creationTime).toLocaleDateString()}</span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DETAIL MODAL
// ---------------------------------------------------------------------------

function ContentDropDetail({
  dropId, agents, onClose,
}: {
  dropId: Id<"contentDrops">;
  agents: Doc<"agents">[];
  onClose: () => void;
}) {
  const drop = useQuery(api.contentDrops.get, { id: dropId });
  const updateStatus = useMutation(api.contentDrops.updateStatus);
  const [loading, setLoading] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  if (!drop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-2xl rounded-xl border border-line bg-surface-3 p-6 shadow-[var(--shadow-elevation-2)]">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const agent = drop.agentId ? agents.find((a) => a._id === drop.agentId) : null;

  const handleAction = async (status: "APPROVED" | "REJECTED" | "PUBLISHED") => {
    setLoading(status);
    try {
      await updateStatus({ id: dropId, status, reviewedBy: "operator", reviewNote: reviewNote || undefined });
    } finally {
      setLoading(null);
    }
  };

  const canReview = drop.status === "SUBMITTED" || drop.status === "DRAFT";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4 rounded-xl border border-line bg-surface-3 p-6 shadow-[var(--shadow-elevation-2)]">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <TypeIcon type={drop.contentType} />
                <h2 className="text-[15px] font-semibold leading-snug text-ink">{drop.title}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
                <span>{drop.contentType.replace(/_/g, " ")}</span>
                {agent && <><span>·</span><span>{agent.emoji ? `${agent.emoji} ` : ""}{agent.name}</span></>}
                <span>·</span>
                <StatusBadge status={drop.status} />
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 transition-colors duration-150 hover:bg-surface-2">
              <X size={15} strokeWidth={1.7} className="text-ink-muted" />
            </button>
          </div>

          {/* Summary */}
          {drop.summary && (
            <p className="border-l-2 border-line pl-3 text-[12.5px] text-ink-secondary">{drop.summary}</p>
          )}

          {/* Content */}
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-line bg-surface-2 p-4">
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink-secondary">{drop.content}</pre>
          </div>

          {/* Tags */}
          {drop.tags && drop.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {drop.tags.map((tag) => (
                <FactoryStatusBadge key={tag} tone="neutral">
                  {tag}
                </FactoryStatusBadge>
              ))}
            </div>
          )}

          {/* Review note display */}
          {drop.reviewNote && (
            <div className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              <span className="font-medium">Review note:</span> {drop.reviewNote}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-[11.5px] text-ink-muted">
            <div className="flex items-center gap-1.5">
              <Clock size={12} strokeWidth={1.7} aria-hidden />
              Created {new Date(drop._creationTime).toLocaleString()}
            </div>
            {drop.reviewedAt && (
              <div className="flex items-center gap-1.5">
                <User size={12} strokeWidth={1.7} aria-hidden />
                Reviewed by {drop.reviewedBy} · {new Date(drop.reviewedAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Review actions */}
          {canReview && (
            <div className="space-y-3 border-t border-line pt-4">
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Optional review note…"
                className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAction("APPROVED")}
                  disabled={loading !== null}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
                >
                  {loading === "APPROVED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => handleAction("REJECTED")}
                  disabled={loading !== null}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-err-soft px-3 text-[13px] font-medium text-err transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
                >
                  {loading === "REJECTED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Reject
                </button>
                <button
                  onClick={() => handleAction("PUBLISHED")}
                  disabled={loading !== null}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
                >
                  {loading === "PUBLISHED" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Publish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE FORM
// ---------------------------------------------------------------------------

function CreateDropForm({
  projectId, agents, onClose,
}: {
  projectId: Id<"projects"> | null;
  agents: Doc<"agents">[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("BLOG_POST");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = useMutation(api.contentDrops.submit);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || loading) return;
    setLoading(true);
    try {
      await submit({
        projectId: projectId ?? undefined,
        agentId: agentId ? agentId as Id<"agents"> : undefined,
        title: title.trim(),
        contentType: contentType as any,
        content: content.trim(),
        summary: summary.trim() || undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4 rounded-xl border border-line bg-surface-3 p-6 shadow-[var(--shadow-elevation-2)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">New Content Drop</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 transition-colors duration-150 hover:bg-surface-2"><X size={15} strokeWidth={1.7} className="text-ink-muted" /></button>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
          />
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summary (optional)"
            className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
          />
          <div className="flex gap-3">
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink"
            >
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink"
            >
              <option value="">No agent</option>
              {agents.map((a) => <option key={a._id} value={a._id}>{a.emoji ? `${a.emoji} ` : ""}{a.name}</option>)}
            </select>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Content body…"
            rows={6}
            className="w-full resize-none rounded-lg border border-line bg-surface-1 px-3 py-2.5 font-mono text-[12px] text-ink placeholder:text-ink-muted"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !content.trim() || loading}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Submit Drop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// METRICS TAB
// ---------------------------------------------------------------------------

function MetricsTab({ projectId }: { projectId: Id<"projects"> | null }) {
  const stats = useQuery(api.contentDrops.getStats, projectId ? { projectId } : {});
  const drops = useQuery(api.contentDrops.list, projectId ? { projectId } : {});

  if (!stats || !drops) return <div className="flex items-center justify-center py-12 text-[12.5px] text-ink-muted">Loading metrics…</div>;

  const approvalRate = stats.byStatus.SUBMITTED
    ? Math.round(((stats.byStatus.APPROVED ?? 0) / ((stats.byStatus.APPROVED ?? 0) + (stats.byStatus.REJECTED ?? 0) || 1)) * 100)
    : 0;

  const typeEntries = Object.entries(stats.byType ?? {}).sort((a, b) => b[1] - a[1]);
  const statusEntries = STATUSES.map((s) => [s, stats.byStatus[s] ?? 0] as [string, number]);
  const maxCount = Math.max(...typeEntries.map((e) => e[1]), 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Drops"    value={stats.total}    sub="All time" />
        <StatCard label="Published"      value={stats.byStatus.PUBLISHED ?? 0} sub="Live content" />
        <StatCard label="Approval Rate"  value={`${approvalRate}%`} sub="Approved / reviewed" />
        <StatCard label="Pending Review" value={stats.byStatus.SUBMITTED ?? 0} sub="Awaiting decision" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status breakdown */}
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <BarChart3 size={15} strokeWidth={1.7} className="text-ink-muted" aria-hidden /> Status Breakdown
          </h3>
          <div className="space-y-2.5">
            {statusEntries.map(([status, count]) => {
              const cfg = STATUS_CONFIG[status];
              const pct = Math.round((count / (stats.total || 1)) * 100);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className={cn("w-20 shrink-0 text-[11.5px] font-medium", cfg?.color ?? "text-ink-muted")}>
                    {cfg?.label ?? status}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full transition-all duration-150", cfg?.bar ?? "bg-line-strong")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-[11.5px] text-ink">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Content type breakdown */}
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Tag size={15} strokeWidth={1.7} className="text-ink-muted" aria-hidden /> Content Types
          </h3>
          <div className="space-y-2.5">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <TypeIcon type={type} size={14} />
                <span className="flex-1 truncate text-[11.5px] text-ink-secondary">{type.replace(/_/g, " ")}</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-ok transition-all duration-150"
                    style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="w-4 text-right font-mono text-[11.5px] text-ink">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent published */}
      <Card className="p-5">
        <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink">
          <TrendingUp size={15} strokeWidth={1.7} className="text-ink-muted" aria-hidden /> Recent Published
        </h3>
        <div className="space-y-2">
          {drops.filter((d) => d.status === "PUBLISHED").slice(0, 5).map((d) => (
            <div key={d._id} className="flex items-center gap-3 border-b border-line py-2 text-[13.5px] last:border-0">
              <TypeIcon type={d.contentType} size={14} />
              <p className="flex-1 truncate text-ink">{d.title}</p>
              <span className="shrink-0 text-[11.5px] text-ink-muted">{new Date(d._creationTime).toLocaleDateString()}</span>
            </div>
          ))}
          {drops.filter((d) => d.status === "PUBLISHED").length === 0 && (
            <p className="py-4 text-center text-[12.5px] text-ink-muted">No published content yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN VIEW
// ---------------------------------------------------------------------------

export function ContentPipelineView({ projectId }: ContentPipelineViewProps) {
  const [tab, setTab] = useState<TabMode>("drops");
  const [selectedDrop, setSelectedDrop] = useState<Id<"contentDrops"> | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [seeding, setSeeding] = useState(false);

  const captures    = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const contentDrops = useQuery(api.contentDrops.list, projectId ? { projectId } : {});
  const agents      = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const stats       = useQuery(api.contentDrops.getStats, projectId ? { projectId } : {});

  const seedDrops = useMutation(api.contentDrops.seedContentDrops);

  const isLoading = !captures || !contentDrops || !agents;

  if (isLoading) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto grid max-w-[1200px] grid-cols-4 gap-4 px-6 py-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface-1 p-5">
              <div className="mb-4 h-3 w-24 animate-pulse rounded bg-surface-2" />
              <div className="mb-6 h-7 w-16 animate-pulse rounded bg-surface-2" />
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-2 animate-pulse rounded bg-surface-2" style={{ width: `${90 - j * 10}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const handleSeed = async () => {
    setSeeding(true);
    try { await seedDrops({ projectId: projectId ?? undefined }); }
    finally { setSeeding(false); }
  };

  const filteredDrops = contentDrops.filter((d) => {
    if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && d.contentType !== typeFilter) return false;
    return true;
  });

  const columnItems: Record<string, typeof captures> = {
    idea:      captures.filter((t) => t.status === "INBOX"),
    drafting:  captures.filter((t) => ["READY", "ASSIGNED", "IN_PROGRESS"].includes(t.status)),
    review:    captures.filter((t) => ["REVIEW", "NEEDS_APPROVAL"].includes(t.status)),
    published: captures.filter((t) => t.status === "DONE"),
  };

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Content Pipeline"
        description={
          stats
            ? `${stats.total} drops · ${stats.byStatus.PUBLISHED ?? 0} published · ${stats.byStatus.SUBMITTED ?? 0} pending review`
            : "Track content from idea to publication. Ideas → Drafting → Review → Published."
        }
        eyebrow="Content"
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {contentDrops.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Seed Sample Data
            </button>
          )}

          {/* Create button */}
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
          >
            <Plus className="h-3 w-3" /> New Drop
          </button>

          {/* Tab switcher */}
          <div className="flex rounded-lg border border-line p-0.5" role="tablist">
            {([
              { id: "drops",   label: "Drops",   icon: Package },
              { id: "pipeline",label: "Pipeline", icon: LayoutGrid },
              { id: "metrics", label: "Metrics",  icon: BarChart3 },
            ] as { id: TabMode; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition-colors duration-150",
                  tab === id ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
                {id === "drops" && contentDrops.length > 0 && (
                  <span className="font-mono text-[11.5px] text-ink-muted">{contentDrops.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      }
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-6 px-6 py-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <MetricBlock
            label="Drops"
            value={contentDrops.length}
            detail="Content units tracked end to end"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Published"
            value={stats?.byStatus.PUBLISHED ?? 0}
            detail="Drops that already cleared the pipeline"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Pending review"
            value={stats?.byStatus.SUBMITTED ?? 0}
            detail="Items still waiting on editorial or operator review"
          />
        </Card>
        <Card className="p-4">
          <MetricBlock
            label="Pipeline tasks"
            value={captures.length}
            detail="Upstream work shaping the publishing queue"
          />
        </Card>
      </div>

      {/* Filters (Drops tab only) */}
      {tab === "drops" && contentDrops.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto flex-nowrap rounded-xl border border-line bg-surface-1 px-4 py-2.5">
          <Filter size={14} strokeWidth={1.7} className="shrink-0 text-ink-muted" aria-hidden />
          <div className="flex shrink-0 gap-1.5 flex-nowrap">
            {["ALL", ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors duration-150",
                  statusFilter === s
                    ? "border-line bg-surface-2 text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-secondary"
                )}
              >
                {s === "ALL" ? "All" : STATUS_CONFIG[s]?.label ?? s}
                {s !== "ALL" && (stats?.byStatus[s] ?? 0) > 0 && (
                  <span className="ml-1 font-mono text-ink-muted">{stats?.byStatus[s]}</span>
                )}
              </button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-line" />
          <div className="flex shrink-0 gap-1.5 flex-nowrap">
            {["ALL", ...CONTENT_TYPES].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors duration-150",
                  typeFilter === t
                    ? "border-line bg-surface-2 text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-secondary"
                )}
              >
                {t === "ALL" ? "All Types" : t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          {filteredDrops.length !== contentDrops.length && (
            <span className="ml-auto text-[11.5px] text-ink-muted">
              Showing {filteredDrops.length} of {contentDrops.length}
            </span>
          )}
        </div>
      )}

      {/* Tab Content */}
      {tab === "drops" && (
        <div className="flex-1 overflow-y-auto">
          {filteredDrops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package size={40} strokeWidth={1.6} className="mb-4 text-ink-muted" aria-hidden />
              <p className="mb-1 text-[15px] font-semibold text-ink">
                {contentDrops.length === 0 ? "No content drops yet" : "No drops match your filters"}
              </p>
              <p className="mb-6 max-w-xs text-[12.5px] text-ink-muted">
                {contentDrops.length === 0
                  ? "Seed sample data to get started, or create your first content drop."
                  : "Try adjusting the status or type filter."}
              </p>
              {contentDrops.length === 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={handleSeed}
                    disabled={seeding}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Seed Sample Data
                  </button>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create First Drop
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredDrops.map((drop) => (
                <ContentDropCard key={drop._id} drop={drop} agents={agents} onSelect={setSelectedDrop} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "pipeline" && (
        <div className="flex-1 overflow-x-auto">
          <div className="flex h-full min-w-max gap-4 py-1">
            {PIPELINE_COLUMNS.map((col) => (
              <div
                key={col.id}
                className="flex w-72 flex-col"
              >
                <div className="mb-3 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">{col.label}</span>
                  <span className="font-mono text-[11.5px] text-ink-secondary">
                    {columnItems[col.id]?.length ?? 0}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {(columnItems[col.id] ?? []).slice(0, 12).map((item) => (
                    <Card key={item._id} className="p-3">
                      <p className="mb-2 line-clamp-2 text-[12.5px] font-medium leading-relaxed text-ink">{item.title}</p>
                      <div className="flex items-center gap-2">
                        <FactoryStatusBadge tone="neutral">{item.type}</FactoryStatusBadge>
                        {item.priority > 0 && (
                          <span className={cn("font-mono text-[11.5px] font-medium", item.priority === 3 ? "text-err" : item.priority === 2 ? "text-warn" : "text-ink-muted")}>
                            P{item.priority}
                          </span>
                        )}
                      </div>
                    </Card>
                  ))}
                  {(columnItems[col.id]?.length ?? 0) === 0 && (
                    <div className="py-10 text-center text-[11.5px] text-ink-muted">Empty</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "metrics" && <MetricsTab projectId={projectId} />}

      {/* Modals */}
      {selectedDrop && (
        <ContentDropDetail dropId={selectedDrop} agents={agents} onClose={() => setSelectedDrop(null)} />
      )}
      {showCreate && (
        <CreateDropForm projectId={projectId} agents={agents} onClose={() => setShowCreate(false)} />
      )}
      </div>
    </section>
  );
}
