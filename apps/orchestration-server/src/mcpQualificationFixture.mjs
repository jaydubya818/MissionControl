// Deliberately dependency-free: the exact admitted server is this one file.
// The host-owned broker uses the MCP SDK, but the spawned fixture cannot load
// mutable packages or gain capabilities through transitive dependencies.
const QUALIFICATION_OPERATION = "read_factory_doctrine_excerpt";
const QUALIFICATION_SERVER = "mission-control-readonly-qualification-fixture";
const QUALIFICATION_SERVER_VERSION = "1.0.0";
const QUALIFICATION_PROTOCOL_VERSION = "2025-11-25";

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolResult(section) {
  const structuredContent = {
    section,
    excerpt: "Humans own intent, judgment, governance, and approval; agents own bounded execution, validation, recovery, and evidence collection.",
    classification: "PUBLIC_FIXTURE",
  };
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
}

let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffered += chunk;
  for (;;) {
    const newline = buffered.indexOf("\n");
    if (newline < 0) break;
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    if (request.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: QUALIFICATION_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: QUALIFICATION_SERVER, version: QUALIFICATION_SERVER_VERSION },
        },
      });
    } else if (request.method === "tools/call") {
      const valid = request.params?.name === QUALIFICATION_OPERATION
        && request.params?.arguments?.section === "authority-boundary"
        && Object.keys(request.params.arguments).length === 1;
      write(valid
        ? { jsonrpc: "2.0", id: request.id, result: toolResult("authority-boundary") }
        : { jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Exact admitted operation and arguments required" } });
    } else if (request.id !== undefined) {
      write({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
    }
  }
});
