import { computeCanonicalHash } from "./genomeHash";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const LOCAL_QUALIFICATION_MODE = "LOCAL_SYNTHETIC_QUALIFICATION" as const;
export const LOCAL_QUALIFICATION_PROGRAM = "unpublished-handoff-fixture/v1" as const;

/** Deployment-owned program scope, never request arguments. The project is the
 * canonical engagement in this program; there is no parallel engagement row. */
export interface LocalRepositoryAdmission {
  schema: "local-synthetic-repository-admission/v1";
  mode: typeof LOCAL_QUALIFICATION_MODE;
  program: typeof LOCAL_QUALIFICATION_PROGRAM;
  tenantId: string;
  projectId: string;
  engagementId: string;
  operatorId: string;
  environmentId: string;
  hostId: string;
  fixtureId: string;
  root: string;
  baselineCommit: string;
  baselineTree: string;
  fixtureContentDigest: string;
  expiresAt: number;
  publicationAuthority: "NONE";
  productionAuthority: "NONE";
}

const fields = ["schema", "mode", "program", "tenantId", "projectId", "engagementId", "operatorId",
  "environmentId", "hostId", "fixtureId", "root", "baselineCommit", "baselineTree", "fixtureContentDigest",
  "expiresAt", "publicationAuthority", "productionAuthority"];

export function parseLocalRepositoryAdmission(serialized: string | undefined, now: number): LocalRepositoryAdmission {
  if (!serialized) throw new Error("Local qualification repository admission is not configured.");
  const a = JSON.parse(serialized) as LocalRepositoryAdmission;
  if (!a || typeof a !== "object" || Array.isArray(a)
    || Object.keys(a).length !== fields.length || fields.some(key => !Object.prototype.hasOwnProperty.call(a, key))
    || a.schema !== "local-synthetic-repository-admission/v1" || a.mode !== LOCAL_QUALIFICATION_MODE
    || a.program !== LOCAL_QUALIFICATION_PROGRAM || a.publicationAuthority !== "NONE" || a.productionAuthority !== "NONE"
    || a.engagementId !== a.projectId || !Number.isFinite(a.expiresAt) || a.expiresAt <= now
    || [a.tenantId, a.projectId, a.operatorId, a.environmentId, a.hostId, a.fixtureId].some(x => typeof x !== "string" || !x.trim())
    || !/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(a.baselineCommit)
    || a.baselineTree?.length !== a.baselineCommit.length || !/^[a-f0-9]+$/.test(a.baselineTree)
    || !/^sha256:[a-f0-9]{64}$/.test(a.fixtureContentDigest)
    || !/^\/private\/tmp\/mc-local-qualification-[a-f0-9]{32}\/repository$/.test(a.root)) {
    throw new Error("Local qualification admission is malformed, expired or outside the disposable fixture scope.");
  }
  return a;
}

export function localRepositoryAdmissionDigest(a: LocalRepositoryAdmission): string {
  return `sha256:${computeCanonicalHash(a)}`;
}

export function isLocalQualificationRepository(repository: any): boolean {
  return repository?.repositoryMode === LOCAL_QUALIFICATION_MODE || repository?.provider === "LOCAL"
    || repository?.localAdmission !== undefined || repository?.localAdmissionDigest !== undefined;
}

export function assertLocalRepositoryScope(input: {
  admission: LocalRepositoryAdmission; project: any; tenant: any; operator: any; environment: any;
  actorId: string; repository?: any;
}) {
  const { admission: a, project: p, tenant: t, operator: o, environment: e, repository: r } = input;
  const fixture = (row: any) => row?.metadata?.schema === a.program && row.metadata.synthetic === true
    && row.metadata.productionAuthority === false;
  if (p?._id !== a.projectId || p.tenantId !== a.tenantId || !fixture(p)
    || t?._id !== a.tenantId || !t.active || !fixture(t)
    || o?._id !== a.operatorId || o.tenantId !== a.tenantId || !o.active || !fixture(o)
    || o.authId !== "user_SyntheticHandoffQualification" || input.actorId !== a.operatorId
    || p.slug !== "synthetic-unpublished-handoff" || t.slug !== "synthetic-handoff-qualification"
    || e?._id !== a.environmentId || e.tenantId !== a.tenantId || e.type !== "dev"
    || e.metadata?.schema !== "factory-qualification-environment/v1" || e.metadata.synthetic !== true
    || e.metadata.projectId !== a.projectId) throw new Error("Local repository admission requires the exact approved synthetic identity and development environment.");
  const digest = localRepositoryAdmissionDigest(a);
  if (r && (r.provider !== "LOCAL" || r.repositoryMode !== LOCAL_QUALIFICATION_MODE
    || r.projectId !== a.projectId || r.tenantId !== a.tenantId || r.providerRepositoryId !== undefined
    || r.repository !== `local-qualification/${a.fixtureId}` || r.localAdmissionDigest !== digest
    || localRepositoryAdmissionDigest(r.localAdmission) !== digest
    || e.metadata.repositoryId !== r._id)) throw new Error("Local repository identity or admission changed.");
  return digest;
}

export function assertRepositoryPublicationAllowed(repository: any): void {
  if (!repository || repository.provider !== "GITHUB" || isLocalQualificationRepository(repository)) {
    throw new Error("Repository has no GitHub publication, PR, merge, release or production authority.");
  }
}

export async function loadLocalRepositoryAdmission(ctx: Pick<QueryCtx, "db">, repository: any, now: number, version?: any) {
  if (!repository || !isLocalQualificationRepository(repository)) {
    throw new Error("Exact local qualification repository is missing.");
  }
  const a = parseLocalRepositoryAdmission(process.env.MC_LOCAL_REPOSITORY_ADMISSION, now);
  const [project, tenant, operator, environment] = await Promise.all([
    ctx.db.get(a.projectId as Id<"projects">), ctx.db.get(a.tenantId as Id<"tenants">),
    ctx.db.get(a.operatorId as Id<"operators">), ctx.db.get(a.environmentId as Id<"environments">),
  ]);
  const digest = assertLocalRepositoryScope({ admission: a, project, tenant, operator, environment, actorId: a.operatorId, repository });
  if (version && (version.repositoryAdmissionDigest !== digest || version.repositoryMode !== LOCAL_QUALIFICATION_MODE
    || version.projectId !== a.projectId || version.tenantId !== a.tenantId || version.repositoryId !== repository._id
    || version.environmentId !== a.environmentId || version.executionBackend !== "isolated-container"
    || version.inferenceConstraint?.mode !== "DENIED")) throw new Error("Factory composition does not admit this exact local repository capability.");
  return { admission: a, digest, environment };
}

export function assertLocalRepositoryHost(a: LocalRepositoryAdmission, digest: string, host: any, now: number) {
  const o = host?.localQualificationObservation;
  if (!host || host.projectId !== a.projectId || host.hostId !== a.hostId || host.checkoutRoot !== a.root
    || host.status !== "READY" || host.dirty || host.baseCommit !== a.baselineCommit
    || !o || o.admissionDigest !== digest || o.root !== a.root || o.baselineCommit !== a.baselineCommit
    || o.baselineTree !== a.baselineTree || o.fixtureContentDigest !== a.fixtureContentDigest
    || o.noRemotes !== true || !Number.isSafeInteger(o.observedAt) || o.observedAt < 0
    || o.observedAt > now || now - o.observedAt > 60000) {
    throw new Error("Local repository ownership observation is stale or does not match admission.");
  }
}
