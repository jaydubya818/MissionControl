import type { CapabilityDescriptor, CapabilityRegistry, CapabilityResolution, OwnerScope, PolicySnapshot, WorkAuthority, WorkBinding } from './types.ts';

function sameScope(left: OwnerScope, right: OwnerScope): boolean {
  return ['ownerId', 'organizationId', 'installationId', 'environment'].every(key => {
    const field = key as keyof OwnerScope;
    return typeof left[field] === 'string' && left[field].length > 0 && left[field] === right[field];
  });
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function platformDefaults(snapshot: PolicySnapshot, now: number): boolean {
  const policy = snapshot.platformOwnerPolicy;
  return !!policy && ['development', 'qualification'].includes(snapshot.scope.environment)
    && sameScope(policy, snapshot.scope) && policy.status === 'ACTIVE' && positiveInteger(policy.revision)
    && Number.isFinite(policy.expiresAt) && policy.expiresAt > now
    && [policy.id, policy.administrationRecordId, policy.membershipRecordId, policy.installationRecordId, policy.auditRecordId]
      .every(value => typeof value === 'string' && value.trim().length > 0);
}

function sameWork(left: WorkBinding, right: WorkBinding): boolean {
  return typeof left.workId === 'string' && left.workId.length > 0 && left.workId === right.workId
    && positiveInteger(left.workVersion) && left.workVersion === right.workVersion
    && positiveInteger(left.workGeneration) && left.workGeneration === right.workGeneration;
}

function budgetRemaining(authority: WorkAuthority): number | null {
  const budget = authority.budget;
  if (!budget || budget.exposure !== 'KNOWN' || ![budget.limitMicros, budget.reservedMicros, budget.spentMicros, budget.requestedMicros]
    .every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  const remaining = budget.limitMicros - budget.reservedMicros - budget.spentMicros;
  return Number.isSafeInteger(remaining) && remaining >= budget.requestedMicros ? remaining : null;
}

function grantCurrent(authority: WorkAuthority, snapshot: PolicySnapshot, now: number): boolean {
  return sameScope(authority, snapshot.scope) && authority.status === 'ACTIVE'
    && authority.policyRevision === snapshot.revision && positiveInteger(authority.grantRevision)
    && authority.grantRevision === authority.currentGrantRevision
    && Number.isFinite(authority.expiresAt) && authority.expiresAt > now
    && typeof authority.agentId === 'string' && authority.agentId.length > 0
    && Array.isArray(authority.capabilities) && Array.isArray(authority.permissions);
}

function authorityReasons(descriptor: CapabilityDescriptor, snapshot: PolicySnapshot, now: number): string[] {
  const grant = snapshot.authority;
  const work = snapshot.requestedWork;
  if (!grant || !work) return ['EXACT_WORK_AUTHORITY_REQUIRED'];
  const reasons: string[] = [];
  if (!grantCurrent(grant, snapshot, now) || !sameWork(grant, work) || grant.agentId !== work.agentId) reasons.push('WORK_AUTHORITY_STALE_OR_OUT_OF_SCOPE');
  if (!grant.capabilities?.includes(descriptor.id)) reasons.push('AGENT_CAPABILITY_NOT_GRANTED');
  if (!descriptor.requiredPermissions.every(permission => grant.permissions?.includes(permission))) reasons.push('PERMISSION_REQUIRED');
  if (grant.approval !== 'APPROVED') reasons.push(grant.approval === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'WORK_APPROVAL_REQUIRED');
  if (budgetRemaining(grant) === null) reasons.push('BUDGET_RESTRICTED');
  if (grant.parentAgentId) {
    const parent = snapshot.parentAuthority;
    if (!parent || parent.parentAgentId || parent.agentId !== grant.parentAgentId || parent.agentId === grant.agentId
      || !grantCurrent(parent, snapshot, now) || !sameWork(parent, grant) || parent.approval !== 'APPROVED'
      || grant.expiresAt > parent.expiresAt
      || !grant.capabilities.every(capability => parent.capabilities.includes(capability))
      || !grant.permissions.every(permission => parent.permissions.includes(permission))
      || budgetRemaining(parent) === null || grant.budget.limitMicros > budgetRemaining(parent)!) reasons.push('PARENT_AUTHORITY_REQUIRED');
  }
  return reasons;
}

/** Eligibility is not a grant. Admission must atomically recheck this revision and canonical Work authority. */
export function resolveCapabilities(registry: CapabilityRegistry, snapshot: PolicySnapshot, now: number): CapabilityResolution[] {
  const current = Number.isFinite(now) && positiveInteger(snapshot.revision)
    && snapshot.registryVersion === registry.version && sameScope(snapshot.scope, snapshot.scope)
    && ['development', 'qualification', 'production'].includes(snapshot.scope.environment)
    && Number.isFinite(snapshot.observedAt) && snapshot.observedAt <= now
    && Number.isFinite(snapshot.expiresAt) && snapshot.expiresAt > now;
  const platformOwner = current && platformDefaults(snapshot, now);
  const byId = new Map(registry.capabilities.map(item => [item.id, item]));
  const resolved = new Map<string, CapabilityResolution>();
  function resolve(descriptor: CapabilityDescriptor): CapabilityResolution {
    const existing = resolved.get(descriptor.id);
    if (existing) return existing;
    const preference = snapshot.preferences[descriptor.id]
      ?? (platformOwner ? 'ENABLED' : snapshot.ordinaryDefaults[descriptor.id] ?? descriptor.ordinaryDefault);
    const preferenceSource = snapshot.preferences[descriptor.id] ? 'OWNER' : platformOwner ? 'PLATFORM_OWNER_POLICY' : 'ORDINARY_DEFAULT';
    const facts = snapshot.facts[descriptor.id];
    const reasons: string[] = [];
    if (!current) reasons.push('POLICY_SNAPSHOT_STALE_OR_INVALID');
    if (!descriptor.environments.includes(snapshot.scope.environment)) reasons.push('UNSUPPORTED_ENVIRONMENT');
    if (facts?.supported !== true) reasons.push('PLATFORM_UNSUPPORTED');
    if (facts?.deployed !== true) reasons.push('DEPLOYMENT_UNAVAILABLE');
    if (facts?.entitled !== true) reasons.push('ORGANIZATION_NOT_ENTITLED');
    if (facts?.administrator !== 'ALLOW') reasons.push(facts?.administrator === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'ADMINISTRATOR_DENIED');
    const availability = reasons.length ? 'UNAVAILABLE' : 'AVAILABLE';
    const setupMissing = descriptor.setupRequirements.filter(key => facts?.setup?.[key] !== true);
    const qualificationMissing = descriptor.qualificationRequirements.filter(key => facts?.qualification?.[key] !== 'QUALIFIED');
    reasons.push(...setupMissing.map(key => `SETUP:${key}`), ...qualificationMissing.map(key => `QUALIFICATION:${key}`));
    const selected = facts?.selectedAlternative;
    const routeMissing = descriptor.alternativeDependencies.length > 0
      && (!selected || !descriptor.alternativeDependencies.includes(selected));
    if (routeMissing) reasons.push('DEPENDENCY_ROUTE_REQUIRED');
    const dependencyIds = [...descriptor.dependencies,
      ...(selected && descriptor.alternativeDependencies.includes(selected) ? [selected] : [])];
    const dependencies = dependencyIds.map(id => resolve(byId.get(id)!));
    const blockedDependencies = dependencies.filter(dependency => dependency.preference !== 'ENABLED'
      || dependency.availability !== 'AVAILABLE' || dependency.readiness !== 'READY' || dependency.lifecycle !== 'ACTIVE');
    reasons.push(...blockedDependencies.map(dependency => `DEPENDENCY:${dependency.id}`));
    let readiness: CapabilityResolution['readiness'] = setupMissing.length ? 'SETUP_REQUIRED'
      : qualificationMissing.length ? 'QUALIFICATION_REQUIRED' : 'READY';
    if ((blockedDependencies.length || routeMissing) && readiness === 'READY') readiness = 'SETUP_REQUIRED';
    const lifecycle = facts?.lifecycle ?? 'UNKNOWN';
    if (lifecycle !== 'ACTIVE') reasons.push(`LIFECYCLE:${lifecycle}`);
    if (preference !== 'ENABLED') reasons.push('OWNER_DISABLED_NEW_WORK');
    const grantReasons = authorityReasons(descriptor, snapshot, now);
    if (snapshot.requestedWork) grantReasons.push(...dependencies.filter(dependency => dependency.authority !== 'AUTHORIZED')
      .map(dependency => dependency.authority === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : `DEPENDENCY_AUTHORITY:${dependency.id}`));
    const authority: CapabilityResolution['authority'] = !current ? 'NOT_GRANTED' : grantReasons.length === 0 ? 'AUTHORIZED'
      : grantReasons.every(reason => reason === 'PENDING_APPROVAL') ? 'PENDING_APPROVAL' : 'NOT_GRANTED';
    reasons.push(...grantReasons);
    const admissionEligible = availability === 'AVAILABLE' && readiness === 'READY' && preference === 'ENABLED'
      && lifecycle === 'ACTIVE' && authority === 'AUTHORIZED';
    const label = lifecycle === 'REVOKED' || lifecycle === 'PAUSED' ? lifecycle
      : preference === 'DISABLED' ? 'DISABLED'
      : readiness !== 'READY' ? 'ENABLED — SETUP OR QUALIFICATION REQUIRED'
      : current && facts?.supported === true && facts.deployed === true && facts.entitled === true
        && facts.administrator === 'PENDING_APPROVAL' && lifecycle === 'ACTIVE' ? 'PENDING_APPROVAL'
      : availability !== 'AVAILABLE' ? 'UNAVAILABLE'
      : lifecycle !== 'ACTIVE' ? lifecycle
      : authority === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL'
      : admissionEligible ? 'ACTIVE' : 'ENABLED';
    const result: CapabilityResolution = { id: descriptor.id, version: descriptor.version, registryVersion: registry.version,
      policyRevision: snapshot.revision, preference, preferenceSource, availability, readiness, lifecycle, authority,
      administrator: facts?.administrator ?? 'DENY',
      admissionEligible, label, reasons: [...new Set(reasons)].sort() };
    resolved.set(descriptor.id, result);
    return result;
  }
  return registry.capabilities.map(resolve);
}
