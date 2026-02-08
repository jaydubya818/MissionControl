import { CSSProperties, useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface ChatViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentPurple: "#8b5cf6",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
};

export function ChatView({ projectId }: ChatViewProps) {
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Show all tasks (not just those with threadRef)
  const availableTasks = tasks ?? [];

  // Filter tasks by search query
  const filteredTasks = searchQuery
    ? availableTasks.filter((task) =>
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableTasks;

  // Auto-select first task if none selected
  useEffect(() => {
    if (!selectedTaskId && tasks && tasks.length > 0) {
      setSelectedTaskId(tasks[0]._id);
    }
  }, [selectedTaskId, tasks]);

  if (!tasks) {
    return (
      <main style={styles.container}>
        <div style={styles.loading}>Loading tasks...</div>
      </main>
    );
  }

  if (availableTasks.length === 0) {
    return (
      <main style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💬</div>
          <div style={styles.emptyTitle}>No Tasks Yet</div>
          <div style={styles.emptyText}>
            Create a task to start chatting about it
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>Task Threads</h2>
          <div style={styles.threadCount}>{availableTasks.length}</div>
        </div>
        <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="🔍 Search tasks..."
            style={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={styles.clearButton}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div style={styles.threadList}>
          {filteredTasks.map((task) => (
            <ThreadItem
              key={task._id}
              task={task}
              isSelected={task._id === selectedTaskId}
              onSelect={() => setSelectedTaskId(task._id)}
            />
          ))}
          {filteredTasks.length === 0 && searchQuery && (
            <div style={styles.noResults}>
              <div style={styles.noResultsText}>No tasks found</div>
              <div style={styles.noResultsSubtext}>Try a different search</div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.main}>
        {selectedTaskId ? (
          <ThreadView taskId={selectedTaskId} />
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyTitle}>Select a task</div>
            <div style={styles.emptyText}>
              Choose a task from the sidebar to view its conversation
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

interface ThreadItemProps {
  task: Doc<"tasks">;
  isSelected: boolean;
  onSelect: () => void;
}

function ThreadItem({ task, isSelected, onSelect }: ThreadItemProps) {
  const messages = useQuery(api.messages.listByTask, { taskId: task._id });
  const messageCount = messages?.length ?? 0;
  const hasMessages = messageCount > 0;
  
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...styles.threadItem,
        ...(isSelected && styles.threadItemSelected),
      }}
      aria-label={`Thread: ${task.title}`}
    >
      <div style={styles.threadItemHeader}>
        <div style={styles.threadItemTitle}>{task.title}</div>
        <div style={styles.threadItemBadges}>
          {hasMessages && (
            <div style={styles.messageCountBadge}>{messageCount}</div>
          )}
          <div style={styles.threadItemStatus}>{task.status}</div>
        </div>
      </div>
      {task.description && (
        <div style={styles.threadItemDesc}>{task.description}</div>
      )}
    </button>
  );
}

interface ThreadViewProps {
  taskId: Id<"tasks">;
}

function ThreadView({ taskId }: ThreadViewProps) {
  const messages = useQuery(api.messages.listByTask, { taskId });
  const task = useQuery(api.tasks.get, { taskId });
  const agents = useQuery(api.agents.list, { projectId: task?.projectId });
  const postMessage = useMutation(api.messages.post);
  
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [replyTo, setReplyTo] = useState<Doc<"messages"> | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages?.length]);

  // Detect @mentions
  useEffect(() => {
    const lastAtIndex = messageText.lastIndexOf("@");
    if (lastAtIndex !== -1 && lastAtIndex === messageText.length - 1) {
      setShowMentions(true);
      setMentionQuery("");
    } else if (lastAtIndex !== -1) {
      const afterAt = messageText.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ")) {
        setShowMentions(true);
        setMentionQuery(afterAt);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  }, [messageText]);

  if (!messages || !task) {
    return <div style={styles.loading}>Loading messages...</div>;
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;

    // Extract @mentions
    const mentionMatches = messageText.match(/@(\w+)/g);
    const mentions = mentionMatches ? mentionMatches.map(m => m.slice(1)) : undefined;

    setIsSending(true);
    try {
      await postMessage({
        taskId,
        type: "COMMENT",
        content: messageText.trim(),
        authorType: "HUMAN",
        authorUserId: "operator", // In production, this would be the actual user ID
        mentions,
        replyToId: replyTo?._id,
      });
      setMessageText("");
      setReplyTo(null);
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMentionSelect = (agentName: string) => {
    const lastAtIndex = messageText.lastIndexOf("@");
    const newText = messageText.slice(0, lastAtIndex + 1) + agentName + " ";
    setMessageText(newText);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const filteredAgents = agents?.filter(a => 
    a.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ) ?? [];

  return (
    <div style={styles.thread}>
      <div style={styles.threadHeader}>
        <h2 style={styles.threadTitle}>{task.title}</h2>
        <div style={styles.threadMeta}>
          <span style={styles.threadMetaItem}>{task.status}</span>
          <span style={styles.threadMetaItem}>{task.type}</span>
        </div>
      </div>

      <div style={styles.messageList} ref={messageListRef}>
        {messages.length === 0 ? (
          <div style={styles.emptyMessages}>
            <div style={styles.emptyMessagesIcon}>💬</div>
            <div style={styles.emptyMessagesText}>No messages yet</div>
            <div style={styles.emptyMessagesSubtext}>Start the conversation!</div>
          </div>
        ) : (
          messages.map((message) => (
            <Message 
              key={message._id} 
              message={message}
              onReply={() => setReplyTo(message)}
            />
          ))
        )}
      </div>

      <div style={styles.messageInputContainer}>
        {replyTo && (
          <div style={styles.replyBanner}>
            <div style={styles.replyBannerContent}>
              <span style={styles.replyBannerLabel}>Replying to {replyTo.authorType}:</span>
              <span style={styles.replyBannerText}>
                {replyTo.content.length > 50
                  ? replyTo.content.slice(0, 50) + "..."
                  : replyTo.content}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              style={styles.replyBannerClose}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        
        {showMentions && filteredAgents.length > 0 && (
          <div style={styles.mentionsDropdown}>
            {filteredAgents.slice(0, 5).map((agent) => (
              <button
                key={agent._id}
                onClick={() => handleMentionSelect(agent.name)}
                style={styles.mentionItem}
              >
                <span style={styles.mentionItemEmoji}>{agent.emoji || "🤖"}</span>
                <span style={styles.mentionItemName}>{agent.name}</span>
                <span style={styles.mentionItemRole}>{agent.role}</span>
              </button>
            ))}
          </div>
        )}

        <div style={styles.messageInput}>
          <textarea
            ref={inputRef}
            placeholder="Type a message... (Press Enter to send, Shift+Enter for new line, @ to mention)"
            style={styles.textarea}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            rows={1}
          />
          <button 
            style={{
              ...styles.sendButton,
              ...(isSending || !messageText.trim() ? styles.sendButtonDisabled : {}),
            }} 
            onClick={handleSendMessage}
            disabled={isSending || !messageText.trim()}
            aria-label="Send message"
          >
            {isSending ? "⏳" : "📤"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MessageProps {
  message: Doc<"messages">;
  onReply: () => void;
}

function Message({ message, onReply }: MessageProps) {
  const isAgent = message.authorType === "AGENT";
  const isSystem = message.authorType === "SYSTEM";
  const [showActions, setShowActions] = useState(false);

  // Format content with @mentions highlighted
  const formatContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} style={styles.mention}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      style={{
        ...styles.message,
        ...(isAgent && styles.messageAgent),
        ...(isSystem && styles.messageSystem),
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div style={styles.messageHeader}>
        <div style={styles.messageAuthor}>
          {isAgent ? "🤖" : isSystem ? "⚙️" : "👤"} {message.authorType}
          {message.authorUserId && (
            <span style={styles.messageAuthorId}> ({message.authorUserId})</span>
          )}
        </div>
        <div style={styles.messageHeaderRight}>
          <div style={styles.messageTime}>
            {new Date(message._creationTime).toLocaleTimeString()}
          </div>
          {showActions && (
            <button
              onClick={onReply}
              style={styles.replyButton}
              aria-label="Reply to message"
            >
              ↩️
            </button>
          )}
        </div>
      </div>
      
      {message.replyToId && (
        <div style={styles.replyIndicator}>
          ↩️ Reply to previous message
        </div>
      )}
      
      <div style={styles.messageContent}>{formatContent(message.content)}</div>
      
      {message.type && (
        <div style={styles.messageType}>{message.type}</div>
      )}
      
      {message.artifacts && message.artifacts.length > 0 && (
        <div style={styles.artifacts}>
          {message.artifacts.map((artifact, i) => (
            <div key={i} style={styles.artifact}>
              📎 {artifact.name} ({artifact.type})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    background: colors.bgPage,
  },
  sidebar: {
    width: 320,
    borderRight: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  sidebarHeader: {
    padding: "20px",
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sidebarTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: 0,
  },
  threadCount: {
    padding: "4px 10px",
    background: colors.accentBlue,
    borderRadius: 12,
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#fff",
  },
  searchBox: {
    padding: "12px",
    borderBottom: `1px solid ${colors.border}`,
    position: "relative",
  },
  searchInput: {
    width: "100%",
    padding: "8px 32px 8px 12px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
  },
  clearButton: {
    position: "absolute",
    right: 20,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: "1rem",
    padding: "4px",
  },
  threadList: {
    flex: 1,
    overflow: "auto",
    padding: "8px",
  },
  noResults: {
    padding: "32px 16px",
    textAlign: "center",
  },
  noResultsText: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    marginBottom: "4px",
  },
  noResultsSubtext: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  threadItem: {
    width: "100%",
    padding: "12px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    marginBottom: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
    textAlign: "left",
  },
  threadItemSelected: {
    borderColor: colors.accentBlue,
    background: colors.bgHover,
  },
  threadItemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "6px",
  },
  threadItemTitle: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  threadItemBadges: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  messageCountBadge: {
    padding: "2px 6px",
    background: colors.accentBlue,
    borderRadius: 10,
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "#fff",
    minWidth: 18,
    textAlign: "center",
  },
  threadItemStatus: {
    padding: "2px 8px",
    background: colors.bgHover,
    borderRadius: 4,
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  threadItemDesc: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  thread: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  threadHeader: {
    padding: "20px 24px",
    borderBottom: `1px solid ${colors.border}`,
  },
  threadTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "8px",
  },
  threadMeta: {
    display: "flex",
    gap: "12px",
  },
  threadMetaItem: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },
  messageList: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  message: {
    padding: "12px 16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  messageAgent: {
    borderLeftColor: colors.accentPurple,
    borderLeftWidth: 3,
  },
  messageSystem: {
    borderLeftColor: colors.accentGreen,
    borderLeftWidth: 3,
  },
  messageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  messageAuthor: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  messageAuthorId: {
    fontSize: "0.75rem",
    fontWeight: 400,
    color: colors.textMuted,
  },
  messageHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  messageTime: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  replyButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "4px",
    opacity: 0.7,
    transition: "opacity 0.2s",
  },
  replyIndicator: {
    fontSize: "0.75rem",
    color: colors.accentBlue,
    marginBottom: "6px",
    fontStyle: "italic",
  },
  mention: {
    color: colors.accentBlue,
    fontWeight: 600,
    background: `${colors.accentBlue}20`,
    padding: "2px 4px",
    borderRadius: 3,
  },
  artifacts: {
    marginTop: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  artifact: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    padding: "4px 8px",
    background: colors.bgHover,
    borderRadius: 4,
  },
  messageContent: {
    fontSize: "0.875rem",
    color: colors.textPrimary,
    lineHeight: 1.5,
    marginBottom: "6px",
  },
  messageType: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  messageInputContainer: {
    position: "relative",
    borderTop: `1px solid ${colors.border}`,
  },
  replyBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: colors.bgHover,
    borderBottom: `1px solid ${colors.border}`,
  },
  replyBannerContent: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: 1,
  },
  replyBannerLabel: {
    fontSize: "0.75rem",
    color: colors.accentBlue,
    fontWeight: 600,
  },
  replyBannerText: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  replyBannerClose: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: "1rem",
    padding: "4px",
  },
  mentionsDropdown: {
    position: "absolute",
    bottom: "100%",
    left: 24,
    right: 24,
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.3)",
    maxHeight: 200,
    overflow: "auto",
    zIndex: 10,
  },
  mentionItem: {
    width: "100%",
    padding: "10px 12px",
    background: "none",
    border: "none",
    borderBottom: `1px solid ${colors.border}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    textAlign: "left",
    transition: "background 0.2s",
  },
  mentionItemEmoji: {
    fontSize: "1.25rem",
  },
  mentionItemName: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: colors.textPrimary,
    flex: 1,
  },
  mentionItemRole: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
  },
  messageInput: {
    padding: "16px 24px",
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textPrimary,
    fontSize: "0.875rem",
    fontFamily: "inherit",
    resize: "none",
    minHeight: 42,
    maxHeight: 120,
  },
  sendButton: {
    padding: "10px 16px",
    background: colors.accentBlue,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: "1.25rem",
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "4rem",
    marginBottom: "16px",
  },
  emptyTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "8px",
  },
  emptyText: {
    fontSize: "1rem",
    color: colors.textSecondary,
  },
  loading: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.textSecondary,
  },
  emptyMessages: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    textAlign: "center",
  },
  emptyMessagesIcon: {
    fontSize: "3rem",
    marginBottom: "12px",
    opacity: 0.5,
  },
  emptyMessagesText: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "4px",
  },
  emptyMessagesSubtext: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
  },
};
