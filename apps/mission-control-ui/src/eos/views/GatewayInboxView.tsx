import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { SchematicPageHead } from "@/components/schematic/SchematicPageHead";
import { cn } from "@/lib/utils";

export interface GatewayInboxViewProps {
  onOpenConversation?: (sessionId: string) => void;
}

/** Multi-channel conversation inbox (waku Gateway tab). */
export function GatewayInboxView({ onOpenConversation }: GatewayInboxViewProps): JSX.Element {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sessions = useQuery(api.analytics.gatewaySessions, {});

  return (
    <div className="pb-6">
      <SchematicPageHead title="Gateway" subtitle="channels · open in chat dock" updatedAt={Date.now()} />
      <p className="mb-4 text-[13px] text-ink-secondary">
        Conversations from web, Telegram, and agent sessions. Select one to load it in the chat dock.
      </p>
      {sessions === undefined ? (
        <div className="schematic-card animate-pulse text-ink-muted">Loading inbox…</div>
      ) : sessions.length === 0 ? (
        <div className="schematic-card text-ink-muted">
          No gateway conversations yet. Send a message in the chat dock to start.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveId(s.id);
                onOpenConversation?.(s.id);
              }}
              className={cn(
                "schematic-card w-full text-left transition-colors hover:border-schematic-accent",
                activeId === s.id && "border-schematic-accent bg-schematic-accent-soft/30"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{s.title}</span>
                <span className="schematic-gwtag">{s.channel}</span>
              </div>
              <p className="mt-1 truncate text-[13px] text-ink-secondary">{s.preview}</p>
              <p className="schematic-meta mt-1">{s.meta}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
