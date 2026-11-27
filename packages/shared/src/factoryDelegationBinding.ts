import { canonicalDigest } from "./canonicalDigest.js";

export const FACTORY_DELEGATION_BINDING_SCHEMA = "factory-delegation-binding/v1";

export type FactoryDelegationEffect =
  | "repository.read"
  | "sandbox.write"
  | "candidate.create"
  | "verification.request";

/** Immutable correlation only. Authentication, current authority, reservations,
 * revocation and transactional admission remain the owning services' responsibility. */
export interface FactoryDelegationBinding {
  readonly schema: typeof FACTORY_DELEGATION_BINDING_SCHEMA;
  readonly delegationId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly missionId: string;
  readonly missionSpecRevisionId: string;
  readonly missionPlanId: string;
  readonly missionPlanRevision: number;
  readonly missionPlanDigest: string;
  readonly workOrderId: string;
  readonly workOrderRevisionId: string;
  readonly workOrderRevisionNumber: number;
  readonly taskId: string;
  readonly workflowRunId: string;
  readonly executionManifestDigest: string;
  readonly qualityContractDigest: string;
  readonly authorityGeneration: number;
  readonly factoryId: string;
  readonly factoryVersion: string;
  readonly executionProtocol: "MYFACTORY_EXECUTION_V2";
  readonly clientId: string;
  readonly ownerScope: string;
  readonly partnerWorkId: string;
  readonly partnerWorkGeneration: number;
  readonly partnerRequestId: string;
  readonly partnerRequestDigest: string;
  readonly repositoryId: string;
  readonly repository: string;
  readonly baseCommit: string;
  readonly baseTree: string;
  readonly sourceSnapshotDigest: string;
  readonly executionProfileDigest: string;
  readonly modelPolicyDigest: string;
  readonly verificationPolicyDigest: string;
  readonly allowedEffects: readonly FactoryDelegationEffect[];
  readonly budgetReservationId: string;
  readonly maxSpendMicrousd: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly deadline: number;
}

const textMatching = (pattern: RegExp) => (value: unknown) =>
  typeof value === "string" && pattern.test(value);
const identity = textMatching(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
const sha256 = textMatching(/^[a-f0-9]{64}$/);
const digest = textMatching(/^sha256:[a-f0-9]{64}$/);
const gitSha = textMatching(/^[a-f0-9]{40}$/);
const uuid = textMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const nonNegativeInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positiveInteger = (value: unknown) => nonNegativeInteger(value) && Number(value) > 0;
const effects = new Set<string>(["repository.read", "sandbox.write", "candidate.create", "verification.request"]);

const fields = {
  schema: (value: unknown) => value === FACTORY_DELEGATION_BINDING_SCHEMA,
  delegationId: identity,
  tenantId: identity,
  projectId: identity,
  missionId: identity,
  missionSpecRevisionId: identity,
  missionPlanId: identity,
  missionPlanRevision: positiveInteger,
  missionPlanDigest: digest,
  workOrderId: identity,
  workOrderRevisionId: identity,
  workOrderRevisionNumber: positiveInteger,
  taskId: identity,
  workflowRunId: identity,
  executionManifestDigest: digest,
  qualityContractDigest: digest,
  authorityGeneration: positiveInteger,
  factoryId: identity,
  factoryVersion: sha256,
  executionProtocol: (value: unknown) => value === "MYFACTORY_EXECUTION_V2",
  clientId: identity,
  ownerScope: identity,
  partnerWorkId: uuid,
  partnerWorkGeneration: positiveInteger,
  partnerRequestId: uuid,
  partnerRequestDigest: sha256,
  repositoryId: identity,
  repository: textMatching(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/),
  baseCommit: gitSha,
  baseTree: gitSha,
  sourceSnapshotDigest: digest,
  executionProfileDigest: digest,
  modelPolicyDigest: digest,
  verificationPolicyDigest: digest,
  allowedEffects: (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= effects.size
    && new Set(value).size === value.length && [...value].every(item => typeof item === "string" && effects.has(item)),
  budgetReservationId: identity,
  maxSpendMicrousd: nonNegativeInteger,
  issuedAt: nonNegativeInteger,
  expiresAt: positiveInteger,
  deadline: positiveInteger,
} satisfies Record<keyof FactoryDelegationBinding, (value: unknown) => boolean>;

export function parseFactoryDelegationBinding(value: unknown): FactoryDelegationBinding {
  const invalid = () => new Error("Invalid factory delegation binding");
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== Object.keys(fields).length) throw invalid();
  for (const [key, validate] of Object.entries(fields)) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !validate(descriptor.value)) throw invalid();
  }
  const binding = value as FactoryDelegationBinding;
  if (binding.issuedAt >= binding.expiresAt || binding.expiresAt > binding.deadline) throw invalid();
  return Object.freeze({ ...binding, allowedEffects: Object.freeze([...binding.allowedEffects]) });
}

export function factoryDelegationBindingDigest(value: unknown): string {
  return canonicalDigest(FACTORY_DELEGATION_BINDING_SCHEMA, parseFactoryDelegationBinding(value));
}

/** expected must come from authenticated, tenant-scoped canonical storage.
 * Matching is not admission and cannot establish that a reservation or grant exists. */
export function assertFactoryDelegationBindingMatches(incoming: unknown, expected: unknown, now: number): void {
  try {
    const binding = parseFactoryDelegationBinding(incoming);
    const stored = parseFactoryDelegationBinding(expected);
    if (!nonNegativeInteger(now) || binding.issuedAt > now || binding.expiresAt <= now || binding.deadline <= now
      || factoryDelegationBindingDigest(binding) !== factoryDelegationBindingDigest(stored)) throw new Error();
  } catch {
    throw new Error("Factory delegation binding unavailable or mismatched");
  }
}
