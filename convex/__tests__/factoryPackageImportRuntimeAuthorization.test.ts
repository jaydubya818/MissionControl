import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { importDrafts, preview, resolveTarget } from "../factoryPackageImports";
import { FACTORY_PACKAGE_QUALIFICATION_FLAG } from "../lib/factoryPackageImport";

function functionHandler<T extends (...args: any[]) => any>(
  registered: unknown,
): T {
  return (registered as { _handler: T })._handler;
}

type Row = Record<string, any> & { _id: string };

function createContext({
  identity = { subject: "user-a", tokenIdentifier: "issuer|user-a" },
  mutate,
}: {
  identity?: { subject: string; tokenIdentifier: string } | null;
  mutate?: (tables: Record<string, Row[]>) => void;
} = {}) {
  const tables: Record<string, Row[]> = {
    tenants: [
      {
        _id: "tenant-a",
        name: "Design Partner",
        slug: "design-partner",
        active: true,
      },
      { _id: "tenant-b", name: "Other", slug: "other", active: true },
    ],
    projects: [
      {
        _id: "project-a",
        tenantId: "tenant-a",
        name: "Qualified project",
        slug: "qualified",
        status: "ACTIVE",
      },
    ],
    operators: [
      {
        _id: "operator-a",
        tenantId: "tenant-a",
        authId: "user-a",
        email: "operator@example.com",
        name: "Operator",
        active: true,
        createdAt: 1,
      },
    ],
    roles: [
      {
        _id: "role-a",
        tenantId: "tenant-a",
        name: "Design partner operator",
        description: "Bounded draft importer",
        permissions: ["delivery.write", "delivery.assign"],
      },
    ],
    roleAssignments: [
      {
        _id: "role-assignment-a",
        operatorId: "operator-a",
        roleId: "role-a",
        scope: { type: "project", id: "project-a" },
        assignedAt: 1,
      },
    ],
    workspaceRepositories: [
      {
        _id: "repository-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        status: "READY",
        repository: "sellerfi/platform",
        defaultBranch: "main",
      },
    ],
    orgMembers: [
      {
        _id: "member-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        operatorId: "operator-a",
        name: "Operator",
        active: true,
        projectAccess: [{ projectId: "project-a" }],
      },
    ],
    scrumTeams: [
      {
        _id: "team-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        name: "Qualified team",
        status: "ACTIVE",
      },
    ],
    teamMemberships: [
      {
        _id: "team-membership-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        teamId: "team-a",
        memberId: "member-a",
        operatorId: "operator-a",
        role: "LEAD",
        active: true,
      },
    ],
    repositoryCodeScopes: [
      {
        _id: "scope-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        repositoryId: "repository-a",
        owningTeamId: "team-a",
        allowedEnvironments: ["LOCAL", "CLOUD"],
        active: true,
      },
    ],
    workflows: [
      {
        _id: "workflow-a",
        projectId: "project-a",
        workflowId: "software-change/verified-pr",
        version: 3,
        active: true,
      },
    ],
    featureFlags: [
      {
        _id: "flag-plan",
        key: "missions.plan-release-v1",
        enabled: true,
        projectId: "project-a",
      },
      {
        _id: "flag-package",
        key: FACTORY_PACKAGE_QUALIFICATION_FLAG,
        enabled: true,
        projectId: "project-a",
      },
    ],
  };
  mutate?.(tables);

  const db = {
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((row) => row._id === id) ?? null,
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_index: string, apply: (q: any) => any) => {
          const conditions: Array<{ field: string; value: unknown }> = [];
          const q: any = {
            eq: (field: string, value: unknown) => {
              conditions.push({ field, value });
              return q;
            },
          };
          apply(q);
          rows = rows.filter((row) =>
            conditions.every(({ field, value }) => row[field] === value),
          );
          return builder;
        },
        collect: async () => rows,
        first: async () => rows[0] ?? null,
      };
      return builder;
    },
  };

  return {
    auth: { getUserIdentity: async () => identity },
    db,
  } as any;
}

const args = {
  projectId: "project-a" as Id<"projects">,
  repositoryId: "repository-a" as Id<"workspaceRepositories">,
  ownerMemberId: "member-a" as Id<"orgMembers">,
  owningTeamId: "team-a" as Id<"scrumTeams">,
  codeScopeMappings: [
    {
      requestedCodeScope: "apps/marketplace/**",
      codeScopeId: "scope-a" as Id<"repositoryCodeScopes">,
    },
  ],
  workflowId: "software-change/verified-pr",
  executionEnvironment: "POLICY_SELECTED" as const,
};

describe("Factory package runtime target authorization", () => {
  it("emits bounded failure telemetry for anonymous preview and confirm calls", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const anonymousContext = createContext({ identity: null });
      await functionHandler(preview)(anonymousContext, {
        ...args,
        packageId: "Bearer browser-secret",
        packageVersion: Number.NaN,
      });
      await functionHandler(importDrafts)(anonymousContext, {
        ...args,
        packageId: "Bearer browser-secret",
        packageVersion: Number.NaN,
        expectedPackageDigest: "server-secret",
        expectedMappingDigest: "customer-content",
      });

      expect(warn).toHaveBeenCalledTimes(2);
      const events = warn.mock.calls.map(([message]) => JSON.parse(message));
      expect(events).toMatchObject([
        {
          event: "mission_control.ingestion_failed",
          stage: "PREVIEW",
          package_id: "invalid",
          package_version: null,
          failure_code: "AUTHENTICATION_REQUIRED",
        },
        {
          event: "mission_control.ingestion_failed",
          stage: "CONFIRM",
          package_id: "invalid",
          package_version: null,
          package_digest_prefix: null,
          mapping_digest_prefix: null,
          failure_code: "AUTHENTICATION_REQUIRED",
        },
      ]);
      expect(JSON.stringify(events)).not.toContain("browser-secret");
      expect(JSON.stringify(events)).not.toContain("server-secret");
      expect(JSON.stringify(events)).not.toContain("customer-content");
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects malformed confirmation digests before upstream retrieval", async () => {
    const context = createContext();
    const target = await functionHandler(resolveTarget)(context, args);
    const runQuery = vi.fn().mockResolvedValue(target);
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("upstream retrieval must not run"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await functionHandler(importDrafts)(
        { ...context, runQuery },
        {
          ...args,
          packageId: "12345678-1234-4234-9234-123456789abc",
          packageVersion: 1,
          expectedPackageDigest: "server-secret",
          expectedMappingDigest: "customer-content",
        },
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "IDEMPOTENCY_CONFLICT" },
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect(runQuery).toHaveBeenCalledTimes(1);
      expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
        event: "mission_control.ingestion_failed",
        stage: "CONFIRM",
        package_digest_prefix: null,
        mapping_digest_prefix: null,
        failure_code: "IDEMPOTENCY_CONFLICT",
      });
    } finally {
      fetcher.mockRestore();
      warn.mockRestore();
    }
  });

  it("rejects an anonymous caller before reading target authority", async () => {
    const result = await functionHandler(resolveTarget)(
      createContext({ identity: null }),
      args,
    );
    expect(result).toEqual({ ok: false, code: "AUTHENTICATION_REQUIRED" });
  });

  it("resolves the exact authenticated project, repository, owner, team, scope, workflow, and project gate", async () => {
    const result = await functionHandler(resolveTarget)(createContext(), args);
    expect(result).toMatchObject({
      ok: true,
      tenantId: "tenant-a",
      projectId: "project-a",
      repositoryId: "repository-a",
      ownerMemberId: "member-a",
      owningTeamId: "team-a",
      workflowId: "software-change/verified-pr",
      qualificationModeEnabled: true,
    });
  });

  it.each([
    [
      "caller without project-scoped role assignment",
      (tables: Record<string, Row[]>) => {
        tables.roleAssignments[0].scope = {
          type: "project",
          id: "project-b",
        };
        tables.teamMemberships[0].role = "VIEWER";
      },
      "TARGET_UNAUTHORIZED",
    ],
    [
      "caller without delivery assignment authority",
      (tables: Record<string, Row[]>) => {
        tables.roles[0].permissions = ["delivery.write"];
        tables.teamMemberships[0].role = "DEVELOPER";
      },
      "TARGET_UNAUTHORIZED",
    ],
    [
      "cross-tenant repository",
      (tables: Record<string, Row[]>) => {
        tables.workspaceRepositories[0].tenantId = "tenant-b";
      },
      "TARGET_UNAUTHORIZED",
    ],
    [
      "cross-project owner",
      (tables: Record<string, Row[]>) => {
        tables.orgMembers[0].projectId = "project-b";
      },
      "TARGET_UNAUTHORIZED",
    ],
    [
      "cross-team code scope",
      (tables: Record<string, Row[]>) => {
        tables.repositoryCodeScopes[0].owningTeamId = "team-b";
      },
      "CODE_SCOPE_REJECTED",
    ],
    [
      "cross-repository code scope",
      (tables: Record<string, Row[]>) => {
        tables.repositoryCodeScopes[0].repositoryId = "repository-b";
      },
      "CODE_SCOPE_REJECTED",
    ],
    [
      "project-mismatched workflow",
      (tables: Record<string, Row[]>) => {
        tables.workflows[0].projectId = "project-b";
      },
      "WORKFLOW_UNAVAILABLE",
    ],
  ])("rejects a %s", async (_label, mutate, code) => {
    const result = await functionHandler(resolveTarget)(
      createContext({ mutate }),
      args,
    );
    expect(result).toEqual({ ok: false, code });
  });

  it("does not treat a global qualification flag as project authorization", async () => {
    const result = await functionHandler(resolveTarget)(
      createContext({
        mutate: (tables) => {
          const flag = tables.featureFlags.find(
            (row) => row.key === FACTORY_PACKAGE_QUALIFICATION_FLAG,
          )!;
          delete flag.projectId;
        },
      }),
      args,
    );
    expect(result).toMatchObject({
      ok: true,
      qualificationModeEnabled: false,
    });
  });
});
