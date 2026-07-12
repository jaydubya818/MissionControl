/**
 * Gateway connection settings (OpenClaw Studio parity).
 * Configure upstream OpenClaw Gateway URL; token is set on the server (GATEWAY_TOKEN).
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "./components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";
import { useToast } from "./Toast";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface GatewayStatus {
  configured: boolean;
  urlConfigured: boolean;
  tokenConfigured: boolean;
}

export function GatewaySettingsView() {
  const { toast } = useToast();
  const conn = useQuery(api.gatewayConnection.get, {});
  const setUrl = useMutation(api.gatewayConnection.setUrl);
  const [urlInput, setUrlInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (conn?.url !== undefined) setUrlInput(conn.url ?? "");
  }, [conn?.url]);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    const base = getOrchestrationBaseUrl();
    fetch(base ? `${base}/gateway/status` : "/gateway/status")
      .then((r) => r.json())
      .then((data: GatewayStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conn?.url]);

  const handleSave = async () => {
    const url = urlInput.trim();
    if (!url) {
      toast("Enter a Gateway URL (e.g. ws://localhost:18789)", true);
      return;
    }
    setSaving(true);
    try {
      await setUrl({ url });
      toast("Gateway URL saved.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save", true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="OpenClaw Gateway"
        description="Connect Mission Control to an OpenClaw Gateway for live agent chat and streaming. URL is stored here; token is set on the server (GATEWAY_TOKEN)."
      />

      <div className="px-6 py-6 flex flex-col gap-6 max-w-2xl">
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-3">Upstream URL</h3>
          <p className="text-[12.5px] text-ink-secondary mb-3">
            WebSocket URL of the OpenClaw Gateway (e.g. <code className="bg-surface-2 px-1 rounded font-mono">ws://localhost:18789</code> or <code className="bg-surface-2 px-1 rounded font-mono">wss://gateway.example.com</code>).
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="ws://localhost:18789"
              aria-label="Gateway URL"
              className="flex-1 h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[15px] font-semibold text-ink mb-3">Connection status</h3>
          {statusLoading ? (
            <div className="flex items-center gap-2 text-[13.5px] text-ink-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </div>
          ) : status ? (
            <div className="space-y-2 text-[13.5px]">
              <div className="flex items-center gap-2">
                {status.urlConfigured ? (
                  <CheckCircle2 size={15} strokeWidth={1.7} className="text-ok shrink-0" aria-hidden />
                ) : (
                  <XCircle size={15} strokeWidth={1.7} className="text-ink-muted shrink-0" aria-hidden />
                )}
                <span className={status.urlConfigured ? "text-ink" : "text-ink-muted"}>
                  URL: {status.urlConfigured ? "Configured" : "Not set"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {status.tokenConfigured ? (
                  <CheckCircle2 size={15} strokeWidth={1.7} className="text-ok shrink-0" aria-hidden />
                ) : (
                  <XCircle size={15} strokeWidth={1.7} className="text-warn shrink-0" aria-hidden />
                )}
                <span className={status.tokenConfigured ? "text-ink" : "text-ink-muted"}>
                  Token: {status.tokenConfigured ? "Set on server" : "Not set (set GATEWAY_TOKEN on orchestration server)"}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-2">
                {status.configured ? (
                  <CheckCircle2 size={15} strokeWidth={1.7} className="text-ok shrink-0" aria-hidden />
                ) : (
                  <AlertCircle size={15} strokeWidth={1.7} className="text-warn shrink-0" aria-hidden />
                )}
                <span className={status.configured ? "text-ok" : "text-ink-muted"}>
                  {status.configured ? "Ready to connect" : "Configure URL above and set GATEWAY_TOKEN on the server to enable the proxy."}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13.5px] text-warn">
              <AlertCircle size={15} strokeWidth={1.7} className="shrink-0" aria-hidden />
              Cannot reach orchestration server. Ensure it is running at {getOrchestrationBaseUrl() || "same origin (proxied)"} and CORS allows this origin.
            </div>
          )}
        </Card>

        <Card className="p-5 border-dashed">
          <h3 className="text-[15px] font-semibold text-ink mb-2">WebSocket proxy</h3>
          <p className="text-[12.5px] text-ink-secondary">
            When configured, the browser connects to <code className="bg-surface-2 px-1 rounded font-mono">ws://localhost:4100/gateway/ws</code> (or your orchestration server). The server forwards frames to the upstream Gateway and injects the token so credentials stay server-side.
          </p>
        </Card>
      </div>
    </main>
  );
}
