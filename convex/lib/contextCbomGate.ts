/**
 * Feature-flag gate for the Context Bill of Materials (CBOM) subsystem.
 *
 * Mirrors lib/contextRegistryGate.ts for the `context.cbom` flag. Lives in
 * lib/ (rather than convex/context/) so downstream composite TypeScript
 * projects that include `convex/lib/**` can resolve it without listing the
 * context/ modules.
 */

import { resolveFlag, type FlagRow } from "./flags";

export const CONTEXT_CBOM_FLAG = "context.cbom";

/** Throws unless the `context.cbom` feature flag resolves enabled. */
export async function requireContextCbomEnabled(
  ctx: { db: any },
  projectId?: string | null
): Promise<void> {
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", CONTEXT_CBOM_FLAG))
    .collect()) as FlagRow[];
  const resolved = resolveFlag(rows, CONTEXT_CBOM_FLAG, projectId ?? null);
  if (!resolved.enabled) {
    throw new Error(
      `Context CBOM is disabled — enable the "${CONTEXT_CBOM_FLAG}" feature flag first`
    );
  }
}
