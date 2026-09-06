import { createHash } from "node:crypto";
import { z } from "zod";
import type { ExactInferenceRoute } from "@mission-control/shared";

const selectedRoute = z.object({
  provider: z.literal("openai"),
  providerRoute: z.literal("openai-chat-completions"),
  modelId: z.literal("gpt-4o-mini-2024-07-18"),
  routeDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapter: z.literal("mission-control-openai-chat-completions"),
  adapterVersion: z.literal("1.0.0"),
  endpoint: z.literal("https://api.openai.com/v1/chat/completions"),
}).strict();

const classifyRequest = z.object({
  messages: z.tuple([z.object({
    role: z.literal("user"),
    content: z.string().refine(value => value.trim().length > 0),
  }).strict()]),
  temperature: z.number().finite().min(0).max(2).optional(),
  max_completion_tokens: z.number().int().min(1).max(1024),
}).strict();

export interface PreparedClassifyInferenceRequest {
  readonly serializedRequest: string;
  readonly requestDigest: string;
  readonly payloadBytes: number;
  readonly maximumOutputTokens: number;
  readonly temperature?: number;
}

/** Freeze exact wire bytes; this establishes neither token counts nor send authority. */
export function prepareClassifyInferenceRequest(
  route: ExactInferenceRoute,
  body: unknown,
): PreparedClassifyInferenceRequest {
  const parsedRoute = selectedRoute.safeParse(route);
  if (!parsedRoute.success) throw new Error("CLASSIFY_INFERENCE_ROUTE_INVALID");
  const parsedBody = classifyRequest.safeParse(body);
  if (!parsedBody.success) throw new Error("CLASSIFY_INFERENCE_REQUEST_INVALID");
  const request = parsedBody.data;
  const serializedRequest = JSON.stringify({
    model: parsedRoute.data.modelId,
    messages: [{ role: "user", content: request.messages[0].content }],
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    max_completion_tokens: request.max_completion_tokens,
    n: 1,
    stream: false,
    service_tier: "default",
  });
  const payloadBytes = Buffer.byteLength(serializedRequest, "utf8");
  if (payloadBytes > 256_000) throw new Error("CLASSIFY_INFERENCE_PAYLOAD_TOO_LARGE");
  return Object.freeze({
    serializedRequest,
    requestDigest: `sha256:${createHash("sha256").update(serializedRequest, "utf8").digest("hex")}`,
    payloadBytes,
    maximumOutputTokens: request.max_completion_tokens,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  });
}
