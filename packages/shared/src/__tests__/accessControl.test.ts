import { describe, expect, it } from "vitest";
import {
  ACCESS_PERMISSIONS,
  ACCESS_PROFILE_DEFAULTS,
  ACCESS_VIEW_REQUIREMENTS,
  ADMIN_LOCKED_PERMISSIONS,
  ALL_ACCESS_PERMISSIONS,
  PERSONA_KEYS,
  SUPPORTED_ACCESS_VIEWS,
  validateAccessProfileDraft,
} from "../accessControl.js";

describe("access control contract", () => {
  it("defines one valid default for every canonical persona", () => {
    expect(Object.keys(ACCESS_PROFILE_DEFAULTS).sort()).toEqual([...PERSONA_KEYS].sort());

    for (const persona of PERSONA_KEYS) {
      const profile = ACCESS_PROFILE_DEFAULTS[persona];
      expect(validateAccessProfileDraft(persona, profile)).toEqual({ valid: true, errors: [] });
    }
  });

  it("declares a read requirement for every supported view", () => {
    expect(Object.keys(ACCESS_VIEW_REQUIREMENTS).sort()).toEqual([...SUPPORTED_ACCESS_VIEWS].sort());
  });

  it("keeps builder delivery permissions separate from approval and administration", () => {
    const permissions = ACCESS_PROFILE_DEFAULTS.BUILDER.permissions;
    expect(permissions).toContain(ACCESS_PERMISSIONS.DELIVERY_RECOVER);
    expect(permissions).toContain(ACCESS_PERMISSIONS.EVIDENCE_WRITE);
    expect(permissions).not.toContain(ACCESS_PERMISSIONS.APPROVALS_DECIDE);
    expect(permissions).not.toContain(ACCESS_PERMISSIONS.MEMBERS_MANAGE);
    expect(permissions).not.toContain(ACCESS_PERMISSIONS.POLICY_MANAGE);
  });

  it("keeps executive read-oriented by default", () => {
    const permissions = ACCESS_PROFILE_DEFAULTS.EXECUTIVE.permissions;
    expect(permissions).toContain(ACCESS_PERMISSIONS.ANALYTICS_READ);
    expect(permissions).toContain(ACCESS_PERMISSIONS.POLICY_READ);
    expect(permissions).not.toContain(ACCESS_PERMISSIONS.APPROVALS_DECIDE);
    expect(permissions).not.toContain(ACCESS_PERMISSIONS.DELIVERY_WRITE);
  });

  it("gives Admin every registered permission and locks the recovery-critical set", () => {
    expect(ACCESS_PROFILE_DEFAULTS.ADMIN.permissions).toEqual(ALL_ACCESS_PERMISSIONS);
    expect(ADMIN_LOCKED_PERMISSIONS.every((permission) =>
      ACCESS_PROFILE_DEFAULTS.ADMIN.permissions.includes(permission)
    )).toBe(true);
  });

  it("rejects unknown values, inaccessible landing views, and missing view permissions", () => {
    const result = validateAccessProfileDraft("BUILDER", {
      permissions: [ACCESS_PERMISSIONS.TASKS_READ],
      visibleViews: ["tasks", "command-center", "made-up-view"],
      defaultLandingView: "control-work-orders",
      defaultScopeLens: "EVERYTHING",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "Unknown views: made-up-view.",
      "Default landing view must be visible for the profile.",
      "Default scope lens is not supported.",
      `View command-center requires ${ACCESS_PERMISSIONS.FACTORY_READ}.`,
    ]));
  });

  it("prevents Admin from dropping access-management capabilities", () => {
    const profile = ACCESS_PROFILE_DEFAULTS.ADMIN;
    const result = validateAccessProfileDraft("ADMIN", {
      ...profile,
      permissions: profile.permissions.filter(
        (permission) => permission !== ACCESS_PERMISSIONS.ACCESS_PROFILES_MANAGE,
      ),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(ACCESS_PERMISSIONS.ACCESS_PROFILES_MANAGE);
    expect(result.errors).toContain("Admin must retain every registered permission.");
  });

  it("prevents a persona from selecting a scope lens outside its authority model", () => {
    const result = validateAccessProfileDraft("BUILDER", {
      ...ACCESS_PROFILE_DEFAULTS.BUILDER,
      defaultScopeLens: "COMPANY",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("BUILDER cannot use COMPANY as its default scope lens.");
  });
});
