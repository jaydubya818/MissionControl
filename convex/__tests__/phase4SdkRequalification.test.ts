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
import {
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteQualificationDigest,
} from "../lib/modelRouteAdmission";
import {
  context7ToolVersionSnapshot,
  mcpToolVersionDigest,
} from "../lib/governedMcp";

const repositoryId = "repo-phase4-sdk-requal";
const toolEvidencePath = "docs/software-factory/phase4-real-mcp-service-selection-v2.md";
const profileEvidencePath = "docs/testing/evidence/governed-mcp-phase4-recovery/first-live-call-preflight.md";
const evidenceDigest = (path: string) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const sha = (character: string) => `sha256:${character.repeat(64)}`;
function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

const manifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
const routeSnapshot = exactModelRouteSnapshot({
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5.6-terra",
  reasoningConfig: { effort: "high", maxTokens: 16_384 },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const routeQualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest,
  evidenceReference: "docs/testing/evidence/production-execution-admission-foundation-v1/final-validation.md",
  evidenceDigest: sha("a"),
  workloadClasses: ["SOFTWARE_CHANGE"],
  riskClasses: ["GREEN"],
  promotedBy: "operator-1",
  promotedAt: 100,
  compatibility: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: manifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifactDigest: runtimeDigest,
    executionBackend: "persistent-worker",
  },
});
const routeQualificationDigest = modelRouteQualificationDigest(routeQualificationSnapshot);

function createQualificationContext() {
  const tenantId = "tenant-1";
  const projectId = "project-1";
  const tables: Record<string, Array<Record<string, unknown>>> = {
    tenants: [{ _id: tenantId, active: true }],
    projects: [{ _id: projectId, tenantId, name: "PHASE4_REAL_MCP_QUALIFICATION", slug: "phase4-real-mcp-qualification" }],
    modelCatalog: [{
      _id: "model-route-1",
      projectId,
      routeSnapshot,
      routeDigest,
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot: routeQualificationSnapshot,
      qualificationDigest: routeQualificationDigest,
    }],
    mcpToolVersions: [],
    mcpToolGrants: [],
    factoryExecutionProfiles: [],
    activities: [],
  };
  let sequence = 1;
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
      const builder: {
        withIndex: (name: string, apply: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) => unknown;
        collect: () => Promise<Array<Record<string, unknown>>>;
        first: () => Promise<Record<string, unknown> | null>;
      } = {
        withIndex: (_name, apply) => {
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
        collect: async () => [...rows],
        first: async () => rows[0] ?? null,
      };
      return builder;
    },
  };
  return {
    ctx: { auth: { getUserIdentity: async () => null }, db } as never,
    tables,
    projectId,
  };
}

describe("Phase 4 MCP SDK 1.32.2 requalification (in-memory fixture)", () => {
  afterEach(() => {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
  });

  it("registers, qualifies, grants, and profiles Context7 against the pinned SDK without colliding with 1.31.0 keys", async () => {
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    const state = createQualificationContext();
    const sdkVersion = pinnedMcpSdkVersion();
    const snapshot = context7ToolVersionSnapshot();
    const validUntil = Date.now() + 6 * 60 * 60 * 1_000;
    const registerTool = functionHandler<any>(registerContext7QueryDocs);
    const qualifyTool = functionHandler<any>(qualifyVersion);
    const grantTool = functionHandler<any>(createGrant);
    const registerProfile = functionHandler<any>(registerExecutionProfileVersion);
    const qualifyProfile = functionHandler<any>(qualifyExecutionProfile);

    expect(sdkVersion).toBe("1.32.2");
    expect(snapshot.sdk.version).toBe("1.32.2");
    expect(mcpToolVersionDigest(snapshot)).toMatch(/^sha256:[a-f0-9]{64}$/);

    state.tables.mcpToolVersions.push({
      _id: "legacy-1.31.0",
      projectId: state.projectId,
      registrationIdempotencyKey: `phase4-context7-v4.0.5:${repositoryId}`,
      toolVersionDigest: sha("0"),
      immutableSnapshot: { sdk: { package: "@modelcontextprotocol/sdk", version: "1.31.0" } },
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
    });
    await expect(registerTool(state.ctx, {
      projectId: state.projectId as never,
      registrationIdempotencyKey: `phase4-context7-v4.0.5:${repositoryId}`,
    })).rejects.toThrow("Tool Version idempotency key is bound to another identity.");

    const tool = await registerTool(state.ctx, {
      projectId: state.projectId as never,
      registrationIdempotencyKey: phase4Context7ToolVersionRegistrationKey(repositoryId),
    });
    expect(tool).toMatchObject({ created: true });
    expect(tool.toolVersionDigest).toBe(mcpToolVersionDigest(snapshot));
    const toolRow = state.tables.mcpToolVersions.find((row) => row._id === tool.toolVersionId) as Record<string, unknown>;
    expect(toolRow.registrationIdempotencyKey).toBe(`phase4-context7-v4.0.5-sdk-1.32.2:${repositoryId}`);
    expect((toolRow.immutableSnapshot as { sdk: { version: string } }).sdk.version).toBe("1.32.2");
    expect(toolRow.enabled).toBe(false);
    expect(toolRow.qualificationStatus).toBe("UNQUALIFIED");

    const replay = await registerTool(state.ctx, {
      projectId: state.projectId as never,
      registrationIdempotencyKey: phase4Context7ToolVersionRegistrationKey(repositoryId),
    });
    expect(replay).toEqual({ toolVersionId: tool.toolVersionId, toolVersionDigest: tool.toolVersionDigest, created: false });

    const qualification = await qualifyTool(state.ctx, {
      toolVersionId: tool.toolVersionId as never,
      expectedDigest: tool.toolVersionDigest,
      evidenceReference: toolEvidencePath,
      evidenceDigest: evidenceDigest(toolEvidencePath),
      validUntil,
    });
    expect(qualification.qualificationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(toolRow).toMatchObject({
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      qualifiedBy: "demo:company-administrator",
    });

    const grant = await grantTool(state.ctx, {
      projectId: state.projectId as never,
      toolVersionId: tool.toolVersionId as never,
      grantKey: "phase4-context7-query-docs",
      expiresAt: validUntil,
      registrationIdempotencyKey: phase4Context7GrantRegistrationKey(repositoryId),
    });
    expect(grant).toMatchObject({ created: true });
    const grantRow = state.tables.mcpToolGrants[0] as Record<string, unknown>;
    expect(grantRow.registrationIdempotencyKey).toBe(`phase4-context7-grant-sdk-1.32.2:${repositoryId}`);
    expect(grantRow.state).toBe("ACTIVE");
    expect(grantRow.toolVersionDigest).toBe(tool.toolVersionDigest);

    const profile = await registerProfile(state.ctx, {
      projectId: state.projectId as never,
      profileKey: "phase4-context7-codex",
      registrationIdempotencyKey: phase4Context7ProfileRegistrationKey(repositoryId),
      executor: { adapter: "codex", version: "v1" },
      executionBackend: "persistent-worker",
      modelCatalogId: "model-route-1" as never,
      toolGrantId: grant.toolGrantId as never,
      isolationModes: ["WORKSPACE_WRITE"],
    });
    expect(profile).toMatchObject({ created: true });
    const profileRow = state.tables.factoryExecutionProfiles[0] as Record<string, unknown>;
    expect(profileRow.registrationIdempotencyKey).toBe(`phase4-context7-profile-sdk-1.32.2:${repositoryId}`);
    expect(profileRow.enabled).toBe(false);
    expect(profileRow.qualificationStatus).toBe("UNQUALIFIED");
    expect(profileRow.admissionStatus).toBe("DISABLED");
    expect(profileRow.toolGrantId).toBe(grant.toolGrantId);
    expect((profileRow.immutableSnapshot as { toolGrant: { grantDigest: string } }).toolGrant.grantDigest).toBe(grant.grantDigest);

    const qualifiedProfile = await qualifyProfile(state.ctx, {
      executionProfileId: profile.executionProfileId as never,
      expectedProfileDigest: profileRow.profileDigest as string,
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
      qualificationIdempotencyKey: `phase4-context7-profile-qualification-sdk-1.32.2:${repositoryId}`,
    });
    expect(profileRow.admissionStatus).not.toBe("PRODUCTION");
    expect(["PRODUCTION_PILOT_ELIGIBLE", "DISABLED"]).toContain(profileRow.admissionStatus);
  });
});
