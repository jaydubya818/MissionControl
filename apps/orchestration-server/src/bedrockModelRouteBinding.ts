import { exactModelRouteSnapshot, exactModelRouteDigest } from '../../../convex/lib/modelRouteAdmission.js';
import { liabilityDigest } from '../../../convex/lib/providerLiability.js';
import { bedrockRouteSchema, type BedrockRoute } from './bedrockRoute.js';

/** Uses the canonical inference-only V2 identity. The bounded providerRoute key
 * commits to the full account/project/role/profile/topology descriptor. Harness,
 * price and runtime stay in their existing composition authorities. */
export function bedrockModelRouteBinding(input:BedrockRoute) {
  const descriptor=bedrockRouteSchema.parse(input);
  const descriptorDigest=liabilityDigest(descriptor);
  const snapshot=exactModelRouteSnapshot({provider:'aws-bedrock',providerRoute:`bedrock-us:${descriptorDigest.slice(7)}`,modelId:descriptor.modelId});
  return {descriptor,descriptorDigest,snapshot,routeDigest:exactModelRouteDigest(snapshot),authority:'NONE' as const};
}
