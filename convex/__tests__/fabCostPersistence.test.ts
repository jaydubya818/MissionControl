import { expect, it, vi } from "vitest";
import { reconcileFabObservedCost } from "../lib/fabCostPersistence";
import evidence from "../../docs/testing/evidence/live-retry-2026-10-04/producer-inspector.json";

it("reconciles retained failure costs once without releasing reservations or reopening execution", async () => {
  const run = structuredClone(evidence.run);
  const mission = { _id: run.missionId, projectId: run.projectId, tenantId: run.tenantId, spentUsd: 0 };
  const patch = vi.fn(async (id, changes) => Object.assign(id === run._id ? run : mission, changes));
  const ctx = { db: { query: () => ({ withIndex: () => ({ collect: async () => evidence.events }) }),
    patch, get: async () => mission } };
  const beforeReservation = run.reservedCostUsd;
  const first = await reconcileFabObservedCost(ctx as never, run as never);
  const second = await reconcileFabObservedCost(ctx as never, run as never);
  expect(first.spentUsd).toBeCloseTo(0.0102412, 10);
  expect(second.deltaUsd).toBe(0);
  expect(mission.spentUsd).toBeCloseTo(0.0102412, 10);
  expect(patch).toHaveBeenCalledTimes(2);
  expect(run.reservedCostUsd).toBe(beforeReservation);
  expect(run.executionCostAuthorization.actualCost.status).toBe("UNAVAILABLE");
  expect(run.status).toBe("FAILED");
});
