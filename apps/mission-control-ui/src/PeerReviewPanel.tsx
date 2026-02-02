import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

interface PeerReviewPanelProps {
  taskId: Id<"tasks">;
  projectId: Id<"projects">;
}

export function PeerReviewPanel({ taskId, projectId }: PeerReviewPanelProps) {
  const [showCreateReview, setShowCreateReview] = useState(false);
  const reviews = useQuery(api.reviews.listByTask, { taskId });
  const stats = useQuery(api.reviews.getStats, { projectId });

  if (!reviews || !stats) {
    return <div style={{ padding: "20px", color: "#94a3b8" }}>Loading reviews...</div>;
  }

  return (
    <div style={{ padding: "20px" }}>
      {/* Stats Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "12px",
        marginBottom: "20px",
      }}>
        <StatCard label="Total Reviews" value={reviews.length} icon="📝" />
        <StatCard label="Praise" value={stats.byType.PRAISE} icon="👏" color="#10b981" />
        <StatCard label="Refutes" value={stats.byType.REFUTE} icon="⚠️" color="#f59e0b" />
        <StatCard label="Changesets" value={stats.byType.CHANGESET} icon="🔧" color="#3b82f6" />
        <StatCard label="Avg Score" value={stats.avgScore.toFixed(1)} icon="⭐" />
      </div>

      {/* Create Review Button */}
      <button
        onClick={() => setShowCreateReview(true)}
        style={{
          width: "100%",
          padding: "12px",
          background: "#3b82f6",
          border: "none",
          borderRadius: "6px",
          color: "white",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        + Create Review
      </button>

      {/* Reviews List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {reviews.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📝</div>
            <div style={{ fontSize: "16px" }}>No reviews yet</div>
            <div style={{ fontSize: "14px", marginTop: "8px" }}>Be the first to review this task!</div>
          </div>
        ) : (
          reviews.map((review) => (
            <ReviewCard key={review._id} review={review} />
          ))
        )}
      </div>

      {/* Create Review Modal */}
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

function StatCard({ label, value, icon, color }: any) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: "6px",
      padding: "12px",
      border: "1px solid #1e293b",
    }}>
      <div style={{ fontSize: "20px", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontSize: "24px", fontWeight: 600, color: color || "#e2e8f0" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>{label}</div>
    </div>
  );
}

function ReviewCard({ review }: any) {
  const respondToReview = useMutation(api.reviews.respond);
  const [responding, setResponding] = useState(false);
  const [responseText, setResponseText] = useState("");

  const getTypeColor = (type: string) => {
    switch (type) {
      case "PRAISE": return "#10b981";
      case "REFUTE": return "#f59e0b";
      case "CHANGESET": return "#3b82f6";
      case "APPROVE": return "#8b5cf6";
      default: return "#6b7280";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "PRAISE": return "👏";
      case "REFUTE": return "⚠️";
      case "CHANGESET": return "🔧";
      case "APPROVE": return "✅";
      default: return "📝";
    }
  };

  const handleRespond = async (accept: boolean) => {
    if (!responseText.trim()) return;
    
    try {
      await respondToReview({
        reviewId: review._id,
        responseBy: review.reviewerAgentId, // TODO: Get current agent
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
    <div style={{
      background: "#0f172a",
      borderRadius: "8px",
      padding: "16px",
      border: `1px solid ${getTypeColor(review.type)}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "20px" }}>{getTypeIcon(review.type)}</span>
          <span style={{ fontSize: "14px", fontWeight: 600, color: getTypeColor(review.type) }}>
            {review.type}
          </span>
          {review.score && (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Score: {review.score}/10
            </span>
          )}
        </div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          {new Date(review._creationTime).toLocaleString()}
        </div>
      </div>

      {/* Summary */}
      <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>
        {review.summary}
      </div>

      {/* Details */}
      {review.details && (
        <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
          {review.details}
        </div>
      )}

      {/* Changeset */}
      {review.changeset && (
        <div style={{
          background: "#020617",
          borderRadius: "4px",
          padding: "12px",
          marginBottom: "12px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
            Files Changed:
          </div>
          {review.changeset.files.map((file: any, idx: number) => (
            <div key={idx} style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>
              {file.action === "ADD" && "➕"}
              {file.action === "MODIFY" && "✏️"}
              {file.action === "DELETE" && "❌"}
              {" "}{file.path}
            </div>
          ))}
        </div>
      )}

      {/* Status Badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{
          fontSize: "11px",
          padding: "4px 8px",
          borderRadius: "4px",
          background: review.status === "PENDING" ? "#7c2d12" : "#064e3b",
          color: review.status === "PENDING" ? "#fbbf24" : "#10b981",
          fontWeight: 600,
        }}>
          {review.status}
        </span>
        {review.severity && (
          <span style={{
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "4px",
            background: "#7c2d12",
            color: "#fbbf24",
          }}>
            {review.severity}
          </span>
        )}
      </div>

      {/* Response Section */}
      {review.status === "PENDING" && !responding && (
        <button
          onClick={() => setResponding(true)}
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "4px",
            color: "#e2e8f0",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Respond
        </button>
      )}

      {responding && (
        <div style={{ marginTop: "12px" }}>
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Your response..."
            style={{
              width: "100%",
              minHeight: "60px",
              padding: "8px",
              background: "#020617",
              border: "1px solid #334155",
              borderRadius: "4px",
              color: "#e2e8f0",
              fontSize: "12px",
              marginBottom: "8px",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handleRespond(true)}
              style={{
                padding: "6px 12px",
                background: "#10b981",
                border: "none",
                borderRadius: "4px",
                color: "white",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond(false)}
              style={{
                padding: "6px 12px",
                background: "#ef4444",
                border: "none",
                borderRadius: "4px",
                color: "white",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Reject
            </button>
            <button
              onClick={() => setResponding(false)}
              style={{
                padding: "6px 12px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#e2e8f0",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolved Response */}
      {review.responseText && (
        <div style={{
          marginTop: "12px",
          padding: "8px",
          background: "#020617",
          borderRadius: "4px",
          fontSize: "12px",
          color: "#94a3b8",
        }}>
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
        reviewerAgentId: agents?.[0]?._id, // TODO: Get current agent
      });
      onClose();
    } catch (error) {
      console.error("Error creating review:", error);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          maxWidth: "500px",
          width: "100%",
          padding: "24px",
          color: "#e2e8f0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 20px 0" }}>Create Review</h3>

        {/* Type Selection */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>
            Review Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            style={{
              width: "100%",
              padding: "8px",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "4px",
              color: "#e2e8f0",
              fontSize: "14px",
            }}
          >
            <option value="PRAISE">👏 Praise</option>
            <option value="REFUTE">⚠️ Refute</option>
            <option value="CHANGESET">🔧 Changeset</option>
            <option value="APPROVE">✅ Approve</option>
          </select>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>
            Summary *
          </label>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary of your review"
            style={{
              width: "100%",
              padding: "8px",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "4px",
              color: "#e2e8f0",
              fontSize: "14px",
            }}
          />
        </div>

        {/* Details */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>
            Details
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Detailed explanation..."
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "8px",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "4px",
              color: "#e2e8f0",
              fontSize: "14px",
              resize: "vertical",
            }}
          />
        </div>

        {/* Conditional Fields */}
        {type === "PRAISE" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>
              Score: {score}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={score}
              onChange={(e) => setScore(parseInt(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {type === "REFUTE" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", marginBottom: "8px" }}>
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as any)}
              style={{
                width: "100%",
                padding: "8px",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#e2e8f0",
                fontSize: "14px",
              }}
            >
              <option value="MINOR">Minor</option>
              <option value="MAJOR">Major</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#e2e8f0",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!summary.trim()}
            style={{
              padding: "8px 16px",
              background: summary.trim() ? "#3b82f6" : "#334155",
              border: "none",
              borderRadius: "6px",
              color: "white",
              fontSize: "14px",
              cursor: summary.trim() ? "pointer" : "not-allowed",
            }}
          >
            Create Review
          </button>
        </div>
      </div>
    </div>
  );
}
