import { describe, expect, it } from "vitest";
import { liabilityDigest } from "../../../../convex/lib/providerLiability.js";
import { serializeBedrock, type BedrockRequest } from "../bedrockAdapter.js";
import { bedrockPreSendInputBound } from "../bedrockLiabilityBound.js";
import { bedrockRouteSchema } from "../bedrockRoute.js";
import { fixtureRoute } from "./fixtures/bedrockBridgeFixture.js";

const request = (text: string): BedrockRequest => ({
  system: "Bound the exact serialized request.",
  messages: [{ role: "user", content: [{ type: "text", text }] }],
  tools: [{
    name: "lookup",
    description: "Read one fixture",
    input_schema: { type: "object", properties: { key: { type: "string" } } },
  }],
  maxOutputTokens: 4096,
});

describe("Bedrock pre-send input liability", () => {
  it.each([
    ["ASCII", "plain request"],
    ["Unicode", "東京 café 🚀"],
    ["multibyte edge", "𠜎".repeat(128)],
  ])("reserves the full context ceiling for unsupported CountTokens: %s", (_name, text) => {
    const wire = serializeBedrock(fixtureRoute, "CONVERSE", request(text));
    const bound = bedrockPreSendInputBound(fixtureRoute, wire, 262_144);

    expect(bound).toMatchObject({
      classification: "CONSERVATIVE_UPPER_BOUND",
      countTokensCapability: "UNSUPPORTED",
      maximumInputTokens: 1_000_000,
      serializedRequestBytes: Buffer.byteLength(wire.serializedBody, "utf8"),
      derivation: "FULL_MODEL_CONTEXT_WINDOW",
    });
    const { evidenceDigest, ...snapshot } = bound;
    expect(evidenceDigest).toBe(liabilityDigest(snapshot));
  });

  it("binds system, messages, tools and the hard output cap to one exact serialization", () => {
    const wire = serializeBedrock(fixtureRoute, "CONVERSE", request("exact"));
    expect(JSON.parse(wire.serializedBody)).toEqual(wire.body);
    expect(JSON.parse(wire.serializedBody)).toMatchObject({
      system: [{ text: "Bound the exact serialized request." }],
      inferenceConfig: { maxTokens: 4096 },
      toolConfig: { tools: expect.any(Array) },
      messages: expect.any(Array),
    });
    expect(wire.payloadBytes).toBe(Buffer.byteLength(wire.serializedBody, "utf8"));
  });

  it("fails closed when capability status is unknown", () => {
    const route = bedrockRouteSchema.parse({
      ...fixtureRoute,
      capabilities: { countTokens: { ...fixtureRoute.capabilities.countTokens, status: "UNKNOWN" } },
    });
    const wire = serializeBedrock(route, "CONVERSE", request("unknown"));
    expect(() => bedrockPreSendInputBound(route, wire, 262_144)).toThrow(
      "BEDROCK_COUNTTOKENS_CAPABILITY_UNKNOWN",
    );
  });

  it("rejects fabricated provider-exact evidence on an unsupported route", () => {
    const wire = serializeBedrock(fixtureRoute, "CONVERSE", request("fake"));
    expect(() => bedrockPreSendInputBound(fixtureRoute, wire, 262_144, 10)).toThrow(
      "BEDROCK_FAKE_PROVIDER_TOKEN_EVIDENCE",
    );
  });

  it("requires a real provider count on a supported route", () => {
    const route = bedrockRouteSchema.parse({
      ...fixtureRoute,
      capabilities: { countTokens: { ...fixtureRoute.capabilities.countTokens, status: "SUPPORTED" } },
    });
    const wire = serializeBedrock(route, "CONVERSE", request("supported"));
    expect(() => bedrockPreSendInputBound(route, wire, 262_144)).toThrow();
    expect(bedrockPreSendInputBound(route, wire, 262_144, 37)).toMatchObject({
      classification: "PROVIDER_EXACT",
      maximumInputTokens: 37,
      derivation: "PROVIDER_COUNTTOKENS",
    });
  });

  it("rejects over-limit payloads and any post-serialization mutation", () => {
    const wire = serializeBedrock(fixtureRoute, "CONVERSE", request("edge"));
    expect(() => bedrockPreSendInputBound(fixtureRoute, wire, wire.payloadBytes - 1)).toThrow(
      "BEDROCK_SERIALIZED_REQUEST_NOT_BOUNDED",
    );
    const changedBody = { ...wire, body: { ...wire.body, inferenceConfig: { maxTokens: 1 } } };
    expect(() => bedrockPreSendInputBound(fixtureRoute, changedBody, 262_144)).toThrow(
      "BEDROCK_SERIALIZED_REQUEST_NOT_BOUNDED",
    );
    const changedSerialization = { ...wire, serializedBody: `${wire.serializedBody} ` };
    expect(() => bedrockPreSendInputBound(fixtureRoute, changedSerialization, 262_144)).toThrow(
      "BEDROCK_SERIALIZED_REQUEST_NOT_BOUNDED",
    );
  });
});
