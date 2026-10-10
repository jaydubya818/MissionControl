import { getFunctionName } from "convex/server";
const params = new URLSearchParams(location.search),
  scenario = params.get("scenario") || "proposal";
const proposal = {
  proposalId: "proposal-ui-fixture",
  digest: "sha256:fixture",
  connectionId: "connection-ui-fixture",
  status: "PENDING",
  proposal: {
    title: "Agentic HR platform",
    objective: "Review employee operations and recruiting integration.",
    workstreams: ["Employee core", "Recruiting", "Independent verification"],
    stopCondition: "Owner acceptance of exact evidence.",
  },
  missionId: null,
  detail: null,
  result: null,
  resultDigest: null,
};
let review: any =
  scenario === "proposal"
    ? proposal
    : {
        ...proposal,
        status: "CREATED",
        missionId: "mission-ui-fixture",
        detail: {
          mission: { state: "AWAITING_ACCEPTANCE" },
          plan: { revision: 1, status: "APPROVED" },
          needsYou: "Review the current Result.",
          workOrders: [
            { id: "wo-ui-fixture", title: "Employee core", state: "DONE" },
          ],
        },
        resultDigest: "sha256:fixture-result",
        sofieResultAuthorized: true,
        result: {
          status: "AVAILABLE",
          ownerAcceptance: "PENDING",
          freshUntil: scenario === "expired" ? 1 : Date.now() + 60000,
          reasons: [],
          workOrders: [
            {
              workOrderId: "wo-ui-fixture",
              candidate: "a".repeat(40),
              verificationAttemptId: "verifier-ui-fixture",
              evidenceSetDigest: "sha256:" + "b".repeat(64),
              proofDigest: "sha256:" + "c".repeat(64),
            },
          ],
          plan: { planDigest: "sha256:fixture-plan" },
        },
      };
const functions: Record<string, (...args: any[]) => Promise<any>> = {
  "sofieOwnerReview:inspect": async () => {
    if (scenario === "denied") throw Error("denied fixture");
    return structuredClone(review);
  },
  "sofieEnterprise:decide": async (args) => {
    if (scenario === "error") throw Error("unconfirmed fixture");
    review = {
      ...review,
      status: args.decision === "REVOKE" ? "REJECTED" : "AUTHORIZED",
    };
    return {};
  },
  "sofieOwnerReview:decideResult": async (args) => {
    review = {
      ...review,
      detail: {
        ...review.detail,
        mission: { state: args.decision === "ACCEPT" ? "DONE" : "BLOCKED" },
      },
      result: {
        ...review.result,
        ownerAcceptance: args.decision === "ACCEPT" ? "ACCEPTED" : "PENDING",
        status: args.decision === "ACCEPT" ? "AVAILABLE" : "NOT_AVAILABLE",
        reasons: args.decision === "ACCEPT" ? [] : ["MISSION_NOT_COMPLETE"],
        workOrders: args.decision === "ACCEPT" ? review.result.workOrders : [],
      },
    };
    return {};
  },
  "sofieOwnerReview:authorizeResultRead": async () => ({}),
};
const rows: any[] = [];
export const useQuery = () => rows;
export const useMutation = (reference: any) =>
  functions[getFunctionName(reference)];
