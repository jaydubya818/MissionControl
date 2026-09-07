import { describe, expect, it } from "vitest";
import { temporaryFactoryAutomationGrantIsCurrent } from "../lib/companyAccess";

describe("temporary Factory automation authority expiry", () => {
  const current = { authorization: "216b51ff-ab61-4b07-9cc2-391e0ec89a8d",
    masterAuthorization: "e11b3640-f44f-4e0b-bb00-82d94ae19984", grantedAt: 1_000,
    expiresAt: 601_000, originalPermissions: ["repositories.manage"] };
  it("accepts only the bounded approved window", () => {
    expect(temporaryFactoryAutomationGrantIsCurrent(current, 1_000)).toBe(true);
    expect(temporaryFactoryAutomationGrantIsCurrent(current, 600_999)).toBe(true);
    expect(temporaryFactoryAutomationGrantIsCurrent(current, 601_000)).toBe(false);
  });
  it.each([
    { ...current, authorization: "other" },
    { ...current, masterAuthorization: "other" },
    { ...current, grantedAt: 2_000 },
    { ...current, expiresAt: 601_001 },
    { ...current, originalPermissions: ["factory.automation.manage"] },
    { ...current, originalPermissions: "repositories.manage" },
  ])("denies malformed or expanded grants %#", grant => {
    expect(temporaryFactoryAutomationGrantIsCurrent(grant, 1_500)).toBe(false);
  });
});
