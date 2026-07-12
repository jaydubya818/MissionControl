/**
 * Feature gate for the external executor contract (Epic 18).
 * Mirrors the flag-gate pattern documented in docs/FEATURE_FLAGS.md.
 */

import { resolveFlag, type FlagRow } from "./flags";

export const EXECUTOR_FLAG = "executor.pi-bridge";

export async function requireExecutorEnabled(ctx: { db: any }): Promise<void> {
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", EXECUTOR_FLAG))
    .collect()) as FlagRow[];
  if (!resolveFlag(rows, EXECUTOR_FLAG).enabled) {
    throw new Error(
      `External executor contract is disabled — enable the "${EXECUTOR_FLAG}" feature flag`
    );
  }
}
