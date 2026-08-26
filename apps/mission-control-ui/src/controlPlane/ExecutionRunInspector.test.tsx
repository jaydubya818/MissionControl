import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionRunInspector, RemoteSandboxCard } from "./ExecutionRunInspector";

const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useAction: () => vi.fn(),
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
