import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { installedMaxDurationSeconds, parseOwnerEnrollment, permitDenied, permitOrigin } from '../../packages/shared/src/executionPermit';

export type InstalledOrigins = { environment: 'APPROVED_NONPRODUCTION'; issuer: string; audience: string; audiences?: Record<string, string> };
/**
 * `{environment, issuer, audience, audiences?}`. `audience` is the default for installations without an `audiences` entry;
 * the optional `audiences` map pins an installation to its own origin. A malformed `audiences` map denies everything.
 */
export function installedOrigins(): InstalledOrigins {
  const raw = process.env.MC_SOFIE_INSTALLED_ORIGINS;
  let config: any; try { config = JSON.parse(raw ?? 'null'); } catch { return permitDenied(); }
  if (config?.environment !== 'APPROVED_NONPRODUCTION' || !permitOrigin(config.issuer) || !permitOrigin(config.audience)
    || config.issuer === config.audience) return permitDenied();
  if (config.audiences !== undefined) {
    const audiences = config.audiences;
    if (!audiences || typeof audiences !== 'object' || Array.isArray(audiences)
      || !Object.entries(audiences).every(([id, origin]) => !!id.trim() && typeof origin === 'string' && !!permitOrigin(origin) && origin !== config.issuer))
      return permitDenied();
  }
  return config as InstalledOrigins;
}
/** The audience an installation's enrollment must carry. */
export function installedAudienceFor(origins: InstalledOrigins, installationId: unknown): string {
  const audiences = origins.audiences;
  return audiences && typeof installationId === 'string' && Object.prototype.hasOwnProperty.call(audiences, installationId)
    ? audiences[installationId] : origins.audience;
}
export async function installedEnrollment(ctx: Pick<MutationCtx | QueryCtx, 'db'>, connection: Doc<'enterpriseAppConnections'>) {
  const enrollment = parseOwnerEnrollment(connection.installedEnrollment), origins = installedOrigins(), now = Date.now();
  const project = await ctx.db.get(connection.projectId);
  if (project?.metadata?.sofieMode !== 'INSTALLED_NONPRODUCTION' || project.metadata.productionAuthority !== false
    || project.tenantId !== connection.tenantId || !project.tenantId || !(await ctx.db.get(project.tenantId))?.active
    || enrollment.issuer !== origins.issuer || enrollment.audience !== installedAudienceFor(origins, enrollment.installationId) || enrollment.connectionId !== connection._id
    || enrollment.missionControlOwnerId !== connection.ownerId || enrollment.projectId !== connection.projectId
    || enrollment.tenantId !== connection.tenantId || enrollment.revokedAt !== null || enrollment.activeFrom > now || enrollment.expiresAt <= now
    || enrollment.expiresAt > connection.expiresAt || enrollment.maxCostMicrousd > 1300000 || enrollment.maxDurationSeconds > installedMaxDurationSeconds()) return permitDenied();
  return { enrollment, project };
}
export function configuredConnectionSecret(connectionId: string, keyId?: string): string | undefined {
  let keys: unknown; try { keys = JSON.parse(process.env.MC_SOFIE_CONNECTION_SECRETS ?? '{}'); } catch { return permitDenied(); }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return permitDenied();
  if (!Object.prototype.hasOwnProperty.call(keys, connectionId)) return undefined;
  const value = (keys as Record<string, any>)[connectionId];
  if (!value || typeof value.secret !== 'string' || value.secret.length < 32 || typeof value.keyId !== 'string'
    || (keyId !== undefined && value.keyId !== keyId)) return permitDenied();
  return value.secret;
}
export function installedServiceSecret(connectionId: string, keyId: string): string {
  return configuredConnectionSecret(connectionId, keyId) ?? permitDenied();
}
