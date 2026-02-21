import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface PeerReviewPanelProps {
  taskId: Id<"tasks">;
  projectId: Id<"projects">;
}

export function PeerReviewPanel({ taskId, projectId }: PeerReviewPanelProps) {
  const [showCreateReview, setShowCreateReview] = useState(false);
  const reviews = useQuery(api.reviews.listByTask, { taskId });
  const stats = useQuery(api.reviews.getStats, { projectId });

  if (!reviews || !stats) {
    return <div className="p-5 text-muted-foreground">Loading reviews...</div>;
  }

  return (
    <div className="p-5">
      {/* Stats Summary */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-5">
        <StatCard label="Total Reviews" value={reviews.length} icon="📝" />
        <StatCard label="Praise" value={stats.byType.PRAISE} icon="👏" colorClass="text-emerald-500" />
        <StatCard label="Refutes" value={stats.byType.REFUTE} icon="⚠️" colorClass="text-amber-500" />
        <StatCard label="Changesets" value={stats.byType.CHANGESET} icon="🔧" colorClass="text-blue-500" />
        <StatCard label="Avg Score" value={stats.avgScore.toFixed(1)} icon="⭐" />
      </div>

      {/* Create Review Button */}
      <button
        onClick={() => setShowCreateReview(true)}
        className="w-full p-3 bg-blue-500 hover:bg-blue-600 border-none rounded-md text-white text-sm font-medium cursor-pointer mb-5 transition-colors"
      >
        + Create Review
      </button>

      {/* Reviews List */}
      <div className="flex flex-col gap-3">
        {reviews.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <div className="text-5xl mb-3">📝</div>
            <div className="text-base">No reviews yet</div>
            <div className="text-sm mt-2">Be the first to review this task!</div>
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

const STAT_DEFAULT_CLASS = "text-foreground";

function StatCard({ label, value, icon, colorClass }: { label: string; value: number | string; icon: string; colorClass?: string }) {
  return (
    <div className="bg-background rounded-md p-3 border border-card">
      <div className="text-xl mb-1">{icon}</div>
      <div className={cn("text-2xl font-semibold", colorClass || STAT_DEFAULT_CLASS)}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const TYPE_BORDER_CLASSES: Record<string, string> = {
  PRAISE: "border-emerald-500",
  REFUTE: "border-amber-500",
  CHANGESET: "border-blue-500",
  APPROVE: "border-blue-500",
};

const TYPE_TEXT_CLASSES: Record<string, string> = {
  PRAISE: "text-emerald-500",
  REFUTE: "text-amber-500",
  CHANGESET: "text-blue-500",
  APPROVE: "text-blue-500",
};

const TYPE_ICONS: Record<string, string> = {
  PRAISE: "👏",
  REFUTE: "⚠️",
  CHANGESET: "🔧",
  APPROVE: "✅",
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
      "bg-background rounded-lg p-4 border",
      TYPE_BORDER_CLASSES[review.type] || "border-gray-500"
    )}>
      {/* Header */}
      <div className="flex justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{TYPE_ICONS[review.type] || "📝"}</span>
          <span className={cn("text-sm font-semibold", TYPE_TEXT_CLASSES[review.type] || "text-gray-500")}>
            {review.type}
          </span>
          {review.score && (
            <span className="text-xs text-muted-foreground">
              Score: {review.score}/10
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(review._creationTime).toLocaleString()}
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm font-medium mb-2 text-foreground">
        {review.summary}
      </div>

      {/* Details */}
      {review.details && (
        <div className="text-[13px] text-muted-foreground mb-3">
          {review.details}
        </div>
      )}

      {/* Changeset */}
      {review.changeset && (
        <div className="bg-slate-950 rounded p-3 mb-3">
          <div className="text-xs font-semibold mb-2 text-foreground">
            Files Changed:
          </div>
          {review.changeset.files.map((file: any, idx: number) => (
            <div key={idx} className="text-[11px] text-muted-foreground mb-1">
              {file.action === "ADD" && "➕"}
              {file.action === "MODIFY" && "✏️"}
              {file.action === "DELETE" && "❌"}
              {" "}{file.path}
            </div>
          ))}
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "text-[11px] px-2 py-1 rounded font-semibold",
          review.status === "PENDING"
            ? "bg-orange-900 text-amber-400"
            : "bg-emerald-950 text-emerald-500"
        )}>
          {review.status}
        </span>
        {review.severity && (
          <span className="text-[11px] px-2 py-1 rounded bg-orange-900 text-amber-400">
            {review.severity}
          </span>
        )}
      </div>

      {/* Response Section */}
      {review.status === "PENDING" && !responding && (
        <button
          onClick={() => setResponding(true)}
          className="mt-3 px-3 py-2 bg-card border border-border rounded text-foreground text-xs cursor-pointer hover:bg-muted transition-colors"
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
            className="w-full min-h-[60px] p-2 bg-slate-950 border border-border rounded text-foreground text-xs mb-2 resize-y"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(true)}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 border-none rounded text-white text-xs cursor-pointer transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond(false)}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 border-none rounded text-white text-xs cursor-pointer transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => setResponding(false)}
              className="px-3 py-1.5 bg-card border border-border rounded text-foreground text-xs cursor-pointer hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolved Response */}
      {review.responseText && (
        <div className="mt-3 p-2 bg-slate-950 rounded text-xs text-muted-foreground">
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

  const handleSubmit = async () => {
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

  const inputClasses = "w-full p-2 bg-background border border-border rounded text-foreground text-sm";

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl max-w-[500px] w-full p-6 text-card-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-lg font-semibold">Create Review</h3>

        {/* Type Selection */}
        <div className="mb-4">
          <label className="block text-sm mb-2">Review Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className={inputClasses}>
            <option value="PRAISE">👏 Praise</option>
            <option value="REFUTE">⚠️ Refute</option>
            <option value="CHANGESET">🔧 Changeset</option>
            <option value="APPROVE">✅ Approve</option>
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
            className="px-4 py-2 bg-card border border-border rounded-md text-foreground text-sm cursor-pointer hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!summary.trim()}
            className={cn(
              "px-4 py-2 border-none rounded-md text-white text-sm transition-colors",
              summary.trim()
                ? "bg-blue-500 hover:bg-blue-600 cursor-pointer"
                : "bg-slate-700 cursor-not-allowed"
            )}
          >
            Create Review
          </button>
        </div>
      </div>
    </div>
  );
}
