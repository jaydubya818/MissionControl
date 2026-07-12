/**
 * Feature-flag gate for the evaluation framework (Software Factory Epic 5).
 *
 * Shared by convex/evaluation/scenarios.ts and
 * convex/evaluation/comparisons.ts. Lives in lib/ (rather than
 * convex/evaluation/) so downstream composite TypeScript projects that
 * include `convex/lib/**` can resolve it without listing the evaluation/
 * modules. Mirrors lib/contextRegistryGate.ts.
 */

import { resolveFlag, type FlagRow } from "./flags";

export const EVAL_FRAMEWORK_FLAG = "eval.framework";

/** Throws unless the `eval.framework` feature flag resolves enabled. */
export async function requireEvalFrameworkEnabled(
  ctx: { db: any },
  projectId?: string | null
): Promise<void> {
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", EVAL_FRAMEWORK_FLAG))
    .collect()) as FlagRow[];
  const resolved = resolveFlag(rows, EVAL_FRAMEWORK_FLAG, projectId ?? null);
  if (!resolved.enabled) {
    throw new Error(
      `Evaluation framework is disabled — enable the "${EVAL_FRAMEWORK_FLAG}" feature flag first`
    );
  }
}
