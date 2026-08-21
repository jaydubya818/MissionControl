import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Factory, MessageSquare, Mic, Send, User } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
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
  { label: "Set up code review", view: "harness-code-review-wizard" as MainView },
  { label: "Sync PR checks", view: "harness-change-review" as MainView },
  { label: "Open meta loop", view: "harness-meta-loop" as MainView },
  { label: "Evaluate GitHub skills", view: "skills" as MainView },
  { label: "Factory health", view: "harness-health" as MainView },
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
  const chatThreads = useQuery(
    api.missionChat.listThreads,
    projectId ? { projectId, limit: 20 } : "skip"
  );
  const chatSession = useQuery(
    api.missionChat.getSession,
    selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );
  const factoryHealth = useQuery(
    api.factory.health.getFactoryHealth,
    projectId ? { projectId } : "skip"
  );

  const runs = useQuery(
    api.analytics.recentRunTurns,
    projectId ? { projectId, limit: 20 } : { limit: 20 }
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
            id: "default",
            title: "Factory Agent",
            channel: "factory",
            messageCount: messages.length,
          },
          ...(runs ?? []).slice(0, 5).map((r) => ({
            id: r.id,
            title: r.label,
            channel: "factory",
            messageCount: r.toolCount,
          })),
        ];

  useEffect(() => {
    setSelectedThreadId(null);
    setSessionId(mode === "operator" ? "new" : "default");
    setMessages([]);
    setSubmitError(null);
  }, [mode, projectId]);

  const renderedMessages: ChatItem[] =
    mode === "operator"
      ? [
          ...(chatSession?.messages ?? []).map((message): ChatItem =>
            message.senderType === "HUMAN"
              ? { kind: "user", text: message.content }
              : {
                  kind: "turn",
                  // A persisted work record carries no measured latency, cost,
                  // iteration count or gate decision. Those fields used to be
                  // filled with 0 / 1 / "allow" / "mission-control", rendering
                  // "gate · allow · 0.0s · 1 iter · $0.00" under every historical
                  // message as though it had been measured. Omitted fields are
                  // simply not rendered by TurnCard.
                  turn: {
                    reply: message.content,
                  },
                }
          ),
          ...messages.filter((message) => message.kind === "streaming"),
        ]
      : messages;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [renderedMessages.length, pending]);

  const factoryReply = useCallback(
    async (text: string, startedAt: number) => {
      const lower = text.toLowerCase();
      if (lower.includes("meta loop") || lower.includes("suggestion")) {
        onNavigate?.("harness-meta-loop");
        return {
          reply: "Opening the evidence-backed improvement inbox. Empty means no qualifying real signals have been observed yet.",
          gate: { decision: "allow" as const, reason: "factory agent — meta loop" },
        };
      }
      if (lower.includes("code review") || lower.includes("review wizard")) {
        onNavigate?.("harness-code-review-wizard");
        return {
          reply: "Opening the factory-first code review wizard. Start with verifiers, then PR lenses.",
          gate: { decision: "allow" as const, reason: "factory agent — code review" },
        };
      }
      if (lower.includes("pr") || lower.includes("change review") || lower.includes("mutation")) {
        onNavigate?.("harness-change-review");
        return {
          reply: "Navigate to Change Review to sync PR/CI data and mutation testing reports.",
          gate: { decision: "allow" as const, reason: "factory agent — PR checks" },
        };
      }
      if (lower.includes("analyze") || lower.includes("github") || lower.includes("skill")) {
        onNavigate?.("skills");
        return {
          reply: "Open Registry → Evaluate to analyze a public GitHub repo for SKILL.md files.",
          gate: { decision: "allow" as const, reason: "factory agent — registry analyze" },
        };
      }
      if (lower.includes("health") || lower.includes("maturity")) {
        onNavigate?.("harness-health");
        const stage = factoryHealth?.maturityStage ?? "unknown";
        return {
          reply: `Factory maturity: ${stage}. Opening health dashboard for loop coverage and ledger signals.`,
          gate: { decision: "allow" as const, reason: "factory agent — health" },
        };
      }
      if (lower.includes("delegate") || lower.includes("automate")) {
        onNavigate?.("harness-launch");
        return {
          reply: "Use Launch to schedule recurring outer-loop workflows once success rate is high.",
          gate: { decision: "allow" as const, reason: "factory agent — delegation" },
        };
      }
      return {
        reply: `Factory Agent ready. Try: "sync PR checks", "set up code review", "open meta loop", or "analyze github skills". Current project: ${projectId ? "scoped" : "all projects"}.`,
        gate: { decision: "skip" as const, reason: "factory agent — general routing" },
      };
    },
    [factoryHealth?.maturityStage, onNavigate, projectId]
  );

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

    const finish = (turn: TurnCardData) => {
      setPending(false);
      setMessages((m) => {
        const withoutStream = m.filter((x) => x.kind !== "streaming");
        return [...withoutStream, { kind: "turn", turn }];
      });
    };

    if (mode === "factory") {
      void factoryReply(text, startedAt)
        .then(({ reply, gate }) => {
          // `factoryReply` is deterministic client-side keyword routing: no
          // model is invoked and nothing is billed. `cost: 0.004` and
          // `model: "factory-agent-router"` were invented and rendered in the
          // same footer that shows real model spend elsewhere. Latency is the
          // only measured value here.
          finish({
            reply,
            gate,
            latencyMs: Date.now() - startedAt,
          });
        })
        .catch((error) => {
          setPending(false);
          setMessages((current) => current.filter((item) => item.kind !== "streaming"));
          setSubmitError(error instanceof Error ? error.message : "Factory routing failed.");
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
    factoryReply,
    input,
    mode,
    pending,
    projectId,
    selectedThreadId,
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
          Factory Agent
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
          }
        }}
        onViewAllHistory={() => {
          const first = chatThreads?.[0];
          if (mode === "operator" && first) {
            setSessionId(first._id);
            setSelectedThreadId(first._id);
          }
        }}
        modelLabel={mode === "factory" ? "factory-agent" : "factory-router"}
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
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
          {FACTORY_PROMPTS.map((p) => (
            <button
              key={p.view}
              type="button"
              onClick={() => {
                onNavigate?.(p.view);
                setInput(p.label);
              }}
              className="rounded-full border border-line bg-surface-1 px-2.5 py-1 text-[10px] text-ink-secondary hover:border-registry-accent/40 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={logRef} className="schematic-chatlog min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {renderedMessages.length === 0 ? (
          <p className="px-0.5 py-2 text-[13px] text-ink-muted">
            {mode === "factory"
              ? "Factory Agent routes harness work: code review setup, PR sync, meta loop, and registry analyze."
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
              ? "Ask Factory Agent to route harness work…"
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
