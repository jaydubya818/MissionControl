/**
 * Telegraph Inbox
 *
 * Threads grouped by project with message counts and last activity.
 * Click to expand into TelegraphThread view.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgInput: "#0f172a",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
};

export function TelegraphInbox({ projectId }: { projectId: Id<"projects"> | null }) {
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"telegraphThreads"> | null>(null);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [composing, setComposing] = useState(false);
  const [messageText, setMessageText] = useState("");

  const threads = useQuery(api.telegraph.listThreads, projectId ? { projectId } : {});
  const selectedThread = useQuery(
    api.telegraph.getThread,
    selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );
  const createThread = useMutation(api.telegraph.createThread);
  const sendMessage = useMutation(api.telegraph.sendMessage);

  const handleCreateThread = async () => {
    if (!newThreadTitle.trim()) return;
    const threadId = await createThread({
      projectId: projectId ?? undefined,
      title: newThreadTitle.trim(),
      participants: [],
      channel: "INTERNAL",
    });
    setNewThreadTitle("");
    setComposing(false);
    setSelectedThreadId(threadId);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedThreadId) return;
    await sendMessage({
      threadId: selectedThreadId,
      senderId: "OPERATOR",
      senderType: "HUMAN",
      content: messageText.trim(),
      channel: "INTERNAL",
      projectId: projectId ?? undefined,
    });
    setMessageText("");
  };

  if (selectedThreadId && selectedThread) {
    return (
      <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        <button
          onClick={() => setSelectedThreadId(null)}
          style={{ background: "none", border: "none", color: colors.accentBlue, cursor: "pointer", marginBottom: 16, fontSize: "0.85rem" }}
        >
          ← Back to Inbox
        </button>

        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, maxWidth: 700 }}>
          <div style={{ padding: 16, borderBottom: "1px solid " + colors.border, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ color: colors.textPrimary, margin: 0 }}>{selectedThread.title}</h3>
              <span style={{ color: colors.textMuted, fontSize: "0.8rem" }}>
                {selectedThread.channel} · {selectedThread.participants?.length ?? 0} participants · {selectedThread.messageCount} messages
              </span>
            </div>
            {selectedThread.linkedTaskId && (
              <span style={{ padding: "3px 8px", borderRadius: 4, background: colors.accentBlue + "22", color: colors.accentBlue, fontSize: "0.75rem", fontWeight: 600 }}>
                Linked to Task
              </span>
            )}
          </div>

          <div style={{ padding: 16, maxHeight: 500, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {(selectedThread.messages ?? []).map((msg: any) => (
              <div
                key={msg._id}
                style={{
                  background: msg.senderType === "HUMAN" ? colors.accentBlue + "11" : colors.bgInput,
                  border: "1px solid " + colors.border,
                  borderRadius: 6,
                  padding: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: colors.accentBlue, fontSize: "0.8rem", fontWeight: 600 }}>
                    {msg.senderId} ({msg.senderType})
                  </span>
                  <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                    {new Date(msg._creationTime).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: colors.textPrimary, fontSize: "0.9rem" }}>{msg.content}</div>
              </div>
            ))}
            {(selectedThread.messages ?? []).length === 0 && (
              <div style={{ color: colors.textMuted, textAlign: "center", padding: 40 }}>No messages yet.</div>
            )}
          </div>

          <div style={{ padding: 16, borderTop: "1px solid " + colors.border, display: "flex", gap: 8 }}>
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message..."
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid " + colors.border,
                background: colors.bgInput,
                color: colors.textPrimary,
                fontSize: "0.9rem",
                outline: "none",
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: colors.accentBlue,
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: colors.textPrimary, margin: 0 }}>Telegraph Inbox</h2>
        <button
          onClick={() => setComposing(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: colors.accentBlue,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          New Thread
        </button>
      </div>

      {composing && (
        <div style={{ background: colors.bgCard, border: "1px solid " + colors.border, borderRadius: 8, padding: 16, marginBottom: 16, display: "flex", gap: 8 }}>
          <input
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateThread()}
            placeholder="Thread title..."
            autoFocus
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid " + colors.border,
              background: colors.bgInput,
              color: colors.textPrimary,
              fontSize: "0.9rem",
              outline: "none",
            }}
          />
          <button onClick={handleCreateThread} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: colors.accentGreen, color: "#fff", cursor: "pointer", fontWeight: 600 }}>
            Create
          </button>
          <button onClick={() => { setComposing(false); setNewThreadTitle(""); }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid " + colors.border, background: "transparent", color: colors.textSecondary, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(threads ?? []).map((thread: any) => (
          <div
            key={thread._id}
            onClick={() => setSelectedThreadId(thread._id)}
            style={{
              background: colors.bgCard,
              border: "1px solid " + colors.border,
              borderRadius: 8,
              padding: 14,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: thread.channel === "TELEGRAM" ? "#f59e0b" : colors.accentBlue, fontSize: "0.75rem", fontWeight: 600 }}>
                  {thread.channel}
                </span>
                <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: "0.95rem" }}>{thread.title}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: colors.textMuted, fontSize: "0.8rem" }}>{thread.messageCount} msgs</span>
                <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                  {thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>
            <div style={{ color: colors.textMuted, fontSize: "0.8rem", marginTop: 4 }}>
              {thread.participants?.length ?? 0} participants
              {thread.linkedTaskId && " · Linked to task"}
            </div>
          </div>
        ))}
        {(threads ?? []).length === 0 && (
          <div style={{ color: colors.textMuted, textAlign: "center", padding: 40, background: colors.bgCard, borderRadius: 8, border: "1px solid " + colors.border }}>
            No threads yet. Create one to start communicating.
          </div>
        )}
      </div>
    </main>
  );
}
