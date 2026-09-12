// Provider protocol fixture only: binds loopback in a network=none container.
// It cannot reach a provider, has no credentials, and does not certify billing.
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
export async function exerciseCodexRuntime() {
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    if (req.method !== "POST" || req.url !== "/responses" || ++requests > 3) {
      res.writeHead(403).end();
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks));
    const tool = requests === 1;
    const item = tool
      ? {
          id: "fc_fixture",
          type: "function_call",
          call_id: "call_fixture",
          name: "exec_command",
          arguments: JSON.stringify({
            cmd: "printf FDLC_ACTUAL_RUNTIME_OK > /tmp/runtime-marker",
            max_output_tokens: 1000,
          }),
          status: "completed",
        }
      : {
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "FDLC_OFFLINE_RUNTIME_COMPLETE",
              annotations: [],
            },
          ],
        };
    const response = {
      id: "resp_fixture_" + requests,
      object: "response",
      created_at: 1,
      status: "completed",
      model: body.model,
      output: [item],
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    let seq = 0;
    const event = (type, value) =>
      res.write(
        "event: " +
          type +
          "\ndata: " +
          JSON.stringify({ type, sequence_number: seq++, ...value }) +
          "\n\n",
      );
    event("response.created", {
      response: { ...response, status: "in_progress", output: [] },
    });
    event("response.output_item.added", {
      output_index: 0,
      item: tool
        ? { ...item, status: "in_progress", arguments: "" }
        : { ...item, status: "in_progress", content: [] },
    });
    if (tool) {
      event("response.function_call_arguments.delta", {
        item_id: item.id,
        output_index: 0,
        delta: item.arguments,
      });
      event("response.function_call_arguments.done", {
        item_id: item.id,
        output_index: 0,
        arguments: item.arguments,
      });
    } else {
      event("response.content_part.added", {
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      });
      event("response.output_text.delta", {
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: item.content[0].text,
      });
      event("response.output_text.done", {
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        text: item.content[0].text,
      });
      event("response.content_part.done", {
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: item.content[0],
      });
    }
    event("response.output_item.done", { output_index: 0, item });
    event("response.completed", { response });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const args = [
    "exec",
    "--sandbox",
    "danger-full-access",
    "--model",
    "gpt-5",
    "--json",
    "-c",
    'model_provider="fdlc-offline"',
    "-c",
    'model_providers.fdlc-offline.name="FDLC offline fixture"',
    "-c",
    `model_providers.fdlc-offline.base_url="http://127.0.0.1:${port}"`,
    "-c",
    'model_providers.fdlc-offline.wire_api="responses"',
    "-c",
    "model_providers.fdlc-offline.requires_openai_auth=false",
    "-c",
    "model_providers.fdlc-offline.supports_websockets=false",
    "Offline qualification only. Execute the provided deterministic tool instruction and finish.",
  ];
  const child = spawn("codex", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: "/tmp" },
  });
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (d) => (stdout = (stdout + d).slice(-12000)));
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
  const timer = setTimeout(() => child.kill("SIGKILL"), 25000);
  const exitCode = await new Promise((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", resolve);
  });
  clearTimeout(timer);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  let markerObserved = false;
  try {
    markerObserved =
      readFileSync("/tmp/runtime-marker", "utf8") === "FDLC_ACTUAL_RUNTIME_OK";
  } catch {}
  return {
    schema: "fdlc-codex-runtime-fixture/v1",
    providerCalls: 0,
    fixtureRequests: requests,
    exitCode,
    markerObserved,
    completed: stdout.includes("FDLC_OFFLINE_RUNTIME_COMPLETE"),
    stdout,
    stderr,
  };
}
