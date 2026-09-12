import { computeCanonicalHash } from "./genomeHash";
import { factoryVersionConfigurationDigest } from "./factoryConfiguration";

/** An additional restriction on offline admission, never a replacement for
 * workspace permissions, profile qualification or readiness. Deployment config
 * must name the exact disposable environment; production defaults to denied. */
export function qualificationEnvironmentDigest(input: {
  environment: any; projectId: unknown; tenantId: unknown; repositoryId: unknown;
  configuredEnvironmentId: string | undefined;
}): string {
  const e = input.environment;
  if (!e || !input.configuredEnvironmentId || e._id !== input.configuredEnvironmentId
    || e.type !== "dev" || !input.tenantId || e.tenantId !== input.tenantId
    || e.metadata?.schema !== "factory-qualification-environment/v1"
    || e.metadata.synthetic !== true || e.metadata.projectId !== input.projectId
    || e.metadata.repositoryId !== input.repositoryId) {
    throw new Error("Offline admission requires the exact configured synthetic development environment; production is denied.");
  }
  return `sha256:${computeCanonicalHash({ id: e._id, tenantId: e.tenantId, type: e.type, metadata: e.metadata })}`;
}

export function assertQualificationActivation(input: {
  definition: any; version: any; environment: any; configuredEnvironmentId: string | undefined; now: number;
}) {
  const { definition, version, now } = input;
  const digest = qualificationEnvironmentDigest({ ...input, projectId: version.projectId,
    tenantId: version.tenantId, repositoryId: version.repositoryId });
  const a = definition?.qualificationActivation;
  if (!a || a.schema !== "factory-qualification-activation/v1" || a.target !== "QUALIFICATION"
    || definition.status !== "ACTIVE" || definition.activeVersionId !== version._id
    || definition._id !== version.factoryDefinitionId
    || definition.projectId !== version.projectId || definition.tenantId !== version.tenantId
    || a.environmentId !== version.environmentId || a.environmentDigest !== digest
    || version.qualificationEnvironmentDigest !== digest || a.factoryDefinitionVersionId !== version._id
    || factoryVersionConfigurationDigest(version) !== version.configurationDigest
    || a.configurationDigest !== version.configurationDigest || a.executionProfileDigest !== version.executionProfileDigest
    || !a.actorId || !a.assessmentId || !a.evidenceReference || !Number.isFinite(a.activatedAt)
    || a.activatedAt > now || !Number.isFinite(a.expiresAt) || a.expiresAt <= now) {
    throw new Error("Qualification Factory activation is absent, changed, expired or outside scope.");
  }
  return a;
}
