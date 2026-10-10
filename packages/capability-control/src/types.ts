export type Environment = 'development' | 'qualification' | 'production';
export type Preference = 'ENABLED' | 'DISABLED';
export type Lifecycle = 'ACTIVE' | 'PAUSED' | 'REVOKED';
export type CapabilityGroup = 'Personal Assistant' | 'Agents and Automation' | 'Computer and Tools'
  | 'Software Development' | 'Enterprise Engineering' | 'Communication' | 'Advanced';

export interface CapabilityDescriptor {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly owningSystem: string;
  readonly group: CapabilityGroup;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly alternativeDependencies: readonly string[];
  readonly environments: readonly Environment[];
  readonly requiredPermissions: readonly string[];
  readonly setupRequirements: readonly string[];
  readonly qualificationRequirements: readonly string[];
  readonly ordinaryDefault: Preference;
  readonly experimental: boolean;
  readonly revocationBehavior: 'FENCE_WRITERS_STOP_RESOURCES_PRESERVE_UNKNOWN';
}

export interface CapabilityRegistry {
  readonly version: string;
  readonly capabilities: readonly CapabilityDescriptor[];
}

export interface OwnerScope {
  readonly ownerId: string;
  readonly organizationId: string;
  readonly installationId: string;
  readonly environment: Environment;
}

export interface PlatformOwnerPolicy extends OwnerScope {
  readonly id: string;
  readonly revision: number;
  readonly status: Lifecycle;
  readonly administrationRecordId: string;
  readonly membershipRecordId: string;
  readonly installationRecordId: string;
  readonly auditRecordId: string;
  readonly expiresAt: number;
}

export interface CapabilityFacts {
  readonly supported: boolean;
  readonly deployed: boolean;
  readonly entitled: boolean;
  readonly administrator: 'ALLOW' | 'DENY' | 'PENDING_APPROVAL';
  readonly setup: Readonly<Record<string, boolean>>;
  readonly qualification: Readonly<Record<string, 'QUALIFIED' | 'UNQUALIFIED'>>;
  readonly lifecycle: Lifecycle;
  readonly selectedAlternative?: string;
}

export interface WorkBinding {
  readonly workId: string;
  readonly workVersion: number;
  readonly workGeneration: number;
  readonly agentId: string;
}

export interface WorkAuthority extends OwnerScope, WorkBinding {
  readonly policyRevision: number;
  readonly grantRevision: number;
  readonly currentGrantRevision: number;
  readonly capabilities: readonly string[];
  readonly permissions: readonly string[];
  readonly status: Lifecycle;
  readonly approval: 'APPROVED' | 'PENDING_APPROVAL' | 'DENIED';
  readonly expiresAt: number;
  readonly parentAgentId?: string;
  readonly budget: {
    readonly limitMicros: number;
    readonly reservedMicros: number;
    readonly spentMicros: number;
    readonly requestedMicros: number;
    readonly exposure: 'KNOWN' | 'UNKNOWN';
  };
}

/** Server adapters supply current authenticated facts, never request bodies or agent output. */
export interface PolicySnapshot {
  readonly registryVersion: string;
  readonly scope: OwnerScope;
  readonly revision: number;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly platformOwnerPolicy?: PlatformOwnerPolicy;
  readonly ordinaryDefaults: Readonly<Record<string, Preference>>;
  readonly preferences: Readonly<Record<string, Preference>>;
  readonly facts: Readonly<Record<string, CapabilityFacts>>;
  readonly requestedWork?: WorkBinding;
  readonly authority?: WorkAuthority;
  readonly parentAuthority?: WorkAuthority;
}

export interface CapabilityResolution {
  readonly id: string;
  readonly version: string;
  readonly registryVersion: string;
  readonly policyRevision: number;
  readonly preference: Preference;
  readonly preferenceSource: 'OWNER' | 'PLATFORM_OWNER_POLICY' | 'ORDINARY_DEFAULT';
  readonly availability: 'AVAILABLE' | 'UNAVAILABLE';
  readonly administrator: 'ALLOW' | 'DENY' | 'PENDING_APPROVAL';
  readonly readiness: 'READY' | 'SETUP_REQUIRED' | 'QUALIFICATION_REQUIRED';
  readonly lifecycle: Lifecycle | 'UNKNOWN';
  readonly authority: 'NOT_GRANTED' | 'PENDING_APPROVAL' | 'AUTHORIZED';
  readonly admissionEligible: boolean;
  readonly label: string;
  readonly reasons: readonly string[];
}
