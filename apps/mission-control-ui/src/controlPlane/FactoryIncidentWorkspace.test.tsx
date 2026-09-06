import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
                acknowledgmentReceipt: { kind: "EVIDENCE", recordId: "evidence-acknowledgment-1", relationship: "control-command-acknowledged" },
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

  it("separates command, acknowledgment, and observed-effect proof at containment", async () => {
    const clarifyIncident = { ...incident, phase: "CLARIFY", status: "OPEN", currentSequence: 1 };
    useQuery.mockImplementation((_reference, args) => (
      args && typeof args === "object" && "incidentId" in args
        ? { incident: clarifyIncident, transitions: [], proposals: [] }
        : [clarifyIncident]
    ));
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Advance to Contain" })).toBeInTheDocument());
    expect(screen.getByLabelText("Control command receipts")).toBeInTheDocument();
    expect(screen.getByLabelText("Control acknowledgment receipts")).toBeInTheDocument();
    expect(screen.getByLabelText("Observed control effects")).toBeInTheDocument();
    expect(screen.getByText(/require three distinct receipts/i)).toBeInTheDocument();
  });

  it("renders persisted pause command, acknowledgment, and observation as distinct stages", async () => {
    const clarifyIncident = {
      ...incident,
      repositoryId: "repository-1",
      phase: "CLARIFY",
      status: "OPEN",
      currentSequence: 1,
    };
    useQuery.mockImplementation((reference, args) => {
      if (args && typeof args === "object" && "repositoryId" in args) {
        return {
          admission: "DENIED",
          generation: 1,
          activeRequestId: "request-1",
          restorationAuthorizations: [],
          receipts: [
            { _id: "effect-1", receiptType: "EFFECT_OBSERVED", operation: "PAUSE_REPOSITORY_DISPATCH", requestId: "request-1", authoritySequence: 1, authorityExpiresAt: Date.now() + 60_000, createdAt: 4 },
            { _id: "ack-1", receiptType: "ACKNOWLEDGED", operation: "PAUSE_REPOSITORY_DISPATCH", requestId: "request-1", authoritySequence: 1, authorityExpiresAt: Date.now() + 60_000, createdAt: 3 },
            { _id: "command-1", receiptType: "COMMAND_ISSUED", operation: "PAUSE_REPOSITORY_DISPATCH", requestId: "request-1", authoritySequence: 1, authorityExpiresAt: Date.now() + 60_000, createdAt: 2 },
            { _id: "requested-1", receiptType: "COMMAND_REQUESTED", operation: "PAUSE_REPOSITORY_DISPATCH", requestId: "request-1", authoritySequence: 1, authorityExpiresAt: Date.now() + 60_000, createdAt: 1 },
          ],
        };
      }
      return args && typeof args === "object" && "incidentId" in args
        ? { incident: clarifyIncident, transitions: [], proposals: [] }
        : [clarifyIncident];
    });
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Advance to Contain" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Pause repository dispatch" }));
    const evidence = within(screen.getByLabelText("Repository dispatch control evidence"));
    expect(evidence.getByText("Repository dispatch: Paused")).toBeInTheDocument();
    expect(evidence.getByText("Command requested").parentElement).toHaveTextContent("requested-1");
    expect(evidence.getByText("Command executed").parentElement).toHaveTextContent("command-1");
    expect(evidence.getByText("Acknowledged").parentElement).toHaveTextContent("ack-1");
    expect(evidence.getByText("Effect observed").parentElement).toHaveTextContent("effect-1");
  });

  it("offers a fresh request after an expired persisted lineage", async () => {
    const clarifyIncident = { ...incident, repositoryId: "repository-1", phase: "CLARIFY", status: "OPEN", currentSequence: 1 };
    useQuery.mockImplementation((_reference, args) => {
      if (args && typeof args === "object" && "repositoryId" in args) return {
        admission: "ENABLED", generation: 0, activeRequestId: "expired-request", restorationAuthorizations: [],
        receipts: [{
          _id: "expired", receiptType: "COMMAND_REQUESTED", operation: "PAUSE_REPOSITORY_DISPATCH",
          requestId: "expired-request", authoritySequence: 1, authorityExpiresAt: Date.now() - 1, createdAt: 1,
        }],
      };
      return args && typeof args === "object" && "incidentId" in args
        ? { incident: clarifyIncident, transitions: [], proposals: [] }
        : [clarifyIncident];
    });
    render(<FactoryIncidentWorkspace projectId={"project-1" as any} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Advance to Contain" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Pause repository dispatch" }));
    expect(screen.getByRole("button", { name: "Request pause command" })).toBeInTheDocument();
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
