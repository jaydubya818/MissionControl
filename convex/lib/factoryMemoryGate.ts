import { resolveFlag, type FlagRow } from "./flags";

export const FACTORY_MEMORY_FLAGS = {
  HYBRID: "factory-memory.hybrid",
  RELATIONSHIPS: "factory-memory.relationships",
  AGENTIC_RETRIEVAL: "factory-memory.agentic-retrieval",
  KNOWLEDGE_GRAPH: "factory-memory.knowledge-graph",
  CONTEXT_ENGINE: "factory-memory.context-engine",
} as const;

export type FactoryMemoryPhase = keyof typeof FACTORY_MEMORY_FLAGS;

export async function requireFactoryMemoryPhaseEnabled(
  ctx: { db: any },
  projectId: string,
  phase: FactoryMemoryPhase,
): Promise<void> {
  const key = FACTORY_MEMORY_FLAGS[phase];
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .collect()) as FlagRow[];
  if (!resolveFlag(rows, key, projectId).enabled) {
    throw new Error(
      `Factory Memory phase is disabled — enable the "${key}" feature flag first`,
    );
  }
}
