import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareClassifyInferenceRequest } from "../governedInferenceWire.js";

const route = {
  provider: "openai", providerRoute: "openai-chat-completions", modelId: "gpt-4o-mini-2024-07-18",
  routeDigest: `sha256:${"a".repeat(64)}`, adapter: "mission-control-openai-chat-completions",
  adapterVersion: "1.0.0", endpoint: "https://api.openai.com/v1/chat/completions",
};
const request = () => ({ messages: [{ role: "user", content: "Classify this request." }], max_completion_tokens: 1024 });

describe("prepareClassifyInferenceRequest", () => {
  it("freezes the exact selected wire and hashes its UTF-8 bytes", () => {
    const prepared = prepareClassifyInferenceRequest(route, { ...request(), temperature: 0 });
    const expected = '{"model":"gpt-4o-mini-2024-07-18","messages":[{"role":"user","content":"Classify this request."}],"temperature":0,"max_completion_tokens":1024,"n":1,"stream":false,"service_tier":"default"}';
    expect(prepared).toEqual({
      serializedRequest: expected,
      requestDigest: `sha256:${createHash("sha256").update(new TextEncoder().encode(expected)).digest("hex")}`,
      payloadBytes: new TextEncoder().encode(expected).byteLength,
      maximumOutputTokens: 1024,
      temperature: 0,
    });
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it("omits optional temperature and preserves prompt whitespace", () => {
    const prepared = prepareClassifyInferenceRequest(route, {
      messages: [{ role: "user", content: "  Keep this text.\n" }], max_completion_tokens: 1,
    });
    expect(JSON.parse(prepared.serializedRequest)).toEqual({
      model: route.modelId, messages: [{ role: "user", content: "  Keep this text.\n" }],
      max_completion_tokens: 1, n: 1, stream: false, service_tier: "default",
    });
    expect(prepared.maximumOutputTokens).toBe(1);
  });

  it("serializes deterministically regardless of caller property order", () => {
    expect(prepareClassifyInferenceRequest(route, { temperature: 2, ...request() }))
      .toEqual(prepareClassifyInferenceRequest(route, { ...request(), temperature: 2 }));
  });

  it("accepts the exact UTF-8 byte ceiling and rejects a one-byte excess", () => {
    const envelope = JSON.stringify({ model: route.modelId, messages: [{ role: "user", content: "" }],
      max_completion_tokens: 1024, n: 1, stream: false, service_tier: "default" });
    const available = 256_000 - new TextEncoder().encode(envelope).byteLength;
    const content = "😀".repeat(Math.floor(available / 4)) + "a".repeat(available % 4);
    const body = { ...request(), messages: [{ role: "user", content }] };
    const prepared = prepareClassifyInferenceRequest(route, body);
    expect(prepared.payloadBytes).toBe(256_000);
    expect(prepared.serializedRequest.length).toBeLessThan(256_000);
    expect(() => prepareClassifyInferenceRequest(route, {
      ...body, messages: [{ role: "user", content: `${content}a` }],
    })).toThrow("CLASSIFY_INFERENCE_PAYLOAD_TOO_LARGE");
  });

  it("counts JSON escaping in the payload ceiling", () => {
    expect(() => prepareClassifyInferenceRequest(route, {
      ...request(), messages: [{ role: "user", content: `x${"\n".repeat(128_000)}` }],
    })).toThrow("CLASSIFY_INFERENCE_PAYLOAD_TOO_LARGE");
  });

  it.each([
    null, undefined, [], "request", {},
    { max_completion_tokens: 1, messages: [] },
    { ...request(), messages: [{ role: "user", content: "" }] },
    { ...request(), messages: [{ role: "user", content: " \n\t" }] },
    { ...request(), messages: [{ role: "system", content: "text" }] },
    { ...request(), messages: [{ role: "user", content: [{ type: "text", text: "text" }] }] },
    { ...request(), messages: [{ role: "user", content: "text", name: "extra" }] },
    { ...request(), messages: [{ role: "user", content: "one" }, { role: "user", content: "two" }] },
  ])("rejects malformed request %j", body => {
    expect(() => prepareClassifyInferenceRequest(route, body)).toThrow("CLASSIFY_INFERENCE_REQUEST_INVALID");
  });

  it.each(["model", "max_tokens", "n", "tools", "media", "batch", "tier", "cache", "stream", "service_tier", "prediction"])
    ("rejects caller-controlled %s", field => {
      expect(() => prepareClassifyInferenceRequest(route, { ...request(), [field]: undefined }))
        .toThrow("CLASSIFY_INFERENCE_REQUEST_INVALID");
    });

  it.each([0, -1, 1.5, 1025, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "1024", null, undefined])
    ("rejects invalid output ceiling %s", max_completion_tokens => {
      expect(() => prepareClassifyInferenceRequest(route, { ...request(), max_completion_tokens }))
        .toThrow("CLASSIFY_INFERENCE_REQUEST_INVALID");
    });

  it.each([-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY, "1", null])
    ("rejects invalid temperature %s", temperature => {
      expect(() => prepareClassifyInferenceRequest(route, { ...request(), temperature }))
        .toThrow("CLASSIFY_INFERENCE_REQUEST_INVALID");
    });

  it.each([
    { provider: "other" }, { providerRoute: "responses" }, { modelId: "gpt-4o-mini" },
    { endpoint: "https://example.invalid/v1/chat/completions" }, { adapter: "other" },
    { adapterVersion: "1.0.1" }, { routeDigest: "sha256:short" },
    { routeDigest: `sha256:${"A".repeat(64)}` }, { routeDigest: `sha256:${"g".repeat(64)}` },
  ])("rejects route substitution %j", substitution => {
    expect(() => prepareClassifyInferenceRequest({ ...route, ...substitution }, request()))
      .toThrow("CLASSIFY_INFERENCE_ROUTE_INVALID");
  });

  it("retains prepared bytes after caller mutation", () => {
    const body = { ...request(), temperature: 0.5 };
    const callerRoute = { ...route };
    const prepared = prepareClassifyInferenceRequest(callerRoute, body);
    const frozen = { ...prepared };
    body.messages[0].content = "Replacement content";
    body.messages.push({ role: "user", content: "Additional message" });
    body.max_completion_tokens = 999_999;
    body.temperature = 2;
    callerRoute.modelId = "replacement-model";
    expect(prepared).toEqual(frozen);
    expect(JSON.parse(prepared.serializedRequest).messages).toEqual(request().messages);
  });
});
