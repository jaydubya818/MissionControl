/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "!../__tests__/**"]);
const subject = "user_BootstrapOwner123";
const input = { name: "Staging Owner", email: "owner@example.test" };

async function fixture(active = true) {
  const t = convexTest(schema, modules);
  const tenantId = await t.run((ctx) => ctx.db.insert("tenants", {
    name: "Isolated staging", slug: "isolated-staging", active,
  }));
  return { t, tenantId, owner: t.withIdentity({ subject }) };
}

async function membershipRows(t: ReturnType<typeof convexTest<typeof schema>>) {
  return await t.run(async (ctx) => ({
    operators: await ctx.db.query("operators").collect(),
    roles: await ctx.db.query("roles").collect(),
    assignments: await ctx.db.query("roleAssignments").collect(),
    activities: await ctx.db.query("activities").collect(),
  }));
}

describe("first owner bootstrap through registered Mission-scoped handlers", () => {
  beforeEach(() => {
    vi.stubEnv("MC_BOOTSTRAP_OWNER_SUBJECT", subject);
    vi.stubEnv("MC_BOOTSTRAP_TENANT_SLUG", "isolated-staging");
    vi.stubEnv("MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT", "0");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("atomically enrolls the configured signed-in owner, audits it, and closes bootstrap", async () => {
    const { t, tenantId, owner } = await fixture();
    expect(await owner.query(api.companyMembers.getBootstrapStatus)).toEqual({
      eligible: true, tenantName: "Isolated staging",
    });
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, input)).toEqual({ success: true, tenantId });
    const rows = await membershipRows(t);
    expect(rows.operators).toHaveLength(1);
    expect(rows.roles).toHaveLength(1);
    expect(rows.assignments).toHaveLength(1);
    expect(rows.activities).toHaveLength(1);
    const operator = rows.operators[0];
    expect(operator).toMatchObject({ authId: subject, tenantId, active: true, email: input.email });
    expect(rows.roles[0].permissions).toContain("company.owner");
    expect(rows.assignments[0]).toMatchObject({ operatorId: operator._id, roleId: rows.roles[0]._id, scope: { type: "tenant", id: tenantId } });
    expect(rows.activities[0]).toMatchObject({ tenantId, actorId: operator._id, targetId: operator._id, action: "COMPANY_OWNER_BOOTSTRAPPED" });
    expect(await owner.query(api.companyContext.getSession)).toMatchObject({ status: "READY", companies: [{ tenantId, canManageCompany: true }] });
    expect(await owner.query(api.companyMembers.getBootstrapStatus)).toEqual({ eligible: false });
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, input)).toMatchObject({ success: false });
    expect(await membershipRows(t)).toEqual(rows);
  });

  it.each(["anonymous", "wrong-subject", "missing-subject", "missing-slug", "wrong-slug", "inactive"])("denies %s without creating authority", async (scenario) => {
    const { t, owner } = await fixture(scenario !== "inactive");
    if (scenario === "missing-subject") vi.stubEnv("MC_BOOTSTRAP_OWNER_SUBJECT", "");
    if (scenario === "missing-slug") vi.stubEnv("MC_BOOTSTRAP_TENANT_SLUG", "");
    if (scenario === "wrong-slug") vi.stubEnv("MC_BOOTSTRAP_TENANT_SLUG", "other-company");
    const caller = scenario === "anonymous" ? t : scenario === "wrong-subject" ? t.withIdentity({ subject: "user_OtherOwner123" }) : owner;
    expect(await caller.query(api.companyMembers.getBootstrapStatus)).toEqual({ eligible: false });
    expect(await caller.mutation(api.companyMembers.bootstrapOwner, input)).toMatchObject({ success: false });
    expect(await membershipRows(t)).toEqual({ operators: [], roles: [], assignments: [], activities: [] });
  });

  it("cannot claim an occupied tenant whose existing operator is another subject", async () => {
    const { t, tenantId, owner } = await fixture();
    await t.run((ctx) => ctx.db.insert("operators", { tenantId, authId: "user_ExistingOwner123", name: "Existing", email: "existing@example.test", active: true, createdAt: Date.now() }));
    const before = await membershipRows(t);
    expect(await owner.query(api.companyMembers.getBootstrapStatus)).toEqual({ eligible: false });
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, input)).toMatchObject({ success: false });
    expect(await membershipRows(t)).toEqual(before);
  });

  it("rejects invalid membership input without partial writes", async () => {
    const { t, owner } = await fixture();
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, { ...input, email: "invalid" })).toMatchObject({ success: false });
    expect(await membershipRows(t)).toEqual({ operators: [], roles: [], assignments: [], activities: [] });
  });

  it.each([subject, "user_FormerOwner123"])("keeps setup closed for inactive operator %s", async (authId) => {
    const { t, tenantId, owner } = await fixture();
    await t.run((ctx) => ctx.db.insert("operators", { tenantId, authId, name: "Inactive", email: "inactive@example.test", active: false, createdAt: Date.now() }));
    const before = await membershipRows(t);
    expect(await owner.query(api.companyMembers.getBootstrapStatus)).toEqual({ eligible: false });
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, input)).toMatchObject({ success: false });
    expect(await membershipRows(t)).toEqual(before);
  });

  it("does not reuse an underprivileged role based on its owner name", async () => {
    const { t, tenantId, owner } = await fixture();
    const oldRoleId = await t.run((ctx) => ctx.db.insert("roles", { tenantId, name: "Company Owner", permissions: ["missions.read"] }));
    expect(await owner.mutation(api.companyMembers.bootstrapOwner, input)).toMatchObject({ success: true });
    const rows = await membershipRows(t);
    expect(rows.assignments[0].roleId).not.toBe(oldRoleId);
    const assignedRole = rows.roles.find((role) => role._id === rows.assignments[0].roleId)!;
    expect(assignedRole.permissions).toEqual(expect.arrayContaining(["company.owner", "company.manage", "members.manage"]));
    expect(await owner.query(api.companyContext.getSession)).toMatchObject({ status: "READY", companies: [{ canManageCompany: true }] });
  });

  it("serializes duplicate setup requests to one enrollment in the test backend", async () => {
    const { t, owner } = await fixture();
    const results = await Promise.all([
      owner.mutation(api.companyMembers.bootstrapOwner, input),
      owner.mutation(api.companyMembers.bootstrapOwner, input),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const rows = await membershipRows(t);
    expect(rows.operators).toHaveLength(1);
    expect(rows.assignments).toHaveLength(1);
    expect(rows.activities).toHaveLength(1);
  });

  it("allows the enrolled owner to create a workspace while denying another subject", async () => {
    const { t, tenantId, owner } = await fixture();
    await owner.mutation(api.companyMembers.bootstrapOwner, input);
    const workspace = {
      tenantId, name: "Qualification", slug: "qualification", purpose: "Isolated qualification",
      owner: input.name, defaultPolicy: "Owner approval required", status: "ACTIVE" as const,
    };
    await expect(t.withIdentity({ subject: "user_OtherOwner123" }).mutation(api.companyContext.createWorkspace, workspace)).rejects.toThrow();
    expect(await owner.mutation(api.companyContext.createWorkspace, workspace)).toMatchObject({ success: true, project: { tenantId, slug: workspace.slug } });
  });
});
