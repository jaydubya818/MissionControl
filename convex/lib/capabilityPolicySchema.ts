import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const capabilityPolicyTables = {
  capabilityEnrolledOwners: defineTable({ policyScopes: v.optional(v.array(v.string())), memberId: v.string(), projectId: v.string(), installationId: v.string(), incarnation: v.string() })
    .index('by_owner', ['memberId', 'projectId']).index('by_project', ['projectId']),
  capabilityPolicyFences: defineTable({
    scope: v.string(), authority: v.string(), ownerId: v.string(), organizationId: v.string(),
    installationId: v.string(), backendId: v.string(), incarnation: v.string(),
    enrollmentVersion: v.number(), version: v.number(), policyId: v.string(),
    fenceHash: v.string(), acknowledgment: v.object({ message: v.string(), keyId: v.string(), signature: v.string() }),
    capabilityId: v.string(), operation: v.string(),
  }).index('by_scope', ['scope']),
  capabilityWorkControls: defineTable({
    scope: v.string(), capabilityId: v.string(), operation: v.union(v.literal('pause'), v.literal('revoke')),
    version: v.number(), policyId: v.string(), fenceHash: v.string(),
  }).index('by_control', ['scope', 'capabilityId', 'operation']),
  capabilityAdmissionReferences: defineTable({
    scope: v.string(), referenceId: v.string(), workId: v.string(), missionId: v.string(),
    version: v.number(), policyId: v.string(), actionDigest: v.string(),
  }).index('by_reference', ['scope', 'referenceId']),
};
