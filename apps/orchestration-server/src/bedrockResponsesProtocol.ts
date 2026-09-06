import type { BedrockRequest, BedrockResult } from "./bedrockAdapter.js";

const object = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function requireValue(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error(code);
}
export interface BedrockResponsesTranslation {
  request: BedrockRequest;
  tools: Map<string, { name: string; custom: boolean }>;
  model: string;
}

/** Explicit local CLI protocol translation. No provider passthrough, authority,
 * credentials, previous-response lookup or implicit conversation state. */
export function responsesToBedrock(
  raw: unknown,
  maximumOutputTokens: number,
): BedrockResponsesTranslation {
  requireValue(
    object(raw) && Buffer.byteLength(JSON.stringify(raw)) <= 1024 * 1024,
    "RESPONSES_INPUT_INVALID",
  );
  const allowed = [
    "model",
    "input",
    "instructions",
    "tools",
    "tool_choice",
    "parallel_tool_calls",
    "store",
    "stream",
    "include",
    "reasoning",
    "text",
    "metadata",
    "client_metadata",
    "prompt_cache_key",
    "max_output_tokens",
  ];
  requireValue(
    Object.keys(raw).every((k) => allowed.includes(k)),
    "RESPONSES_FIELD_UNSUPPORTED",
  );
  // CLI telemetry/cache hints are local-only and never forwarded to Bedrock.
  requireValue(
    raw.client_metadata === undefined ||
      (object(raw.client_metadata) &&
        Object.values(raw.client_metadata).every((v) => typeof v === "string")),
    "RESPONSES_METADATA_INVALID",
  );
  requireValue(
    raw.model === "anthropic.claude-sonnet-4-6" && raw.store !== true,
    "RESPONSES_MODEL_OR_STORAGE_UNSUPPORTED",
  );
  requireValue(
    raw.tool_choice === undefined || raw.tool_choice === "auto",
    "RESPONSES_TOOL_CHOICE_UNSUPPORTED",
  );
  requireValue(
    raw.reasoning === undefined ||
      (object(raw.reasoning) &&
        raw.reasoning.effort === "none" &&
        Object.keys(raw.reasoning).every(
          (k) =>
            k === "effort" ||
            (k === "summary" && raw.reasoning.summary === "none"),
        )),
    "RESPONSES_REASONING_UNSUPPORTED",
  );
  // Codex asks for encrypted reasoning if present. This path emits none and
  // never forwards this optional response-inclusion hint to Bedrock.
  requireValue(
    raw.include === undefined ||
      (Array.isArray(raw.include) &&
        raw.include.every((v) => v === "reasoning.encrypted_content")),
    "RESPONSES_INCLUDE_UNSUPPORTED",
  );
  requireValue(
    raw.max_output_tokens === undefined ||
      (Number.isSafeInteger(raw.max_output_tokens) &&
        raw.max_output_tokens > 0 &&
        raw.max_output_tokens <= maximumOutputTokens),
    "RESPONSES_OUTPUT_BOUND_EXCEEDED",
  );
  const tools = new Map<string, { name: string; custom: boolean }>();
  const definitions: NonNullable<BedrockRequest["tools"]> = [];
  requireValue(
    raw.tools === undefined ||
      (Array.isArray(raw.tools) && raw.tools.length <= 64),
    "RESPONSES_TOOLS_INVALID",
  );
  for (const tool of raw.tools ?? []) {
    requireValue(
      object(tool) &&
        ["function", "custom"].includes(tool.type) &&
        typeof tool.name === "string" &&
        /^[A-Za-z0-9_-]{1,64}$/.test(tool.name),
      "RESPONSES_TOOL_UNSUPPORTED",
    );
    requireValue(!tools.has(tool.name), "RESPONSES_TOOL_DUPLICATE");
    const custom = tool.type === "custom";
    requireValue(
      custom || object(tool.parameters),
      "RESPONSES_TOOL_SCHEMA_REQUIRED",
    );
    tools.set(tool.name, { name: tool.name, custom });
    definitions.push({
      name: tool.name,
      description: String(tool.description ?? ""),
      input_schema: custom
        ? {
            type: "object",
            properties: { input: { type: "string" } },
            required: ["input"],
            additionalProperties: false,
          }
        : tool.parameters,
    });
  }
  const request: BedrockRequest = {
    messages: [],
    maxOutputTokens: raw.max_output_tokens ?? maximumOutputTokens,
  };
  const instructions: string[] = [];
  if (raw.instructions !== undefined) {
    requireValue(
      typeof raw.instructions === "string",
      "RESPONSES_INSTRUCTIONS_INVALID",
    );
    instructions.push(raw.instructions);
  }
  if (raw.text !== undefined) {
    requireValue(
      object(raw.text) && Object.keys(raw.text).every((k) => k === "format"),
      "RESPONSES_TEXT_UNSUPPORTED",
    );
    const format = raw.text.format;
    requireValue(
      object(format) && ["text", "json_schema"].includes(format.type),
      "RESPONSES_FORMAT_UNSUPPORTED",
    );
    if (format.type === "json_schema") {
      requireValue(object(format.schema), "RESPONSES_FORMAT_SCHEMA_REQUIRED");
      instructions.push(
        "Return final text as JSON satisfying this schema: " +
          JSON.stringify(format.schema),
      );
    }
  }
  const append = (
    role: "user" | "assistant",
    block: BedrockRequest["messages"][number]["content"][number],
  ) => {
    const last = request.messages.at(-1);
    if (last?.role === role) last.content.push(block);
    else request.messages.push({ role, content: [block] });
  };
  requireValue(
    typeof raw.input === "string" || Array.isArray(raw.input),
    "RESPONSES_MESSAGES_INVALID",
  );
  if (typeof raw.input === "string")
    append("user", { type: "text", text: raw.input });
  else
    for (const item of raw.input) {
      requireValue(object(item), "RESPONSES_ITEM_INVALID");
      if (item.type === "message" || item.type === undefined) {
        requireValue(
          ["user", "assistant", "system", "developer"].includes(item.role),
          "RESPONSES_ROLE_UNSUPPORTED",
        );
        const content =
          typeof item.content === "string"
            ? [{ type: "input_text", text: item.content }]
            : item.content;
        requireValue(Array.isArray(content), "RESPONSES_CONTENT_INVALID");
        for (const part of content) {
          requireValue(
            object(part) &&
              ["input_text", "output_text"].includes(part.type) &&
              typeof part.text === "string",
            "RESPONSES_CONTENT_UNSUPPORTED",
          );
          if (item.role === "system" || item.role === "developer")
            instructions.push(part.text);
          else append(item.role, { type: "text", text: part.text });
        }
      } else if (["function_call", "custom_tool_call"].includes(item.type)) {
        const tool = tools.get(item.name);
        requireValue(
          tool &&
            tool.custom === (item.type === "custom_tool_call") &&
            typeof item.call_id === "string",
          "RESPONSES_TOOL_CALL_INVALID",
        );
        const input = tool.custom
          ? { input: item.input }
          : JSON.parse(item.arguments);
        requireValue(
          object(input) && (!tool.custom || typeof input.input === "string"),
          "RESPONSES_TOOL_INPUT_INVALID",
        );
        append("assistant", {
          type: "tool_use",
          id: item.call_id,
          name: item.name,
          input,
        });
      } else if (
        ["function_call_output", "custom_tool_call_output"].includes(item.type)
      ) {
        requireValue(
          typeof item.call_id === "string" && typeof item.output === "string",
          "RESPONSES_TOOL_RESULT_INVALID",
        );
        append("user", {
          type: "tool_result",
          tool_use_id: item.call_id,
          content: item.output,
        });
      } else throw new Error("RESPONSES_ITEM_UNSUPPORTED");
    }
  if (instructions.length) request.system = instructions.join("\n\n");
  if (definitions.length) request.tools = definitions;
  return { request, tools, model: raw.model };
}

/** Local completion-event framing is not Bedrock provider streaming. */
export function bedrockToResponses(
  result: BedrockResult,
  translation: BedrockResponsesTranslation,
  requestId: string,
) {
  const output = result.content.map((block, index) => {
    if (block.type === "text")
      return {
        id: `msg_${requestId}_${index}`,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: block.text, annotations: [] }],
      };
    requireValue(block.type === "tool_use", "BEDROCK_OUTPUT_UNSUPPORTED");
    const tool = translation.tools.get(block.name);
    requireValue(tool, "BEDROCK_UNKNOWN_TOOL");
    if (tool.custom) {
      requireValue(
        typeof block.input.input === "string" &&
          Object.keys(block.input).length === 1,
        "BEDROCK_CUSTOM_TOOL_INPUT_INVALID",
      );
      return {
        id: `ct_${requestId}_${index}`,
        type: "custom_tool_call",
        call_id: block.id,
        name: tool.name,
        input: block.input.input,
        status: "completed",
      };
    }
    return {
      id: `fc_${requestId}_${index}`,
      type: "function_call",
      call_id: block.id,
      name: tool.name,
      arguments: JSON.stringify(block.input),
      status: "completed",
    };
  });
  const response = {
    id: `resp_${requestId}`,
    object: "response",
    created_at: 0,
    status: result.stopReason === "max_tokens" ? "incomplete" : "completed",
    ...(result.stopReason === "max_tokens"
      ? { incomplete_details: { reason: "max_output_tokens" } }
      : {}),
    model: translation.model,
    output,
    usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
  const events: string[] = [];
  let sequence = 0;
  const emit = (type: string, value: Record<string, unknown>) =>
    events.push(
      `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...value })}\n\n`,
    );
  emit("response.created", {
    response: { ...response, status: "in_progress", output: [] },
  });
  output.forEach((item, index) => {
    emit("response.output_item.added", {
      output_index: index,
      item: { ...item, status: "in_progress" },
    });
    emit("response.output_item.done", { output_index: index, item });
  });
  emit(
    response.status === "incomplete"
      ? "response.incomplete"
      : "response.completed",
    { response },
  );
  return { response, events: events.join("") };
}
