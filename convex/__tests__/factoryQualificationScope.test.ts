import { describe, expect, it } from "vitest";
import { assertQualificationActivation, qualificationEnvironmentDigest } from "../lib/factoryQualificationScope";
import { factoryVersionConfigurationDigest } from "../lib/factoryConfiguration";

function fixture() {
  const environment = { _id: "environment", type: "dev", tenantId: "tenant",
    metadata: { schema: "factory-qualification-environment/v1", synthetic: true, projectId: "project", repositoryId: "repository" } };
  const version: any = { _id: "version", factoryDefinitionId: "factory", projectId: "project", tenantId: "tenant",
    repositoryId: "repository", environmentId: "environment", executionBackend: "isolated-container",
    codeScopeIds: ["scope"], agentBindings: [], verifierIds: ["verifier"],
    budget: { maxCostUsd: 1, maxAttempts: 1, maxRuntimeMinutes: 1 }, executionProfileDigest: "profile-digest" };
  const digest = qualificationEnvironmentDigest({ environment, ...version, configuredEnvironmentId: "environment" });
  version.qualificationEnvironmentDigest = digest;
  version.configurationDigest = factoryVersionConfigurationDigest(version);
  const definition = { _id: "factory", projectId: "project", tenantId: "tenant", status: "ACTIVE", activeVersionId: "version",
    qualificationActivation: { schema: "factory-qualification-activation/v1", target: "QUALIFICATION", environmentId: "environment",
      environmentDigest: digest, factoryDefinitionVersionId: "version", configurationDigest: version.configurationDigest,
      executionProfileDigest: version.executionProfileDigest, actorId: "operator", assessmentId: "assessment",
      evidenceReference: "synthetic-evidence", activatedAt: 1, expiresAt: 100 } };
  return { environment, version, definition, configuredEnvironmentId: "environment", now: 2 };
}

describe("qualification activation restriction, separate from permission and readiness", () => {
  it("binds the exact disposable environment and immutable configuration", () => {
    const input = fixture();
    expect(assertQualificationActivation(input)).toEqual(input.definition.qualificationActivation);
  });
  it("rejects production, scope substitution, missing configuration and expired or altered authority", () => {
    const mutations: Array<(value: any) => void> = [
      x => { x.environment.type = "prod"; }, x => { x.environment.type = "staging"; },
      x => { x.configuredEnvironmentId = undefined; }, x => { x.configuredEnvironmentId = "other"; },
      x => { x.environment.metadata.synthetic = false; }, x => { x.environment.metadata.projectId = "other"; },
      x => { x.environment.metadata.repositoryId = "other"; }, x => { x.environment.tenantId = "other"; },
      x => { x.definition._id = "other"; }, x => { x.definition.activeVersionId = "other"; },
      x => { x.definition.qualificationActivation.target = "PRODUCTION"; }, x => { x.definition.status = "ARCHIVED"; },
      x => { x.definition.qualificationActivation.actorId = ""; }, x => { x.definition.qualificationActivation.assessmentId = ""; },
      x => { x.definition.qualificationActivation.expiresAt = 2; }, x => { x.definition.qualificationActivation.activatedAt = 3; },
      x => { x.version.budget.maxCostUsd = 9; }, x => { x.version.executionProfileDigest = "substitute"; },
      x => { x.version.qualificationEnvironmentDigest = "other"; },
    ];
    for (const mutate of mutations) { const input = fixture(); mutate(input); expect(() => assertQualificationActivation(input)).toThrow(); }
  });
});
