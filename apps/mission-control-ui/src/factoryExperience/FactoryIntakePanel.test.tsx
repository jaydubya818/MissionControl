import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FactoryIntakePanel } from "./FactoryIntakePanel";

const state = vi.hoisted(() => ({ deliveries: [] as unknown[], query: vi.fn(), retry: vi.fn(), plan: vi.fn(), queryDenied: false }));
vi.mock("../../../../convex/_generated/api", () => ({ api: { factory: { intake: {
  listDeliveries: "list", retryDelivery: "retry", requestPlanning: "plan",
} } } }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => { state.query(...args); if (state.queryDenied) throw new Error("Authenticated operator required."); return state.deliveries; },
  useMutation: () => state.retry, useAction: () => state.plan }));
const projectId = "project-1" as Id<"projects">;
const delivery = { _id: "delivery-1", status: "PROCESSED", attempts: 1, outcome: "MISSION_CREATED", missionId: "mission-1",
  source: { kind: "PRODUCT_ERROR", title: "Save failed" } };

describe("intake operator preview", () => {
  beforeEach(() => { state.deliveries = []; state.queryDenied = false; vi.clearAllMocks(); state.retry.mockReset().mockResolvedValue({ scheduled: true }); state.plan.mockReset().mockResolvedValue({}); });
  it("does not load or mutate intake before opening the existing Mission surface", () => {
    render(<FactoryIntakePanel projectId={projectId} onOpenMission={vi.fn()} />);
    expect(state.query).not.toHaveBeenCalled();
    expect(state.retry).not.toHaveBeenCalled(); expect(state.plan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review intake" }));
    expect(state.query).toHaveBeenCalledWith("list", { projectId, limit: 50 });
    expect(screen.getByText(/No visible deliveries/)).toBeInTheDocument();
  });
  it("keeps missing restoration explicit and hands planning to the canonical Mission", async () => {
    state.deliveries = [delivery]; const open = vi.fn();
    render(<FactoryIntakePanel projectId={projectId} onOpenMission={open} />);
    fireEvent.click(screen.getByRole("button", { name: "Review intake" }));
    expect(screen.getByText("Restoration has not been established.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Mission" })); expect(open).toHaveBeenCalledWith("mission-1");
    fireEvent.click(screen.getByRole("button", { name: "Request planning" }));
    await waitFor(() => expect(state.plan).toHaveBeenCalledWith({ deliveryId: "delivery-1" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Planning was requested");
    expect(state.retry).not.toHaveBeenCalled();
  });
  it("shows retry refusal without claiming work was scheduled", async () => {
    state.deliveries = [{ ...delivery, status: "FAILED", missionId: undefined }];
    state.retry.mockRejectedValue(new Error("INTAKE_PROCESSING_ALREADY_SCHEDULED"));
    render(<FactoryIntakePanel projectId={projectId} onOpenMission={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Review intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("INTAKE_PROCESSING_ALREADY_SCHEDULED");
    expect(screen.queryByText(/Processing retry was scheduled/)).not.toBeInTheDocument();
  });
  it("does not offer another retry after the bounded attempt limit", () => {
    state.deliveries = [{ ...delivery, status: "FAILED", attempts: 3, missionId: undefined }];
    render(<FactoryIntakePanel projectId={projectId} onOpenMission={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Review intake" }));
    expect(screen.queryByRole("button", { name: "Retry processing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request planning" })).not.toBeInTheDocument();
  });

  it("preserves the Mission page after a denied read and can recover locally", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.queryDenied = true;
      render(<><h1>Mission portfolio</h1><FactoryIntakePanel projectId={projectId} onOpenMission={vi.fn()} /></>);
      fireEvent.click(screen.getByRole("button", { name: "Review intake" }));
      expect(screen.getByRole("heading", { name: "Mission portfolio" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Intake is currently unavailable");
      state.queryDenied = false; fireEvent.click(screen.getByRole("button", { name: "Retry intake" }));
      expect(screen.getByText(/No visible deliveries/)).toBeInTheDocument();
      expect(state.plan).not.toHaveBeenCalled();
    } finally { errorLog.mockRestore(); }
  });
});
