import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface TaskCommentsProps {
  taskId: Id<"tasks">;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");

  const comments = useQuery(api.comments.listByTask, { taskId });
  const agents = useQuery(api.agents.listAll, {});
  const postComment = useMutation(api.comments.post);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;

    try {
      await postComment({
        taskId,
        content: newComment,
        authorType: "HUMAN",
        authorUserId: "operator", // TODO: Get from auth
      });
      
      setNewComment("");
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Show mentions on @
    if (e.key === "@") {
      setShowMentions(true);
      setMentionSearch("");
    }
    
    // Hide mentions on Escape
    if (e.key === "Escape") {
      setShowMentions(false);
    }
    
    // Submit on Cmd+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleSubmit(e);
    }
  };

  const handleMentionSelect = (agentName: string) => {
    const lastAtIndex = newComment.lastIndexOf("@");
    const beforeAt = newComment.substring(0, lastAtIndex);
    const afterAt = newComment.substring(lastAtIndex + 1 + mentionSearch.length);
    
    setNewComment(`${beforeAt}@${agentName} ${afterAt}`);
    setShowMentions(false);
    setMentionSearch("");
  };

  const filteredAgents = agents?.filter(agent =>
    agent.name.toLowerCase().includes(mentionSearch.toLowerCase())
  ) || [];

  if (!comments) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
        Loading comments...
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      {/* Comments List */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        {comments.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "32px",
            color: "#64748b",
            fontSize: "0.875rem",
          }}>
            No comments yet. Be the first to comment!
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment._id}
              style={{
                background: "#334155",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              {/* Author */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}>
                <div style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#e2e8f0",
                }}>
                  {comment.author ? (
                    <>
                      {comment.author.emoji} {comment.author.name}
                    </>
                  ) : (
                    <>👤 {comment.authorUserId || "User"}</>
                  )}
                </div>
                <div style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                }}>
                  {new Date(comment._creationTime).toLocaleString()}
                </div>
              </div>

              {/* Content with @mentions highlighted */}
              <div style={{
                fontSize: "0.875rem",
                color: "#cbd5e1",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {comment.content.split(/(@\w+)/g).map((part, i) => {
                  if (part.startsWith("@")) {
                    return (
                      <span
                        key={i}
                        style={{
                          color: "#3b82f6",
                          fontWeight: 600,
                        }}
                      >
                        {part}
                      </span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment Input */}
      <div style={{
        borderTop: "1px solid #334155",
        padding: "16px",
        position: "relative",
      }}>
        <form onSubmit={handleSubmit}>
          <textarea
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value);
              
              // Update mention search
              const lastAtIndex = e.target.value.lastIndexOf("@");
              if (lastAtIndex !== -1 && showMentions) {
                const search = e.target.value.substring(lastAtIndex + 1);
                setMentionSearch(search);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (use @ to mention agents, Cmd+Enter to send)"
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "12px",
              background: "#334155",
              border: "1px solid #475569",
              borderRadius: "8px",
              color: "#e2e8f0",
              fontSize: "0.875rem",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />

          {/* Mention Suggestions */}
          {showMentions && filteredAgents.length > 0 && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: "16px",
              right: "16px",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              marginBottom: "4px",
              maxHeight: "200px",
              overflowY: "auto",
              boxShadow: "0 -4px 12px rgba(0,0,0,0.3)",
            }}>
              {filteredAgents.map((agent) => (
                <button
                  key={agent._id}
                  type="button"
                  onClick={() => handleMentionSelect(agent.name)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    color: "#e2e8f0",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <span>{agent.emoji}</span>
                  <span>{agent.name}</span>
                  <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                    {agent.role}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "8px",
          }}>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Tip: Use @ to mention agents
            </div>
            <button
              type="submit"
              disabled={!newComment.trim()}
              style={{
                padding: "8px 16px",
                background: newComment.trim() ? "#3b82f6" : "#334155",
                color: newComment.trim() ? "#fff" : "#64748b",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: newComment.trim() ? "pointer" : "not-allowed",
              }}
            >
              Post Comment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
