/**
 * Live Agent Chat (OpenClaw Studio parity - Phase 2).
 * Connect to Gateway via WS proxy, select an agent, send messages and show transcript.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader } from "./components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "./Toast";
import {
  GatewayClient,
  getGatewayWsUrl,
  type GatewayConnectionState,
  type GatewayFrame,
} from "@/lib/gatewayClient";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { Loader2, Send, MessageSquare, AlertCircle } from "lucide-react";

interface GatewayStatus {
  configured: boolean;
  urlConfigured: boolean;
  tokenConfigured: boolean;
}

export function LiveAgentChatView({ projectId }: { projectId: Id<"projects"> | null }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [connState, setConnState] = useState<GatewayConnectionState>("disconnected");
  const [client, setClient] = useState<GatewayClient | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name?: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const clientRef = useRef<GatewayClient | null>(null);

  const convexAgents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : "skip"
  );

  useEffect(() => {
    let cancelled = false;
    setStatusError(null);
    const base = getOrchestrationBaseUrl();
    fetch(base ? `${base}/gateway/status` : "/gateway/status")
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: GatewayStatus) => {
        if (!cancelled) {
          setStatus(data);
          setStatusError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus(null);
          setStatusError(e?.message ?? "Could not reach orchestration server.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(() => {
    const c = new GatewayClient(getGatewayWsUrl());
    c.setStateChange(setConnState);
    clientRef.current = c;
    setClient(c);
    c.connect()
      .then(async () => {
        try {
          const list = (await c.request("agents.list", {})) as unknown;
          const arr = Array.isArray(list) ? list : (list as any)?.agents ?? (list as any)?.list ?? [];
          setAgents(
            arr.map((a: any) => ({
              id: typeof a.id === "string" ? a.id : a._id ?? String(a.id ?? a.agentId ?? ""),
              name: a.name ?? a.displayName ?? "Agent",
            }))
          );
        } catch {
          setAgents(
            (convexAgents ?? []).map((a) => ({
              id: a._id,
              name: a.name,
            }))
          );
        }
      })
      .catch((e) => {
        toast(e?.message ?? "Connection failed", true);
      });
  }, [convexAgents, toast]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setClient(null);
    setAgents([]);
    setSelectedAgentId(null);
    setMessages([]);
    setConnState("disconnected");
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!client || !selectedAgentId) {
      setMessages([]);
      return;
    }
    const sessionKey = `agent::${selectedAgentId}`;
    setLoadingHistory(true);
    client
      .request("chat.history", { sessionKey, limit: 100 })
      .then((payload: unknown) => {
        const p = payload as { messages?: Array<{ role?: string; content?: string }> };
        const list = p?.messages ?? (Array.isArray(payload) ? payload : []);
        setMessages(
          list.map((m: any) => ({
            role: m.role ?? m.author ?? "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? m),
          }))
        );
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));

    const unsub = client.onEvent((frame: GatewayFrame) => {
      if (frame.event === "chat" && frame.payload) {
        const p = frame.payload as { sessionKey?: string; message?: { role?: string; content?: string } };
        if (p?.sessionKey === sessionKey && p?.message) {
          setMessages((prev) => [
            ...prev,
            {
              role: p.message.role ?? "assistant",
              content: typeof p.message.content === "string" ? p.message.content : JSON.stringify(p.message.content ?? ""),
            },
          ]);
        }
      }
    });
    return unsub;
  }, [client, selectedAgentId]);

  const sendMessage = useCallback(() => {
    if (!client || !selectedAgentId || !input.trim()) return;
    const sessionKey = `agent::${selectedAgentId}`;
    setSending(true);
    client
      .request("chat.send", {
        sessionKey,
        content: input.trim(),
        idempotencyKey: `mc-${Date.now()}`,
      })
      .then(() => {
        setMessages((prev) => [...prev, { role: "user", content: input.trim() }]);
        setInput("");
      })
      .catch((e) => toast(e?.message ?? "Send failed", true))
      .finally(() => setSending(false));
  }, [client, selectedAgentId, input, toast]);

  if (status === null && !statusError) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Live Agent Chat"
          description="Connect to the OpenClaw Gateway for streaming chat with agents."
        />
        <div className="px-6 py-8 flex flex-col items-center justify-center text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin mb-4" strokeWidth={1.75} />
          <p className="text-[13.5px]">Checking gateway configuration…</p>
        </div>
      </main>
    );
  }

  // Fictitious demo data when orchestration is unreachable (e.g. production without backend)
  const fictitiousAgents = [
    { id: "demo-support", name: "Support Bot" },
    { id: "demo-research", name: "Research Agent" },
    { id: "demo-task", name: "Task Runner" },
  ];
  const fictitiousMessages: Array<{ role: string; content: string }> = [
    { role: "user", content: "What can you help me with today?" },
    {
      role: "assistant",
      content:
        "I can help with support tickets, research summaries, and task coordination. This is demo data — connect to the orchestration server for live chat.",
    },
    { role: "user", content: "Show me a sample response." },
    {
      role: "assistant",
      content:
        "Here’s a sample: Mission Control connects to the OpenClaw Gateway for streaming chat. In production, run the orchestration server and set VITE_ORCHESTRATION_URL so this view shows real agents and messages.",
    },
  ];

  if (statusError) {
    return (
      <main className="flex-1 overflow-auto flex flex-col bg-app">
        <PageHeader
          title="Live Agent Chat"
          description="Connect to the OpenClaw Gateway for streaming chat with agents."
        />
        <div className="px-4 py-2 border-b border-line bg-warn-soft flex items-center gap-2 text-warn">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <p className="text-[12.5px]">
            Orchestration server unavailable — showing demo data. In dev, run the server at{" "}
            <code className="font-mono rounded bg-surface-2 px-1 text-ink-secondary">http://localhost:4100</code> or set{" "}
            <code className="font-mono rounded bg-surface-2 px-1 text-ink-secondary">VITE_ORCHESTRATION_URL</code>.
          </p>
        </div>
        <div className="flex-1 flex min-h-0 px-6 py-4">
          <div className="w-56 border-r border-line pr-4 flex flex-col gap-1">
            <p className="text-[11.5px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">Agents (demo)</p>
            {fictitiousAgents.map((a) => (
              <div
                key={a.id}
                className="text-left px-3 py-2 rounded-lg text-[13.5px] border border-line bg-surface-1 text-ink-secondary cursor-default"
              >
                {a.name}
              </div>
            ))}
          </div>
          <div className="flex-1 flex flex-col min-w-0 pl-4">
            <Card className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
              <div className="flex-1 overflow-auto space-y-2 mb-4">
                {fictitiousMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border border-line px-3 py-2 text-[13.5px] text-ink ${
                      m.role === "user" ? "bg-surface-3 ml-8" : "bg-surface-2 mr-8"
                    }`}
                  >
                    <span className="text-[11.5px] font-medium text-ink-muted">
                      {m.role}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-line pt-3 opacity-60">
                <input
                  type="text"
                  disabled
                  placeholder="Connect to orchestration server to send messages…"
                  className="h-9 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                />
                <Button size="sm" disabled>
                  Send
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  if (!status?.configured) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Live Agent Chat"
          description="Connect to the OpenClaw Gateway for streaming chat with agents."
        />
        <div className="px-6 py-8 flex flex-col items-center justify-center">
          <AlertCircle className="h-6 w-6 text-warn mb-4" strokeWidth={1.6} />
          <p className="text-[13.5px] text-ink-secondary text-center max-w-md">
            Configure the Gateway (Agents → Gateway) with an upstream URL and set GATEWAY_TOKEN on the orchestration server, then return here to connect.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto flex flex-col bg-app">
      <PageHeader
        title="Live Agent Chat"
        description={
          connState === "connected"
            ? "Connected to Gateway. Select an agent and chat."
            : connState === "connecting"
              ? "Connecting…"
              : "Connect to stream chat with agents."
        }
        actions={
          connState === "connected" ? (
            <Button size="sm" variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          ) : connState === "connecting" ? (
            <Button size="sm" disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Connecting
            </Button>
          ) : (
            <Button size="sm" onClick={connect}>
              Connect
            </Button>
          )
        }
      />

      <div className="flex-1 flex min-h-0 px-6 py-4">
        {connState === "connected" && (
          <>
            <div className="w-56 border-r border-line pr-4 flex flex-col gap-1">
              <p className="text-[11.5px] font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">Agents</p>
              {agents.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">No agents from Gateway. Using Convex list.</p>
              ) : null}
              {(agents.length > 0 ? agents : (convexAgents ?? []).map((a) => ({ id: String(a._id), name: a.name }))).map(
                (a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAgentId(a.id)}
                    className={`text-left px-3 py-2 rounded-lg text-[13.5px] transition-colors duration-150 ${
                      selectedAgentId === a.id
                        ? "bg-surface-2 text-ink"
                        : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    {a.name ?? a.id}
                  </button>
                )
              )}
            </div>
            <div className="flex-1 flex flex-col min-w-0 pl-4">
              {selectedAgentId ? (
                <>
                  <Card className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
                    {loadingHistory ? (
                      <div className="flex items-center justify-center flex-1 text-ink-muted text-[13.5px]">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading history…
                      </div>
                    ) : (
                      <div className="flex-1 overflow-auto space-y-2 mb-4">
                        {messages.length === 0 && (
                          <p className="text-[13.5px] text-ink-muted">No messages yet. Say something below.</p>
                        )}
                        {messages.map((m, i) => (
                          <div
                            key={i}
                            className={`rounded-lg border border-line px-3 py-2 text-[13.5px] text-ink ${
                              m.role === "user" ? "bg-surface-3 ml-8" : "bg-surface-2 mr-8"
                            }`}
                          >
                            <span className="text-[11.5px] font-medium text-ink-muted">
                              {m.role}
                            </span>
                            <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 border-t border-line pt-3">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        placeholder="Type a message…"
                        aria-label="Message"
                        className="h-9 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted"
                      />
                      <Button size="sm" onClick={sendMessage} disabled={sending || !input.trim()}>
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </Card>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-ink-muted">
                  <MessageSquare className="h-6 w-6 mb-2" strokeWidth={1.6} />
                  <p className="text-[13.5px]">Select an agent to start chatting.</p>
                </div>
              )}
            </div>
          </>
        )}
        {connState !== "connected" && connState !== "connecting" && (
          <div className="flex flex-col items-center justify-center flex-1 text-ink-muted">
            <MessageSquare className="h-6 w-6 mb-2" strokeWidth={1.6} />
            <p className="text-[13.5px]">Click Connect to attach to the Gateway.</p>
          </div>
        )}
      </div>
    </main>
  );
}
