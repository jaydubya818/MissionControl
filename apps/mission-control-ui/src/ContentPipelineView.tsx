import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter,
  LayoutGrid,
  Package,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton-card";

interface ContentPipelineViewProps {
  projectId: Id<"projects"> | null;
}

type TabMode = "pipeline" | "drops";

const PIPELINE_COLUMNS = [
  { id: "idea", label: "Ideas", color: "border-t-zinc-500" },
  { id: "drafting", label: "Drafting", color: "border-t-blue-500" },
  { id: "review", label: "Review", color: "border-t-blue-500" },
  { id: "published", label: "Published", color: "border-t-emerald-500" },
];

const DROP_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-500",
  SUBMITTED: "bg-blue-500",
  APPROVED: "bg-emerald-500",
  REJECTED: "bg-red-500",
  PUBLISHED: "bg-blue-500",
};

function ContentDropCard({
  drop,
  agents,
  onSelect,
}: {
  drop: Doc<"contentDrops">;
  agents: Doc<"agents">[];
  onSelect: (id: Id<"contentDrops">) => void;
}) {
  const agent = drop.agentId ? agents.find((a) => a._id === drop.agentId) : null;

  return (
    <Card
      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onSelect(drop._id)}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-foreground/90 leading-relaxed line-clamp-2 flex-1">
          {drop.title}
        </p>
        <span
          className={`ml-2 shrink-0 text-[0.55rem] uppercase tracking-wider font-medium text-white px-1.5 py-0.5 rounded ${DROP_STATUS_COLORS[drop.status] ?? "bg-zinc-500"}`}
        >
          {drop.status}
        </span>
      </div>
      {drop.summary && (
        <p className="text-[0.65rem] text-muted-foreground/60 line-clamp-2 mb-2">
          {drop.summary}
        </p>
      )}
      <div className="flex items-center gap-2 text-[0.6rem] text-muted-foreground/50">
        <span className="uppercase tracking-wider">{drop.contentType.replace("_", " ")}</span>
        {agent && (
          <>
            <span>&middot;</span>
            <span>{agent.emoji ?? "🤖"} {agent.name}</span>
          </>
        )}
        <span>&middot;</span>
        <span>{new Date(drop._creationTime).toLocaleDateString()}</span>
      </div>
      {drop.tags && drop.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {drop.tags.map((tag) => (
            <span
              key={tag}
              className="text-[0.55rem] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function ContentDropDetail({
  dropId,
  agents,
  onClose,
}: {
  dropId: Id<"contentDrops">;
  agents: Doc<"agents">[];
  onClose: () => void;
}) {
  const drop = useQuery(api.contentDrops.get, { id: dropId });
  const updateStatus = useMutation(api.contentDrops.updateStatus);

  if (!drop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Card className="w-full max-w-2xl p-6">
          <SkeletonCard lines={4} />
        </Card>
      </div>
    );
  }

  const agent = drop.agentId ? agents.find((a) => a._id === drop.agentId) : null;

  const handleAction = async (status: "APPROVED" | "REJECTED" | "PUBLISHED") => {
    await updateStatus({ id: dropId, status, reviewedBy: "operator" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{drop.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="uppercase tracking-wider">{drop.contentType.replace("_", " ")}</span>
                {agent && (
                  <>
                    <span>&middot;</span>
                    <span>{agent.emoji ?? "🤖"} {agent.name}</span>
                  </>
                )}
                <span>&middot;</span>
                <span
                  className={`text-white px-1.5 py-0.5 rounded text-[0.55rem] uppercase tracking-wider font-medium ${DROP_STATUS_COLORS[drop.status] ?? "bg-zinc-500"}`}
                >
                  {drop.status}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {drop.summary && (
            <p className="text-xs text-muted-foreground mb-4">{drop.summary}</p>
          )}

          <div className="bg-muted/50 rounded-lg p-4 mb-4 max-h-[300px] overflow-y-auto">
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
              {drop.content}
            </pre>
          </div>

          {drop.reviewNote && (
            <div className="text-xs text-muted-foreground mb-4 border-l-2 border-border pl-3">
              <span className="font-medium">Review:</span> {drop.reviewNote}
            </div>
          )}

          {(drop.status === "SUBMITTED" || drop.status === "DRAFT") && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button
                onClick={() => handleAction("APPROVED")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3" />
                Approve
              </button>
              <button
                onClick={() => handleAction("REJECTED")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </button>
              <button
                onClick={() => handleAction("PUBLISHED")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 border border-border transition-colors"
              >
                <Eye className="h-3 w-3" />
                Publish
              </button>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

export function ContentPipelineView({ projectId }: ContentPipelineViewProps) {
  const [tab, setTab] = useState<TabMode>("drops");
  const [selectedDrop, setSelectedDrop] = useState<Id<"contentDrops"> | null>(null);

  const captures = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const contentDrops = useQuery(api.contentDrops.list, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const isLoading = !captures || !contentDrops || !agents;

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ))}
        </div>
      </main>
    );
  }

  const columnItems: Record<string, typeof captures> = {
    idea: captures.filter((t) => t.status === "INBOX"),
    drafting: captures.filter((t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status)),
    review: captures.filter((t) => ["REVIEW", "NEEDS_APPROVAL"].includes(t.status)),
    published: captures.filter((t) => t.status === "DONE"),
  };

  return (
    <main className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            Content Pipeline
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track content from idea to publication
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setTab("drops")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "drops"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Package className="h-3 w-3" />
              Drops ({contentDrops.length})
            </button>
            <button
              onClick={() => setTab("pipeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "pipeline"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-3 w-3" />
              Pipeline
            </button>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 border border-border transition-colors">
            <Filter className="h-3 w-3" />
            Filter
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === "drops" ? (
        <div className="flex-1 overflow-y-auto p-6">
          {contentDrops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No content drops yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Agents will submit deliverables here when they complete content tasks
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contentDrops.map((drop) => (
                <ContentDropCard
                  key={drop._id}
                  drop={drop}
                  agents={agents}
                  onSelect={setSelectedDrop}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 p-6 min-w-max h-full">
            {PIPELINE_COLUMNS.map((col, colIdx) => (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: colIdx * 0.08 }}
                className="w-72 flex flex-col"
              >
                <div className={`flex items-center justify-between px-3 py-2 mb-3 rounded-md bg-muted/50 border border-border border-t-2 ${col.color}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {col.label}
                  </span>
                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                    {columnItems[col.id]?.length ?? 0}
                  </span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {(columnItems[col.id] ?? []).slice(0, 10).map((item) => (
                    <Card key={item._id} className="p-3 cursor-pointer">
                      <p className="text-xs font-medium text-foreground/90 leading-relaxed line-clamp-2 mb-2">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.6rem] text-muted-foreground/60 uppercase tracking-wider">
                          {item.type}
                        </span>
                        {item.priority > 0 && (
                          <span className="text-[0.6rem] text-amber-500/80">
                            P{item.priority}
                          </span>
                        )}
                      </div>
                    </Card>
                  ))}

                  {(columnItems[col.id]?.length ?? 0) === 0 && (
                    <div className="py-8 text-center text-[0.65rem] text-muted-foreground/40 uppercase tracking-wider">
                      Empty
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedDrop && (
          <ContentDropDetail
            dropId={selectedDrop}
            agents={agents}
            onClose={() => setSelectedDrop(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
