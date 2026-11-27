import { internalMutation } from "../lib/missionScopedFunctions";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { buildAutomationDraft, isAutomationDraftDue } from "../lib/automationDispatch";

/**
 * Active automation definitions create review-only Work Order drafts. They
 * cannot dispatch themselves, mutate code, or bypass the normal approval flow.
 */
export const createDueDrafts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const definitions = (
      await ctx.db.query("automationDefinitions").collect()
    ).filter(
      (definition) =>
        definition.enabled === true &&
        !!definition.sourceSuggestionId &&
        !!definition.sourcePattern &&
        isAutomationDraftDue(
          {
            enabled: true,
            lastDraftAt: definition.lastDraftAt,
          },
          now
        )
    );
    let created = 0;

    for (const definition of definitions) {
      const draft = buildAutomationDraft({
        id: String(definition._id),
        projectId: definition.projectId ? String(definition.projectId) : undefined,
        name: definition.name,
        sourcePattern: definition.sourcePattern!,
        sourceSuggestionId: String(definition.sourceSuggestionId),
        enabled: true,
        lastDraftAt: definition.lastDraftAt,
      }, now);
      const result = await ctx.runMutation(api.workOrders.create, {
        ...draft,
        projectId: definition.projectId as Id<"projects"> | undefined,
      });
      await ctx.db.patch(definition._id, { lastDraftAt: now, updatedAt: now });
      if (result.created) created += 1;
    }

    return { considered: definitions.length, created };
  },
});
