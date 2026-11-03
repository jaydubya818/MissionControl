import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";
import {
  phase4Context7GrantRegistrationKey,
  phase4Context7ProfileQualificationKey,
  phase4Context7ProfileRegistrationKey,
  phase4Context7ToolVersionRegistrationKey,
  pinnedMcpSdkVersion,
} from "../../scripts/lib/phase4-mcp-qualification.mjs";
import {
  createGrant,
  qualifyVersion,
  registerContext7QueryDocs,
} from "../factory/governedMcp";
import {
  qualify as qualifyExecutionProfile,
  registerVersion as registerExecutionProfileVersion,
} from "../factory/executionProfiles";
import { promoteExactRoute, registerExactRoute } from "../modelCatalog";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  MCP_CONTEXT7_DESTINATION,
  MCP_CONTEXT7_OPERATION,
  MCP_TOOL_VERSION_SCHEMA,
  context7ToolVersionSnapshot,
  mcpToolVersionDigest,
} from "../lib/governedMcp";

const repositoryId = "repo-phase4-sdk-requal";
const toolEvidencePath = "docs/software-factory/phase4-real-mcp-service-selection-v2.md";
const profileEvidencePath = "docs/testing/evidence/governed-mcp-phase4-recovery/first-live-call-preflight.md";
const modelEvidencePath = "docs/testing/evidence/production-execution-admission-foundation-v1/final-validation.md";
const evidenceDigest = (path: string) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const FIXTURE_INDEXES = new Set([
  "by_registration",
  "by_qualification_idempotency",
  "by_active",
  "by_auth_id",
  "by_operator",
  "by_registration_idempotency",
  "by_profile_version",
  "by_project",
  "by_project_model",
]);
const APPROVER_AUTH = "auth-approver";
const OPERATOR_AUTH = "auth-operator";
const manifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);

function validateConvexArgs(mutation: { exportArgs: () => string }, args: unknown) {
  const spec = JSON.parse(mutation.exportArgs()) as Record<string, unknown>;
  const issues = matchExportedValidator(spec, args, "args");
  if (issues.length > 0) {
    throw new Error(`ArgumentValidationError: ${issues.join("; ")}`);
  }
}

function matchExportedValidator(spec: Record<string, unknown>, value: unknown, path: string): string[] {
  const type = spec.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
    const record = value as Record<string, unknown>;
    const fields = spec.value as Record<string, { optional: boolean; fieldType: Record<string, unknown> }>;
    const issues: string[] = [];
    for (const [key, field] of Object.entries(fields)) {
      if (record[key] === undefined) {
        if (!field.optional) issues.push(`${path}.${key} is required`);
        continue;
      }
      issues.push(...matchExportedValidator(field.fieldType, record[key], `${path}.${key}`));
    }
    return issues;
  }
  if (type === "id" || type === "string") {
    return typeof value === "string" && value.length > 0 ? [] : [`${path} must be a string`];
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? [] : [`${path} must be a number`];
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? [] : [`${path} must be a boolean`];
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    const itemSpec = spec.value as Record<string, unknown>;
    return value.flatMap((item, index) => matchExportedValidator(itemSpec, item, `${path}[${index}]`));
  }
  if (type === "union") {
    const options = spec.value as Array<Record<string, unknown>>;
    return options.some((option) => matchExportedValidator(option, value, path).length === 0)
      ? []
      : [`${path} did not match union`];
  }
  if (type === "literal") {
    return value === spec.value ? [] : [`${path} must equal ${JSON.stringify(spec.value)}`];
  }
  if (type === "any") return [];
  return [`${path} has unsupported validator ${String(type)}`];
}

async function invoke<T>(mutation: { exportArgs: () => string; _handler: (ctx: unknown, args: unknown) => Promise<T> }, ctx: unknown, args: unknown) {
  validateConvexArgs(mutation, args);
  return mutation._handler(ctx, args);
}

function createQualificationContext() {
  const tenantId = "tenant-1";
  const projectId = "project-1";
  const approverId = "operator-approver";
  const operatorId = "operator-operator";
  const tables: Record<string, Array<Record<string, unknown>>> = {
    tenants: [{ _id: tenantId, active: true }],
    projects: [{ _id: projectId, tenantId, name: "PHASE4_REAL_MCP_QUALIFICATION", slug: "phase4-real-mcp-qualification" }],
    operators: [
      { _id: approverId, tenantId, authId: APPROVER_AUTH, email: "approver@example.com", name: "Approver", active: true, createdAt: 1 },
      { _id: operatorId, tenantId, authId: OPERATOR_AUTH, email: "operator@example.com", name: "Operator", active: true, createdAt: 1 },
    ],
    roles: [
      { _id: "role-approver", tenantId, name: "Qualification approver", permissions: ["factory.read", "factory.automation.manage", "factory.approve"] },
      { _id: "role-operator", tenantId, name: "Qualification operator", permissions: ["factory.read", "factory.automation.manage"] },
    ],
    roleAssignments: [
      { _id: "assignment-approver", operatorId: approverId, roleId: "role-approver", scope: { type: "project", id: projectId }, assignedAt: 1 },
      { _id: "assignment-operator", operatorId, roleId: "role-operator", scope: { type: "project", id: projectId }, assignedAt: 1 },
    ],
    teamMemberships: [],
    orgMembers: [],
    workspaceRepositories: [{ _id: repositoryId, projectId, repository: "jaydubya818/MissionControl" }],
    modelCatalog: [],
    mcpToolVersions: [],
    mcpToolGrants: [],
    factoryExecutionProfiles: [],
    activities: [],
  };
  let sequence = 1;
  let currentAuthId = APPROVER_AUTH;
  const db = {
    get: async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = Object.values(tables).flat().find((item) => item._id === id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let indexed = false;
      const builder = {
        withIndex: (name: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          if (!FIXTURE_INDEXES.has(name)) {
            throw new Error(`Fixture refuses unknown index ${name}`);
          }
          indexed = true;
          const conditions: Array<[string, unknown]> = [];
          const query = {
            eq: (field: string, value: unknown) => {
              conditions.push([field, value]);
              return query;
            },
          };
          apply(query);
          rows = rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
          return builder;
        },
        collect: async () => {
          if (!indexed) throw new Error("Fixture refuses an unindexed query");
          return [...rows];
        },
        first: async () => {
          if (!indexed) throw new Error("Fixture refuses an unindexed query");
          return rows[0] ?? null;
        },
      };
      return builder;
    },
  };
  return {
    ctx: {
      auth: {
        getUserIdentity: async () => ({ subject: currentAuthId, tokenIdentifier: `issuer|${currentAuthId}` }),
      },
      db,
    } as never,
    tables,
    projectId,
    approverId,
    useIdentity(kind: "approver" | "operator") {
      currentAuthId = kind === "approver" ? APPROVER_AUTH : OPERATOR_AUTH;
    },
  };
}

async function registerPromotedModelRoute(ctx: unknown, projectId: string) {
  const modelCatalogId = await invoke<string>(registerExactRoute as never, ctx, {
    projectId,
    provider: "openai",
    providerRoute: "openai",
    modelId: "gpt-5.6-terra",
    displayName: "Phase 4 exact Codex qualification route",
    tier: "BALANCED",
    capabilities: ["text", "code"],
    supportsTools: true,
    contextWindow: 200000,
  });
  const route = await (ctx as { db: { get: (id: string) => Promise<Record<string, unknown> | null> } }).db.get(modelCatalogId);
  if (!route?.routeDigest) throw new Error("Registered exact model route was not returned.");
  await invoke(promoteExactRoute as never, ctx, {
    modelCatalogId,
    expectedRouteDigest: route.routeDigest,
    evidenceReference: modelEvidencePath,
    evidenceDigest: evidenceDigest(modelEvidencePath),
    workloadClasses: ["SOFTWARE_CHANGE"],
    riskClasses: ["GREEN"],
    repositoryIds: [repositoryId],
    compatibility: {
      adapter: "codex",
      version: "v1",
      capabilityManifestDigest: manifestDigest,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactDigest: runtimeDigest,
      executionBackend: "persistent-worker",
    },
  });
  return modelCatalogId;
}

describe("Phase 4 MCP SDK 1.32.2 requalification (in-memory fixture)", () => {
  afterEach(() => {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
  });

  it("registers, qualifies, grants, and profiles Context7 against the pinned SDK without colliding with 1.31.0 keys", async () => {
    const state = createQualificationContext();
    const sdkVersion = pinnedMcpSdkVersion();
    const snapshot = context7ToolVersionSnapshot();
    const validUntil = Date.now() + 6 * 60 * 60 * 1_000;

    expect(sdkVersion).toBe("1.32.2");
    expect(snapshot.sdk.version).toBe("1.32.2");
    expect(mcpToolVersionDigest(snapshot)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => state.ctx.db.query("mcpToolVersions").withIndex("by_unknown", () => undefined)).toThrow(
      "Fixture refuses unknown index by_unknown",
    );

    const currentSnapshot = context7ToolVersionSnapshot();
    const legacySnapshot = { ...currentSnapshot, sdk: { ...currentSnapshot.sdk, version: "1.31.0" } };
    state.tables.mcpToolVersions.push({
      _id: "legacy-1.31.0",
      projectId: state.projectId,
      registrationIdempotencyKey: `phase4-context7-v4.0.5:${repositoryId}`,
      toolVersionDigest: `sha256:${computeCanonicalHash({ namespace: MCP_TOOL_VERSION_SCHEMA, value: legacySnapshot })}`,
      immutableSnapshot: legacySnapshot,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
    });
    await expect(invoke(registerContext7QueryDocs as never, state.ctx, {
      projectId: state.projectId,
      registrationIdempotencyKey: `phase4-context7-v4.0.5:${repositoryId}`,
    })).rejects.toThrow("Tool Version idempotency key is bound to another identity.");

    const modelCatalogId = await registerPromotedModelRoute(state.ctx, state.projectId);
    const tool = await invoke<{ toolVersionId: string; toolVersionDigest: string; created: boolean }>(
      registerContext7QueryDocs as never,
      state.ctx,
      {
        projectId: state.projectId,
        registrationIdempotencyKey: phase4Context7ToolVersionRegistrationKey(repositoryId),
      },
    );
    expect(tool).toMatchObject({ created: true });
    expect(tool.toolVersionDigest).toBe(mcpToolVersionDigest(snapshot));
    const toolRow = state.tables.mcpToolVersions.find((row) => row._id === tool.toolVersionId) as Record<string, unknown>;
    expect(toolRow.registrationIdempotencyKey).toBe(`phase4-context7-v4.0.5-sdk-1.32.2:${repositoryId}`);
    expect((toolRow.immutableSnapshot as { sdk: { version: string } }).sdk.version).toBe("1.32.2");
    expect(toolRow.enabled).toBe(false);
    expect(toolRow.qualificationStatus).toBe("UNQUALIFIED");

    const replay = await invoke(registerContext7QueryDocs as never, state.ctx, {
      projectId: state.projectId,
      registrationIdempotencyKey: phase4Context7ToolVersionRegistrationKey(repositoryId),
    });
    expect(replay).toEqual({ toolVersionId: tool.toolVersionId, toolVersionDigest: tool.toolVersionDigest, created: false });

    const qualification = await invoke<{ qualificationDigest: string }>(qualifyVersion as never, state.ctx, {
      toolVersionId: tool.toolVersionId,
      expectedDigest: tool.toolVersionDigest,
      evidenceReference: toolEvidencePath,
      evidenceDigest: evidenceDigest(toolEvidencePath),
      validUntil,
    });
    expect(qualification.qualificationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(toolRow).toMatchObject({
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      qualifiedBy: state.approverId,
    });

    await expect(invoke(createGrant as never, state.ctx, {
      projectId: state.projectId,
      toolVersionId: 12,
      grantKey: "phase4-context7-query-docs",
      expiresAt: validUntil,
      registrationIdempotencyKey: phase4Context7GrantRegistrationKey(repositoryId),
    })).rejects.toThrow(/ArgumentValidationError/);
    await expect(invoke(createGrant as never, state.ctx, {
      projectId: state.projectId,
      toolVersionId: tool.toolVersionId,
      grantKey: 1,
      expiresAt: validUntil,
      registrationIdempotencyKey: phase4Context7GrantRegistrationKey(repositoryId),
    })).rejects.toThrow(/ArgumentValidationError/);

    const grant = await invoke<{ toolGrantId: string; grantDigest: string; created: boolean }>(
      createGrant as never,
      state.ctx,
      {
        projectId: state.projectId,
        toolVersionId: tool.toolVersionId,
        grantKey: "phase4-context7-query-docs",
        expiresAt: validUntil,
        registrationIdempotencyKey: phase4Context7GrantRegistrationKey(repositoryId),
      },
    );
    expect(grant).toMatchObject({ created: true });
    const grantRow = state.tables.mcpToolGrants[0] as Record<string, unknown>;
    const grantSnapshot = grantRow.immutableSnapshot as Record<string, unknown>;
    expect(grantRow.grantKey).toBe("phase4-context7-query-docs");
    expect(grantRow.registrationIdempotencyKey).toBe(`phase4-context7-grant-sdk-1.32.2:${repositoryId}`);
    expect(grantRow.state).toBe("ACTIVE");
    expect(grantRow.toolVersionDigest).toBe(tool.toolVersionDigest);
    expect(grantSnapshot.grantKey).toBe("phase4-context7-query-docs");
    expect(grantSnapshot.operation).toBe(MCP_CONTEXT7_OPERATION);
    expect(grantSnapshot.operation).toBe("query-docs");
    expect(grantSnapshot.credentialClass).toBe("NONE");
    expect(grantSnapshot.maxCallsPerAttempt).toBe(1);
    expect(grantSnapshot.destination).toBe(MCP_CONTEXT7_DESTINATION);
    expect(grantSnapshot.destination).toBe("mcp.context7.com:443");
    expect(grantSnapshot.revocationMode).toBe("DENY_NEW_CALLS");

    const profile = await invoke<{ executionProfileId: string; created: boolean }>(
      registerExecutionProfileVersion as never,
      state.ctx,
      {
        projectId: state.projectId,
        profileKey: "phase4-context7-codex",
        registrationIdempotencyKey: phase4Context7ProfileRegistrationKey(repositoryId),
        executor: { adapter: "codex", version: "v1" },
        executionBackend: "persistent-worker",
        modelCatalogId,
        toolGrantId: grant.toolGrantId,
        isolationModes: ["WORKSPACE_WRITE"],
      },
    );
    expect(profile).toMatchObject({ created: true });
    const profileRow = state.tables.factoryExecutionProfiles[0] as Record<string, unknown>;
    expect(profileRow.registrationIdempotencyKey).toBe(`phase4-context7-profile-sdk-1.32.2:${repositoryId}`);
    expect(profileRow.enabled).toBe(false);
    expect(profileRow.qualificationStatus).toBe("UNQUALIFIED");
    expect(profileRow.admissionStatus).toBe("DISABLED");
    expect(profileRow.toolGrantId).toBe(grant.toolGrantId);
    expect((profileRow.immutableSnapshot as { toolGrant: { grantDigest: string } }).toolGrant.grantDigest).toBe(grant.grantDigest);

    const qualifiedProfile = await invoke<{ qualificationDigest: string }>(qualifyExecutionProfile as never, state.ctx, {
      executionProfileId: profile.executionProfileId,
      expectedProfileDigest: profileRow.profileDigest,
      qualificationIdempotencyKey: phase4Context7ProfileQualificationKey(repositoryId),
      evidenceReference: profileEvidencePath,
      evidenceDigest: evidenceDigest(profileEvidencePath),
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      validUntil,
    });
    expect(qualifiedProfile.qualificationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(profileRow).toMatchObject({
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationIdempotencyKey: `phase4-context7-profile-qualification-sdk-1.32.2:${repositoryId}`,
      promotedBy: state.approverId,
    });
  });

  it("denies qualifyVersion and profile qualify when the operator lacks factory.approve", async () => {
    const state = createQualificationContext();
    const validUntil = Date.now() + 6 * 60 * 60 * 1_000;
    state.useIdentity("operator");

    const tool = await invoke<{ toolVersionId: string; toolVersionDigest: string }>(
      registerContext7QueryDocs as never,
      state.ctx,
      {
        projectId: state.projectId,
        registrationIdempotencyKey: phase4Context7ToolVersionRegistrationKey(`${repositoryId}-deny`),
      },
    );
    await expect(invoke(qualifyVersion as never, state.ctx, {
      toolVersionId: tool.toolVersionId,
      expectedDigest: tool.toolVersionDigest,
      evidenceReference: toolEvidencePath,
      evidenceDigest: evidenceDigest(toolEvidencePath),
      validUntil,
    })).rejects.toThrow("Your workspace role does not permit this factory action.");

    state.useIdentity("approver");
    await invoke(qualifyVersion as never, state.ctx, {
      toolVersionId: tool.toolVersionId,
      expectedDigest: tool.toolVersionDigest,
      evidenceReference: toolEvidencePath,
      evidenceDigest: evidenceDigest(toolEvidencePath),
      validUntil,
    });
    const modelCatalogId = await registerPromotedModelRoute(state.ctx, state.projectId);
    const grant = await invoke<{ toolGrantId: string }>(createGrant as never, state.ctx, {
      projectId: state.projectId,
      toolVersionId: tool.toolVersionId,
      grantKey: "phase4-context7-query-docs",
      expiresAt: validUntil,
      registrationIdempotencyKey: phase4Context7GrantRegistrationKey(`${repositoryId}-deny`),
    });
    const profile = await invoke<{ executionProfileId: string }>(registerExecutionProfileVersion as never, state.ctx, {
      projectId: state.projectId,
      profileKey: "phase4-context7-codex",
      registrationIdempotencyKey: phase4Context7ProfileRegistrationKey(`${repositoryId}-deny`),
      executor: { adapter: "codex", version: "v1" },
      executionBackend: "persistent-worker",
      modelCatalogId,
      toolGrantId: grant.toolGrantId,
      isolationModes: ["WORKSPACE_WRITE"],
    });
    const profileRow = state.tables.factoryExecutionProfiles.find((row) => row._id === profile.executionProfileId) as Record<string, unknown>;

    state.useIdentity("operator");
    await expect(invoke(qualifyExecutionProfile as never, state.ctx, {
      executionProfileId: profile.executionProfileId,
      expectedProfileDigest: profileRow.profileDigest,
      qualificationIdempotencyKey: phase4Context7ProfileQualificationKey(`${repositoryId}-deny`),
      evidenceReference: profileEvidencePath,
      evidenceDigest: evidenceDigest(profileEvidencePath),
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      validUntil,
    })).rejects.toThrow("Your workspace role does not permit this factory action.");
    expect(profileRow.admissionStatus).toBe("DISABLED");
    expect(profileRow.qualificationStatus).toBe("UNQUALIFIED");
  });
});
