export interface FixtureHold {
  id: string;
  digest: string;
  kind: "NATIVE" | "DELEGATED";
  maximumMicrousd: number;
  expiresAt: number;
  state: "RESERVED" | "UNKNOWN" | "SETTLED" | "CANCELLED";
  settledMicrousd: number;
  settlementDigest?: string;
}
export interface DelegatedFixtureBudget {
  mode: "FIXTURE_ONLY";
  ceilingMicrousd: number;
  holds: FixtureHold[];
}
export function assertMicrousd(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_MONEY");
}
export function fixtureExposure(budget: DelegatedFixtureBudget): number {
  const total = budget.holds.reduce((sum, hold) => sum + BigInt(
    hold.state === "SETTLED" ? hold.settledMicrousd : hold.state === "CANCELLED" ? 0 : hold.maximumMicrousd), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MONEY_OVERFLOW");
  return Number(total);
}
export function reserveFixtureAllowance(budget: DelegatedFixtureBudget, hold: Pick<FixtureHold,
  "id" | "digest" | "kind" | "maximumMicrousd" | "expiresAt">, now: number): DelegatedFixtureBudget {
  assertMicrousd(budget.ceilingMicrousd);
  assertMicrousd(hold.maximumMicrousd);
  const existing = budget.holds.find(item => item.id === hold.id);
  if (existing) {
    if (existing.digest !== hold.digest || existing.maximumMicrousd !== hold.maximumMicrousd
      || existing.kind !== hold.kind || existing.expiresAt !== hold.expiresAt) throw new Error("RESERVATION_CONFLICT");
    return budget;
  }
  if (budget.mode !== "FIXTURE_ONLY" || budget.holds.length >= 100
    || !Number.isSafeInteger(hold.expiresAt) || hold.expiresAt <= now) throw new Error("RESERVATION_UNAVAILABLE");
  if (BigInt(fixtureExposure(budget)) + BigInt(hold.maximumMicrousd) > BigInt(budget.ceilingMicrousd)) throw new Error("BUDGET_EXHAUSTED");
  return { ...budget, holds: [...budget.holds, { ...hold, state: "RESERVED", settledMicrousd: 0 }] };
}
export function transitionFixtureAllowance(budget: DelegatedFixtureBudget, id: string,
  event: { type: "SEND" | "CANCEL" | "EXPIRE"; now: number }
    | { type: "RECONCILE"; actualMicrousd: number; settlementDigest: string; cleanupConfirmed: true }): DelegatedFixtureBudget {
  const hold = budget.holds.find(item => item.id === id);
  if (!hold) throw new Error("RESERVATION_UNAVAILABLE");
  let next = { ...hold };
  if (event.type === "RECONCILE") {
    assertMicrousd(event.actualMicrousd);
    if (!event.cleanupConfirmed || !/^sha256:[a-f0-9]{64}$/.test(event.settlementDigest)
      || event.actualMicrousd > hold.maximumMicrousd) throw new Error("SETTLEMENT_DENIED");
    if (hold.state === "SETTLED") {
      if (hold.settlementDigest !== event.settlementDigest || hold.settledMicrousd !== event.actualMicrousd) throw new Error("SETTLEMENT_CONFLICT");
      return budget;
    }
    if (hold.state !== "UNKNOWN") throw new Error("SETTLEMENT_DENIED");
    next = { ...hold, state: "SETTLED", settledMicrousd: event.actualMicrousd, settlementDigest: event.settlementDigest };
  } else if (event.type === "SEND") {
    if (hold.state !== "RESERVED" || hold.expiresAt <= event.now) throw new Error("SEND_DENIED");
    next.state = "UNKNOWN";
  } else if (hold.state === "RESERVED" && (event.type === "CANCEL" || hold.expiresAt <= event.now)) {
    next.state = "CANCELLED";
  }
  return { ...budget, holds: budget.holds.map(item => item.id === id ? next : item) };
}
