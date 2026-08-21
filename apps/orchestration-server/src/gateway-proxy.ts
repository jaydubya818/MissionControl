/**
 * WebSocket proxy for OpenClaw Gateway (Studio parity).
 * Accepts browser connections at /gateway/ws and forwards to upstream Gateway,
 * injecting auth token server-side when the client does not send one.
 */

import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";

export interface GatewayProxyOptions {
  loadUpstreamSettings: () => Promise<{ url: string; token: string }>;
  allowWs?: (req: IncomingMessage) => boolean;
  log?: (msg: string) => void;
  logError?: (msg: string, err?: unknown) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const out = JSON.parse(raw);
    return isObject(out) ? out : null;
  } catch {
    return null;
  }
}

function resolvePathname(url: string | undefined): string {
  const raw = typeof url === "string" ? url : "";
  const idx = raw.indexOf("?");
  return (idx === -1 ? raw : raw.slice(0, idx)) || "/";
}

function buildErrorResponse(
  id: string,
  code: string,
  message: string
): Record<string, unknown> {
  return {
    type: "res",
    id,
    ok: false,
    error: { code, message },
  };
}

function injectAuthToken(
  params: Record<string, unknown>,
  token: string
): Record<string, unknown> {
  const next = { ...params };
  const auth = isObject(next.auth) ? { ...next.auth } : {};
  (auth as Record<string, unknown>).token = token;
  next.auth = auth;
  return next;
}

function resolveOriginForUpstream(upstreamUrl: string): string {
  const url = new URL(upstreamUrl);
  const proto = url.protocol === "wss:" ? "https:" : "http:";
  const hostname =
    url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "0.0.0.0"
      ? "localhost"
      : url.hostname;
  const host = url.port ? `${hostname}:${url.port}` : hostname;
  return `${proto}//${host}`;
}

function hasNonEmptyToken(params: unknown): boolean {
  const raw =
    params && isObject(params) && isObject((params as any).auth)
      ? (params as any).auth.token
      : "";
  return typeof raw === "string" && raw.trim().length > 0;
}

function hasNonEmptyPassword(params: unknown): boolean {
  const raw =
    params && isObject(params) && isObject((params as any).auth)
      ? (params as any).auth.password
      : "";
  return typeof raw === "string" && raw.trim().length > 0;
}

function hasBrowserAuth(parsed: Record<string, unknown>): boolean {
  const params = parsed.params;
  return hasNonEmptyToken(params) || hasNonEmptyPassword(params);
}

export function createGatewayProxy(options: GatewayProxyOptions): {
  wss: WebSocketServer;
  handleUpgrade: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => void;
} {
  const {
    loadUpstreamSettings,
    allowWs = (req) => resolvePathname(req.url) === "/gateway/ws",
    log = () => {},
    logError = (msg: string, err?: unknown) => console.error(msg, err),
  } = options;

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (browserWs: WebSocket) => {
    let upstreamWs: WebSocket | null = null;
    // Set synchronously on entering the connect branch. The message handler is
    // async and awaits `loadUpstreamSettings()` before assigning `upstreamWs`,
    // so two back-to-back connect frames would otherwise both take that branch,
    // open two authenticated upstream sockets, and leak the first.
    let upstreamConnecting = false;
    let upstreamReady = false;
    let connectRequestId: string | null = null;
    let connectResponseSent = false;
    let closed = false;

    const closeBoth = (code: number, reason: string) => {
      if (closed) return;
      closed = true;
      try {
        browserWs.close(code, reason);
      } catch {
        /* ignore */
      }
      try {
        upstreamWs?.close(code, reason);
      } catch {
        /* ignore */
      }
    };

    const sendToBrowser = (frame: Record<string, unknown>) => {
      if (browserWs.readyState !== WebSocket.OPEN) return;
      browserWs.send(JSON.stringify(frame));
    };

    const sendConnectError = (code: string, message: string) => {
      if (connectRequestId && !connectResponseSent) {
        connectResponseSent = true;
        sendToBrowser(
          buildErrorResponse(connectRequestId, code, message) as Record<string, unknown>
        );
      }
      closeBoth(1011, "connect failed");
    };

    browserWs.on("message", async (raw: Buffer | string) => {
      const parsed = safeJsonParse(String(raw ?? ""));
      if (!parsed || !isObject(parsed)) {
        closeBoth(1003, "invalid json");
        return;
      }

      if (!upstreamWs) {
        if (upstreamConnecting) {
          closeBoth(1008, "connect already in progress");
          return;
        }
        if (parsed.type !== "req" || parsed.method !== "connect") {
          closeBoth(1008, "connect required");
          return;
        }
        const id = typeof parsed.id === "string" ? parsed.id : "";
        if (!id) {
          closeBoth(1008, "connect id required");
          return;
        }
        upstreamConnecting = true;
        connectRequestId = id;
        const browserHasAuth = hasBrowserAuth(parsed);

        let upstreamUrl = "";
        let upstreamToken = "";
        try {
          const settings = await loadUpstreamSettings();
          upstreamUrl = typeof settings?.url === "string" ? settings.url.trim() : "";
          upstreamToken = typeof settings?.token === "string" ? settings.token.trim() : "";
        } catch (err) {
          logError("Failed to load upstream gateway settings.", err);
          sendConnectError(
            "studio.settings_load_failed",
            "Failed to load gateway settings."
          );
          return;
        }

        if (!upstreamUrl) {
          sendConnectError(
            "studio.gateway_url_missing",
            "Upstream gateway URL is not configured. Set it in Mission Control Gateway settings and ensure GATEWAY_TOKEN is set on the server."
          );
          return;
        }
        if (!upstreamToken && !browserHasAuth) {
          sendConnectError(
            "studio.gateway_token_missing",
            "Upstream gateway token is not configured. Set GATEWAY_TOKEN on the server."
          );
          return;
        }

        let upstreamOrigin = "";
        try {
          upstreamOrigin = resolveOriginForUpstream(upstreamUrl);
        } catch {
          sendConnectError(
            "studio.gateway_url_invalid",
            "Upstream gateway URL is invalid."
          );
          return;
        }

        upstreamWs = new WebSocket(upstreamUrl, { origin: upstreamOrigin });

        upstreamWs.on("open", () => {
          upstreamReady = true;
          if (browserHasAuth) {
            upstreamWs!.send(JSON.stringify(parsed));
          } else {
            const connectFrame = {
              ...parsed,
              params: injectAuthToken(
                (parsed.params as Record<string, unknown>) || {},
                upstreamToken
              ),
            };
            upstreamWs!.send(JSON.stringify(connectFrame));
          }
        });

        upstreamWs.on("message", (upRaw: Buffer | string) => {
          const upParsed = safeJsonParse(String(upRaw ?? ""));
          if (
            upParsed &&
            isObject(upParsed) &&
            upParsed.type === "res" &&
            typeof upParsed.id === "string" &&
            connectRequestId &&
            upParsed.id === connectRequestId
          ) {
            connectResponseSent = true;
          }
          if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.send(String(upRaw ?? ""));
          }
        });

        upstreamWs.on("close", (ev: { code?: number; reason?: string }) => {
          const reason = typeof ev?.reason === "string" ? ev.reason : "";
          if (!connectResponseSent) {
            sendToBrowser(
              buildErrorResponse(
                connectRequestId!,
                "studio.upstream_closed",
                `Upstream gateway closed (${ev.code}): ${reason}`
              ) as Record<string, unknown>
            );
          }
          closeBoth(1012, "upstream closed");
        });

        upstreamWs.on("error", (err: unknown) => {
          logError("Upstream gateway WebSocket error.", err);
          sendConnectError(
            "studio.upstream_error",
            "Failed to connect to upstream gateway WebSocket."
          );
        });

        log("gateway proxy: connected");
        return;
      }

      if (!upstreamReady || upstreamWs.readyState !== WebSocket.OPEN) {
        closeBoth(1013, "upstream not ready");
        return;
      }

      upstreamWs.send(JSON.stringify(parsed));
    });

    browserWs.on("close", () => {
      closeBoth(1000, "client closed");
    });

    browserWs.on("error", (err: unknown) => {
      logError("Browser WebSocket error.", err);
      closeBoth(1011, "client error");
    });
  });

  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!allowWs(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      wss.emit("connection", ws, req);
    });
  };

  return { wss, handleUpgrade };
}
