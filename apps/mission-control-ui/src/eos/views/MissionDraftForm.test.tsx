import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissionDraftForm } from "./MissionDraftForm";

const mocks = vi.hoisted(() => ({
  updateDraft: vi.fn(),
  queryCall: 0,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.updateDraft,
  useQuery: () => {
    const responses = [
      {
        teams: [{ _id: "team-1", name: "Platform", status: "ACTIVE" }],
        memberships: [{ teamId: "team-1", memberId: "member-1", active: true }],
        members: [{ _id: "member-1", name: "Jay West", active: true }],
      },
      [{ repositoryId: "repo-1", displayName: "MissionControl", status: "READY" }],
      [{ _id: "scope-1", name: "Mission Control", active: true }],
    ];
    return responses[mocks.queryCall++ % responses.length];
  },
}));

const mission = {
  _id: "mission-1",
  state: "DRAFT",
  title: "Original title",
  objective: "Reliable Mission editing",
  context: "",
  constraints: [],
  sourceOfTruthRefs: [],
  owner: undefined,
  ownerMemberId: "member-1",
  owningTeamId: "team-1",
  repositoryId: "repo-1",
  codeScopeIds: ["scope-1"],
  budgetUsd: undefined,
  stopCondition: "Focused tests pass",
  maxReadOnlyConcurrency: 2,
  maxCorrectiveIterations: 1,
};

describe("MissionDraftForm", () => {
  beforeEach(() => {
    mocks.updateDraft.mockReset();
    mocks.queryCall = 0;
  });

  it("blocks duplicate saves while the first update is in flight", () => {
    mocks.updateDraft.mockReturnValue(new Promise(() => undefined));
    render(<MissionDraftForm mission={mission} projectId={"workspace-1" as any} />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Changed title" },
    });
    const save = screen.getByRole("button", { name: "Save draft" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.updateDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("saves an explicit owner-selected execution environment", () => {
    mocks.updateDraft.mockReturnValue(new Promise(() => undefined));
    render(<MissionDraftForm mission={mission} projectId={"workspace-1" as any} />);
    fireEvent.change(screen.getByLabelText("Execution environment"), { target: { value: "LOCAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(mocks.updateDraft).toHaveBeenCalledWith(expect.objectContaining({ executionEnvironment: "LOCAL" }));
  });

  it("retains the confirmed environment while parent query props catch up", async () => {
    mocks.updateDraft.mockResolvedValue({ mission: { ...mission, executionEnvironment: "LOCAL" } });
    render(<MissionDraftForm mission={mission} projectId={"workspace-1" as any} />);
    fireEvent.change(screen.getByLabelText("Execution environment"), { target: { value: "LOCAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Saved");
    expect(screen.getByLabelText("Execution environment")).toHaveValue("LOCAL");
  });

  it("associates invalid budget feedback with the field", () => {
    render(<MissionDraftForm mission={mission} projectId={"workspace-1" as any} />);

    const budget = screen.getByLabelText("Budget (USD)");
    fireEvent.change(budget, { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(budget).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Budget must be zero or greater."
    );
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });
});
