import { describe, expect, it, vi } from "vitest";
import { BedrockInferenceBridge } from "../bedrockInferenceBridge.js";
import { bridgeFixture } from "./fixtures/bedrockBridgeFixture.js";

const request = { messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "private fixture" }] }], maxOutputTokens: 20 };
describe("accounting capture boundary", () => {
  it("denies a new request before reservation/send when durable storage is unavailable", async () => {
    const f = bridgeFixture();
    const reserve = vi.spyOn(f.authority, "reserve");
    const accounting = { prepare: vi.fn().mockRejectedValue(new Error("ACCOUNTING_CAPACITY_EXHAUSTED")) };
    const bridge = new (BedrockInferenceBridge as any)(f.binding, f.authority, f.transport, Date.now, accounting);
    await expect(bridge.infer("request", request, new AbortController().signal)).rejects.toThrow("ACCOUNTING_CAPACITY_EXHAUSTED");
    expect(reserve).not.toHaveBeenCalled();
    expect(f.sends).toBe(0);
  });
  it("captures known usage before settlement and preserves a durable failure reference", async () => {
    const f = bridgeFixture();
    const events: string[] = [];
    const reference = { journalId: "fixture-journal", slot: "0000", observationDigest: `sha256:${"a".repeat(64)}`, state: "PENDING" };
    const accounting = {
      prepare: vi.fn(async () => { events.push("prepare"); return {}; }),
      capture: vi.fn(async (_ticket: unknown, payload: unknown) => { events.push("capture"); expect(payload).toMatchObject({ usage: { classification: "ACTUAL", inputTokens: 10 } }); return reference; }),
      deliver: vi.fn(async () => { events.push("settle"); throw new Error("offline accounting"); }),
    };
    const bridge = new (BedrockInferenceBridge as any)(f.binding, f.authority, f.transport, Date.now, accounting);
    const error = await bridge.infer("request", request, new AbortController().signal).catch((e: unknown) => e);
    expect(events).toEqual(["prepare", "capture", "settle"]);
    expect(error).toMatchObject({ accountingReference: reference, settlementPayload: { usage: { expectedReceiptRevision: 0 } } });
    expect(f.sends).toBe(1);
  });
  it("reports capture failure without inventing durability or dropping known usage", async () => {
    const f = bridgeFixture(), settle = vi.spyOn(f.authority, "settle");
    const accounting = { prepare: vi.fn().mockResolvedValue({}), capture: vi.fn().mockRejectedValue(new Error("file sync failed")), deliver: vi.fn() };
    const bridge = new (BedrockInferenceBridge as any)(f.binding, f.authority, f.transport, Date.now, accounting);
    const error = await bridge.infer("request", request, new AbortController().signal).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: "ACCOUNTING_CAPTURE_FAILED", accountingReference: undefined,
      settlementPayload: { usage: { inputTokens: 10, outputTokens: 5, classification: "ACTUAL" } } });
    expect(settle).toHaveBeenCalledTimes(1); expect(accounting.deliver).not.toHaveBeenCalled(); expect(f.sends).toBe(1);
  });
  it("distinguishes an acknowledged accounting incident from a pending delivery without releasing output", async () => {
    const f = bridgeFixture();
    const reference = { journalId: "fixture-journal", slot: "0000", observationDigest: `sha256:${"a".repeat(64)}`, state: "PENDING" };
    const accounting = { prepare: vi.fn().mockResolvedValue({}), capture: vi.fn().mockResolvedValue(reference), deliver: vi.fn().mockResolvedValue({ duplicate: false, incident: true }) };
    const bridge = new (BedrockInferenceBridge as any)(f.binding, f.authority, f.transport, Date.now, accounting);
    const error = await bridge.infer("request", request, new AbortController().signal).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: "BEDROCK_SETTLEMENT_NOT_ACCEPTED", accountingReference: { ...reference, state: "ACKNOWLEDGED" } });
    expect(f.sends).toBe(1);
    await expect(bridge.infer("next", request, new AbortController().signal)).rejects.toThrow("REPLAY");
  });
});
