import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CreateFactoryMissionDialog } from "./CreateFactoryMissionDialog";

const createDraft = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => createDraft,
  useQuery: () => [
    {
      repository: "sellerfi/app",
      displayName: "SellerFi",
      defaultBranch: "main",
      isDefault: true,
    },
  ],
}));

describe("CreateFactoryMissionDialog", () => {
  beforeEach(() => {
    createDraft.mockReset();
    createDraft.mockResolvedValue({ mission: { _id: "mission-1" } });
  });

  it("creates only a Mission draft and preserves recommendation provenance", async () => {
    render(
      <CreateFactoryMissionDialog
        projectId={"project-1" as Id<"projects">}
        open
        onOpenChange={vi.fn()}
        experienceLevel="intermediate"
        initialRequest="Fix a small checkout typo and prove it with tests"
        initialRecipeId="build-review"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Create Mission draft" }),
    );
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1));
    const payload = createDraft.mock.calls[0][0];
    expect(payload).toMatchObject({
      projectId: "project-1",
      metadata: {
        factoryExperience: {
          recommendedRecipeId: "build-test",
          selectedRecipeId: "build-review",
          operatorOverrodeRecommendation: true,
        },
      },
    });
    expect(payload.metadata.factoryExperience).not.toHaveProperty(
      "uiModeAtCreation",
    );
    expect(payload).not.toHaveProperty("dispatch");
    expect(payload).not.toHaveProperty("approved");
    expect(payload).not.toHaveProperty("accepted");
  });

  it.each([
    ["Explain how authentication works; report findings only", "scout"],
    ["Write an implementation plan for a schema migration", "plan"],
  ])("keeps the requested non-mutating recipe when drafting %s", async (request, recipeId) => {
    render(
      <CreateFactoryMissionDialog
        projectId={"project-1" as Id<"projects">}
        open
        onOpenChange={vi.fn()}
        experienceLevel="intermediate"
        initialRequest={request}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Create Mission draft" }),
    );
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1));
    const payload = createDraft.mock.calls[0][0];
    expect(payload.metadata.factoryExperience).toMatchObject({
      recommendedRecipeId: recipeId,
      selectedRecipeId: recipeId,
      operatorOverrodeRecommendation: false,
    });
    expect(payload).not.toHaveProperty("dispatch");
    expect(payload).not.toHaveProperty("approved");
    expect(payload).not.toHaveProperty("accepted");
  });
});
