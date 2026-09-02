import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createGatewayProxy, type GatewayProxyOptions } from "../gateway-proxy.js";

type Frame = Record<string, unknown>;

interface Upstream {
  url: string;
  received: Frame[];
  sockets: WebSocket[];
  close: () => Promise<void>;
}

async function startUpstream(onFrame?: (ws: WebSocket, frame: Frame) => void): Promise<Upstream> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  const received: Frame[] = [];
  const sockets: WebSocket[] = [];
  wss.on("connection", (ws: WebSocket) => {
    sockets.push(ws);
    ws.on("message", (raw: Buffer | string) => {
      const frame = JSON.parse(String(raw)) as Frame;
      received.push(frame);
      onFrame?.(ws, frame);
    });
  });
  const { port } = wss.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    received,
    sockets,
    close: () => new Promise((resolve) => wss.close(() => resolve())),
  };
}

interface Proxy {
  wsUrl: (path?: string) => string;
  close: () => Promise<void>;
}

async function startProxy(options: GatewayProxyOptions): Promise<Proxy> {
  const server: Server = createServer((_req, res) => res.end());
  const proxy = createGatewayProxy(options);
  server.on("upgrade", (req, socket, head) => proxy.handleUpgrade(req, socket, head));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    wsUrl: (path = "/gateway/ws") => `ws://127.0.0.1:${port}${path}`,
    close: () =>
      new Promise((resolve) => {
        proxy.wss.close();
        server.close(() => resolve());
      }),
  };
}

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket): Promise<Frame> {
  return new Promise((resolve) => ws.once("message", (raw: Buffer | string) => resolve(JSON.parse(String(raw)))));
}

function closed(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) =>
    ws.once("close", (code: number, reason: Buffer) => resolve({ code, reason: reason.toString() }))
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const connectFrame = (params: Frame = {}) => ({ type: "req", id: "connect-1", method: "connect", params });

describe("gateway proxy", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  async function setup(settings: { url: string; token: string }, onFrame?: (ws: WebSocket, frame: Frame) => void) {
    const upstream = await startUpstream(onFrame);
    cleanups.push(upstream.close);
    const proxy = await startProxy({
      loadUpstreamSettings: async () => ({ url: settings.url || upstream.url, token: settings.token }),
    });
    cleanups.push(proxy.close);
    return { upstream, proxy };
  }

  it("refuses upgrades on any path other than /gateway/ws", async () => {
    const { proxy } = await setup({ url: "", token: "server-token" });
    await expect(open(proxy.wsUrl("/other"))).rejects.toThrow();
  });

  it("does not require any credential on the upgrade itself", async () => {
    // The HTTP auth middleware never sees upgrade requests; the only gate is the path.
    const { proxy } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("closes with 1003 when the first frame is not JSON", async () => {
    const { proxy } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    const done = closed(ws);
    ws.send("not json");
    expect(await done).toEqual({ code: 1003, reason: "invalid json" });
  });

  it("closes with 1008 when the first frame is not a connect request", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    const done = closed(ws);
    ws.send(JSON.stringify({ type: "req", id: "x", method: "agents.list" }));
    expect(await done).toEqual({ code: 1008, reason: "connect required" });
    expect(upstream.sockets).toHaveLength(0);
  });

  it("closes with 1008 when the connect request has no id", async () => {
    const { proxy } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    const done = closed(ws);
    ws.send(JSON.stringify({ type: "req", method: "connect" }));
    expect(await done).toEqual({ code: 1008, reason: "connect id required" });
  });

  it("injects the server-side token into a connect frame that carries no auth", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    ws.send(JSON.stringify(connectFrame({})));
    await waitFor(() => upstream.received.length === 1);
    expect(upstream.received[0]).toEqual({
      type: "req",
      id: "connect-1",
      method: "connect",
      params: { auth: { token: "server-token" } },
    });
    ws.close();
  });

  it("forwards a connect frame verbatim when the browser supplies its own token", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    const frame = connectFrame({ auth: { token: "browser-token" }, client: "mc" });
    ws.send(JSON.stringify(frame));
    await waitFor(() => upstream.received.length === 1);
    expect(upstream.received[0]).toEqual(frame);
    ws.close();
  });

  it("treats a browser password as sufficient auth and does not inject the token", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    const frame = connectFrame({ auth: { password: "hunter2" } });
    ws.send(JSON.stringify(frame));
    await waitFor(() => upstream.received.length === 1);
    expect(upstream.received[0]).toEqual(frame);
    ws.close();
  });

  it("ignores whitespace-only browser tokens and injects the server token instead", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" });
    const ws = await open(proxy.wsUrl());
    ws.send(JSON.stringify(connectFrame({ auth: { token: "   " } })));
    await waitFor(() => upstream.received.length === 1);
    expect((upstream.received[0].params as Frame).auth).toEqual({ token: "server-token" });
    ws.close();
  });

  it("answers the connect request with studio.gateway_token_missing when neither side has a token", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "" });
    const ws = await open(proxy.wsUrl());
    const reply = nextMessage(ws);
    const done = closed(ws);
    ws.send(JSON.stringify(connectFrame({})));
    expect(await reply).toMatchObject({
      type: "res",
      id: "connect-1",
      ok: false,
      error: { code: "studio.gateway_token_missing" },
    });
    expect((await done).code).toBe(1011);
    expect(upstream.sockets).toHaveLength(0);
  });

  it("answers with studio.gateway_url_missing when no upstream is configured", async () => {
    const proxy = await startProxy({ loadUpstreamSettings: async () => ({ url: "", token: "t" }) });
    cleanups.push(proxy.close);
    const ws = await open(proxy.wsUrl());
    const reply = nextMessage(ws);
    ws.send(JSON.stringify(connectFrame({})));
    expect(await reply).toMatchObject({ ok: false, error: { code: "studio.gateway_url_missing" } });
  });

  it("answers with studio.settings_load_failed when settings cannot be loaded", async () => {
    const proxy = await startProxy({
      loadUpstreamSettings: async () => {
        throw new Error("convex down");
      },
      logError: () => {},
    });
    cleanups.push(proxy.close);
    const ws = await open(proxy.wsUrl());
    const reply = nextMessage(ws);
    ws.send(JSON.stringify(connectFrame({})));
    expect(await reply).toMatchObject({ ok: false, error: { code: "studio.settings_load_failed" } });
  });

  it("relays frames both ways once connected and mirrors an upstream close as 1012", async () => {
    const { proxy, upstream } = await setup({ url: "", token: "server-token" }, (ws, frame) => {
      if (frame.method === "connect") {
        ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload: { hello: true } }));
      } else if (frame.method === "agents.list") {
        ws.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload: [] }));
        ws.close(4000, "bye");
      }
    });
    const ws = await open(proxy.wsUrl());
    const connectReply = nextMessage(ws);
    ws.send(JSON.stringify(connectFrame({})));
    expect(await connectReply).toMatchObject({ type: "res", id: "connect-1", ok: true });

    const listReply = nextMessage(ws);
    const done = closed(ws);
    ws.send(JSON.stringify({ type: "req", id: "list-1", method: "agents.list" }));
    expect(await listReply).toMatchObject({ type: "res", id: "list-1", ok: true, payload: [] });
    expect(upstream.received.map((frame) => frame.method)).toEqual(["connect", "agents.list"]);
    expect(await done).toEqual({ code: 1012, reason: "upstream closed" });
  });

  it("reports an upstream close before the connect response as studio.upstream_closed", async () => {
    const { proxy } = await setup({ url: "", token: "server-token" }, (ws) => ws.close(4001, "rejected"));
    const ws = await open(proxy.wsUrl());
    const reply = nextMessage(ws);
    const done = closed(ws);
    ws.send(JSON.stringify(connectFrame({})));
    expect(await reply).toMatchObject({
      type: "res",
      id: "connect-1",
      ok: false,
      error: { code: "studio.upstream_closed", message: "Upstream gateway closed (4001): rejected" },
    });
    expect((await done).code).toBe(1012);
  });
});
