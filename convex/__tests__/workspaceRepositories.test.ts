import { describe, expect, it } from "vitest";
import {
  canonicalRepositoryKey,
  CODE_SCOPE_APPROVAL_POLICIES,
  findOverlappingScopes,
  normalizeCodePath,
  normalizeCodePaths,
  repositoryDisplayName,
  resolveMissionRepositoryBinding,
  validateCodeScopeInput,
  validateRepositoryInput,
} from "../lib/workspaceRepositories";

describe("workspace repository contracts", () => {
  it("normalizes repository identity without changing its display name", () => {
    expect(canonicalRepositoryKey(" SellerFi/Marketplace ")).toBe("sellerfi/marketplace");
    expect(repositoryDisplayName("SellerFi/Marketplace")).toBe("Marketplace");
  });

  it("validates repository and default branch input", () => {
    expect(validateRepositoryInput({ repository: "SellerFi/Marketplace", defaultBranch: "main" })).toBeNull();
    expect(validateRepositoryInput({ repository: "Marketplace", defaultBranch: "main" })).toBe(
      "Use the repository format owner/repository."
    );
    expect(validateRepositoryInput({ repository: "SellerFi/Marketplace", defaultBranch: "" })).toBe(
      "Default branch is required."
    );
  });

  it("uses the Mission repository binding instead of the legacy workspace default", () => {
    expect(resolveMissionRepositoryBinding({
      projectId: "workspace-1",
      missionRepository: {
        projectId: "workspace-1",
        repository: "example/external-product",
        defaultBranch: "stable",
      },
      legacyRepository: "example/control-plane",
      legacyDefaultBranch: "main",
    })).toEqual({
      repository: "example/external-product",
      defaultBranch: "stable",
      source: "MISSION",
    });
  });

  it("fails closed for cross-workspace Mission repository bindings", () => {
    expect(() => resolveMissionRepositoryBinding({
      projectId: "workspace-1",
      missionRepository: {
        projectId: "workspace-2",
        repository: "example/external-product",
        defaultBranch: "main",
      },
    })).toThrow("Mission repository does not belong to the selected workspace");
  });

  it("normalizes repository-relative code paths", () => {
    expect(normalizeCodePath("./apps\\buyer-portal/")).toBe("apps/buyer-portal");
    expect(normalizeCodePaths(["apps/api", "./apps/api/", "packages/shared"])).toEqual([
      "apps/api",
      "packages/shared",
    ]);
    expect(normalizeCodePath("../secrets")).toBe("");
  });

  it("requires valid, bounded code scopes", () => {
    expect(
      validateCodeScopeInput({
        name: "Buyer portal",
        slug: "buyer-portal",
        includePaths: ["apps/buyer-portal"],
        excludePaths: ["apps/buyer-portal/generated"],
      })
    ).toBeNull();
    expect(
      validateCodeScopeInput({
        name: "Buyer portal",
        slug: "Buyer Portal",
        includePaths: ["apps/buyer-portal"],
        excludePaths: [],
      })
    ).toContain("slug");
    expect(
      validateCodeScopeInput({
        name: "Buyer portal",
        slug: "buyer-portal",
        includePaths: ["../buyer-portal"],
        excludePaths: [],
      })
    ).toContain("include path");
  });

  it("keeps approval gate identifiers controlled and descriptive guidance separate", () => {
    expect(CODE_SCOPE_APPROVAL_POLICIES).toEqual(["HUMAN_REVIEW", "RISK_REVIEW"]);
    expect(validateCodeScopeInput({
      name: "Buyer portal",
      slug: "buyer-portal",
      includePaths: ["apps/buyer-portal"],
      excludePaths: [],
      approvalPolicy: "HUMAN_REVIEW",
      approvalPolicyDescription: "Checkout lead confirms the affected flow.",
    })).toBeNull();
    expect(validateCodeScopeInput({
      name: "Buyer portal",
      slug: "buyer-portal",
      includePaths: ["apps/buyer-portal"],
      excludePaths: [],
      approvalPolicy: "Both owning team leads approve",
    })).toBe("Select a supported code-scope approval gate.");
  });

  it("reports exact and nested scope overlaps", () => {
    expect(
      findOverlappingScopes(["apps/buyer-portal/checkout"], [
        { name: "Buyer portal", includePaths: ["apps/buyer-portal"] },
        { name: "Seller portal", includePaths: ["apps/seller-portal"] },
      ])
    ).toEqual(["Buyer portal"]);
  });
});
