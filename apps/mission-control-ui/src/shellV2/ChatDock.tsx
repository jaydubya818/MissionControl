import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Factory, MessageSquare, Mic, Send, User } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { MainView } from "../TopNav";
import { cn } from "@/lib/utils";
import { ChatSessionBar } from "@/components/operator/ChatSessionBar";
import { ChatBubble } from "@/components/operator/ChatBubble";
import { TurnCard } from "@/components/operator/TurnCard";
import { StreamingTurnCard } from "@/components/operator/StreamingTurnCard";
import type { TurnCardData } from "@/components/operator/TurnCard";

type ChatMode = "operator" | "factory";

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "turn"; turn: TurnCardData }
  | { kind: "streaming"; pending: boolean; stream?: string; startedAt: number };

const FACTORY_PROMPTS = [
  { label: "What needs attention?", prompt: "Give me the current Factory status and what needs attention." },
  { label: "Review failures", prompt: "Show me the current failures and incidents." },
  { label: "Check costs", prompt: "Show me current Factory costs and remaining Fab budget." },
  { label: "Active work", prompt: "Summarize active WorkOrders." },
];

export interface ChatDockProps {
  width: number | string;
  onClose: () => void;
  projectId?: Id<"projects"> | null;
  archStatus?: ReactNode;
  onNavigate?: (view: MainView) => void;
}

/** Persistent right chat dock (waku #dock). */
export function ChatDock({
  width,
  onClose,
  projectId,
  archStatus,
  onNavigate,
}: ChatDockProps): JSX.Element {
  const [mode, setMode] = useState<ChatMode>("operator");
  const [sessionId, setSessionId] = useState("default");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [pending, setPending] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"telegraphThreads"> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const submitChatRequest = useMutation(api.missionChat.submitRequest);
  const submitFabRequest = useAction(api.fabChat.send);
  const chatThreads = useQuery(
    api.missionChat.listThreads,
    projectId ? { projectId, limit: 20 } : "skip"
  );
  const chatSession = useQuery(
    api.missionChat.getSession,
    mode === "operator" && selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );
  const fabThreads = useQuery(
    api.fabChat.listThreads,
    projectId ? { projectId, limit: 20 } : "skip"
  );
  const fabSession = useQuery(
    api.fabChat.getSession,
    mode === "factory" && selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );
  const fabBrief = useQuery(
    api.fabChat.getOperationalBrief,
    projectId ? { projectId } : "skip"
  );

  const sessions =
    mode === "operator"
      ? [
          {
            id: "new",
            title: "New work request",
            channel: "operator",
            messageCount: 0,
          },
          ...(chatThreads ?? []).map((thread) => ({
            id: thread._id,
            title: thread.title,
            channel: "operator",
            messageCount: thread.messageCount,
          })),
        ]
      : [
          {
            id: "new",
            title: "New Fab chat",
            channel: "factory",
            messageCount: 0,
          },
          ...(fabThreads ?? []).map((thread) => ({
            id: thread._id,
            title: thread.title,
            channel: "factory",
            messageCount: thread.messageCount,
          })),
        ];

  useEffect(() => {
    setSelectedThreadId(null);
    setSessionId("new");
    setMessages([]);
    setSubmitError(null);
  }, [mode, projectId]);

  const activeSession = mode === "operator" ? chatSession : fabSession;
  const renderedMessages: ChatItem[] = [
    ...(activeSession?.messages ?? []).map((message): ChatItem =>
      message.senderType === "HUMAN"
        ? { kind: "user", text: message.content }
        : {
            kind: "turn",
            turn: {
              reply: message.content,
              gate: {
                decision: "allow",
                reason: mode === "factory" ? "Fab · governed read" : "Persisted Mission Control work record",
              },
              latencyMs: Number(message.metadata?.latencyMs ?? 0),
              iterations: 1,
              cost: Number(message.metadata?.costNanoUsd ?? 0) / 1_000_000_000,
              model: String(message.metadata?.model ?? (mode === "factory" ? "live-factory-context" : "mission-control")),
            },
          }
    ),
    ...messages.filter((message) => message.kind === "streaming"),
  ];

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [renderedMessages.length, pending]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;
    setSubmitError(null);
    setInput("");
    if (mode === "factory") {
      setMessages((m) => [...m, { kind: "user", text }]);
    }
    setPending(true);
    const startedAt = Date.now();
    setMessages((m) => [
      ...m,
      { kind: "streaming", pending: true, stream: "", startedAt },
    ]);

    if (mode === "factory") {
      if (!projectId) {
        setPending(false);
        setMessages([]);
        setSubmitError("Select a workspace before asking Fab.");
        return;
      }
      void submitFabRequest({
        projectId,
        threadId: selectedThreadId ?? undefined,
        content: text,
        idempotencyKey: `fab-chat:${projectId}:${startedAt}`,
      })
        .then((result) => {
          setSelectedThreadId(result.threadId);
          setSessionId(result.threadId);
          setMessages([]);
          setPending(false);
        })
        .catch((error) => {
          setPending(false);
          setMessages((current) => current.filter((item) => item.kind !== "streaming"));
          setSubmitError(error instanceof Error ? error.message : "Fab could not answer.");
        });
      return;
    }

    if (!projectId) {
      setPending(false);
      setMessages([]);
      setSubmitError("Select a workspace before submitting work.");
      return;
    }
    void submitChatRequest({
      projectId,
      threadId: selectedThreadId ?? undefined,
      content: text,
      actorId: "operator",
      idempotencyKey: `mission-chat:${projectId}:${startedAt}`,
    })
      .then((result) => {
        setSelectedThreadId(result.threadId);
        setSessionId(result.threadId);
        setMessages([]);
        setPending(false);
      })
      .catch((error) => {
        setPending(false);
        setMessages([]);
        setSubmitError(
          error instanceof Error ? error.message : "Mission Control could not create the work."
        );
      });
  }, [
    input,
    mode,
    pending,
    projectId,
    selectedThreadId,
    submitFabRequest,
    submitChatRequest,
  ]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-l border-line bg-rail"
      style={{ width }}
      aria-label="Chat dock"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <MessageSquare size={14} className="text-ink-muted" aria-hidden />
        <span className="text-[13px] font-semibold text-ink">Chat</span>
        {archStatus ? (
          <span className="schematic-arch-status ml-1 truncate">{archStatus}</span>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-ink-muted hover:text-ink"
          title="Collapse chat"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setMode("operator")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium",
            mode === "operator" ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
          )}
        >
          <User size={12} aria-hidden />
          Operator
        </button>
        <button
          type="button"
          onClick={() => setMode("factory")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium",
            mode === "factory" ? "bg-surface-2 text-registry-accent" : "text-ink-muted hover:text-ink"
          )}
        >
          <Factory size={12} aria-hidden />
          Fab
        </button>
      </div>

      <ChatSessionBar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewChat={() => {
          setSessionId(mode === "operator" ? "new" : `session-${Date.now()}`);
          setSelectedThreadId(null);
          setMessages([]);
          setSubmitError(null);
        }}
        onSelectSession={(nextSessionId) => {
          setSessionId(nextSessionId);
          if (mode === "operator") {
            const thread = (chatThreads ?? []).find((candidate) => candidate._id === nextSessionId);
            setSelectedThreadId(thread?._id ?? null);
          } else {
            const thread = (fabThreads ?? []).find((candidate) => candidate._id === nextSessionId);
            setSelectedThreadId(thread?._id ?? null);
          }
        }}
        onViewAllHistory={() => {
          const first = mode === "operator" ? chatThreads?.[0] : fabThreads?.[0];
          if (first) {
            setSessionId(first._id);
            setSelectedThreadId(first._id);
          }
        }}
        modelLabel={mode === "factory" ? "fab · dual route" : "factory-router"}
      />

      {mode === "operator" && chatSession?.task && (
        <div className="shrink-0 border-b border-line bg-surface-1 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.("tasks")}
              className="truncate font-medium text-ink hover:underline"
            >
              {chatSession.task.identifier ?? chatSession.task.title}
            </button>
            <span className="rounded border border-line px-1.5 py-0.5 text-ink-secondary">
              {chatSession.task.status.replace(/_/g, " ")}
            </span>
          </div>
          {chatSession.workOrder && (
            <button
              type="button"
              onClick={() => onNavigate?.("control-work-orders")}
              className="mt-1 text-ink-muted hover:text-ink hover:underline"
            >
              WorkOrder · {chatSession.workOrder.state.replace(/_/g, " ")}
              {chatSession.workflowRun ? ` · Run ${chatSession.workflowRun.status}` : ""}
            </button>
          )}
        </div>
      )}

      {mode === "factory" ? (
        <div className="shrink-0 border-b border-line px-3 py-2">
          {fabBrief ? (
            <div className={cn("mb-2 rounded-lg border px-2.5 py-2 text-[11px]", fabBrief.status === "ATTENTION" ? "border-warning/40 bg-warning/5" : "border-success/30 bg-success/5")}>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                {fabBrief.status === "ATTENTION" ? <AlertTriangle size={12} className="text-warning" aria-hidden /> : <Factory size={12} className="text-success" aria-hidden />}
                {fabBrief.status === "ATTENTION" ? "Fab found items needing attention" : "Factory signals are stable"}
              </div>
              <div className="mt-1 text-ink-muted">{fabBrief.criticalAlerts} critical · {fabBrief.openIncidents} incidents · {fabBrief.failedTraces} failed traces · {fabBrief.openFixProposals} fix proposals · ${fabBrief.actualChatCostUsd.toFixed(6)} chat</div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {FACTORY_PROMPTS.map((p) => (
              <button key={p.label} type="button" onClick={() => setInput(p.prompt)} className="rounded-full border border-line bg-surface-1 px-2.5 py-1 text-[10px] text-ink-secondary hover:border-registry-accent/40 hover:text-ink">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={logRef} className="schematic-chatlog min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {renderedMessages.length === 0 ? (
          <p className="px-0.5 py-2 text-[13px] text-ink-muted">
            {mode === "factory"
              ? "Ask Fab about Factory health, failures, traces, costs, active work, architecture, QA, design, or your next software requirement."
              : "Message Mission Control from any tab. Open Overview to watch factory flow, or Gateway for channel conversations."}
          </p>
        ) : (
          renderedMessages.map((m, idx) => {
            if (m.kind === "user") return <ChatBubble key={idx} text={m.text} />;
            if (m.kind === "streaming")
              return (
                <StreamingTurnCard
                  key={idx}
                  turn={{
                    pending: m.pending,
                    stream: m.stream,
                    startedAt: m.startedAt,
                    gate: m.stream?.includes("gate")
                      ? { decision: "skip", reason: "evaluating retrieval need" }
                      : undefined,
                  }}
                />
              );
            return <TurnCard key={idx} turn={m.turn} />;
          })
        )}
      </div>

      {submitError && (
        <div role="alert" className="shrink-0 border-t border-err/30 bg-err-soft px-3 py-2 text-xs text-err">
          {submitError}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
        <input
          id="dock-msg"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            mode === "factory"
              ? "Ask Fab about the Factory or your next requirement…"
              : "Message Mission Control…"
          }
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-2 text-[13px] text-ink outline-none focus:border-schematic-accent"
        />
        <button
          type="button"
          className="rounded-lg p-2 text-ink-muted hover:text-ink"
          title="Voice input (coming soon)"
        >
          <Mic size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending || !input.trim()}
          className={cn(
            "flex items-center gap-1 rounded-lg bg-schematic-accent px-3 py-2 text-[13px] font-semibold text-white",
            "disabled:opacity-40"
          )}
        >
          <Send size={14} aria-hidden />
          Send
        </button>
      </div>
    </aside>
  );
}
