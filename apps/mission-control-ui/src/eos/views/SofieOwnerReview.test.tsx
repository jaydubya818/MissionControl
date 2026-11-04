import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SofieOwnerReview } from "./SofieOwnerReview";
const state = vi.hoisted(() => ({
  mode: "clerk",
  inspect: vi.fn(),
  decide: vi.fn(),
  authorize: vi.fn(),
  resultDecision: vi.fn(),
  rows: {
    proposals: [] as {
      id: string;
      digest: string;
      title: string;
      missionId: string | null;
    }[],
    truncated: false,
  },
}));
vi.mock("../../auth/AuthRuntimeContext", () => ({
  useAuthRuntime: () => ({ mode: state.mode }),
}));
vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    sofieOwnerReview: {
      list: "list",
      inspect: "inspect",
      authorizeResultRead: "authorize",
      decideResult: "resultDecision",
    },
    sofieEnterprise: { decide: "decide" },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.rows,
  useMutation: (ref: string) => state[ref as "inspect"],
}));
const proposal = {
  proposalId: "proposal-1",
  digest: "sha256:proposal",
  connectionId: "connection-1",
  status: "PENDING",
  proposal: {
    title: "Agentic HR platform",
    objective: "Build employee operations.",
    workstreams: ["Core", "Recruiting"],
    stopCondition: "Owner acceptance",
  },
  missionId: null,
  detail: null,
  result: null,
  resultDigest: null,
};
const completed = () => ({
  ...proposal,
  status: "CREATED",
  missionId: "mission-1",
  detail: {
    mission: { state: "AWAITING_ACCEPTANCE" },
    plan: { revision: 1, status: "APPROVED" },
    workOrders: [],
  },
  resultDigest: "sha256:evidence",
  result: {
    status: "AVAILABLE",
    freshUntil: Date.now() + 60000,
    ownerAcceptance: "PENDING",
    reasons: [],
    workOrders: [],
    plan: { planDigest: "sha256:plan" },
  },
});
function mount() {
  return render(
    <MemoryRouter
      initialEntries={[
        "/v2/missions?proposal=proposal-1&proposalDigest=sha256%3Aproposal",
      ]}
    >
      <SofieOwnerReview projectId={"project-1" as any} />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.mode = "clerk";
  state.rows = { proposals: [], truncated: false };
  state.inspect.mockResolvedValue(proposal);
  state.decide.mockResolvedValue({ authorized: true });
});
describe("Sofie owner review", () => {
  it("requires canonical Clerk mode before requesting owner data", () => {
    state.mode = "demo";
    mount();
    expect(
      screen.getByText(/Sign in with your MissionControl owner/),
    ).toBeTruthy();
    expect(state.inspect).not.toHaveBeenCalled();
  });
  it("authorizes the exact reviewed proposal and connection", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Authorize Mission creation" }),
    );
    await waitFor(() =>
      expect(state.decide).toHaveBeenCalledWith({
        projectId: "project-1",
        proposalId: "proposal-1",
        expectedDigest: "sha256:proposal",
        connectionId: "connection-1",
        decision: "AUTHORIZE_DRAFT",
      }),
    );
  });
  it("shows denied review without decision controls", async () => {
    state.inspect.mockRejectedValue(Error("denied"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/);
    expect(
      screen.queryByRole("button", { name: "Authorize Mission creation" }),
    ).toBeNull();
  });
  it("requires a reason to reject and binds the exact Result", async () => {
    state.inspect.mockResolvedValue(completed());
    state.resultDecision.mockResolvedValue({ decision: "REJECT" });
    mount();
    const button = await screen.findByRole("button", {
      name: "Reject enterprise Result",
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Missing behavior" },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(state.resultDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: "mission-1",
          expectedPlanDigest: "sha256:plan",
          expectedResultDigest: "sha256:evidence",
          decision: "REJECT",
          reason: "Missing behavior",
        }),
      ),
    );
  });
  it("disables acceptance for expired observations", async () => {
    state.inspect.mockResolvedValue({
      ...completed(),
      result: { ...completed().result, freshUntil: Date.now() - 1 },
    });
    mount();
    expect(
      await screen.findByRole("button", { name: "Accept enterprise Result" }),
    ).toBeDisabled();
    expect(screen.getByText(/Current Result unavailable/)).toBeTruthy();
  });
  it("retains error and does not claim confirmation on failed decisions", async () => {
    state.decide.mockRejectedValue(Error("lost response"));
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Authorize Mission creation" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/);
    expect(screen.queryByText(/Creation authorized/)).toBeNull();
  });
  it.each(["REJECTED", "EXPIRED"])(
    "hides Result controls for a %s proposal with current evidence",
    async (status) => {
      state.inspect.mockResolvedValue({ ...completed(), status });
      mount();
      expect(
        await screen.findByText(
          status === "REJECTED"
            ? /This proposal was rejected/
            : /This proposal has expired/,
        ),
      ).toHaveTextContent(/Result authorization and decisions are unavailable/);
      expect(
        screen.getByRole("heading", { name: "Result / Proof" }),
      ).toBeTruthy();
      for (const name of [
        "Allow Sofie to read this Result",
        "Accept enterprise Result",
        "Reject enterprise Result",
      ])
        expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByLabelText("Decision reason")).toBeNull();
      expect(state.authorize).not.toHaveBeenCalled();
      expect(state.resultDecision).not.toHaveBeenCalled();
    },
  );
  it("keeps Result authorization and acceptance available for a created proposal", async () => {
    state.inspect.mockResolvedValue(completed());
    mount();
    expect(
      await screen.findByRole("button", {
        name: "Allow Sofie to read this Result",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Accept enterprise Result" }),
    ).toBeEnabled();
  });
  it("identifies truncated lists while retaining listed proposal links", async () => {
    state.rows = {
      proposals: [
        {
          id: "other",
          digest: "digest",
          title: "Another proposal",
          missionId: null,
        },
      ],
      truncated: true,
    };
    mount();
    expect(screen.getByText(/This proposal list is limited/)).toHaveTextContent(
      /owner review link from Sofie/,
    );
    expect(
      screen.getByRole("button", { name: "Another proposal" }),
    ).toBeEnabled();
    await screen.findByRole("button", { name: "Authorize Mission creation" });
  });
  it("does not claim an incomplete empty list means no linked proposals", async () => {
    state.rows.truncated = true;
    mount();
    expect(
      screen.getByText("No linked proposals in this limited list."),
    ).toBeTruthy();
    expect(
      screen.queryByText("No linked proposals in this workspace."),
    ).toBeNull();
    await screen.findByRole("button", { name: "Authorize Mission creation" });
  });
  it("does not show a limit notice for a complete list", async () => {
    mount();
    expect(screen.queryByText(/This proposal list is limited/)).toBeNull();
    await screen.findByRole("button", { name: "Authorize Mission creation" });
  });
});
