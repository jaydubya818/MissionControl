import { z } from "zod";
import {
  bedrockRouteSchema,
  BEDROCK_MODEL,
  type BedrockRoute,
} from "./bedrockRoute.js";

const jsonObject = z.record(z.string(), z.unknown());
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }).strict(),
  z
    .object({
      type: z.literal("tool_use"),
      id: z.string().min(1),
      name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
      input: jsonObject,
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_result"),
      tool_use_id: z.string().min(1),
      content: z.string(),
      is_error: z.boolean().optional(),
    })
    .strict(),
]);
const requestSchema = z
  .object({
    system: z.string().optional(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.array(block).min(1),
          })
          .strict(),
      )
      .min(1),
    tools: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
            description: z.string(),
            input_schema: jsonObject,
          })
          .strict(),
      )
      .optional(),
    maxOutputTokens: z.number().int().positive().max(64000),
  })
  .strict();
export type BedrockRequest = z.infer<typeof requestSchema>;
export type BedrockApi = "CONVERSE" | "INVOKE_MODEL";
export interface BedrockWire {
  api: BedrockApi;
  region: "us-east-1";
  modelId: string;
  body: Record<string, unknown>;
  maxAttempts: 1;
}
export function serializeBedrock(
  route: BedrockRoute,
  api: BedrockApi,
  input: BedrockRequest,
): BedrockWire {
  const r = bedrockRouteSchema.parse(route);
  const q = requestSchema.parse(input);
  if (!["CONVERSE", "INVOKE_MODEL"].includes(api))
    throw new Error("API_NOT_APPROVED");
  const pending = new Set<string>();
  const seen = new Set<string>();
  const names = new Set(q.tools?.map((t) => t.name));
  if (names.size !== (q.tools?.length ?? 0)) throw new Error("DUPLICATE_TOOL");
  for (const m of q.messages) {
    for (const b of m.content) {
      if (b.type === "tool_use") {
        if (m.role !== "assistant" || seen.has(b.id) || !names.has(b.name))
          throw new Error("TOOL_USE_INVALID");
        seen.add(b.id);
        pending.add(b.id);
      }
      if (b.type === "tool_result") {
        if (m.role !== "user" || !pending.delete(b.tool_use_id))
          throw new Error("TOOL_RESULT_ORPHAN");
      }
    }
  }
  if (pending.size) throw new Error("TOOL_RESULT_REQUIRED");
  const body =
    api === "INVOKE_MODEL"
      ? {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: q.maxOutputTokens,
          ...(q.system ? { system: q.system } : {}),
          messages: q.messages,
          ...(q.tools?.length ? { tools: q.tools } : {}),
        }
      : {
          inferenceConfig: { maxTokens: q.maxOutputTokens },
          ...(q.system ? { system: [{ text: q.system }] } : {}),
          messages: q.messages.map((m) => ({
            role: m.role,
            content: m.content.map((b) =>
              b.type === "text"
                ? { text: b.text }
                : b.type === "tool_use"
                  ? {
                      toolUse: {
                        toolUseId: b.id,
                        name: b.name,
                        input: b.input,
                      },
                    }
                  : {
                      toolResult: {
                        toolUseId: b.tool_use_id,
                        content: [{ text: b.content }],
                        status: b.is_error ? "error" : "success",
                      },
                    },
            ),
          })),
          ...(q.tools?.length
            ? {
                toolConfig: {
                  tools: q.tools.map((t) => ({
                    toolSpec: {
                      name: t.name,
                      description: t.description,
                      inputSchema: { json: t.input_schema },
                    },
                  })),
                },
              }
            : {}),
        };
  // No passthrough fields, prompt caching, extended thinking, streaming or retry overrides.
  return {
    api,
    region: r.region,
    modelId: r.inferenceProfileArn,
    body,
    maxAttempts: 1,
  };
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export interface BedrockResult {
  content: BedrockRequest["messages"][number]["content"];
  stopReason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
  providerRequestId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheWriteInputTokens: number;
    reasoning: "DISABLED";
  };
}
/** Metadata requestId must originate from the provider response, not the body message ID. */
export function parseBedrock(
  api: BedrockApi,
  body: unknown,
  providerRequestId: unknown,
): BedrockResult {
  const id = z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/)
    .parse(providerRequestId);
  let content: BedrockResult["content"];
  let stop: BedrockResult["stopReason"];
  let usage: BedrockResult["usage"];
  if (api === "CONVERSE") {
    const b = z
      .object({
        output: z.object({
          message: z.object({
            role: z.literal("assistant"),
            content: z
              .array(
                z.union([
                  z.object({ text: z.string() }).strict(),
                  z
                    .object({
                      toolUse: z.object({
                        toolUseId: z.string().min(1),
                        name: z.string().min(1),
                        input: jsonObject,
                      }),
                    })
                    .strict(),
                ]),
              )
              .min(1),
          }),
        }),
        stopReason: z.enum([
          "end_turn",
          "max_tokens",
          "tool_use",
          "stop_sequence",
        ]),
        usage: z
          .object({
            inputTokens: count,
            outputTokens: count,
            totalTokens: count,
            cacheReadInputTokens: count.optional(),
            cacheWriteInputTokens: count.optional(),
            cacheDetails: z.array(z.unknown()).max(0).optional(),
          })
          .strict(),
      })
      .parse(body);
    content = b.output.message.content.map((c) =>
      "text" in c
        ? { type: "text", text: c.text }
        : {
            type: "tool_use",
            id: c.toolUse.toolUseId,
            name: c.toolUse.name,
            input: c.toolUse.input,
          },
    );
    stop = b.stopReason;
    usage = {
      inputTokens: b.usage.inputTokens,
      outputTokens: b.usage.outputTokens,
      cacheReadInputTokens: b.usage.cacheReadInputTokens ?? 0,
      cacheWriteInputTokens: b.usage.cacheWriteInputTokens ?? 0,
      reasoning: "DISABLED",
    };
    if (b.usage.totalTokens !== usage.inputTokens + usage.outputTokens)
      throw new Error("USAGE_TOTAL_MISMATCH");
  } else if (api === "INVOKE_MODEL") {
    const b = z
      .object({
        model: z.literal(BEDROCK_MODEL),
        role: z.literal("assistant"),
        content: z.array(block).min(1),
        stop_reason: z.enum([
          "end_turn",
          "max_tokens",
          "tool_use",
          "stop_sequence",
        ]),
        usage: z
          .object({
            input_tokens: count,
            output_tokens: count,
            cache_read_input_tokens: count.optional(),
            cache_creation_input_tokens: count.optional(),
          })
          .strict(),
      })
      .parse(body);
    if (b.content.some((c) => c.type === "tool_result"))
      throw new Error("ASSISTANT_TOOL_RESULT_INVALID");
    content = b.content;
    stop = b.stop_reason;
    usage = {
      inputTokens: b.usage.input_tokens,
      outputTokens: b.usage.output_tokens,
      cacheReadInputTokens: b.usage.cache_read_input_tokens ?? 0,
      cacheWriteInputTokens: b.usage.cache_creation_input_tokens ?? 0,
      reasoning: "DISABLED",
    };
  } else throw new Error("API_NOT_APPROVED");
  const tools = content.filter((c) => c.type === "tool_use");
  if (
    (stop === "tool_use") !== tools.length > 0 ||
    new Set(tools.map((t) => t.id)).size !== tools.length
  )
    throw new Error("TOOL_STOP_MISMATCH");
  // WO1 does not request caching. Unexpected billable dimensions retain the full hold.
  if (usage.cacheReadInputTokens || usage.cacheWriteInputTokens)
    throw new Error("UNEXPECTED_CACHE_USAGE");
  return { content, stopReason: stop, usage, providerRequestId: id };
}
export function classifyBedrockError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return {
    name,
    transient: [
      "ThrottlingException",
      "ServiceUnavailableException",
      "InternalServerException",
      "ModelTimeoutException",
      "TimeoutError",
    ].includes(name),
    automaticRetry: false as const,
    outcome: "UNKNOWN" as const,
  };
}
export interface BedrockTransport {
  readonly evidenceClass: "OFFLINE_FIXTURE" | "APPROVED_QUALIFICATION" ;
  send(
    wire: BedrockWire,
    signal: AbortSignal,
  ): Promise<{ body: unknown; requestId: unknown }>;
}
/** Compatibility fixture entry point preserves its no-live-call restriction. */
export async function invokeBedrockFixture(
  transport: BedrockTransport,
  wire: BedrockWire,
  options: { signal: AbortSignal; timeoutMs: number },
) {
  if (
    transport.evidenceClass !== "OFFLINE_FIXTURE"  )
    throw new Error("TRANSPORT_NOT_BOUNDED");
  return invokeBedrockTransport(transport, wire, options);
}
/** Explicit caller-selected transport. Qualified transport requires a separate
 * live-call grant; SDK sends never inherit fixture qualification. */
export async function invokeBedrockTransport(
  transport: BedrockTransport,
  wire: BedrockWire,
  options: { signal: AbortSignal; timeoutMs: number },
) {
  if (
    !["OFFLINE_FIXTURE", "APPROVED_QUALIFICATION"].includes(
      transport.evidenceClass,
    ) ||
    wire.maxAttempts !== 1 ||
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > 900000
  )
    throw new Error("TRANSPORT_NOT_BOUNDED");
  options.signal.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(options.signal.reason);
      reject(new Error("CANCELED_UNKNOWN"));
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("TIMEOUT_UNKNOWN"));
    }, options.timeoutMs);
  });
  try {
    const result = await Promise.race([
      transport.send(structuredClone(wire), controller.signal),
      aborted,
    ]);
    options.signal.throwIfAborted();
    return parseBedrock(wire.api, result.body, result.requestId);
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", onAbort);
  }
}
