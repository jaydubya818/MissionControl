/**
 * Regression tests for the two-ladder permission lockout.
 *
 * The company ladder (`roleGrantsPermission`) resolved delivery permissions by
 * matching role NAMES against "workspace lead" / "product manager" / "team
 * lead". Neither shipped role catalog uses those names, so once enforcement
 * became provisioning-driven only a Company Owner could satisfy
 * APPROVE_DELIVERY — and RED-risk dual control, which needs two distinct
 * approvers, became unsatisfiable.
 *
 * These tests pin the SHIPPED catalogs, so a future catalog edit that
 * reintroduces the gap fails here rather than in production.
 */

import { describe, expect, it } from "vitest";
import { COMPANY_PERMISSIONS, roleGrantsPermission } from "../lib/companyAccess";

function role(name: string, permissions: string[]) {
  return { _id: "role-1", _creationTime: 1, name, permissions } as any;
}

// convex/companyMembers.ts DEFAULT_ROLES
const COMPANY_OWNER = role("Company Owner", [
  "company.owner", "company.manage", "members.manage", "workspaces.create",
  "workspaces.manage", "missions.write", "missions.approve", "workorders.write",
  "workorders.dispatch", "approvals.decide",
]);
const PORTFOLIO_OWNER = role("Portfolio Owner", [
  "missions.write", "missions.approve", "workorders.write", "workorders.dispatch", "approvals.decide",
]);
const SCRUM_LEAD = role("Scrum Lead", ["missions.write", "workorders.write", "tasks.assign", "tasks.write"]);
const DEVELOPER = role("Developer", ["missions.write", "workorders.write", "tasks.write", "evidence.write"]);
const AUDITOR = role("Read-only Auditor", ["missions.read", "workorders.read", "tasks.read", "evidence.read"]);

// convex/seedMissionControlDemo.ts
const DEMO_OPERATOR = role("Operator", [
  "tasks.read", "tasks.update", "tasks.transition", "agents.read",
  "approvals.read", "approvals.decide", "telemetry.read",
]);
const DEMO_REVIEWER = role("Reviewer", ["tasks.read", "approvals.read", "approvals.decide", "policy.read"]);

describe("delivery permissions are reachable by the roles Mission Control ships", () => {
  it("lets a Portfolio Owner approve delivery", () => {
    // workOrders.accept requires APPROVE_DELIVERY. Before the fix this was
    // false, so the role that owns governed decisions could not accept.
    expect(roleGrantsPermission(PORTFOLIO_OWNER, COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(true);
  });

  it("makes RED-risk dual control satisfiable with the demo catalog", () => {
    // Dual control sets requiredDecisionCount: 2 and needs two DISTINCT
    // approvers. One qualifying role means one qualifying person.
    const approvers = [COMPANY_OWNER, DEMO_OPERATOR, DEMO_REVIEWER].filter((candidate) =>
      roleGrantsPermission(candidate, COMPANY_PERMISSIONS.APPROVE_DELIVERY),
    );
    expect(approvers.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a Company Owner authorized", () => {
    expect(roleGrantsPermission(COMPANY_OWNER, COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(true);
  });
});

describe("the fix does not widen authority", () => {
  it("still refuses approval authority to a Developer", () => {
    expect(roleGrantsPermission(DEVELOPER, COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(false);
  });

  it("still refuses approval authority to a Scrum Lead who holds no approval grant", () => {
    expect(roleGrantsPermission(SCRUM_LEAD, COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(false);
  });

  it("grants a read-only auditor nothing at all", () => {
    for (const permission of Object.values(COMPANY_PERMISSIONS)) {
      expect(roleGrantsPermission(AUDITOR, permission), `auditor got ${permission}`).toBe(false);
    }
  });

  it("keeps write and approve authority separate for a Developer", () => {
    expect(roleGrantsPermission(DEVELOPER, COMPANY_PERMISSIONS.UPDATE_DELIVERY)).toBe(true);
    expect(roleGrantsPermission(DEVELOPER, COMPANY_PERMISSIONS.MANAGE_COMPANY)).toBe(false);
    expect(roleGrantsPermission(DEVELOPER, COMPANY_PERMISSIONS.MANAGE_MEMBERS)).toBe(false);
  });

  it("does not let a dispatch grant confer approval", () => {
    const dispatcher = role("Dispatcher", ["workorders.dispatch"]);
    expect(roleGrantsPermission(dispatcher, COMPANY_PERMISSIONS.DISPATCH_WORK)).toBe(true);
    expect(roleGrantsPermission(dispatcher, COMPANY_PERMISSIONS.APPROVE_DELIVERY)).toBe(false);
  });
});
