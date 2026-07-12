import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { EmptyState } from "./components/ui/empty-state";
import { MessageSquare, Send, Sparkles, X, Bot, User, Wrench, Reply, Loader2, Paperclip } from "lucide-react";

interface ChatViewProps {
  projectId: Id<"projects"> | null;
}

const TASK_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  DONE: "success",
  IN_PROGRESS: "info",
  REVIEW: "info",
  NEEDS_APPROVAL: "warning",
  BLOCKED: "warning",
  FAILED: "error",
};

export function ChatView({ projectId }: ChatViewProps) {
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const availableTasks = tasks ?? [];
  const selectedTask = availableTasks.find((task) => task._id === selectedTaskId) ?? null;
  const activeThreads = availableTasks.filter((task) =>
    ["IN_PROGRESS", "REVIEW", "NEEDS_APPROVAL"].includes(task.status)
  ).length;
  const blockedThreads = availableTasks.filter((task) => task.status === "BLOCKED").length;
  const inboxThreads = availableTasks.filter((task) => task.status === "INBOX").length;

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
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <div className="h-[620px] animate-pulse rounded-xl border border-line bg-surface-2" />
        </div>
      </main>
    );
  }

  if (availableTasks.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Chat"
          description="Task threads and agent conversations. Create a task from the Mission Queue to start."
          icon={<MessageSquare size={16} strokeWidth={1.7} />}
        />
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          <EmptyState
            icon={MessageSquare}
            title="No task threads yet"
            description="Create a task from the Mission Queue in Operations to start a thread and collaborate with agents in a traceable, reviewable way."
            className="min-h-[560px]"
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-app">
      <PageHeader
        title="Chat"
        description={`${availableTasks.length} task threads · Pick one to view or continue the conversation`}
        icon={<MessageSquare size={16} strokeWidth={1.7} />}
        status={
          <StatusBadge tone="neutral">{availableTasks.length} threads</StatusBadge>
        }
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 min-h-0 flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Open threads"
              value={availableTasks.length}
              detail="Operator-visible conversations across the mission queue"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Active lanes"
              value={activeThreads}
              detail="Threads tied to active work or review states"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Inbox pressure"
              value={inboxThreads}
              detail="New work still waiting for assignment or first response"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Blocked threads"
              value={blockedThreads}
              detail="Conversations attached to work that cannot move forward yet"
            />
          </Card>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_300px]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-ink">Thread registry</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-muted">Open task conversations</div>
                </div>
                <StatusBadge tone="neutral">{availableTasks.length}</StatusBadge>
              </div>
            </div>
            <div className="relative border-b border-line p-3">
              <input
                type="text"
                placeholder="Search task threads..."
                aria-label="Search task threads"
                className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 pr-9 text-[13.5px] text-ink placeholder:text-ink-muted"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-5 top-1/2 -translate-y-1/2 border-none bg-transparent p-1 text-ink-muted transition-colors duration-150 hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3">
              {filteredTasks.map((task) => (
                <ThreadItem
                  key={task._id}
                  task={task}
                  isSelected={task._id === selectedTaskId}
                  onSelect={() => setSelectedTaskId(task._id)}
                />
              ))}
              {filteredTasks.length === 0 && searchQuery && (
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-8 text-center">
                  <div className="mb-1 text-[13.5px] text-ink-secondary">No tasks found</div>
                  <div className="text-[12.5px] text-ink-muted">Try a different search</div>
                </div>
              )}
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            {selectedTaskId ? (
              <ThreadView taskId={selectedTaskId} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
                <MessageSquare className="mb-4 h-7 w-7 text-ink-muted" strokeWidth={1.6} />
                <div className="mb-2 text-[15px] font-semibold text-ink">Select a thread</div>
                <div className="text-[13.5px] text-ink-secondary">
                  Choose a task from the registry to view its conversation.
                </div>
              </div>
            )}
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="text-[15px] font-semibold text-ink">Operator cues</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">
                {selectedTask ? "Selected thread posture" : "How to use this surface well"}
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
              {selectedTask ? (
                <>
                  <div className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="text-[12.5px] font-medium text-ink-secondary">Thread context</div>
                    <div className="mt-2 text-[13.5px] font-semibold text-ink">{selectedTask.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge tone={TASK_STATUS_TONE[selectedTask.status] ?? "neutral"}>
                        {selectedTask.status}
                      </StatusBadge>
                      <StatusBadge tone="neutral">Priority {selectedTask.priority}</StatusBadge>
                      <StatusBadge tone="neutral">{selectedTask.type}</StatusBadge>
                    </div>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-ink-secondary">
                      {selectedTask.description?.trim() || "No task description is attached yet. Add operator framing so agents know what matters and what is out of scope."}
                    </p>
                  </div>

                  <div className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="text-[12.5px] font-medium text-ink-secondary">Response discipline</div>
                    <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-secondary">
                      <p>Lead with the decision or blocker first. Agents should not have to infer the action from a paragraph.</p>
                      <p>Use mentions only when routing matters. Thread noise makes later review harder.</p>
                      <p>Keep approval asks explicit: what changed, what is blocked, what decision is needed.</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="text-[12.5px] font-medium text-ink-secondary">Start with the queue</div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-secondary">
                      Use this page for ongoing task dialogue, not brainstorming. Every thread should map back to real work that can be reviewed later.
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-surface-2 p-4">
                    <div className="text-[12.5px] font-medium text-ink-secondary">Good thread hygiene</div>
                    <ul className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-secondary">
                      <li>State the desired outcome before asking for implementation.</li>
                      <li>Move blockers into approvals or operations instead of letting them linger in chat.</li>
                      <li>Keep one conversation per task so audit trails stay trustworthy.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
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
        "mb-2 w-full cursor-pointer rounded-xl border p-3.5 text-left transition-colors duration-150",
        isSelected
          ? "border-line-strong bg-surface-2"
          : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2"
      )}
      aria-label={`Thread: ${task.title}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex-1 truncate text-[13.5px] font-semibold text-ink">
          {task.title}
        </div>
        <div className="flex items-center gap-1.5">
          {hasMessages && (
            <StatusBadge tone="neutral">{messageCount}</StatusBadge>
          )}
          <StatusBadge tone={TASK_STATUS_TONE[task.status] ?? "neutral"}>
            {task.status}
          </StatusBadge>
        </div>
      </div>
      {task.description && (
        <div className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
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
      <div className="flex flex-1 items-center justify-center text-[13.5px] text-ink-muted">
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
      <div className="border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-semibold text-ink">{task.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone={TASK_STATUS_TONE[task.status] ?? "neutral"}>
                {task.status}
              </StatusBadge>
              <StatusBadge tone="neutral">{task.type}</StatusBadge>
            </div>
          </div>
          <Button variant="outline" size="sm">
            <Sparkles className="h-3.5 w-3.5" />
            Prompt assist
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-6" ref={messageListRef}>
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Start the conversation with a clear operator instruction."
            className="flex-1 bg-surface-2"
          />
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

      <div className="relative border-t border-line">
        {replyTo && (
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[12.5px] font-medium text-ink">
                Replying to {replyTo.authorType}:
              </span>
              <span className="truncate text-[12.5px] text-ink-muted">
                {replyTo.content.length > 50
                  ? replyTo.content.slice(0, 50) + "..."
                  : replyTo.content}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="border-none bg-transparent p-1 text-ink-muted transition-colors duration-150 hover:text-ink"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {showMentions && filteredAgents.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 z-10 max-h-[200px] overflow-auto rounded-xl border border-line bg-surface-3 shadow-[var(--shadow-elevation-2)]">
            {filteredAgents.slice(0, 5).map((agent) => (
              <button
                key={agent._id}
                onClick={() => handleMentionSelect(agent.name)}
                className="flex w-full items-center gap-2 border-b border-line bg-transparent px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-2"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-secondary">
                  <Bot className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="flex-1 text-[13.5px] font-medium text-ink">{agent.name}</span>
                <span className="text-[12.5px] text-ink-muted">{agent.role}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3 px-6 py-4">
          <textarea
            ref={inputRef}
            placeholder="Type a message... (Press Enter to send, Shift+Enter for new line, @ to mention)"
            className="min-h-[48px] max-h-[120px] flex-1 resize-none rounded-lg border border-line bg-surface-1 px-3 py-3 font-[inherit] text-[13.5px] text-ink placeholder:text-ink-muted"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSending}
            rows={1}
          />
          <Button
            className="min-w-[52px] px-4"
            onClick={handleSendMessage}
            disabled={isSending || !messageText.trim()}
            aria-label="Send message"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
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
  const AuthorIcon = isAgent ? Bot : isSystem ? Wrench : User;

  const formatContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="rounded-sm bg-info-soft px-1 py-0.5 font-medium text-info-accent">
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
        "rounded-xl border border-line px-4 py-3.5",
        isAgent || isSystem ? "bg-surface-2" : "bg-surface-3"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13.5px] font-semibold text-ink">
          <AuthorIcon className="h-4 w-4 text-ink-muted" strokeWidth={1.75} /> {message.authorType}
          {message.authorUserId && (
            <span className="text-[12.5px] font-normal text-ink-muted">
              {" "}({message.authorUserId})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[12.5px] text-ink-muted">
            {new Date(message._creationTime).toLocaleTimeString()}
          </div>
          {showActions && (
            <button
              onClick={onReply}
              className="border-none bg-transparent p-1 text-ink-muted transition-colors duration-150 hover:text-ink"
              aria-label="Reply to message"
            >
              <Reply className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {message.replyToId && (
        <div className="mb-1.5 text-[12.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Reply className="h-3.5 w-3.5" />
            Reply to previous message
          </span>
        </div>
      )}

      <div className="mb-1.5 text-[13.5px] leading-relaxed text-ink">
        {formatContent(message.content)}
      </div>

      {message.type && (
        <div className="text-[12.5px] text-ink-muted">{message.type}</div>
      )}

      {message.artifacts && message.artifacts.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {message.artifacts.map((artifact, i) => (
            <div key={i} className="rounded-md border border-line bg-surface-1 px-2 py-1 text-[12px] text-ink-secondary">
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {artifact.name} ({artifact.type})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
