import { describe, it, expect } from "vitest";
import {
  assertPilotLiabilityAllocation,
  assertPilotRoleHolds,
} from "../lib/pilotLiabilityAllocation";
const allocation = {
  cohortId: "OFFLINE-FIXTURE",
  cohortMaximumNanoUsd: 20_000_000_000,
  workOrders: Array.from({ length: 10 }, (_, i) => ({
    workOrderId: `fixture-${i}`,
    producerMaximumNanoUsd: 1_000_000_000,
    verifierMaximumNanoUsd: 1_000_000_000,
  })),
};
describe("OFFLINE / FIXTURE pilot cohort allocation", () => {
  it("composes ten two-dollar ceilings without issuing authority", () =>
    expect(assertPilotLiabilityAllocation(allocation)).toEqual({
      allocatedNanoUsd: 20_000_000_000,
      authority: "NONE",
    }));
  it("does not borrow verifier balance for producer sends", () =>
    expect(() =>
      assertPilotRoleHolds(allocation, "fixture-0", [
        { role: "PRODUCER", maximumNanoUsd: 1_000_000_001 },
      ]),
    ).toThrow());
  it("retains maximum holds after low settlement", () =>
    expect(() =>
      assertPilotRoleHolds(allocation, "fixture-0", [
        {
          role: "PRODUCER",
          maximumNanoUsd: 1_000_000_000,
          accountedNanoUsd: 1,
        },
        { role: "PRODUCER", maximumNanoUsd: 1 },
      ]),
    ).toThrow());
  it("accounts for overrun corrections", () =>
    expect(() =>
      assertPilotRoleHolds(allocation, "fixture-0", [
        {
          role: "VERIFIER",
          maximumNanoUsd: 1,
          accountedNanoUsd: 1_000_000_001,
        },
      ]),
    ).toThrow());
  it.each([
    { ...allocation, cohortMaximumNanoUsd: 21_000_000_000 },
    { ...allocation, workOrders: allocation.workOrders.slice(1) },
    {
      ...allocation,
      workOrders: allocation.workOrders.map(() => allocation.workOrders[0]),
    },
    {
      ...allocation,
      workOrders: allocation.workOrders.map((w) => ({
        ...w,
        producerMaximumNanoUsd: 2_000_000_000,
      })),
    },
  ])("rejects altered allocation", (a) =>
    expect(() => assertPilotLiabilityAllocation(a)).toThrow(),
  );
  it("rejects out-of-cohort WorkOrders", () =>
    expect(() => assertPilotRoleHolds(allocation, "other", [])).toThrow());
});
