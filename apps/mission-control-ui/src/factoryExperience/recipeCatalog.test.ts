import { describe, expect, it, vi } from "vitest";
import {
  factoryExperienceMetadata,
  recommendFactoryRecipe,
  recipeIdFromTrace,
  resolveRecipeWorkflow,
} from "./recipeCatalog";

describe("Factory recipe catalog", () => {
  it.each([
    [
      "Investigate why checkout tests are flaky and report findings only",
      "scout",
    ],
    ["Write an implementation plan for the onboarding change", "plan"],
    ["Run lint, typecheck, and tests", "quality"],
    ["Fix a tiny typo and run the tests", "build-test"],
    ["Update the README installation section", "build"],
    ["Change the authorization policy for production acceptance", "full-sdlc"],
    ["Implement a new buyer confidence panel", "plan-build-test"],
  ])("recommends a sufficient governed recipe for %s", (request, recipeId) => {
    expect(recommendFactoryRecipe(request)?.recipeId).toBe(recipeId);
  });

  it.each([
    ["Explain how authentication works; report findings only", "scout"],
    ["Explain how to change the authorization policy", "scout"],
    ["Investigate authentication; do not change code", "scout"],
    ["Do not change production authentication; explain the current policy", "scout"],
    ["Write an implementation plan for a schema migration", "plan"],
    ["Create a plan to update the production database", "plan"],
    ["Plan only: migrate the production schema", "plan"],
    ["Run tests and typecheck for authentication", "quality"],
    ["Run the schema build check without changing code", "quality"],
    ["Investigate authentication and fix the regression", "full-sdlc"],
    ["Write an implementation plan, then implement the authentication migration", "full-sdlc"],
    ["Explain authentication and update production permissions", "full-sdlc"],
    ["Run tests for authentication and deploy the payment service", "full-sdlc"],
    ["Explain authentication before you update production permissions", "full-sdlc"],
    ["Investigate authentication while you fix the regression", "full-sdlc"],
    ["Explain authentication: update production permissions after the explanation", "full-sdlc"],
    ["Explain authentication: how to change the authorization policy", "scout"],
    ["Write an implementation plan: migrate the production schema", "plan"],
  ])("separates requested action from sensitive subject matter for %s", (request, recipeId) => {
    expect(recommendFactoryRecipe(request)?.recipeId).toBe(recipeId);
  });

  it("returns no recommendation for an empty or meaningless request", () => {
    expect(recommendFactoryRecipe("fix")).toBeNull();
  });

  it("resolves a recipe to an existing canonical workflow without creating another engine", () => {
    const workflows = [
      { workflowId: "quality-audit", name: "Quality Audit" },
      { workflowId: "feature-dev", name: "Feature Development" },
    ];
    expect(resolveRecipeWorkflow("plan-build-test", workflows)).toEqual(
      workflows[1],
    );
    expect(resolveRecipeWorkflow("quality", workflows)).toEqual(workflows[0]);
    expect(resolveRecipeWorkflow("scout", workflows)).toBeUndefined();
  });

  it("retains recommendation and override provenance on Mission metadata", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const recommendation = recommendFactoryRecipe(
      "Implement a new buyer confidence panel",
    )!;
    const metadata = factoryExperienceMetadata({
      recommendation,
      selectedRecipeId: "full-sdlc",
      repositoryIntent: "jaydubya818/MissionControl",
    });
    expect(metadata).toMatchObject({
      recommendedRecipeId: "plan-build-test",
      selectedRecipeId: "full-sdlc",
      operatorOverrodeRecommendation: true,
      repositoryIntent: "jaydubya818/MissionControl",
      requestedAt: 1234,
    });
    vi.restoreAllMocks();
  });

  it("reads a recipe projection without treating it as trace authority", () => {
    expect(recipeIdFromTrace({ tags: ["recipe:build-test"] })).toBe(
      "build-test",
    );
    expect(
      recipeIdFromTrace({
        metadata: { factoryExperience: { selectedRecipeId: "scout" } },
      }),
    ).toBe("scout");
    expect(recipeIdFromTrace({ tags: ["recipe:unknown"] })).toBeUndefined();
  });
});
