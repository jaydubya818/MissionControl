import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateRecoveryPanel } from "./CandidateRecoveryPanel";

afterEach(cleanup);
describe("CandidateRecoveryPanel", () => {
  it("disables duplicate requests while pending and confirms a queued reconciliation", async () => {
    let resolve!: () => void;
    const recover = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    render(<CandidateRecoveryPanel candidateRevision={"a".repeat(40)} publicationUncertain onRecover={recover} />);
    fireEvent.click(screen.getByRole("button", { name: "Reconcile publication" }));
    expect(screen.getByRole("button", { name: "Queuing recovery…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button")); expect(recover).toHaveBeenCalledOnce();
    resolve();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Read-only publication reconciliation queued"));
  });
  it("shows a server rejection and permits an explicit dispatch retry", async () => {
    const recover = vi.fn().mockRejectedValueOnce(new Error("Verifier is unavailable")).mockResolvedValueOnce({ queued: true });
    render(<CandidateRecoveryPanel candidateRevision={"b".repeat(40)} publicationUncertain={false} onRecover={recover} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry verification dispatch" }));
    await screen.findByText("Verifier is unavailable");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry verification dispatch" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Independent verification dispatch queued"));
    expect(screen.queryByText("Verifier is unavailable")).not.toBeInTheDocument();
  });
  it("does not queue recovery without a captured candidate", () => {
    const recover = vi.fn();
    render(<CandidateRecoveryPanel publicationUncertain onRecover={recover} />);
    expect(screen.getByRole("button")).toBeDisabled();
    fireEvent.click(screen.getByRole("button")); expect(recover).not.toHaveBeenCalled();
  });
});
