/** Legacy domain-handler tests use in-memory doubles, not Convex transactions.
 * Exercise their existing business authorization here. The canonical Mission
 * boundary is qualified separately by the real-database isolation suite.
 */
import { vi } from "vitest";
vi.mock("../../lib/missionScopedFunctions", async () => {
  const actual = await vi.importActual<any>("../../lib/missionScopedFunctions");
  const raw = await vi.importActual<any>("../../_generated/server");
  return { ...actual, ...raw, contributorMutation: raw.mutation, reviewerMutation: raw.mutation,
    serviceAttemptAction: raw.action, serviceInternalAction: () => raw.internalAction,
    serviceInternalQuery: () => raw.internalQuery, serviceInternalMutation: () => raw.internalMutation };
});
