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
  width: number;
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
  const logRef = useRef<HTMLDivElement>(null);

  const seedMetaLoop = useMutation(api.factory.metaLoop.seedDemoSuggestions);
  const factoryHealth = useQuery(
    api.factory.health.getFactoryHealth,
    projectId ? { projectId } : "skip"
  );

  const runs = useQuery(
    api.analytics.recentRunTurns,
    projectId ? { projectId, limit: 20 } : { limit: 20 }
  );

  const sessions = [
    {
      id: "default",
      title: mode === "factory" ? "Factory Agent" : "Operator session",
      channel: mode,
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
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, pending]);

  const factoryReply = useCallback(
    async (text: string, startedAt: number) => {
      const lower = text.toLowerCase();
      if (lower.includes("meta loop") || lower.includes("suggestion")) {
        await seedMetaLoop({ projectId: projectId ?? undefined });
        onNavigate?.("harness-meta-loop");
        return {
          reply: "Seeded meta loop inbox with observed failure patterns. Opening meta loop.",
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
    [factoryHealth?.maturityStage, onNavigate, projectId, seedMetaLoop]
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setMessages((m) => [...m, { kind: "user", text }]);
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
      void factoryReply(text, startedAt).then(({ reply, gate }) => {
        finish({
          reply,
          gate,
          latencyMs: Date.now() - startedAt,
          iterations: 1,
          cost: 0.004,
          model: "factory-agent-router",
        });
      });
      return;
    }

    const words = [
      "Routing through dispatch gate…",
      "Memory retrieval skipped (low relevance).",
      "Checking factory health before reply.",
    ];
    let i = 0;
    const interval = window.setInterval(() => {
      if (i >= words.length) {
        window.clearInterval(interval);
        finish({
          reply: `Acknowledged: "${text}". Mission Control is monitoring ${projectId ? "this project" : "all projects"} — check Command Center for live factory status.`,
          gate: { decision: "skip", reason: "operator chat — no memory retrieval needed" },
          latencyMs: Date.now() - startedAt,
          iterations: 1,
          cost: 0.002,
          model: "orchestration-router",
        });
        return;
      }
      const chunk = words[i];
      i += 1;
      setMessages((m) =>
        m.map((x) =>
          x.kind === "streaming"
            ? { ...x, stream: [x.stream, chunk].filter(Boolean).join("\n") }
            : x
        )
      );
    }, 400);
  }, [factoryReply, input, mode, pending, projectId]);

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
          setSessionId(`session-${Date.now()}`);
          setMessages([]);
        }}
        onSelectSession={setSessionId}
        onViewAllHistory={() => setSessionId("__all__")}
        modelLabel={mode === "factory" ? "factory-agent" : "factory-router"}
      />

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
        {messages.length === 0 ? (
          <p className="px-0.5 py-2 text-[13px] text-ink-muted">
            {mode === "factory"
              ? "Factory Agent routes harness work: code review setup, PR sync, meta loop, and registry analyze."
              : "Message Mission Control from any tab. Open Overview to watch factory flow, or Gateway for channel conversations."}
          </p>
        ) : (
          messages.map((m, idx) => {
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
