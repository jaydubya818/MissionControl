/** Pure allocation arithmetic; no issued reservation or Factory authority.
 * A single transactional cohort authority must persist this state before use.
 */
export interface PilotLiabilityAllocation {
  cohortId: string;
  cohortMaximumNanoUsd: number;
  workOrders: Array<{
    workOrderId: string;
    producerMaximumNanoUsd: number;
    verifierMaximumNanoUsd: number;
  }>;
}
export function assertPilotLiabilityAllocation(
  value: PilotLiabilityAllocation,
) {
  if (
    !value ||
    typeof value.cohortId !== "string" ||
    !value.cohortId.trim() ||
    value.cohortMaximumNanoUsd !== 20_000_000_000 ||
    !Array.isArray(value.workOrders) ||
    value.workOrders.length !== 10 ||
    new Set(value.workOrders.map((w) => w.workOrderId)).size !== 10
  )
    throw new Error("PILOT_COHORT_ALLOCATION_INVALID");
  let allocated = 0;
  for (const w of value.workOrders) {
    if (
      typeof w.workOrderId !== "string" ||
      !w.workOrderId.trim() ||
      w.producerMaximumNanoUsd !== 1_000_000_000 ||
      w.verifierMaximumNanoUsd !== 1_000_000_000
    )
      throw new Error("PILOT_ROLE_ALLOCATION_INVALID");
    allocated += w.producerMaximumNanoUsd + w.verifierMaximumNanoUsd;
  }
  if (allocated !== value.cohortMaximumNanoUsd)
    throw new Error("PILOT_COHORT_CEILING_MISMATCH");
  return { allocatedNanoUsd: allocated, authority: "NONE" as const };
}
export function assertPilotRoleHolds(
  allocation: PilotLiabilityAllocation,
  workOrderId: string,
  holds: Array<{
    role: "PRODUCER" | "VERIFIER";
    maximumNanoUsd: number;
    accountedNanoUsd?: number;
  }>,
) {
  assertPilotLiabilityAllocation(allocation);
  const w = allocation.workOrders.find(
    (item) => item.workOrderId === workOrderId,
  );
  if (!w) throw new Error("PILOT_WORKORDER_OUT_OF_SCOPE");
  const totals = { PRODUCER: 0, VERIFIER: 0 };
  for (const h of holds) {
    if (
      !["PRODUCER", "VERIFIER"].includes(h.role) ||
      !Number.isSafeInteger(h.maximumNanoUsd) ||
      h.maximumNanoUsd < 0 ||
      (h.accountedNanoUsd !== undefined &&
        (!Number.isSafeInteger(h.accountedNanoUsd) || h.accountedNanoUsd < 0))
    )
      throw new Error("PILOT_HOLD_INVALID");
    totals[h.role] += Math.max(h.maximumNanoUsd, h.accountedNanoUsd ?? 0);
    if (!Number.isSafeInteger(totals[h.role]))
      throw new Error("PILOT_HOLD_OVERFLOW");
  }
  if (
    totals.PRODUCER > w.producerMaximumNanoUsd ||
    totals.VERIFIER > w.verifierMaximumNanoUsd
  )
    throw new Error("PILOT_ROLE_CEILING_EXCEEDED");
  return { totals, authority: "NONE" as const };
}
