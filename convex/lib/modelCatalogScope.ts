import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type CatalogCtx = Pick<QueryCtx | MutationCtx, "db">;

interface CatalogRoutingIdentity {
  _id: unknown;
  _creationTime: number;
  projectId?: unknown;
  modelId: string;
}

/** Factory composition must see every immutable qualification instance. */
export async function loadFactoryModelCatalogForProject(
  ctx: CatalogCtx,
  projectId: Id<"projects">,
) {
  const catalog = await ctx.db.query("modelCatalog").collect();
  const scoped = catalog.filter((model) => model.projectId === projectId);
  const scopedKeys = new Set(scoped.map((model) => `${model.provider}\0${model.modelId}`));
  const shared = catalog.filter((model) =>
    !model.projectId && !scopedKeys.has(`${model.provider}\0${model.modelId}`)
  );
  return [...scoped, ...shared];
}

/** Generic routing policies persist only modelId. Keep that identity stable
 * when Factory appends qualification instances for the same inference route. */
export async function loadModelCatalogForProject(
  ctx: CatalogCtx,
  projectId: Id<"projects">,
) {
  return selectModelCatalogRoutingEntries(
    await loadFactoryModelCatalogForProject(ctx, projectId),
    projectId,
  );
}

export async function findModelCatalogEntry(
  ctx: CatalogCtx,
  projectId: Id<"projects">,
  modelId: string,
) {
  const matches = await ctx.db
    .query("modelCatalog")
    .withIndex("by_model_id", (query) => query.eq("modelId", modelId))
    .collect();
  return selectModelCatalogRoutingEntries(matches, projectId)[0] ?? null;
}

export function selectModelCatalogRoutingEntries<T extends CatalogRoutingIdentity>(
  catalog: T[],
  projectId: Id<"projects">,
): T[] {
  const inScope = catalog
    .filter((model) => model.projectId === projectId || !model.projectId)
    .sort(stableCatalogIdentityOrder);
  const modelIds = [...new Set(inScope.map((model) => model.modelId))];
  return modelIds.map((modelId) => {
    const candidates = inScope.filter((model) => model.modelId === modelId);
    return candidates.find((model) => model.projectId === projectId)
      ?? candidates.find((model) => !model.projectId)!;
  }).sort(stableCatalogIdentityOrder);
}

function stableCatalogIdentityOrder(
  left: CatalogRoutingIdentity,
  right: CatalogRoutingIdentity,
) {
  return left._creationTime - right._creationTime
    || String(left._id).localeCompare(String(right._id));
}
