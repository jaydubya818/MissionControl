import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionRunInspector, InferenceEconomicsCard, RemoteSandboxCard } from "./ExecutionRunInspector";

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

describe("RemoteSandboxCard", () => {
  it("shows execution, credential, result, and teardown evidence without exposing secret material", () => {
    render(<RemoteSandboxCard sandbox={{
      allocation: {
        provider: "EXE_DEV", providerResourceId: "vm-123", resourceName: "mc-attempt-0123456789abcdef",
        state: "TERMINATED", profileDigest: "sha256:profile", lastHeartbeatAt: Date.UTC(2026, 7, 15, 12),
        resultDigest: "sha256:result", resultStatus: "COMPLETED", providerCostUsd: 0.25, inferenceCostUsd: 0.75,
        privatePreviewUrl: "https://mc-attempt-0123456789abcdef.exe.xyz", resourceAbsentAt: Date.UTC(2026, 7, 15, 12, 5),
        teardownReceipt: { resourceAbsent: true, confirmedAbsentAt: Date.UTC(2026, 7, 15, 12, 5) },
      },
      profileSnapshot: {
        profileKey: "exe-standard", version: 3, machine: { cpu: 2, memoryMb: 4096, diskGb: 20 },
        runtime: { maxRuntimeMs: 7_200_000 }, network: { egress: "UNRESTRICTED", publicIngress: false, exposedPorts: [] },
        spend: { maxUsd: 5 }, readiness: { state: "DEGRADED" },
      },
      credentialGrants: [{ provider: "OPENROUTER", state: "REVOKED", maxCostUsd: 5, expiresAt: Date.UTC(2026, 7, 15, 14), secretFingerprint: "sha256:fingerprint" }],
      lifecycleEvents: [{ eventType: "SANDBOX_TERMINATED", occurredAt: Date.UTC(2026, 7, 15, 12, 5) }],
    }} />);

    expect(screen.getByText("Remote sandbox boundary")).toBeInTheDocument();
    expect(screen.getByText("DEGRADED")).toBeInTheDocument();
    expect(screen.getByText("Resource absent")).toBeInTheDocument();
    expect(screen.getByText(/OPENROUTER · REVOKED · cap \$5.00/)).toBeInTheDocument();
    expect(screen.getByText(/COMPLETED · sha256:result/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open private preview" })).toHaveAttribute("href", "https://mc-attempt-0123456789abcdef.exe.xyz/");
    expect(screen.queryByText(/sk-or-v1/)).not.toBeInTheDocument();
  });

  it("does not render an untrusted preview URL", () => {
    render(<RemoteSandboxCard sandbox={{
      allocation: { state: "FAILED", privatePreviewUrl: "https://public.example.com", failureReason: "Provider deletion timed out." },
      profileSnapshot: { readiness: { state: "READY" } }, credentialGrants: [], lifecycleEvents: [],
    }} />);

    expect(screen.queryByRole("link", { name: "Open private preview" })).not.toBeInTheDocument();
    expect(screen.getByText("Private preview unavailable")).toBeInTheDocument();
    expect(screen.getByText("Teardown unverified")).toBeInTheDocument();
    expect(screen.getByText("Provider deletion timed out.")).toBeInTheDocument();
  });
});

describe("InferenceEconomicsCard", () => {
  it("leads with the WorkOrder spending stop despite an older complete projection", () => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: true, reservations: [{ state: "EXHAUSTED" }], intents: [{ state: "RECEIPTED" }],
      receipts: [{ _id: "receipt-overrun", physicalOrdinal: 1, route: { provider: "openai", modelId: "pinned-model" },
        delivery: "DELIVERED", status: "SUCCEEDED", costCompleteness: "COMPLETE", costMicrousd: 6750,
        costClassification: "ESTIMATED", violationCodes: ["RESERVATION_OUTPUT_TOKEN_LIMIT_EXCEEDED"] }],
      inferenceSpendingFence: { fencedAt: 1234, sourceDigest: "sha256:retained-observation",
        violationCodes: ["RESERVATION_OUTPUT_TOKEN_LIMIT_EXCEEDED"] },
      reconciliations: [], latestComparison: null, state: "COMPLETE",
      latestProjection: { outcome: "ACCEPTED", knownCostMicrousd: 6750, totalCostMicrousd: 6750,
        costCoverage: 1, confidence: "HIGH", formulaVersion: "accepted-outcome-economics/v1" },
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Inference spending stopped");
    expect(screen.getByRole("alert")).toHaveTextContent("Existing allocations remain held");
    expect(screen.getByRole("alert")).toHaveTextContent("sha256:retained-observation");
    expect(screen.getByText("SPENDING STOPPED")).toBeInTheDocument();
    expect(screen.getByText(/ESTIMATED ·/)).toBeInTheDocument();
    expect(screen.getByText(/last stored outcome projection and may predate this observation/)).toBeInTheDocument();
    expect(screen.getByText("Last projected cost")).toBeInTheDocument();
    expect(screen.getByText("Last projected coverage")).toBeInTheDocument();
    expect(screen.getByText("Last projected confidence")).toBeInTheDocument();
    expect(screen.queryByText("Complete physical-call total")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume|unfreeze|release/i })).not.toBeInTheDocument();
  });

  it("shows a WorkOrder spending stop when this Attempt has no reservation", () => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: false, reservations: [], intents: [], receipts: [], reconciliations: [],
      latestProjection: null, latestComparison: null, state: "EMPTY",
      inferenceSpendingFence: { fencedAt: 1234, sourceDigest: "sha256:prior-attempt",
        violationCodes: ["RESOLVED_MODEL_DRIFT"] },
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("New inference claims for this WorkOrder are blocked");
    expect(screen.getByText("No governed inference reservation")).toBeInTheDocument();
  });

  it("shows loading and honest empty states", () => {
    const { rerender } = render(<InferenceEconomicsCard data={undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading inference economics");
    rerender(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: false, reservations: [], intents: [], receipts: [], reconciliations: [],
      latestProjection: null, latestComparison: null, state: "EMPTY",
    }} />);
    expect(screen.getByText("No governed inference reservation")).toBeInTheDocument();
    expect(screen.getByText("Gateway disabled")).toBeInTheDocument();
  });

  it("labels unknown cost as a lower bound and exposes comparison denial", () => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: true,
      reservations: [{ state: "ACTIVE" }],
      intents: [{ state: "AMBIGUOUS" }],
      receipts: [{
        _id: "receipt-1", physicalOrdinal: 1, route: { provider: "openai", modelId: "gpt-4o-mini-2024-07-18" },
        delivery: "UNKNOWN", status: "UNKNOWN", costCompleteness: "UNKNOWN",
      }],
      reconciliations: [],
      latestProjection: {
        outcome: "ACCEPTED", knownCostMicrousd: 0, totalCostMicrousd: undefined,
        costCoverage: 0, confidence: "NONE", formulaVersion: "accepted-outcome-economics/v1",
      },
      latestComparison: { status: "NO_GO", blockers: ["INCOMPLETE_COST_COVERAGE"] },
      state: "UNKNOWN",
    }} />);
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
    expect(screen.getByText("Lower bound; total is unknown")).toBeInTheDocument();
    expect(screen.getByText("Comparison ineligible")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Automatic promotion remains disabled");
  });

  it("shows completed accepted-outcome economics without collapsing stages", () => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: true, reservations: [{ state: "EXHAUSTED" }], intents: [{ state: "RECEIPTED" }],
      receipts: [{ _id: "receipt-1", physicalOrdinal: 1, route: { provider: "openai", modelId: "gpt-4o-mini-2024-07-18" }, delivery: "DELIVERED", status: "SUCCEEDED", costCompleteness: "COMPLETE", costMicrousd: 6750, providerRequestId: "req-1" }],
      reconciliations: [], latestComparison: null, state: "COMPLETE",
      latestProjection: { outcome: "ACCEPTED", knownCostMicrousd: 6750, totalCostMicrousd: 6750, costCoverage: 1, confidence: "HIGH", formulaVersion: "accepted-outcome-economics/v1" },
    }} />);
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Verification and human acceptance stay separate")).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
  });

  it.each([true, false])("keeps an unrepresentable aggregate unknown with a stored projection: %s", (projected) => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: true, reservations: [{ state: "EXHAUSTED" }], intents: [{ state: "RECEIPTED" }],
      receipts: [1, 2].map(physicalOrdinal => ({
        _id: `receipt-${physicalOrdinal}`, physicalOrdinal,
        route: { provider: "openai", modelId: "pinned-model" },
        delivery: "DELIVERED", status: "SUCCEEDED", costCompleteness: "COMPLETE",
        costMicrousd: Number.MAX_SAFE_INTEGER,
      })),
      reconciliations: [], latestComparison: null, state: "UNKNOWN",
      latestProjection: projected ? {
        outcome: "ACCEPTED", knownCostMicrousd: undefined, costCompleteness: "UNKNOWN",
        costCoverage: 1, confidence: "NONE", formulaVersion: "accepted-outcome-economics/v2",
      } : null,
    }} />);
    const metric = screen.getByText("Known inference cost").parentElement!;
    expect(metric).toHaveTextContent("Unknown");
    expect(metric).toHaveTextContent("Aggregate cost unavailable");
    expect(metric).not.toHaveTextContent("$");
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("does not replace unknown projected money with an older receipt estimate", () => {
    render(<InferenceEconomicsCard data={{
      gatewayAdmissionEnabled: true, reservations: [{ state: "EXHAUSTED" }], intents: [{ state: "RECEIPTED" }],
      receipts: [{ _id: "receipt-1", physicalOrdinal: 1, route: { provider: "openai", modelId: "pinned-model" },
        delivery: "DELIVERED", status: "SUCCEEDED", costCompleteness: "COMPLETE", costMicrousd: 6750 }],
      reconciliations: [], latestComparison: null, state: "UNKNOWN",
      latestProjection: { outcome: "ACCEPTED", knownCostMicrousd: undefined, costCompleteness: "UNKNOWN",
        costCoverage: 0, confidence: "NONE", formulaVersion: "accepted-outcome-economics/v2" },
    }} />);
    expect(screen.getByText("Known inference cost").parentElement).toHaveTextContent("Unknown");
    expect(screen.getByText(/ESTIMATED ·/)).toBeInTheDocument();
  });
});
