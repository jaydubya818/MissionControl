import { v } from "convex/values";

export const compatibilityIdentity = v.object({
  myFactory: v.literal("fa48a820ba185eb9b891130c78166463b61cba74"),
  myEve: v.literal("8338309582d6806829dec1ae1beef301d6b52425"),
  mySkillsFoundation: v.literal("d57ff77b8522f897fc6ae392cf59b3141295ba82"),
  mySkillsBehavior: v.literal("21ae05a7be2f73be1378deb896f138700c473e84"),
});
export const fixtureRegistrationConfig = v.object({
  kind: v.union(v.literal("MISSIONCONTROL_NATIVE"), v.literal("MYFACTORY")),
  factoryId: v.string(),
  factoryVersion: v.string(),
  definitionVersionId: v.id("factoryDefinitionVersions"),
  capabilities: v.array(v.union(v.literal("NATIVE_EXECUTION"), v.literal("BOUNDED_DELEGATION"), v.literal("SIGNED_RESULT"))),
  capacity: v.number(),
  admissionPolicy: v.literal("FIXTURE_ONLY"),
  compatibility: compatibilityIdentity,
  localProviderSourceSha: v.optional(v.string()),
  executionProvider: v.optional(v.literal("LOCAL_DOCKER_QUALIFICATION")),
});
export const fixtureRegistration = v.object({
  config: fixtureRegistrationConfig,
  digest: v.string(),
  revision: v.number(),
  health: v.union(v.literal("HEALTHY"), v.literal("UNHEALTHY"), v.literal("UNKNOWN")),
  qualification: v.union(v.literal("UNQUALIFIED"), v.literal("FIXTURE_QUALIFIED")),
  evidenceDigest: v.optional(v.string()),
  validUntil: v.number(),
  revokedAt: v.optional(v.number()),
});
export const fixtureBudget = v.object({
  mode: v.literal("FIXTURE_ONLY"), ownerActorId: v.optional(v.string()), ceilingMicrousd: v.number(),
  holds: v.array(v.object({
    id: v.string(), digest: v.string(), kind: v.union(v.literal("NATIVE"), v.literal("DELEGATED")),
    maximumMicrousd: v.number(), expiresAt: v.number(),
    state: v.union(v.literal("RESERVED"), v.literal("UNKNOWN"), v.literal("SETTLED"), v.literal("CANCELLED")),
    settledMicrousd: v.number(), settlementDigest: v.optional(v.string()),
  })),
});
export const trialState = v.union(v.literal("RESERVED"), v.literal("PREPARED"), v.literal("RUNNING"),
  v.literal("STOPPING"), v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELLED"), v.literal("UNKNOWN"));
