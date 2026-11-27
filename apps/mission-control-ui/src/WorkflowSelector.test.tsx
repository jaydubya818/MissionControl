import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkflowSelector } from "./WorkflowSelector";

const start = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({
  useMutation: () => start,
  useQuery: () => [
    { _id: "own", workflowId: "scoped", name: "Scoped workflow", projectId: "workspace", contractVersion: "factory-workflow-contract/v1", steps: [], agents: [] },
    { _id: "foreign", workflowId: "foreign", name: "Foreign workflow", projectId: "other", contractVersion: "factory-workflow-contract/v1", steps: [], agents: [] },
    { _id: "global", workflowId: "global", name: "Global workflow", steps: [], agents: [] },
    { _id: "governed", workflowId: "governed", name: "Governed workflow", projectId: "workspace", contractVersion: "factory-workflow-contract/v2", steps: [], agents: [] },
  ],
}));
beforeEach(() => { start.mockReset(); });

it("requires a workspace and offers no unbound start", () => {
  render(<WorkflowSelector onClose={() => undefined} />);
  expect(screen.getByRole("status")).toHaveTextContent("Choose a workspace");
  expect(screen.getByRole("button", { name: "Start Workflow" })).toBeDisabled();
  expect(screen.queryByText("Global workflow")).not.toBeInTheDocument();
});

it("offers only directly startable definitions from the current workspace", () => {
  start.mockReturnValue(new Promise(() => undefined));
  render(<WorkflowSelector projectId={"workspace" as any} onClose={() => undefined} />);
  expect(screen.queryByText("Foreign workflow")).not.toBeInTheDocument();
  expect(screen.queryByText("Governed workflow")).not.toBeInTheDocument();
  expect(screen.queryByText("Global workflow")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Scoped workflow/ }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bounded fixture" } });
  fireEvent.click(screen.getByRole("button", { name: "Start Workflow" }));
  expect(start).toHaveBeenCalledWith({ workflowId: "scoped", projectId: "workspace", initialInput: "Bounded fixture" });
});
