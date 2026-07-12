/**
 * Feature-flag gate for the context evaluation framework (Epic 4).
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
