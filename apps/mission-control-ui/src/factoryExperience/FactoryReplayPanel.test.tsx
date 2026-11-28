import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FactoryReplayPanel } from "./FactoryReplayPanel";

const state = vi.hoisted(() => ({ review: null as unknown, query: vi.fn(), freeze: vi.fn(), prepare: vi.fn(), reconcile: vi.fn(), dispatch: vi.fn(), queryDenied: false }));
vi.mock("../../../../convex/_generated/api", () => ({ api: { factory: { replay: {
  getReview: "getReview", freeze: "freeze", prepareCase: "prepare", reconcile: "reconcile", dispatchPending: "dispatch",
} } } }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => { state.query(...args); if (state.queryDenied) throw new Error("Replay requires authenticated access."); return state.review; },
  useMutation: (name: "freeze" | "prepare" | "reconcile") => state[name], useAction: () => state.dispatch }));
const experimentId = "experiment-1" as Id<"experiments">;
const entry = { caseKey: "case-1", variantId: "variant-1", state: "UNBOUND", implementationAttempts: 0, failedAttemptIds: [],
  costUsd: null, ownerInterventions: null, assistantOutsideFactoryInterventions: null, unattributedEvaluatorCostIds: [], reasons: ["WORK_ORDER_MISSING"] };
const review = { manifest: { _id: "manifest-1", definition: { variants: [{ id: "variant-1", name: "Baseline" }],
  cases: [{ key: "case-1", workload: { title: "Persist a task" } }] } }, cases: [entry], comparison: { matchedPairs: 0, denominator: 1, minimumPairs: 1,
  sampleSufficient: false, recommendation: { recommendation: "HOLD_RECOMMENDED", comparisonWarnings: ["The frozen workload set has incomplete matched evidence."] } } };

function open(status = "DRAFT", hasManifest = true) {
  render(<FactoryReplayPanel experimentId={experimentId} experimentStatus={status} hasManifest={hasManifest} canFreeze />);
  fireEvent.click(screen.getByRole("button", { name: "Review replay" }));
}
describe("frozen replay operator preview", () => {
  beforeEach(() => { state.review = structuredClone(review); state.queryDenied = false; vi.clearAllMocks();
    state.freeze.mockReset().mockResolvedValue({}); state.prepare.mockReset().mockResolvedValue({}); state.reconcile.mockReset().mockResolvedValue({});
    state.dispatch.mockReset().mockResolvedValue({ nextCursor: null, results: [{ caseKey: "case-1", status: "BLOCKED", reason: "CURRENT_APPROVAL_REQUIRED" }] }); });
  it("loads evidence only on expansion and never dispatches on render", () => {
    render(<FactoryReplayPanel experimentId={experimentId} experimentStatus="DRAFT" hasManifest canFreeze />);
    expect(state.query).not.toHaveBeenCalled(); expect(state.dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review replay" }));
    expect(state.query).toHaveBeenCalledWith("getReview", { experimentId });
    expect(screen.getByText(/Attempt cost: Unknown/)).toHaveTextContent("Owner interventions: Unknown");
    expect(screen.getByText(/0 of 1 matched case pairs/)).toBeInTheDocument();
  });
  it("prepares a fresh case without dispatching or copying approval", async () => {
    open(); fireEvent.click(screen.getByRole("button", { name: "Prepare case" }));
    await waitFor(() => expect(state.prepare).toHaveBeenCalledWith({ manifestId: "manifest-1", variantId: "variant-1", caseKey: "case-1" }));
    expect(state.dispatch).not.toHaveBeenCalled();
  });
  it("retains blocked admission reasons after a bounded batch and permits rechecking", async () => {
    open(); fireEvent.click(screen.getByRole("button", { name: "Dispatch batch from 1" }));
    await waitFor(() => expect(state.dispatch).toHaveBeenCalledWith({ manifestId: "manifest-1", cursor: 0, limit: 10 }));
    expect(await screen.findByLabelText("Blocked replay cases")).toHaveTextContent("CURRENT_APPROVAL_REQUIRED");
    expect(screen.getByRole("button", { name: "Dispatch batch complete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck from first case" }));
    expect(screen.getByRole("button", { name: "Dispatch batch from 1" })).toBeEnabled();
  });
  it("does not offer execution or preparation for a closed experiment", () => {
    open("COMPLETED"); expect(screen.getByRole("button", { name: "Prepare case" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dispatch batch from 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reconcile evidence" })).toBeEnabled();
  });
  it("freezes explicit limits and surfaces admission refusal without claiming success", async () => {
    state.review = null; state.freeze.mockRejectedValue(new Error("Factory version is not admitted")); open("DRAFT", false);
    fireEvent.change(screen.getByLabelText("Minimum matched pairs"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Freeze replay definition" }));
    await waitFor(() => expect(state.freeze).toHaveBeenCalledWith({ experimentId, minimumPairs: 2, maxAttemptsPerCase: 1 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Factory version is not admitted");
    expect(state.prepare).not.toHaveBeenCalled(); expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("contains a denied replay read and retries without dispatching work", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.queryDenied = true;
      render(<><h1>Experiments</h1><FactoryReplayPanel experimentId={experimentId} experimentStatus="DRAFT" hasManifest canFreeze /></>);
      fireEvent.click(screen.getByRole("button", { name: "Review replay" }));
      expect(screen.getByRole("heading", { name: "Experiments" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Replay is currently unavailable");
      state.queryDenied = false; fireEvent.click(screen.getByRole("button", { name: "Retry replay" }));
      expect(screen.getByText(/Attempt cost: Unknown/)).toBeInTheDocument();
      expect(state.dispatch).not.toHaveBeenCalled();
    } finally { errorLog.mockRestore(); }
  });
});
