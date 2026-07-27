import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/factory/badges";
import { HarnessFirstReviewModal } from "./harness/components/HarnessFirstReviewModal";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Minus,
  Pencil,
  Plus,
  ThumbsUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface PeerReviewPanelProps {
  taskId: Id<"tasks">;
  projectId: Id<"projects">;
}

export function PeerReviewPanel({ taskId, projectId }: PeerReviewPanelProps) {
  const [showCreateReview, setShowCreateReview] = useState(false);
  const reviews = useQuery(api.reviews.listByTask, { taskId });
  const stats = useQuery(api.reviews.getStats, { projectId });

  if (!reviews || !stats) {
    return <div className="p-5 text-ink-muted">Loading reviews...</div>;
  }

  return (
    <div className="p-5">
      {/* Stats Summary */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-5">
        <StatCard label="Total Reviews" value={reviews.length} />
        <StatCard label="Praise" value={stats.byType.PRAISE} colorClass="text-ok" />
        <StatCard label="Refutes" value={stats.byType.REFUTE} colorClass="text-warn" />
        <StatCard label="Changesets" value={stats.byType.CHANGESET} colorClass="text-info-accent" />
        <StatCard label="Avg Score" value={stats.avgScore.toFixed(1)} />
      </div>

      {/* Create Review Button */}
      <button
        onClick={() => setShowCreateReview(true)}
        className="w-full h-9 bg-act text-act-ink border-none rounded-lg text-[13px] font-medium cursor-pointer mb-5 transition-opacity duration-150 hover:opacity-90"
      >
        Create Review
      </button>

      {/* Reviews List */}
      <div className="flex flex-col gap-3">
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10 text-ink-muted">
            <FileText className="h-7 w-7 mb-3" strokeWidth={1.5} />
            <div className="text-[15px] font-semibold text-ink">No reviews yet</div>
            <div className="text-[13px] mt-2">Be the first to review this task.</div>
          </div>
        ) : (
          reviews.map((review) => (
            <ReviewCard key={review._id} review={review} />
          ))
        )}
      </div>

      {showCreateReview && (
        <CreateReviewModal
          taskId={taskId}
          projectId={projectId}
          onClose={() => setShowCreateReview(false)}
        />
      )}
    </div>
  );
}

const STAT_DEFAULT_CLASS = "text-ink";

function StatCard({ label, value, colorClass }: { label: string; value: number | string; colorClass?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3 border border-line">
      <div className={cn("text-[19px] font-semibold tabular-nums", colorClass || STAT_DEFAULT_CLASS)}>
        {value}
      </div>
      <div className="text-xs text-ink-muted mt-0.5">{label}</div>
    </div>
  );
}

const TYPE_BORDER_CLASSES: Record<string, string> = {
  PRAISE: "border-l-ok",
  REFUTE: "border-l-warn",
  CHANGESET: "border-l-info-accent",
  APPROVE: "border-l-ok",
};

const TYPE_TEXT_CLASSES: Record<string, string> = {
  PRAISE: "text-ok",
  REFUTE: "text-warn",
  CHANGESET: "text-info-accent",
  APPROVE: "text-ok",
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  PRAISE: ThumbsUp,
  REFUTE: AlertTriangle,
  CHANGESET: Wrench,
  APPROVE: CheckCircle2,
};

function ReviewCard({ review }: any) {
  const respondToReview = useMutation(api.reviews.respond);
  const [responding, setResponding] = useState(false);
  const [responseText, setResponseText] = useState("");

  const handleRespond = async (accept: boolean) => {
    if (!responseText.trim()) return;
    
    try {
      await respondToReview({
        reviewId: review._id,
        responseBy: review.reviewerAgentId,
        responseText,
        accept,
      });
      setResponding(false);
      setResponseText("");
    } catch (error) {
      console.error("Error responding to review:", error);
    }
  };

  return (
    <div className={cn(
      "bg-surface-1 rounded-lg p-4 border border-line border-l-2",
      TYPE_BORDER_CLASSES[review.type] || "border-l-line-strong"
    )}>
      {/* Header */}
      <div className="flex justify-between mb-3">
        <div className="flex items-center gap-2">
          {(() => {
            const TypeIcon = TYPE_ICONS[review.type] ?? FileText;
            return <TypeIcon className={cn("h-4 w-4", TYPE_TEXT_CLASSES[review.type] || "text-ink-muted")} strokeWidth={1.75} />;
          })()}
          <span className={cn("text-[13px] font-semibold", TYPE_TEXT_CLASSES[review.type] || "text-ink-muted")}>
            {review.type}
          </span>
          {review.score && (
            <span className="text-xs text-ink-muted">
              Score: {review.score}/10
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted">
          {new Date(review._creationTime).toLocaleString()}
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm font-medium mb-2 text-ink">
        {review.summary}
      </div>

      {/* Details */}
      {review.details && (
        <div className="text-[13px] text-ink-muted mb-3">
          {review.details}
        </div>
      )}

      {/* Changeset */}
      {review.changeset && (
        <div className="bg-surface-2 border border-line rounded-md p-3 mb-3">
          <div className="text-xs font-semibold mb-2 text-ink">
            Files Changed:
          </div>
          {review.changeset.files.map((file: any, idx: number) => (
            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-ink-muted mb-1">
              {file.action === "ADD" && <Plus className="h-3 w-3" strokeWidth={1.75} />}
              {file.action === "MODIFY" && <Pencil className="h-3 w-3" strokeWidth={1.75} />}
              {file.action === "DELETE" && <Minus className="h-3 w-3" strokeWidth={1.75} />}
              <span className="font-mono">{file.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <StatusBadge tone={review.status === "PENDING" ? "warning" : "success"}>
          {review.status}
        </StatusBadge>
        {review.severity && (
          <StatusBadge tone={review.severity === "CRITICAL" ? "error" : "warning"}>
            {review.severity}
          </StatusBadge>
        )}
      </div>

      {/* Response Section */}
      {review.status === "PENDING" && !responding && (
        <button
          onClick={() => setResponding(true)}
          className="mt-3 px-3 py-2 bg-transparent border border-line rounded-lg text-ink-secondary text-xs cursor-pointer hover:text-ink hover:border-line-strong transition-colors duration-150"
        >
          Respond
        </button>
      )}

      {responding && (
        <div className="mt-3">
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Your response..."
            className="w-full min-h-[60px] p-2 bg-surface-1 border border-line rounded-lg text-ink text-xs mb-2 resize-y placeholder:text-ink-muted"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(true)}
              className="px-3 py-1.5 bg-act text-act-ink border-none rounded-lg text-xs cursor-pointer transition-opacity duration-150 hover:opacity-90"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond(false)}
              className="px-3 py-1.5 bg-err-soft text-err border border-transparent rounded-lg text-xs cursor-pointer transition-opacity duration-150 hover:opacity-90"
            >
              Reject
            </button>
            <button
              onClick={() => setResponding(false)}
              className="px-3 py-1.5 bg-transparent border border-line rounded-lg text-ink-secondary text-xs cursor-pointer hover:text-ink hover:border-line-strong transition-colors duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolved Response */}
      {review.responseText && (
        <div className="mt-3 p-2 bg-surface-2 border border-line rounded-md text-xs text-ink-muted">
          <strong>Response:</strong> {review.responseText}
        </div>
      )}
    </div>
  );
}

function CreateReviewModal({ taskId, projectId, onClose }: any) {
  const createReview = useMutation(api.reviews.create);
  const agents = useQuery(api.agents.listAll, { projectId });
  
  const [type, setType] = useState<"PRAISE" | "REFUTE" | "CHANGESET" | "APPROVE">("PRAISE");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [score, setScore] = useState(8);
  const [severity, setSeverity] = useState<"MINOR" | "MAJOR" | "CRITICAL">("MINOR");
  const [showHarnessGate, setShowHarnessGate] = useState(false);

  const submitReview = async () => {
    if (!summary.trim()) return;

    try {
      await createReview({
        projectId,
        taskId,
        type,
        summary,
        details: details || undefined,
        targetType: "TASK",
        score: type === "PRAISE" ? score : undefined,
        severity: type === "REFUTE" ? severity : undefined,
        reviewerAgentId: agents?.[0]?._id,
      });
      onClose();
    } catch (error) {
      console.error("Error creating review:", error);
    }
  };

  const handleSubmit = () => {
    if (!summary.trim()) return;
    if (type === "REFUTE" || type === "CHANGESET") {
      setShowHarnessGate(true);
      return;
    }
    void submitReview();
  };

  const inputClasses = "w-full h-9 px-3 bg-surface-1 border border-line rounded-lg text-ink text-[13.5px] placeholder:text-ink-muted";

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-surface-3 border border-line rounded-xl shadow-[var(--shadow-elevation-2)] max-w-[500px] w-full p-6 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-lg font-semibold">Create Review</h3>

        {/* Type Selection */}
        <div className="mb-4">
          <label className="block text-sm mb-2">Review Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className={inputClasses}>
            <option value="PRAISE">Praise</option>
            <option value="REFUTE">Refute</option>
            <option value="CHANGESET">Changeset</option>
            <option value="APPROVE">Approve</option>
          </select>
        </div>

        {/* Summary */}
        <div className="mb-4">
          <label className="block text-sm mb-2">Summary *</label>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary of your review"
            className={inputClasses}
          />
        </div>

        {/* Details */}
        <div className="mb-4">
          <label className="block text-sm mb-2">Details</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Detailed explanation..."
            className={cn(inputClasses, "min-h-[80px] resize-y")}
          />
        </div>

        {/* Conditional Fields */}
        {type === "PRAISE" && (
          <div className="mb-4">
            <label className="block text-sm mb-2">Score: {score}/10</label>
            <input
              type="range"
              min="1"
              max="10"
              value={score}
              onChange={(e) => setScore(parseInt(e.target.value))}
              className="w-full"
            />
          </div>
        )}

        {type === "REFUTE" && (
          <div className="mb-4">
            <label className="block text-sm mb-2">Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className={inputClasses}>
              <option value="MINOR">Minor</option>
              <option value="MAJOR">Major</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="h-9 px-3 bg-transparent border border-line rounded-lg text-ink-secondary text-[13px] font-medium cursor-pointer hover:text-ink hover:border-line-strong transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!summary.trim()}
            className={cn(
              "h-9 px-3 border-none rounded-lg text-[13px] font-medium transition-opacity duration-150",
              summary.trim()
                ? "bg-act text-act-ink cursor-pointer hover:opacity-90"
                : "bg-surface-2 text-ink-muted cursor-not-allowed"
            )}
          >
            Create Review
          </button>
        </div>
      </div>
      <HarnessFirstReviewModal
        open={showHarnessGate}
        onClose={() => setShowHarnessGate(false)}
        onProceedComment={() => {
          setShowHarnessGate(false);
          void submitReview();
        }}
      />
    </div>
  );
}
