import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionRunInspector } from "./ExecutionRunInspector";

const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: () => vi.fn(),
}));

describe("ExecutionRunInspector shell states", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useQuery.mockReturnValue(undefined);
  });

  it("names the exact authority being resolved while loading", () => {
    render(<ExecutionRunInspector
      open
      workflowRunId={"run-1" as any}
      onClose={vi.fn()}
    />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading review evidence");
    expect(screen.getByText(/exact Attempt, candidate, verification gate/i)).toBeInTheDocument();
  });

  it("gives a recoverable action for a mismatched or unavailable Attempt", () => {
    render(<ExecutionRunInspector
      open
      workflowRunId={"run-1" as any}
      unavailable
      onClose={vi.fn()}
    />);

    expect(screen.getByRole("alert")).toHaveTextContent("outside the selected WorkOrder");
    expect(screen.getByRole("button", { name: "Close inspector" })).toBeEnabled();
  });

  it("explains the empty selection state", () => {
    render(<ExecutionRunInspector
      open
      workflowRunId={null}
      onClose={vi.fn()}
    />);

    expect(screen.getByText("Select an Attempt")).toBeInTheDocument();
    expect(screen.getByText(/review evidence and recovery history/i)).toBeInTheDocument();
  });
});
