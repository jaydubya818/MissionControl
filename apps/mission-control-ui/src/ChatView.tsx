import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface ChatViewProps {
  projectId: Id<"projects"> | null;
}

export function ChatView({ projectId }: ChatViewProps) {
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const availableTasks = tasks ?? [];

  const filteredTasks = searchQuery
    ? availableTasks.filter((task) =>
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableTasks;

  useEffect(() => {
    if (!selectedTaskId && tasks && tasks.length > 0) {
      setSelectedTaskId(tasks[0]._id);
    }
  }, [selectedTaskId, tasks]);

  if (!tasks) {
    return (
      <main className="flex flex-1 overflow-hidden bg-background">
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading tasks...
        </div>
      </main>
    );
  }

  if (availableTasks.length === 0) {
    return (
      <main className="flex flex-1 overflow-hidden bg-background">
        <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 text-6xl">💬</div>
          <div className="mb-2 text-2xl font-semibold text-foreground">No Tasks Yet</div>
          <div className="text-base text-muted-foreground">
            Create a task to start chatting about it
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 overflow-hidden bg-background">
      <div className="flex w-80 flex-col overflow-hidden border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <h2 className="text-xl font-semibold text-foreground">Task Threads</h2>
          <div className="rounded-xl bg-primary px-2.5 py-1 text-sm font-semibold text-white">
            {availableTasks.length}
          </div>
        </div>
        <div className="relative border-b border-border p-3">
          <input
            type="text"
            placeholder="🔍 Search tasks..."
            className="w-full rounded-md border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-5 top-1/2 -translate-y-1/2 border-none bg-transparent p-1 text-base text-muted-foreground"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-2">
          {filteredTasks.map((task) => (
            <ThreadItem
              key={task._id}
              task={task}
              isSelected={task._id === selectedTaskId}
              onSelect={() => setSelectedTaskId(task._id)}
            />
          ))}
          {filteredTasks.length === 0 && searchQuery && (
            <div className="px-4 py-8 text-center">
              <div className="mb-1 text-sm text-muted-foreground">No tasks found</div>
              <div className="text-xs text-muted-foreground/70">Try a different search</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedTaskId ? (
          <ThreadView taskId={selectedTaskId} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 text-6xl">💬</div>
            <div className="mb-2 text-2xl font-semibold text-foreground">Select a task</div>
            <div className="text-base text-muted-foreground">
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
      className={cn(
        "mb-2 w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-all",
        isSelected && "border-primary bg-muted"
      )}
      aria-label={`Thread: ${task.title}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex-1 truncate text-sm font-semibold text-foreground">
          {task.title}
        </div>
        <div className="flex items-center gap-1.5">
          {hasMessages && (
            <div className="min-w-[18px] rounded-xl bg-primary px-1.5 py-0.5 text-center text-[0.7rem] font-semibold text-white">
              {messageCount}
            </div>
          )}
          <div className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {task.status}
          </div>
        </div>
      </div>
      {task.description && (
        <div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {task.description}
        </div>
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

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages?.length]);

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
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading messages...
      </div>
    );
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;

    const mentionMatches = messageText.match(/@(\w+)/g);
    const mentions = mentionMatches ? mentionMatches.map(m => m.slice(1)) : undefined;

    setIsSending(true);
    try {
      await postMessage({
        taskId,
        type: "COMMENT",
        content: messageText.trim(),
        authorType: "HUMAN",
        authorUserId: "operator",
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
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-5">
        <h2 className="mb-2 text-2xl font-semibold text-foreground">{task.title}</h2>
        <div className="flex gap-3">
          <span className="text-sm text-muted-foreground">{task.status}</span>
          <span className="text-sm text-muted-foreground">{task.type}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-6" ref={messageListRef}>
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
            <div className="mb-3 text-5xl opacity-50">💬</div>
            <div className="mb-1 text-lg font-semibold text-foreground">No messages yet</div>
            <div className="text-sm text-muted-foreground">Start the conversation!</div>
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

      <div className="relative border-t border-border">
        {replyTo && (
          <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-xs font-semibold text-primary">
                Replying to {replyTo.authorType}:
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {replyTo.content.length > 50
                  ? replyTo.content.slice(0, 50) + "..."
                  : replyTo.content}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="border-none bg-transparent p-1 text-base text-muted-foreground"
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}

        {showMentions && filteredAgents.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 z-10 max-h-[200px] overflow-auto rounded-lg border border-border bg-card shadow-lg">
            {filteredAgents.slice(0, 5).map((agent) => (
              <button
                key={agent._id}
                onClick={() => handleMentionSelect(agent.name)}
                className="flex w-full items-center gap-2 border-b border-border bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <span className="text-xl">{agent.emoji || "🤖"}</span>
                <span className="flex-1 text-sm font-semibold text-foreground">{agent.name}</span>
                <span className="text-xs text-muted-foreground">{agent.role}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3 px-6 py-4">
          <textarea
            ref={inputRef}
            placeholder="Type a message... (Press Enter to send, Shift+Enter for new line, @ to mention)"
            className="min-h-[42px] max-h-[120px] flex-1 resize-none rounded-md border border-border bg-card px-3.5 py-2.5 font-[inherit] text-sm text-foreground"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            rows={1}
          />
          <button
            className={cn(
              "flex min-w-[48px] items-center justify-center rounded-md border-none bg-primary px-4 py-2.5 text-xl text-white transition-all",
              (isSending || !messageText.trim()) && "cursor-not-allowed opacity-50"
            )}
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

  const formatContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="rounded-sm bg-primary/20 px-1 py-0.5 font-semibold text-primary">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3",
        isAgent && "border-l-[3px] border-l-blue-400",
        isSystem && "border-l-[3px] border-l-emerald-500"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
          {isAgent ? "🤖" : isSystem ? "⚙️" : "👤"} {message.authorType}
          {message.authorUserId && (
            <span className="text-xs font-normal text-muted-foreground/70">
              {" "}({message.authorUserId})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground/70">
            {new Date(message._creationTime).toLocaleTimeString()}
          </div>
          {showActions && (
            <button
              onClick={onReply}
              className="border-none bg-transparent p-1 text-base opacity-70 transition-opacity hover:opacity-100"
              aria-label="Reply to message"
            >
              ↩️
            </button>
          )}
        </div>
      </div>

      {message.replyToId && (
        <div className="mb-1.5 text-xs italic text-primary">
          ↩️ Reply to previous message
        </div>
      )}

      <div className="mb-1.5 text-sm leading-relaxed text-foreground">
        {formatContent(message.content)}
      </div>

      {message.type && (
        <div className="text-xs italic text-muted-foreground">{message.type}</div>
      )}

      {message.artifacts && message.artifacts.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {message.artifacts.map((artifact, i) => (
            <div key={i} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              📎 {artifact.name} ({artifact.type})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
