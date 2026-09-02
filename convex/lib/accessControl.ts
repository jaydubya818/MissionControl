import {
  ACCESS_CONTROL_MODES,
  ACCESS_PROFILE_DEFAULTS,
  ACCESS_PERMISSIONS,
  PERSONA_KEYS,
  isAccessPermission,
  isAccessViewKey,
  isPersonaKey,
  isScopeLens,
  validateAccessProfileDraft,
  type AccessControlMode,
  type AccessPermission,
  type AccessProfileDraft,
  type AccessViewKey,
  type PersonaKey,
  type ScopeLens,
} from "@mission-control/shared";

export {
  ACCESS_CONTROL_MODES,
  ACCESS_PROFILE_DEFAULTS,
  ACCESS_PERMISSIONS,
  PERSONA_KEYS,
  isAccessPermission,
  isAccessViewKey,
  isPersonaKey,
  isScopeLens,
  validateAccessProfileDraft,
};

export type {
  AccessControlMode,
  AccessPermission,
  AccessViewKey,
  PersonaKey,
  ScopeLens,
};

export interface NormalizedAccessProfileDraft {
  permissions: AccessPermission[];
  visibleViews: AccessViewKey[];
  defaultLandingView: AccessViewKey;
  defaultScopeLens: ScopeLens;
}
const PERSONA_PRIORITY: Record<PersonaKey, number> = {
  ADMIN: 4,
  ARCHITECT: 3,
  EXECUTIVE: 2,
  BUILDER: 1,
};

export function normalizeAccessProfileDraft(
  systemKey: PersonaKey,
  draft: AccessProfileDraft,
): { ok: true; value: NormalizedAccessProfileDraft } | { ok: false; errors: string[] } {
  const permissions = [...new Set(draft.permissions.map((value) => value.trim()).filter(Boolean))];
  const visibleViews = [...new Set(draft.visibleViews.map((value) => value.trim()).filter(Boolean))];
  const normalized = {
    permissions,
    visibleViews,
    defaultLandingView: draft.defaultLandingView.trim(),
    defaultScopeLens: draft.defaultScopeLens.trim(),
  };
  const validation = validateAccessProfileDraft(systemKey, normalized);
  if (!validation.valid) return { ok: false, errors: validation.errors };
  return {
    ok: true,
    value: {
      permissions: permissions as AccessPermission[],
      visibleViews: visibleViews as AccessViewKey[],
      defaultLandingView: normalized.defaultLandingView as AccessViewKey,
      defaultScopeLens: normalized.defaultScopeLens as ScopeLens,
    },
  };
}

export function selectPrimaryPersona<T extends { systemKey?: string }>(
  roles: readonly T[],
): { role?: T; systemKey?: PersonaKey; conflict: boolean } {
  const candidates = roles
    .filter((role): role is T & { systemKey: PersonaKey } =>
      Boolean(role.systemKey && isPersonaKey(role.systemKey))
    )
    .sort((left, right) => PERSONA_PRIORITY[right.systemKey] - PERSONA_PRIORITY[left.systemKey]);
  return {
    role: candidates[0],
    systemKey: candidates[0]?.systemKey,
    conflict: candidates.length > 1,
  };
}

export function isScopeAllowedForPersona(
  systemKey: PersonaKey,
  scopeType: "tenant" | "project" | "team" | "repository" | "environment",
): boolean {
  if (systemKey === "ADMIN" || systemKey === "EXECUTIVE") return scopeType === "tenant";
  if (systemKey === "ARCHITECT") return scopeType === "tenant" || scopeType === "project";
  return scopeType === "project" || scopeType === "team";
}

export function canTransitionAccessControlMode(
  current: AccessControlMode,
  next: AccessControlMode,
): boolean {
  if (current === next) return true;
  if (current === "LEGACY") return next === "SHADOW";
  if (current === "SHADOW") return next === "LEGACY" || next === "ENFORCED";
  return next === "SHADOW" || next === "LEGACY";
}

export function mapLegacyRoleNameToPersona(name: string): PersonaKey | undefined {
  const normalized = name.trim().toLowerCase();
  if (["company owner", "owner", "company admin", "admin"].includes(normalized)) return "ADMIN";
  if (["developer", "software engineer"].includes(normalized)) return "BUILDER";
  if (["read-only auditor", "observer"].includes(normalized)) return "EXECUTIVE";
  if (["architect", "platform architect"].includes(normalized)) return "ARCHITECT";
  return undefined;
}

export function accessProfileDiff(
  current: Pick<NormalizedAccessProfileDraft, "permissions" | "visibleViews">,
  proposed: Pick<NormalizedAccessProfileDraft, "permissions" | "visibleViews">,
) {
  const currentPermissions = new Set(current.permissions);
  const proposedPermissions = new Set(proposed.permissions);
  const currentViews = new Set(current.visibleViews);
  const proposedViews = new Set(proposed.visibleViews);
  return {
    permissionsAdded: proposed.permissions.filter((item) => !currentPermissions.has(item)),
    permissionsRemoved: current.permissions.filter((item) => !proposedPermissions.has(item)),
    viewsAdded: proposed.visibleViews.filter((item) => !currentViews.has(item)),
    viewsRemoved: current.visibleViews.filter((item) => !proposedViews.has(item)),
  };
}
