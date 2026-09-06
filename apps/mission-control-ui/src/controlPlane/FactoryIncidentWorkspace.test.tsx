import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FactoryIncidentBoundary,
  FactoryIncidentWorkspace,
  IncidentPermissionState,
} from "./FactoryIncidentWorkspace";

const useQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: () => vi.fn(),
}));

const incident = {
  _id: "incident-1",
  incidentKey: "INC-DEMO-001",
  title: "Credential broker anomaly",
  summary: "A credential broker response arrived after its Attempt lease expired.",
  severity: "SEV2",
  phase: "CONTAIN",
  status: "CONTAINED",
  commanderActorId: "operator@example.com",
  businessImpact: "One repository dispatch was held before publication.",
  recoveryObjective: "Restore the last known-safe route after revocation evidence is current.",
  containmentState: "CONTAINED",
  authorityRestored: false,
  currentSequence: 2,
};

describe("FactoryIncidentWorkspace", () => {
  beforeEach(() => useQuery.mockReset());

  it("renders an explicit loading state", () => {
    useQuery.mockReturnValue(undefined);
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    expect(screen.getByRole("status", { name: "Loading incidents" })).toBeInTheDocument();
  });

  it("renders a truthful empty state", () => {
    useQuery.mockReturnValue([]);
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    expect(screen.getByText("No incidents recorded")).toBeInTheDocument();
    expect(screen.getByText(/not that alerts or failures never occurred/)).toBeInTheDocument();
  });

  it("separates contained state from authority restoration and shows the next exact phase", async () => {
    useQuery.mockImplementation((_reference, args) => (
      args && typeof args === "object" && "incidentId" in args
        ? {
            incident,
            transitions: [{
              _id: "transition-2", sequence: 2, fromPhase: "CLARIFY", toPhase: "CONTAIN",
              decisionKind: "CONTAINMENT", actorType: "HUMAN", reason: "Revoked the exact Attempt credential.",
              evidenceRefs: [{ kind: "ATTEMPT", recordId: "run-1", relationship: "affected" }],
              containmentActions: ["REVOKE_ATTEMPT_CREDENTIALS"],
              controlExecutions: [{
                controlKey: "REVOKE_ATTEMPT_CREDENTIALS",
                commandReceipt: { kind: "EVIDENCE", recordId: "evidence-command-1", relationship: "control-command-issued" },
                observedEffectReceipt: { kind: "EVIDENCE", recordId: "evidence-effect-1", relationship: "control-effect-observed" },
                observedAt: Date.UTC(2026, 8, 5),
              }],
              createdAt: Date.UTC(2026, 8, 5),
            }],
            proposals: [],
          }
        : [incident]
    ));
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Credential broker anomaly" })).toBeInTheDocument());
    expect(screen.getAllByText("CONTAINED").length).toBeGreaterThan(0);
    expect(screen.getByText("Not restored")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advance to Observe" })).toBeInTheDocument();
    expect(screen.getByText(/immutable decision expects sequence 2/i)).toBeInTheDocument();
  });

  it("separates command receipts from observed-effect proof at containment", async () => {
    const clarifyIncident = { ...incident, phase: "CLARIFY", status: "OPEN", currentSequence: 1 };
    useQuery.mockImplementation((_reference, args) => (
      args && typeof args === "object" && "incidentId" in args
        ? { incident: clarifyIncident, transitions: [], proposals: [] }
        : [clarifyIncident]
    ));
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Advance to Contain" })).toBeInTheDocument());
    expect(screen.getByLabelText("Control command receipts")).toBeInTheDocument();
    expect(screen.getByLabelText("Observed control effects")).toBeInTheDocument();
    expect(screen.getByText(/acknowledgement is not proof/i)).toBeInTheDocument();
  });

  it("renders an explicit denied or degraded access state", () => {
    render(<IncidentPermissionState message="Cross-company access denied." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cross-company access denied.");
  });

  it("contains query authorization failures inside the incident workspace", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const DeniedQuery = () => {
      throw new Error("Company account is unavailable or unauthorized.");
    };
    render(
      <FactoryIncidentBoundary>
        <DeniedQuery />
      </FactoryIncidentBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Company account is unavailable or unauthorized.");
    consoleError.mockRestore();
  });
});
