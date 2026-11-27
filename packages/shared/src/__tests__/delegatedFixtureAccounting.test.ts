import { describe, expect, it } from "vitest";
import { fixtureExposure, reserveFixtureAllowance, transitionFixtureAllowance, type DelegatedFixtureBudget } from "../delegatedFixtureAccounting.js";
const digest = "sha256:" + "a".repeat(64);
const initial = (): DelegatedFixtureBudget => ({ mode: "FIXTURE_ONLY", ceilingMicrousd: 100, holds: [] });
const hold = { id: "trial", digest, kind: "DELEGATED" as const, maximumMicrousd: 80, expiresAt: 1000 };
describe("delegated fixture accounting", () => {
  it("shares one ceiling across native and delegated reservations", () => {
    const b = reserveFixtureAllowance(initial(), hold, 0);
    expect(() => reserveFixtureAllowance(b, { ...hold, id: "native", kind: "NATIVE", maximumMicrousd: 21 }, 0)).toThrow("BUDGET_EXHAUSTED");
    expect(fixtureExposure(reserveFixtureAllowance(b, { ...hold, id: "native", kind: "NATIVE", maximumMicrousd: 20 }, 0))).toBe(100);
  });
  it("returns exact duplicate reservations and rejects changed content", () => {
    const b = reserveFixtureAllowance(initial(), hold, 0);
    expect(reserveFixtureAllowance(b, hold, 0).holds).toHaveLength(1);
    expect(() => reserveFixtureAllowance(b, { ...hold, maximumMicrousd: 1 }, 0)).toThrow("RESERVATION_CONFLICT");
  });
  it.each(["CANCEL", "EXPIRE"] as const)("releases an unsent reservation on %s", type => {
    const b = reserveFixtureAllowance(initial(), hold, 0);
    expect(fixtureExposure(transitionFixtureAllowance(b, hold.id, { type, now: 1000 }))).toBe(0);
  });
  it.each(["CANCEL", "EXPIRE"] as const)("preserves UNKNOWN on %s and restart", type => {
    const b = transitionFixtureAllowance(reserveFixtureAllowance(initial(), hold, 0), hold.id, { type: "SEND", now: 0 });
    const restarted = JSON.parse(JSON.stringify(b));
    expect(fixtureExposure(transitionFixtureAllowance(restarted, hold.id, { type, now: 2000 }))).toBe(80);
    expect(() => transitionFixtureAllowance(restarted, hold.id, { type: "SEND", now: 1 })).toThrow("SEND_DENIED");
  });
  it("settles once from authoritative reconciliation and rejects conflicting duplicates", () => {
    const b = transitionFixtureAllowance(reserveFixtureAllowance(initial(), hold, 0), hold.id, { type: "SEND", now: 0 });
    const event = { type: "RECONCILE" as const, actualMicrousd: 30, settlementDigest: digest, cleanupConfirmed: true as const };
    const settled = transitionFixtureAllowance(b, hold.id, event);
    expect(fixtureExposure(settled)).toBe(30);
    expect(fixtureExposure(transitionFixtureAllowance(settled, hold.id, event))).toBe(30);
    expect(() => transitionFixtureAllowance(settled, hold.id, { ...event, actualMicrousd: 29 })).toThrow("SETTLEMENT_CONFLICT");
    expect(() => transitionFixtureAllowance(b, hold.id, { ...event, actualMicrousd: 81 })).toThrow("SETTLEMENT_DENIED");
  });
  it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe money %s", maximumMicrousd => {
    expect(() => reserveFixtureAllowance(initial(), { ...hold, maximumMicrousd }, 0)).toThrow();
  });
  it("expiry cannot grant another send", () => {
    const b = reserveFixtureAllowance(initial(), hold, 0);
    expect(() => transitionFixtureAllowance(b, hold.id, { type: "SEND", now: 1000 })).toThrow();
    expect(() => reserveFixtureAllowance(initial(), hold, 1000)).toThrow();
  });
});
