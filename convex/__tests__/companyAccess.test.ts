import { afterEach, describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  COMPANY_PERMISSIONS,
  FACTORY_PERMISSIONS,
  listCompanyMemberships,
  roleGrantsPermission,
  teamMembershipGrantsPermission,
  requireCompanyAccess,
  requireCompanyPermission,
  requireWorkspacePermission,
} from "../lib/companyAccess";
import { canAccessDeliveryRecord } from "../lib/deliveryAuthorization";

const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;

afterEach(() => {
  if (originalDemoFlag === undefined) {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
  } else {
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
  }
});

function fakeContext({
  identity = null,
  roleName = "Owner",
  permissions = ["settings.manage"],
  assignmentScope = "tenant",
}: {
  identity?: { subject: string; tokenIdentifier: string } | null;
  roleName?: string;
  permissions?: string[];
  assignmentScope?: "tenant" | "project";
} = {}) {
  const tenantA = {
    _id: "tenant-a" as Id<"tenants">,
    _creationTime: 1,
    name: "Mission Control",
    slug: "mission-control",
    active: true,
  };
  const tenantB = {
    _id: "tenant-b" as Id<"tenants">,
    _creationTime: 2,
    name: "SellerFi",
    slug: "sellerfi",
    active: true,
  };
  const ownerRole = {
    _id: "role-owner" as Id<"roles">,
    _creationTime: 3,
    tenantId: tenantA._id,
    name: roleName,
    permissions,
  };
  const projectA = {
    _id: "project-a" as Id<"projects">,
    _creationTime: 3,
    tenantId: tenantA._id,
    name: "Mission Control",
    slug: "mission-control",
  };
  const operator = {
    _id: "operator-a" as Id<"operators">,
    _creationTime: 4,
    tenantId: tenantA._id,
    email: "owner@example.com",
    name: "Owner",
    authId: "auth-user",
    active: true,
    createdAt: 1,
  };
  const assignment = {
    _id: "assignment-a" as Id<"roleAssignments">,
    _creationTime: 5,
    operatorId: operator._id,
    roleId: ownerRole._id,
    scope: assignmentScope === "project"
      ? { type: "project" as const, id: projectA._id }
      : { type: "tenant" as const, id: tenantA._id },
    assignedAt: 1,
  };
  const tables: Record<string, any[]> = {
    tenants: [tenantA, tenantB],
    operators: [operator],
    roles: [ownerRole],
    roleAssignments: [assignment],
    projects: [projectA],
  };
  const all = Object.values(tables).flat();

  return {
    tenantA,
    tenantB,
    projectA,
    ctx: {
      auth: { getUserIdentity: async () => identity },
      db: {
        get: async (id: string) => all.find((row) => row._id === id) ?? null,
        query: (table: string) => {
          let rows = [...(tables[table] ?? [])];
          const builder: any = {
            withIndex: (_name: string, apply: (q: any) => any) => {
              const conditions: Array<[string, unknown]> = [];
              const q: any = {
                eq: (field: string, value: unknown) => {
                  conditions.push([field, value]);
                  return q;
                },
              };
              apply(q);
              rows = rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
              return builder;
            },
            collect: async () => rows,
          };
          return builder;
        },
      },
    } as any,
  };
}

describe("company access", () => {
  it("keeps the initial role permission matrix explicit and least-privileged", () => {
    const role = (name: string, permissions: string[] = []) => ({ name, permissions } as any);
    const everyPermission = Object.values(COMPANY_PERMISSIONS);

    expect(everyPermission.every((permission) => roleGrantsPermission(role("Company Owner"), permission))).toBe(true);
    expect(everyPermission.every((permission) => roleGrantsPermission(role("Company Admin"), permission))).toBe(true);

    const workspaceLead = role("Workspace Lead");
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.MANAGE_COMPANY)).toBe(false);
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.MANAGE_WORKSPACES)).toBe(true);
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES)).toBe(true);
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.MANAGE_TEAMS)).toBe(true);
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.ASSIGN_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(workspaceLead, COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(true);

    const teamLead = role("Team Lead");
    expect(roleGrantsPermission(teamLead, COMPANY_PERMISSIONS.MANAGE_WORKSPACES)).toBe(false);
    expect(roleGrantsPermission(teamLead, COMPANY_PERMISSIONS.MANAGE_REPOSITORIES)).toBe(false);
    expect(roleGrantsPermission(teamLead, COMPANY_PERMISSIONS.MANAGE_TEAMS)).toBe(true);
    expect(roleGrantsPermission(teamLead, COMPANY_PERMISSIONS.ASSIGN_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(teamLead, COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(true);

    expect(roleGrantsPermission(role("Developer"), COMPANY_PERMISSIONS.UPDATE_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(role("Developer"), COMPANY_PERMISSIONS.VERIFY_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(role("Developer"), COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(false);
    expect(roleGrantsPermission(role("QA"), COMPANY_PERMISSIONS.VERIFY_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(role("QA"), COMPANY_PERMISSIONS.UPDATE_DELIVERY)).toBe(false);
    expect(everyPermission.some((permission) => roleGrantsPermission(role("Viewer"), permission))).toBe(false);
    expect(teamMembershipGrantsPermission("LEAD", COMPANY_PERMISSIONS.MANAGE_TEAMS)).toBe(true);
    expect(teamMembershipGrantsPermission("PM", COMPANY_PERMISSIONS.ASSIGN_DELIVERY)).toBe(true);
    expect(teamMembershipGrantsPermission("DEVELOPER", COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(true);
    expect(teamMembershipGrantsPermission("DEVELOPER", COMPANY_PERMISSIONS.ASSIGN_DELIVERY)).toBe(false);
    expect(teamMembershipGrantsPermission("QA", COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(false);
    expect(teamMembershipGrantsPermission("VIEWER", COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(false);
  });

  it("fails closed without authentication or the demo flag", async () => {
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const { ctx } = fakeContext();
    await expect(listCompanyMemberships(ctx)).resolves.toEqual([]);
  });

  it("resolves only companies linked to the authenticated operator", async () => {
    const { ctx, tenantA } = fakeContext({
      identity: { subject: "auth-user", tokenIdentifier: "issuer|auth-user" },
    });
    const memberships = await listCompanyMemberships(ctx);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].tenant._id).toBe(tenantA._id);
    expect(memberships[0].canManageCompany).toBe(true);
    expect(memberships[0].mode).toBe("AUTHENTICATED");
  });

  it("does not accept the token identifier in place of the exact subject", async () => {
    const { ctx } = fakeContext({
      identity: { subject: "different-user", tokenIdentifier: "auth-user" },
    });
    await expect(listCompanyMemberships(ctx)).resolves.toEqual([]);
  });

  it("denies named administration permissions to an ordinary member", async () => {
    const { ctx, tenantA } = fakeContext({
      identity: { subject: "auth-user", tokenIdentifier: "issuer|auth-user" },
      roleName: "Developer",
      permissions: ["tasks.write"],
    });
    await expect(
      requireCompanyPermission(ctx, tenantA._id, COMPANY_PERMISSIONS.MANAGE_MEMBERS)
    ).rejects.toThrow("does not permit");
  });

  it("derives factory authority from the authenticated project-scoped role", async () => {
    const { ctx, projectA } = fakeContext({
      identity: { subject: "auth-user", tokenIdentifier: "issuer|auth-user" },
      roleName: "Developer",
      permissions: ["tasks.write", "evidence.write"],
      assignmentScope: "project",
    });
    const access = await requireWorkspacePermission(
      ctx,
      projectA._id,
      FACTORY_PERMISSIONS.IMPROVE
    );
    expect(access.actorId).toBe("operator-a");
    await expect(
      requireWorkspacePermission(ctx, projectA._id, FACTORY_PERMISSIONS.APPROVE)
    ).rejects.toThrow("does not permit");
  });

  it("rejects an inaccessible company", async () => {
    const { ctx, tenantB } = fakeContext({
      identity: { subject: "auth-user", tokenIdentifier: "issuer|auth-user" },
    });
    await expect(requireCompanyAccess(ctx, tenantB._id)).rejects.toThrow(
      "unavailable or unauthorized"
    );
  });

  it("exposes active companies only when local demo access is explicit", async () => {
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    const { ctx } = fakeContext();
    const memberships = await listCompanyMemberships(ctx);
    expect(memberships.map((item) => item.tenant.slug)).toEqual([
      "mission-control",
      "sellerfi",
    ]);
    expect(memberships.every((item) => item.mode === "DEMO")).toBe(true);
  });

  it("keeps team-scoped operators inside their assigned delivery records", () => {
    const access = {
      membership: { mode: "AUTHENTICATED", canManageCompany: false },
      roleNames: ["Team Lead"],
      teamMemberships: [{ teamId: "team-a" }],
      memberProfiles: [{ _id: "member-a" }],
    } as any;

    expect(canAccessDeliveryRecord(access, { owningTeamId: "team-a" as Id<"scrumTeams"> })).toBe(true);
    expect(canAccessDeliveryRecord(access, { ownerMemberId: "member-a" as Id<"orgMembers"> })).toBe(true);
    expect(canAccessDeliveryRecord(access, { owningTeamId: "team-b" as Id<"scrumTeams"> })).toBe(false);
    // Deliberate semantic change. `canAccessDeliveryRecord` narrows by
    // OWNERSHIP; it runs only after `requireAuthorizedDeliveryScope` has already
    // required the company permission in this record's workspace. A record with
    // no owner has nothing to narrow by, so the permission check is the whole
    // check and this returns true.
    //
    // It used to return false. That was invisible while the delivery gate was
    // flag-gated off, but enforcement is now driven by deployment provisioning
    // (lib/authorizationRollout.ts), and delivery records are created unowned by
    // default — so `false` would have made every unowned WorkOrder permanently
    // unreachable by every operator except a company admin, with an error
    // message ("unavailable or unauthorized") that gives no way out.
    // See convex/__tests__/deliveryRecordScope.test.ts.
    expect(canAccessDeliveryRecord(access, {})).toBe(true);
  });
});
