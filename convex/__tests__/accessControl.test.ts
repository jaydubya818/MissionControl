import { describe, expect, it } from "vitest";
import { ACCESS_PERMISSIONS, ACCESS_PROFILE_DEFAULTS } from "@mission-control/shared";
import {
  accessProfileDiff,
  canTransitionAccessControlMode,
  isScopeAllowedForPersona,
  mapLegacyRoleNameToPersona,
  normalizeAccessProfileDraft,
  selectPrimaryPersona,
} from "../lib/accessControl";

describe("access control policy", () => {
  it("normalizes a valid profile without weakening validation", () => {
    const profile = ACCESS_PROFILE_DEFAULTS.BUILDER;
    const result = normalizeAccessProfileDraft("BUILDER", {
      ...profile,
      permissions: [...profile.permissions, profile.permissions[0]],
      visibleViews: [...profile.visibleViews, profile.visibleViews[0]],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.permissions).toHaveLength(profile.permissions.length);
      expect(result.value.visibleViews).toHaveLength(profile.visibleViews.length);
    }
  });

  it("selects the safest highest-authority persona and reports conflicts", () => {
    const roles = [
      { name: "Builder", systemKey: "BUILDER" },
      { name: "Admin", systemKey: "ADMIN" },
    ];
    expect(selectPrimaryPersona(roles)).toEqual({
      role: roles[1],
      systemKey: "ADMIN",
      conflict: true,
    });
  });

  it("enforces persona assignment scope ceilings", () => {
    expect(isScopeAllowedForPersona("ADMIN", "tenant")).toBe(true);
    expect(isScopeAllowedForPersona("ADMIN", "project")).toBe(false);
    expect(isScopeAllowedForPersona("EXECUTIVE", "project")).toBe(false);
    expect(isScopeAllowedForPersona("ARCHITECT", "project")).toBe(true);
    expect(isScopeAllowedForPersona("BUILDER", "team")).toBe(true);
    expect(isScopeAllowedForPersona("BUILDER", "tenant")).toBe(false);
  });

  it("requires shadow comparison before first enforcement", () => {
    expect(canTransitionAccessControlMode("LEGACY", "ENFORCED")).toBe(false);
    expect(canTransitionAccessControlMode("LEGACY", "SHADOW")).toBe(true);
    expect(canTransitionAccessControlMode("SHADOW", "ENFORCED")).toBe(true);
    expect(canTransitionAccessControlMode("ENFORCED", "LEGACY")).toBe(true);
  });

  it("maps only exact safe legacy role names", () => {
    expect(mapLegacyRoleNameToPersona("Company Owner")).toBe("ADMIN");
    expect(mapLegacyRoleNameToPersona("Software Engineer")).toBe("BUILDER");
    expect(mapLegacyRoleNameToPersona("Observer")).toBe("EXECUTIVE");
    expect(mapLegacyRoleNameToPersona("Platform Architect")).toBe("ARCHITECT");
    expect(mapLegacyRoleNameToPersona("Product Manager")).toBeUndefined();
    expect(mapLegacyRoleNameToPersona("Team Lead")).toBeUndefined();
  });

  it("computes an impact diff", () => {
    const diff = accessProfileDiff(
      { permissions: [ACCESS_PERMISSIONS.TASKS_READ], visibleViews: ["tasks"] },
      {
        permissions: [ACCESS_PERMISSIONS.TASKS_READ, ACCESS_PERMISSIONS.FACTORY_READ],
        visibleViews: ["command-center"],
      },
    );
    expect(diff).toEqual({
      permissionsAdded: [ACCESS_PERMISSIONS.FACTORY_READ],
      permissionsRemoved: [],
      viewsAdded: ["command-center"],
      viewsRemoved: ["tasks"],
    });
  });
});
