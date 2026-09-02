/**
 * Canonical human access-control contract shared by Convex and the operator UI.
 *
 * Authentication remains provider-owned. These values describe Mission
 * Control authorization and presentation defaults only.
 */

export const PERSONA_KEYS = [
  "EXECUTIVE",
  "ARCHITECT",
  "BUILDER",
  "ADMIN",
] as const;

export type PersonaKey = (typeof PERSONA_KEYS)[number];

export const SCOPE_LENSES = [
  "MY_WORK",
  "TEAM",
  "WORKSPACE",
  "COMPANY",
] as const;

export type ScopeLens = (typeof SCOPE_LENSES)[number];

export const PERSONA_SCOPE_LENSES = {
  EXECUTIVE: ["COMPANY"],
  ARCHITECT: ["WORKSPACE", "COMPANY"],
  BUILDER: ["MY_WORK", "TEAM", "WORKSPACE"],
  ADMIN: ["COMPANY"],
} as const satisfies Record<PersonaKey, readonly ScopeLens[]>;

export const ACCESS_CONTROL_MODES = ["LEGACY", "SHADOW", "ENFORCED"] as const;
export type AccessControlMode = (typeof ACCESS_CONTROL_MODES)[number];

export const ACCESS_PERMISSIONS = {
  COMPANY_MANAGE: "company.manage",
  MEMBERS_MANAGE: "members.manage",
  ACCESS_PROFILES_READ: "accessProfiles.read",
  ACCESS_PROFILES_MANAGE: "accessProfiles.manage",
  WORKSPACES_CREATE: "workspaces.create",
  WORKSPACES_MANAGE: "workspaces.manage",
  REPOSITORIES_MANAGE: "repositories.manage",
  TEAMS_MANAGE: "teams.manage",
  SETTINGS_READ: "settings.read",
  SETTINGS_MANAGE: "settings.manage",
  SYSTEM_READ: "system.read",
  SYSTEM_MANAGE: "system.manage",

  FACTORY_READ: "factory.read",
  FACTORY_IMPROVE: "factory.improve",
  FACTORY_APPROVE: "factory.approve",
  FACTORY_AUTOMATION_MANAGE: "factory.automation.manage",
  MISSIONS_READ: "missions.read",
  MISSIONS_WRITE: "missions.write",
  MISSIONS_APPROVE: "missions.approve",
  WORKORDERS_READ: "workorders.read",
  WORKORDERS_WRITE: "workorders.write",
  WORKORDERS_DISPATCH: "workorders.dispatch",
  TASKS_READ: "tasks.read",
  TASKS_WRITE: "tasks.write",
  DELIVERY_ASSIGN: "delivery.assign",
  DELIVERY_DISPATCH: "delivery.dispatch",
  DELIVERY_WRITE: "delivery.write",
  DELIVERY_VERIFY: "delivery.verify",
  DELIVERY_APPROVE: "delivery.approve",
  DELIVERY_RECOVER: "delivery.recover",
  EVIDENCE_READ: "evidence.read",
  EVIDENCE_WRITE: "evidence.write",

  APPROVALS_READ: "approvals.read",
  APPROVALS_DECIDE: "approvals.decide",
  AUDIT_READ: "audit.read",
  TELEMETRY_READ: "telemetry.read",
  ANALYTICS_READ: "analytics.read",
  AGENTS_READ: "agents.read",
  AGENTS_MANAGE: "agents.manage",
  AUTOMATION_READ: "automation.read",
  POLICY_READ: "policy.read",
  POLICY_MANAGE: "policy.manage",
  QUALITY_READ: "quality.read",
  QUALITY_MANAGE: "quality.manage",
  DEPLOYMENTS_READ: "deployments.read",
  DEPLOYMENTS_CREATE: "deployments.create",
  DEPLOYMENTS_ACTIVATE: "deployments.activate",
  DEPLOYMENTS_ROLLBACK: "deployments.rollback",
  EXECUTION_ROUTING_READ: "executionRouting.read",
  EXECUTION_ROUTING_MANAGE: "executionRouting.manage",
  IDENTITY_READ: "identity.read",
  IDENTITY_MANAGE: "identity.manage",
  CONTEXT_READ: "context.read",
  CONTEXT_MANAGE: "context.manage",
  DOCS_READ: "docs.read",
} as const;

export type AccessPermission =
  (typeof ACCESS_PERMISSIONS)[keyof typeof ACCESS_PERMISSIONS];

export const ALL_ACCESS_PERMISSIONS = Object.freeze(
  [...new Set(Object.values(ACCESS_PERMISSIONS))] as AccessPermission[],
);

export type AccessPermissionGroup = "READ" | "BUILD_OPERATE" | "GOVERN_APPROVE" | "ADMIN";

export const ACCESS_PERMISSION_DETAILS = {
  [ACCESS_PERMISSIONS.COMPANY_MANAGE]: { label: "Manage company", description: "Change company-level configuration and ownership controls.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.MEMBERS_MANAGE]: { label: "Manage members", description: "Add, deactivate, and update human company memberships.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.ACCESS_PROFILES_READ]: { label: "View access profiles", description: "Inspect persona defaults, revisions, and assignment posture.", group: "READ" },
  [ACCESS_PERMISSIONS.ACCESS_PROFILES_MANAGE]: { label: "Manage access profiles", description: "Activate profile changes, restore revisions, and assign personas.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.WORKSPACES_CREATE]: { label: "Create workspaces", description: "Create a new governed software-delivery workspace.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.WORKSPACES_MANAGE]: { label: "Manage workspaces", description: "Change workspace configuration and lifecycle state.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.REPOSITORIES_MANAGE]: { label: "Manage repositories", description: "Connect and change governed repository boundaries.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.TEAMS_MANAGE]: { label: "Manage teams", description: "Configure delivery teams and membership.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.SETTINGS_READ]: { label: "View settings", description: "Inspect administrative configuration without changing it.", group: "READ" },
  [ACCESS_PERMISSIONS.SETTINGS_MANAGE]: { label: "Manage settings", description: "Change administrative configuration.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.SYSTEM_READ]: { label: "View system state", description: "Inspect platform and database operating state.", group: "READ" },
  [ACCESS_PERMISSIONS.SYSTEM_MANAGE]: { label: "Manage system state", description: "Run sensitive platform administration operations.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.FACTORY_READ]: { label: "View factory", description: "Inspect software-factory status, flow, and evidence.", group: "READ" },
  [ACCESS_PERMISSIONS.FACTORY_IMPROVE]: { label: "Improve factory", description: "Change delivery flow and bounded factory behavior.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.FACTORY_APPROVE]: { label: "Approve factory changes", description: "Approve governed changes to the factory operating model.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.FACTORY_AUTOMATION_MANAGE]: { label: "Manage factory automation", description: "Configure automated factory execution and recovery.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.MISSIONS_READ]: { label: "View missions", description: "Inspect mission intent, outcome, risk, and progress.", group: "READ" },
  [ACCESS_PERMISSIONS.MISSIONS_WRITE]: { label: "Change missions", description: "Create and update mission intent and planning.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.MISSIONS_APPROVE]: { label: "Approve missions", description: "Accept governed mission decisions and outcomes.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.WORKORDERS_READ]: { label: "View work orders", description: "Inspect scoped delivery work and execution status.", group: "READ" },
  [ACCESS_PERMISSIONS.WORKORDERS_WRITE]: { label: "Change work orders", description: "Create and update scoped delivery work.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.WORKORDERS_DISPATCH]: { label: "Dispatch work orders", description: "Send approved work into bounded execution.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.TASKS_READ]: { label: "View tasks", description: "Inspect scoped implementation tasks.", group: "READ" },
  [ACCESS_PERMISSIONS.TASKS_WRITE]: { label: "Change tasks", description: "Create and update scoped implementation tasks.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DELIVERY_ASSIGN]: { label: "Assign delivery", description: "Assign delivery work to eligible people or agents.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DELIVERY_DISPATCH]: { label: "Dispatch delivery", description: "Start bounded delivery execution.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DELIVERY_WRITE]: { label: "Update delivery", description: "Record delivery progress and implementation changes.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DELIVERY_VERIFY]: { label: "Verify delivery", description: "Run and record delivery verification.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DELIVERY_APPROVE]: { label: "Approve delivery", description: "Make governed acceptance decisions for delivery.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.DELIVERY_RECOVER]: { label: "Recover delivery", description: "Retry, repair, or resume failed scoped delivery.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.EVIDENCE_READ]: { label: "View evidence", description: "Inspect verification and decision evidence.", group: "READ" },
  [ACCESS_PERMISSIONS.EVIDENCE_WRITE]: { label: "Record evidence", description: "Attach scoped verification and recovery evidence.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.APPROVALS_READ]: { label: "View approvals", description: "Inspect approval requests and decision history.", group: "READ" },
  [ACCESS_PERMISSIONS.APPROVALS_DECIDE]: { label: "Decide approvals", description: "Approve or reject governed requests.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.AUDIT_READ]: { label: "View audit history", description: "Inspect immutable authorization and operating history.", group: "READ" },
  [ACCESS_PERMISSIONS.TELEMETRY_READ]: { label: "View telemetry", description: "Inspect failures, traces, incidents, and recovery signals.", group: "READ" },
  [ACCESS_PERMISSIONS.ANALYTICS_READ]: { label: "View analytics", description: "Inspect value, cost, throughput, and risk metrics.", group: "READ" },
  [ACCESS_PERMISSIONS.AGENTS_READ]: { label: "View agents", description: "Inspect agent identity, health, and assignments.", group: "READ" },
  [ACCESS_PERMISSIONS.AGENTS_MANAGE]: { label: "Manage agents", description: "Register, configure, pause, and retire agents.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.AUTOMATION_READ]: { label: "View automations", description: "Inspect automation definitions, runs, and receipts.", group: "READ" },
  [ACCESS_PERMISSIONS.POLICY_READ]: { label: "View policy", description: "Inspect policy, boundaries, and enforcement posture.", group: "READ" },
  [ACCESS_PERMISSIONS.POLICY_MANAGE]: { label: "Manage policy", description: "Change governed policy and enforcement configuration.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.QUALITY_READ]: { label: "View quality controls", description: "Inspect quality gates, evaluations, and findings.", group: "READ" },
  [ACCESS_PERMISSIONS.QUALITY_MANAGE]: { label: "Manage quality controls", description: "Configure quality gates and verification rules.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.DEPLOYMENTS_READ]: { label: "View deployments", description: "Inspect release state and deployment evidence.", group: "READ" },
  [ACCESS_PERMISSIONS.DEPLOYMENTS_CREATE]: { label: "Create deployments", description: "Prepare a governed deployment candidate.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DEPLOYMENTS_ACTIVATE]: { label: "Activate deployments", description: "Promote an approved deployment candidate.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.DEPLOYMENTS_ROLLBACK]: { label: "Roll back deployments", description: "Restore a prior governed release state.", group: "GOVERN_APPROVE" },
  [ACCESS_PERMISSIONS.EXECUTION_ROUTING_READ]: { label: "View execution routing", description: "Inspect model and execution-routing decisions.", group: "READ" },
  [ACCESS_PERMISSIONS.EXECUTION_ROUTING_MANAGE]: { label: "Manage execution routing", description: "Change model and execution-routing policy.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.IDENTITY_READ]: { label: "View identities", description: "Inspect human, agent, and service identities.", group: "READ" },
  [ACCESS_PERMISSIONS.IDENTITY_MANAGE]: { label: "Manage identities", description: "Change governed identity configuration.", group: "ADMIN" },
  [ACCESS_PERMISSIONS.CONTEXT_READ]: { label: "View context", description: "Inspect skills, memory, and contextual assets.", group: "READ" },
  [ACCESS_PERMISSIONS.CONTEXT_MANAGE]: { label: "Manage context", description: "Change governed skills, memory, and context assets.", group: "BUILD_OPERATE" },
  [ACCESS_PERMISSIONS.DOCS_READ]: { label: "View documentation", description: "Read product and operating documentation.", group: "READ" },
} as const satisfies Record<AccessPermission, {
  label: string;
  description: string;
  group: AccessPermissionGroup;
}>;

export const ADMIN_LOCKED_PERMISSIONS = [
  ACCESS_PERMISSIONS.COMPANY_MANAGE,
  ACCESS_PERMISSIONS.MEMBERS_MANAGE,
  ACCESS_PERMISSIONS.ACCESS_PROFILES_READ,
  ACCESS_PERMISSIONS.ACCESS_PROFILES_MANAGE,
  ACCESS_PERMISSIONS.SETTINGS_READ,
  ACCESS_PERMISSIONS.SETTINGS_MANAGE,
] as const satisfies readonly AccessPermission[];

export const SUPPORTED_ACCESS_VIEWS = [
  "command-center",
  "missions",
  "mission-detail",
  "goals",
  "control-work-orders",
  "control-approvals",
  "tasks",
  "factory",
  "trace-inspector",
  "code",
  "dag",
  "agents",
  "atc",
  "automations",
  "automation-runs",
  "audit",
  "telemetry",
  "analytics",
  "operator-evals",
  "harness-loops",
  "effectiveness",
  "factory-health",
  "readiness",
  "friction",
  "recommendations",
  "dossier",
  "harness-code-review-wizard",
  "harness-change-review",
  "harness-automations",
  "harness-meta-loop",
  "skills",
  "registry-lifecycle",
  "registry-evaluate",
  "registry-inventory",
  "registry-installations",
  "registry-runs",
  "memory",
  "docs",
  "policies",
  "identity",
  "deployments",
  "qc-rulesets",
  "projects",
  "model-routing",
  "access-profiles",
  "gateway",
  "system",
  "design-system",
  "recorder",
  "test-generation",
  "api-import",
  "agent-catalog",
  "flaky-steps",
  "gherkin",
  "hybrid-workflows",
  "codegen",
  "pipeline",
] as const;

export type AccessViewKey = (typeof SUPPORTED_ACCESS_VIEWS)[number];

export const ACCESS_VIEW_REQUIREMENTS = {
  "command-center": ACCESS_PERMISSIONS.FACTORY_READ,
  missions: ACCESS_PERMISSIONS.MISSIONS_READ,
  "mission-detail": ACCESS_PERMISSIONS.MISSIONS_READ,
  goals: ACCESS_PERMISSIONS.MISSIONS_READ,
  "control-work-orders": ACCESS_PERMISSIONS.WORKORDERS_READ,
  "control-approvals": ACCESS_PERMISSIONS.APPROVALS_READ,
  tasks: ACCESS_PERMISSIONS.TASKS_READ,
  factory: ACCESS_PERMISSIONS.FACTORY_READ,
  "trace-inspector": ACCESS_PERMISSIONS.TELEMETRY_READ,
  code: ACCESS_PERMISSIONS.FACTORY_READ,
  dag: ACCESS_PERMISSIONS.TASKS_READ,
  agents: ACCESS_PERMISSIONS.AGENTS_READ,
  atc: ACCESS_PERMISSIONS.FACTORY_READ,
  automations: ACCESS_PERMISSIONS.AUTOMATION_READ,
  "automation-runs": ACCESS_PERMISSIONS.AUTOMATION_READ,
  audit: ACCESS_PERMISSIONS.AUDIT_READ,
  telemetry: ACCESS_PERMISSIONS.TELEMETRY_READ,
  analytics: ACCESS_PERMISSIONS.ANALYTICS_READ,
  "operator-evals": ACCESS_PERMISSIONS.QUALITY_READ,
  "harness-loops": ACCESS_PERMISSIONS.FACTORY_READ,
  effectiveness: ACCESS_PERMISSIONS.ANALYTICS_READ,
  "factory-health": ACCESS_PERMISSIONS.FACTORY_READ,
  readiness: ACCESS_PERMISSIONS.FACTORY_READ,
  friction: ACCESS_PERMISSIONS.TELEMETRY_READ,
  recommendations: ACCESS_PERMISSIONS.FACTORY_READ,
  dossier: ACCESS_PERMISSIONS.EVIDENCE_READ,
  "harness-code-review-wizard": ACCESS_PERMISSIONS.QUALITY_READ,
  "harness-change-review": ACCESS_PERMISSIONS.QUALITY_READ,
  "harness-automations": ACCESS_PERMISSIONS.AUTOMATION_READ,
  "harness-meta-loop": ACCESS_PERMISSIONS.FACTORY_READ,
  skills: ACCESS_PERMISSIONS.CONTEXT_READ,
  "registry-lifecycle": ACCESS_PERMISSIONS.CONTEXT_READ,
  "registry-evaluate": ACCESS_PERMISSIONS.CONTEXT_READ,
  "registry-inventory": ACCESS_PERMISSIONS.CONTEXT_READ,
  "registry-installations": ACCESS_PERMISSIONS.CONTEXT_READ,
  "registry-runs": ACCESS_PERMISSIONS.QUALITY_READ,
  memory: ACCESS_PERMISSIONS.CONTEXT_READ,
  docs: ACCESS_PERMISSIONS.DOCS_READ,
  policies: ACCESS_PERMISSIONS.POLICY_READ,
  identity: ACCESS_PERMISSIONS.IDENTITY_READ,
  deployments: ACCESS_PERMISSIONS.DEPLOYMENTS_READ,
  "qc-rulesets": ACCESS_PERMISSIONS.QUALITY_READ,
  projects: ACCESS_PERMISSIONS.SETTINGS_READ,
  "model-routing": ACCESS_PERMISSIONS.EXECUTION_ROUTING_READ,
  "access-profiles": ACCESS_PERMISSIONS.ACCESS_PROFILES_READ,
  gateway: ACCESS_PERMISSIONS.SYSTEM_READ,
  system: ACCESS_PERMISSIONS.SYSTEM_READ,
  "design-system": ACCESS_PERMISSIONS.SYSTEM_READ,
  recorder: ACCESS_PERMISSIONS.SYSTEM_READ,
  "test-generation": ACCESS_PERMISSIONS.QUALITY_READ,
  "api-import": ACCESS_PERMISSIONS.SYSTEM_MANAGE,
  "agent-catalog": ACCESS_PERMISSIONS.AGENTS_READ,
  "flaky-steps": ACCESS_PERMISSIONS.QUALITY_READ,
  gherkin: ACCESS_PERMISSIONS.QUALITY_READ,
  "hybrid-workflows": ACCESS_PERMISSIONS.FACTORY_READ,
  codegen: ACCESS_PERMISSIONS.SYSTEM_MANAGE,
  pipeline: ACCESS_PERMISSIONS.SYSTEM_MANAGE,
} as const satisfies Record<AccessViewKey, AccessPermission>;

export interface AccessProfileDefaults {
  systemKey: PersonaKey;
  name: string;
  description: string;
  defaultLandingView: AccessViewKey;
  defaultScopeLens: ScopeLens;
  permissions: readonly AccessPermission[];
  visibleViews: readonly AccessViewKey[];
}

const EXECUTIVE_PERMISSIONS = [
  ACCESS_PERMISSIONS.FACTORY_READ,
  ACCESS_PERMISSIONS.MISSIONS_READ,
  ACCESS_PERMISSIONS.WORKORDERS_READ,
  ACCESS_PERMISSIONS.TASKS_READ,
  ACCESS_PERMISSIONS.EVIDENCE_READ,
  ACCESS_PERMISSIONS.APPROVALS_READ,
  ACCESS_PERMISSIONS.AUDIT_READ,
  ACCESS_PERMISSIONS.TELEMETRY_READ,
  ACCESS_PERMISSIONS.ANALYTICS_READ,
  ACCESS_PERMISSIONS.AGENTS_READ,
  ACCESS_PERMISSIONS.AUTOMATION_READ,
  ACCESS_PERMISSIONS.POLICY_READ,
  ACCESS_PERMISSIONS.DEPLOYMENTS_READ,
  ACCESS_PERMISSIONS.CONTEXT_READ,
  ACCESS_PERMISSIONS.DOCS_READ,
] as const satisfies readonly AccessPermission[];

const ARCHITECT_PERMISSIONS = [
  ACCESS_PERMISSIONS.FACTORY_READ,
  ACCESS_PERMISSIONS.FACTORY_IMPROVE,
  ACCESS_PERMISSIONS.FACTORY_AUTOMATION_MANAGE,
  ACCESS_PERMISSIONS.MISSIONS_READ,
  ACCESS_PERMISSIONS.MISSIONS_WRITE,
  ACCESS_PERMISSIONS.WORKORDERS_READ,
  ACCESS_PERMISSIONS.TASKS_READ,
  ACCESS_PERMISSIONS.DELIVERY_VERIFY,
  ACCESS_PERMISSIONS.EVIDENCE_READ,
  ACCESS_PERMISSIONS.APPROVALS_READ,
  ACCESS_PERMISSIONS.AUDIT_READ,
  ACCESS_PERMISSIONS.TELEMETRY_READ,
  ACCESS_PERMISSIONS.ANALYTICS_READ,
  ACCESS_PERMISSIONS.AGENTS_READ,
  ACCESS_PERMISSIONS.AUTOMATION_READ,
  ACCESS_PERMISSIONS.POLICY_READ,
  ACCESS_PERMISSIONS.POLICY_MANAGE,
  ACCESS_PERMISSIONS.QUALITY_READ,
  ACCESS_PERMISSIONS.QUALITY_MANAGE,
  ACCESS_PERMISSIONS.DEPLOYMENTS_READ,
  ACCESS_PERMISSIONS.EXECUTION_ROUTING_READ,
  ACCESS_PERMISSIONS.EXECUTION_ROUTING_MANAGE,
  ACCESS_PERMISSIONS.IDENTITY_READ,
  ACCESS_PERMISSIONS.CONTEXT_READ,
  ACCESS_PERMISSIONS.CONTEXT_MANAGE,
  ACCESS_PERMISSIONS.DOCS_READ,
  ACCESS_PERMISSIONS.SETTINGS_READ,
  ACCESS_PERMISSIONS.WORKSPACES_MANAGE,
  ACCESS_PERMISSIONS.REPOSITORIES_MANAGE,
] as const satisfies readonly AccessPermission[];

const BUILDER_PERMISSIONS = [
  ACCESS_PERMISSIONS.FACTORY_READ,
  ACCESS_PERMISSIONS.FACTORY_IMPROVE,
  ACCESS_PERMISSIONS.MISSIONS_READ,
  ACCESS_PERMISSIONS.WORKORDERS_READ,
  ACCESS_PERMISSIONS.WORKORDERS_WRITE,
  ACCESS_PERMISSIONS.WORKORDERS_DISPATCH,
  ACCESS_PERMISSIONS.TASKS_READ,
  ACCESS_PERMISSIONS.TASKS_WRITE,
  ACCESS_PERMISSIONS.DELIVERY_DISPATCH,
  ACCESS_PERMISSIONS.DELIVERY_WRITE,
  ACCESS_PERMISSIONS.DELIVERY_VERIFY,
  ACCESS_PERMISSIONS.DELIVERY_RECOVER,
  ACCESS_PERMISSIONS.EVIDENCE_READ,
  ACCESS_PERMISSIONS.EVIDENCE_WRITE,
  ACCESS_PERMISSIONS.TELEMETRY_READ,
  ACCESS_PERMISSIONS.AGENTS_READ,
  ACCESS_PERMISSIONS.AUTOMATION_READ,
  ACCESS_PERMISSIONS.CONTEXT_READ,
  ACCESS_PERMISSIONS.DOCS_READ,
] as const satisfies readonly AccessPermission[];

export const ACCESS_PROFILE_DEFAULTS = {
  EXECUTIVE: {
    systemKey: "EXECUTIVE",
    name: "Executive",
    description: "Value, risk, governance, accountable autonomy, and outcome evidence.",
    defaultLandingView: "command-center",
    defaultScopeLens: "COMPANY",
    permissions: EXECUTIVE_PERMISSIONS,
    visibleViews: [
      "command-center",
      "missions",
      "mission-detail",
      "control-work-orders",
      "control-approvals",
      "audit",
      "telemetry",
      "analytics",
      "deployments",
      "docs",
    ],
  },
  ARCHITECT: {
    systemKey: "ARCHITECT",
    name: "Architect",
    description: "System boundaries, contracts, policy, quality, and execution architecture.",
    defaultLandingView: "command-center",
    defaultScopeLens: "WORKSPACE",
    permissions: ARCHITECT_PERMISSIONS,
    visibleViews: [
      "command-center",
      "missions",
      "mission-detail",
      "control-work-orders",
      "tasks",
      "factory",
      "trace-inspector",
      "agents",
      "atc",
      "automations",
      "audit",
      "telemetry",
      "operator-evals",
      "harness-loops",
      "skills",
      "memory",
      "docs",
      "policies",
      "identity",
      "deployments",
      "qc-rulesets",
      "projects",
      "model-routing",
    ],
  },
  BUILDER: {
    systemKey: "BUILDER",
    name: "Builder",
    description: "Assigned delivery from implementation through failure, recovery, evidence, and handoff.",
    defaultLandingView: "control-work-orders",
    defaultScopeLens: "MY_WORK",
    permissions: BUILDER_PERMISSIONS,
    visibleViews: [
      "command-center",
      "control-work-orders",
      "tasks",
      "factory",
      "trace-inspector",
      "agents",
      "atc",
      "telemetry",
      "skills",
      "memory",
      "docs",
    ],
  },
  ADMIN: {
    systemKey: "ADMIN",
    name: "Admin",
    description: "Complete production control-plane and access administration.",
    defaultLandingView: "command-center",
    defaultScopeLens: "COMPANY",
    permissions: ALL_ACCESS_PERMISSIONS,
    visibleViews: SUPPORTED_ACCESS_VIEWS,
  },
} as const satisfies Record<PersonaKey, AccessProfileDefaults>;

export interface AccessProfileDraft {
  permissions: readonly string[];
  visibleViews: readonly string[];
  defaultLandingView: string;
  defaultScopeLens: string;
}

export interface AccessProfileValidationResult {
  valid: boolean;
  errors: string[];
}

export function isPersonaKey(value: string): value is PersonaKey {
  return (PERSONA_KEYS as readonly string[]).includes(value);
}

export function isScopeLens(value: string): value is ScopeLens {
  return (SCOPE_LENSES as readonly string[]).includes(value);
}

export function isAccessPermission(value: string): value is AccessPermission {
  return (ALL_ACCESS_PERMISSIONS as readonly string[]).includes(value);
}

export function isAccessViewKey(value: string): value is AccessViewKey {
  return (SUPPORTED_ACCESS_VIEWS as readonly string[]).includes(value);
}

export function validateAccessProfileDraft(
  systemKey: PersonaKey,
  draft: AccessProfileDraft,
): AccessProfileValidationResult {
  const errors: string[] = [];
  const permissions = new Set(draft.permissions);
  const visibleViews = new Set(draft.visibleViews);

  const invalidPermissions = draft.permissions.filter((value) => !isAccessPermission(value));
  if (invalidPermissions.length > 0) {
    errors.push(`Unknown permissions: ${[...new Set(invalidPermissions)].join(", ")}.`);
  }

  const invalidViews = draft.visibleViews.filter((value) => !isAccessViewKey(value));
  if (invalidViews.length > 0) {
    errors.push(`Unknown views: ${[...new Set(invalidViews)].join(", ")}.`);
  }

  if (!isAccessViewKey(draft.defaultLandingView)) {
    errors.push("Default landing view is not supported.");
  } else if (!visibleViews.has(draft.defaultLandingView)) {
    errors.push("Default landing view must be visible for the profile.");
  }

  if (!isScopeLens(draft.defaultScopeLens)) {
    errors.push("Default scope lens is not supported.");
  } else if (!(PERSONA_SCOPE_LENSES[systemKey] as readonly ScopeLens[]).includes(draft.defaultScopeLens)) {
    errors.push(`${systemKey} cannot use ${draft.defaultScopeLens} as its default scope lens.`);
  }

  for (const view of draft.visibleViews) {
    if (!isAccessViewKey(view)) continue;
    const required = ACCESS_VIEW_REQUIREMENTS[view];
    if (!permissions.has(required)) {
      errors.push(`View ${view} requires ${required}.`);
    }
  }

  if (systemKey === "ADMIN") {
    const missingLocked = ADMIN_LOCKED_PERMISSIONS.filter((permission) => !permissions.has(permission));
    if (missingLocked.length > 0) {
      errors.push(`Admin must retain: ${missingLocked.join(", ")}.`);
    }
    const missingRegistered = ALL_ACCESS_PERMISSIONS.filter((permission) => !permissions.has(permission));
    if (missingRegistered.length > 0) {
      errors.push("Admin must retain every registered permission.");
    }
  }

  return { valid: errors.length === 0, errors };
}
