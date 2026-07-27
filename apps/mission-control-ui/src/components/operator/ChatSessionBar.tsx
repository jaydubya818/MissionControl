import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TELE_KEY = "mc.chat.telemetry";

export interface ChatSession {
  id: string;
  title: string;
  channel?: string;
  messageCount?: number;
}

export interface ChatSessionBarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onViewAllHistory?: () => void;
  modelLabel?: string;
}

/** Session picker + stats toggle (waku dock sesshead). */
export function ChatSessionBar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onViewAllHistory,
  modelLabel,
}: ChatSessionBarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(TELE_KEY) !== "0";
  });

  useEffect(() => {
    document.body.classList.toggle("schematic-no-tele", !showTelemetry);
    localStorage.setItem(TELE_KEY, showTelemetry ? "1" : "0");
  }, [showTelemetry]);

  const toggleTelemetry = useCallback(() => {
    setShowTelemetry((v) => !v);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-2">
      <button type="button" className="schematic-sessbtn" onClick={onNewChat}>
        + New chat
      </button>
      <div className="relative">
        <button
          type="button"
          className="schematic-sessbtn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
        >
          History ▾
        </button>
        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="schematic-sessmenu z-30">
              {onViewAllHistory ? (
                <button
                  type="button"
                  className={cn(
                    "schematic-sessitem w-full text-left",
                    activeSessionId === "__all__" && "schematic-sessitem-active"
                  )}
                  onClick={() => {
                    onViewAllHistory();
                    setMenuOpen(false);
                  }}
                >
                  <div>
                    <b>All messages</b> — full timeline
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    every thread together, newest last
                  </div>
                </button>
              ) : null}
              {sessions.length === 0 ? (
                <div className="schematic-sessitem text-ink-muted">No past conversations yet</div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "schematic-sessitem w-full text-left",
                      s.id === activeSessionId && "schematic-sessitem-active"
                    )}
                    onClick={() => {
                      onSelectSession(s.id);
                      setMenuOpen(false);
                    }}
                  >
                    <div>
                      {s.title}
                      {s.channel ? (
                        <span className="schematic-gwtag ml-1">{s.channel}</span>
                      ) : null}
                    </div>
                    {s.messageCount != null ? (
                      <div className="text-[11px] text-ink-muted">
                        {s.messageCount} message{s.messageCount === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
      <button
        type="button"
        className={cn("schematic-sessbtn", showTelemetry && "schematic-sessbtn-on")}
        onClick={toggleTelemetry}
        title="Show/hide per-turn stats"
      >
        stats
      </button>
      {modelLabel ? (
        <span className="schematic-modelchip ml-auto truncate" title="Active model">
          {modelLabel}
        </span>
      ) : null}
    </div>
  );
}
