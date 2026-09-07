import { describe, expect, it } from "vitest";
import {
  ISOLATED_CONTAINER_POLICY,
  ISOLATED_INVOCATION_EFFECTIVE_CONFIG,
  ISOLATED_INVOCATION_RUNTIME_ARTIFACT,
} from "@mission-control/workflow-engine/harness-contract";
import { isolatedSandboxAdmission, isolatedSandboxDigest, isolatedSandboxIssues } from "../lib/isolatedSandbox";
import { offlineSandboxAdmission, offlineSandboxDigest, offlineSandboxIssues, assertLocalSandboxScope } from "../lib/localQualificationSandbox";
import { localRepositoryAdmissionDigest, type LocalRepositoryAdmission } from "../lib/localRepositoryAdmission";
const hash = `sha256:${"a".repeat(64)}`;
const legacy = { schema: "factory-sandbox-profile/v2" as const, provider: "LOCAL_CONTAINER" as const,
  profileKey: "local-fixture", version: 1, imageDigest: hash, bridgeDigest: hash, backendDigest: hash,
  isolationPolicy: ISOLATED_CONTAINER_POLICY, qualification: { evidenceReference: "component-control", evidenceDigest: hash, validUntil: 5000 } };
const a: LocalRepositoryAdmission = { schema: "local-synthetic-repository-admission/v1", mode: "LOCAL_SYNTHETIC_QUALIFICATION",
  program: "unpublished-handoff-fixture/v1", tenantId: "tenant", projectId: "project", engagementId: "project", operatorId: "operator",
  environmentId: "env", hostId: "host", fixtureId: "fixture", root: `/private/tmp/mc-local-qualification-${"a".repeat(32)}/repository`,
  baselineCommit: "b".repeat(40), baselineTree: "c".repeat(40), fixtureContentDigest: hash, expiresAt: 6000,
  publicationAuthority: "NONE", productionAuthority: "NONE" };
const local = { ...legacy, schema: "local-qualification-sandbox/v1",
  imageDigest: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest,
  bridgeDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest,
  backendDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest,
  localQualification: {
  repositoryId: "repo", repositoryAdmissionDigest: localRepositoryAdmissionDigest(a), environmentId: "env", projectId: "project",
  tenantId: "tenant", operatorId: "operator", program: a.program, operations: ["render-markdown/v1", "verify-document-bytes/v1"],
  risk: "GREEN", inference: "DENIED", transmission: "DENIED", publication: "NONE", production: "NONE" } };
describe("fixture-bound local sandbox structural controls", () => {
  it("preserves legacy admission and refuses new type in the legacy contract", () => {
    expect(offlineSandboxAdmission(legacy, "operator", 1000)).toEqual(isolatedSandboxAdmission(legacy, "operator", 1000));
    expect(offlineSandboxDigest(legacy)).toEqual(isolatedSandboxDigest(legacy));
    expect(isolatedSandboxIssues(local).length).toBeGreaterThan(0);
    expect(isolatedSandboxAdmission(legacy, "operator", 1000).scope.workloadClasses).toEqual(["SOFTWARE_CHANGE"]);
  });
  it("binds only fixed deterministic operations without production or publication authority", () => {
    expect(offlineSandboxIssues(local)).toEqual([]);
    const result = offlineSandboxAdmission(local, "operator", 1000);
    expect(result.authority).toEqual({ routing: false, verification: false, acceptance: false, publication: false, merge: false });
    expect(() => offlineSandboxAdmission(local, "other", 1000)).toThrow();
  });
  it.each([['production', 'PASS'], ['publication', 'PASS'], ['inference', 'ALLOW'], ['transmission', 'ALLOW'], ['risk', 'RED'], ['operations', ['verify-document-bytes/v1', 'shell']]])("rejects capability expansion %s", (key, value) => {
    expect(offlineSandboxIssues({ ...local, localQualification: { ...local.localQualification, [key as string]: value } }).length).toBeGreaterThan(0);
  });
  it("requires the live exact configured repository scope", async () => {
    const metadata = { schema: a.program, synthetic: true, productionAuthority: false };
    const rows: any = {
      tenant: { _id: "tenant", slug: "synthetic-handoff-qualification", active: true, metadata },
      project: { _id: "project", tenantId: "tenant", slug: "synthetic-unpublished-handoff", metadata },
      operator: { _id: "operator", tenantId: "tenant", active: true, authId: "user_SyntheticHandoffQualification", metadata },
      env: { _id: "env", tenantId: "tenant", type: "dev", metadata: { schema: "factory-qualification-environment/v1", synthetic: true, projectId: "project", repositoryId: "repo" } },
      repo: { _id: "repo", tenantId: "tenant", projectId: "project", provider: "LOCAL", repositoryMode: a.mode,
        repository: "local-qualification/fixture", localAdmission: a, localAdmissionDigest: localRepositoryAdmissionDigest(a) },
    };
    const previous = process.env.MC_LOCAL_REPOSITORY_ADMISSION;
    process.env.MC_LOCAL_REPOSITORY_ADMISSION = JSON.stringify(a);
    const ctx: any = { db: { get: async (id: string) => rows[id] ?? null } };
    try {
      await expect(assertLocalSandboxScope(ctx, local, 1000, "operator")).resolves.toBeUndefined();
      await expect(assertLocalSandboxScope(ctx, local, 1000, "other")).rejects.toThrow();
      await expect(assertLocalSandboxScope(ctx, { ...local, localQualification: { ...local.localQualification, repositoryId: "other" } }, 1000, "operator")).rejects.toThrow();
      await expect(assertLocalSandboxScope(ctx, local, 1000, "operator", { projectId: "other", tenantId: "tenant" })).rejects.toThrow();
      await expect(assertLocalSandboxScope(ctx, local, 1000, "operator", { projectId: "project", tenantId: "other" })).rejects.toThrow();
      await expect(assertLocalSandboxScope(ctx, local, 1000, "operator", { projectId: "project", tenantId: "tenant" })).resolves.toBeUndefined();
      rows.env.type = "prod"; await expect(assertLocalSandboxScope(ctx, local, 1000, "operator")).rejects.toThrow();
      rows.env.type = "dev"; await expect(assertLocalSandboxScope(ctx, local, 6001, "operator")).rejects.toThrow();
    } finally { if (previous === undefined) delete process.env.MC_LOCAL_REPOSITORY_ADMISSION; else process.env.MC_LOCAL_REPOSITORY_ADMISSION = previous; }
  });
});
