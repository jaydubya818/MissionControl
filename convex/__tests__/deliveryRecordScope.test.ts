import { describe, expect, it } from "vitest";
import { canAccessDeliveryRecord } from "../lib/deliveryAuthorization";

type Access = Parameters<typeof canAccessDeliveryRecord>[0];

function access(overrides: Partial<NonNullable<Access>> = {}): Access {
  return {
    membership: { mode: "AUTHENTICATED", canManageCompany: false },
    roleNames: ["Delivery engineer"],
    teamMemberships: [],
    memberProfiles: [],
    ...overrides,
  } as unknown as Access;
}

describe("delivery record scope", () => {
  it("admits an unowned record — the workspace permission check is the whole check", () => {
    // Regression: this returned false, so once the delivery gate stopped being
    // flag-gated, every WorkOrder without an explicit owner became invisible to
    // every operator who was not a company admin (or whose role name did not
    // match a name heuristic) — including operators holding delivery.approve.
    expect(canAccessDeliveryRecord(access(), {})).toBe(true);
  });

  it("still narrows an owned record to its owning team", () => {
    const record = { owningTeamId: "team-a" as any };
    expect(canAccessDeliveryRecord(access(), record)).toBe(false);
    expect(
      canAccessDeliveryRecord(
        access({ teamMemberships: [{ teamId: "team-a" }] as any }),
        record,
      ),
    ).toBe(true);
  });

  it("still narrows an owned record to its owning member", () => {
    const record = { ownerMemberId: "member-a" as any };
    expect(canAccessDeliveryRecord(access(), record)).toBe(false);
    expect(
      canAccessDeliveryRecord(
        access({ memberProfiles: [{ _id: "member-a" }] as any }),
        record,
      ),
    ).toBe(true);
  });

  it("does not treat an unowned record as a bypass for company admin checks elsewhere", () => {
    // Access being null means the gate was not enforced at all; that path is
    // decided by resolveDeploymentAuthorizationMode, not by this function.
    expect(canAccessDeliveryRecord(null, { owningTeamId: "team-a" as any })).toBe(true);
  });
});
