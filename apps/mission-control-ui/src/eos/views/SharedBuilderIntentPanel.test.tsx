import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SharedBuilderIntentPanel, sharedIntentErrorMessage } from "./SharedBuilderIntentPanel";

const useQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: () => vi.fn(),
}));

const mission = { _id: "mission-1", projectId: "project-1", title: "Mission" } as any;
const revision = { _id: "spec-1", revisionNumber: 2, digest: "sha256:current" } as any;

describe("SharedBuilderIntentPanel", () => {
  beforeEach(() => useQuery.mockReset());

  it("renders explicit loading and first-revision empty states", () => {
    useQuery.mockReturnValue(undefined);
    const { rerender } = render(<SharedBuilderIntentPanel projectId={"project-1" as any} mission={mission} currentRevision={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading shared contributions");
    useQuery.mockReturnValue({ enabled: true, items: [] });
    rerender(<SharedBuilderIntentPanel projectId={"project-1" as any} mission={mission} currentRevision={null} />);
    expect(screen.getByText(/Save the first Mission Spec revision/)).toBeInTheDocument();
  });

  it("keeps disabled capability inspectable and all form controls unavailable", () => {
    useQuery.mockReturnValue({ enabled: false, items: [] });
    render(<SharedBuilderIntentPanel projectId={"project-1" as any} mission={mission} currentRevision={revision} />);
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save proposal" })).toBeDisabled();
    expect(screen.getByLabelText("Contributor role")).toBeDisabled();
  });

  it("shows conflict and stale recovery without offering unsafe acceptance", () => {
    const base = {
      revisionNumber: 1, contributorRole: "QA", targetSection: "ACCEPTANCE_EXPECTATIONS", targetItemId: "AC-001",
      title: "Negative case", body: "Prove denial", evidenceExpectation: "Browser evidence", missionSpecRevisionId: "spec-1",
      proposedActorType: "AGENT", proposedBy: "qa-agent", decision: undefined,
    };
    useQuery.mockReturnValue({ enabled: true, items: [
      { ...base, _id: "contribution-conflict", contributionKey: "QA-AC-001", state: "CONFLICT", conflictIds: ["other"] },
      { ...base, _id: "contribution-stale", contributionKey: "QA-AC-002", state: "STALE", conflictIds: [], missionSpecRevisionId: "spec-old" },
    ] });
    render(<SharedBuilderIntentPanel projectId={"project-1" as any} mission={mission} currentRevision={revision} />);
    expect(screen.getByText(/Conflicts with 1 current proposal/)).toBeInTheDocument();
    expect(screen.getByText(/targets an older Spec/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept as Spec input" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revise against current" })).toHaveLength(2);
  });

  it("renders accepted decisions with durable attribution after resumption", () => {
    useQuery.mockReturnValue({ enabled: true, items: [{
      _id: "contribution-accepted", contributionKey: "PRODUCT-OUTCOME-001", revisionNumber: 1,
      contributorRole: "PRODUCT", targetSection: "OUTCOME", title: "Outcome", body: "Reduce approval time",
      evidenceExpectation: "Accepted outcome latency", missionSpecRevisionId: "spec-1", proposedActorType: "HUMAN",
      proposedBy: "pm@example.com", state: "ACCEPTED", conflictIds: [],
      decision: { decidedBy: "operator@example.com", reason: "Matches approved product intent" },
    }] });
    render(<SharedBuilderIntentPanel projectId={"project-1" as any} mission={mission} currentRevision={revision} />);
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
    expect(screen.getByText(/Decision by operator@example.com/)).toHaveTextContent("Matches approved product intent");
  });

  it("removes transport details from recoverable server errors", () => {
    expect(sharedIntentErrorMessage(
      new Error("[CONVEX M(...)] Server Error\nUncaught Error: Contribution key is invalid at draft (../convex/file.ts:1:1)\nCalled by client"),
      "Fallback",
    )).toBe("Contribution key is invalid");
  });
});
