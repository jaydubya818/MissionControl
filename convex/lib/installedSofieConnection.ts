import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { parseOwnerEnrollment, permitDenied, permitOrigin } from '../../packages/shared/src/executionPermit';

export function installedOrigins() {
  const raw = process.env.MC_SOFIE_INSTALLED_ORIGINS;
  let config: any; try { config = JSON.parse(raw ?? 'null'); } catch { return permitDenied(); }
  if (config?.environment !== 'APPROVED_NONPRODUCTION' || !permitOrigin(config.issuer) || !permitOrigin(config.audience)
    || config.issuer === config.audience) return permitDenied();
  return config as { environment: 'APPROVED_NONPRODUCTION'; issuer: string; audience: string };
}
export async function installedEnrollment(ctx: Pick<MutationCtx | QueryCtx, 'db'>, connection: Doc<'enterpriseAppConnections'>) {
  const enrollment = parseOwnerEnrollment(connection.installedEnrollment), origins = installedOrigins(), now = Date.now();
  const project = await ctx.db.get(connection.projectId);
  if (project?.metadata?.sofieMode !== 'INSTALLED_NONPRODUCTION' || project.metadata.productionAuthority !== false
    || project.tenantId !== connection.tenantId || !project.tenantId || !(await ctx.db.get(project.tenantId))?.active
    || enrollment.issuer !== origins.issuer || enrollment.audience !== origins.audience || enrollment.connectionId !== connection._id
    || enrollment.missionControlOwnerId !== connection.ownerId || enrollment.projectId !== connection.projectId
    || enrollment.tenantId !== connection.tenantId || enrollment.revokedAt !== null || enrollment.activeFrom > now || enrollment.expiresAt <= now
    || enrollment.expiresAt > connection.expiresAt || enrollment.maxCostMicrousd > 1300000 || enrollment.maxDurationSeconds > 180) return permitDenied();
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
