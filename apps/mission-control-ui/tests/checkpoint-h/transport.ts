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
        status:
          scenario === "rejected-proposal"
            ? "REJECTED"
            : scenario === "expired-proposal"
              ? "EXPIRED"
              : "CREATED",
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
        sofieResultAuthorized: ![
          "rejected-proposal",
          "expired-proposal",
        ].includes(scenario),
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
const proposalList = {
  proposals:
    scenario === "truncated-list"
      ? [
          {
            id: proposal.proposalId,
            digest: proposal.digest,
            title: proposal.proposal.title,
            missionId: "mission-ui-fixture",
          },
        ]
      : [],
  truncated: scenario === "truncated-list" || scenario === "truncated-empty",
};
export const useQuery = (reference:any) => {
  const name=getFunctionName(reference);
  if(name === "workOrders:factoryOverview") return {summary:{activeWorkOrders:0,blockedWorkOrders:0,awaitingApproval:0,staleEvidence:0,runsNeedingAttention:0,recentlyAccepted:0,verificationFailures:0,approvalsPending:0},recentAccepted:[],blockedWorkOrders:[],approvalQueue:[],staleEvidence:[],runsNeedingAttention:[]};
  if(name === "workflowMetrics:getAllMetrics") return [];
  if(name.startsWith("registry/") || name === "governance/policyEnvelopes:listPolicyEnvelopes") return [];
  if(name === "governance/policyEnvelopes:evaluate") return {decision:"ALLOW",source:"fallback"};
  if(name === "agents:list" || name === "agents:listAll") return [{_id:"agent-fixture",name:"Quarantined fixture agent",role:"SPECIALIST",status:"QUARANTINED",spendToday:0,budgetDaily:1,budgetPerRun:1,allowedTaskTypes:[],lastHeartbeatAt:Date.now(),errorStreak:1}];
  if(name === "tasks:list" || name === "tasks:listAll" || name === "contentDrops:list" || name === "projects:list") return [];
  if(name === "projects:get") return {_id:"project-ui-fixture",name:"Component fixture"};
  if(name === "contentDrops:getStats") return {total:0,byStatus:{},byType:{}};
  if(name === "workflowMetrics:getSummary") return {total:0,completed:0,failed:0,running:0,paused:0,successRate:0,avgDurationMs:0,totalRetries:0,totalEscalations:0};
  if(name === "workflows:list") return [
    {_id:"workflow-own",workflowId:"scoped",name:"Scoped workflow",description:"Component fixture only",projectId:"project-ui-fixture",contractVersion:"factory-workflow-contract/v1",agents:[],steps:[]},
    {_id:"workflow-global",workflowId:"global",name:"Global workflow",description:"Not directly startable",agents:[],steps:[]},
    {_id:"workflow-foreign",workflowId:"foreign",name:"Foreign workflow",description:"Another workspace",projectId:"other",contractVersion:"factory-workflow-contract/v1",agents:[],steps:[]},
    {_id:"workflow-governed",workflowId:"governed",name:"Governed workflow",description:"Requires WorkOrder admission",projectId:"project-ui-fixture",contractVersion:"factory-workflow-contract/v2",agents:[],steps:[]},
  ];
  if(name === "softwareFactoryControlPlane:listWorkspaceStructure") return {
    teams:[{_id:"team-ui-fixture",name:"Fixture team",status:"ACTIVE"}],
    members:[{_id:"member-ui-fixture",name:"Fixture owner",active:true}],
    memberships:[{teamId:"team-ui-fixture",memberId:"member-ui-fixture",active:true}],
  };
  if(name === "projects:listRepositories") return [{repositoryId:"repo-ui-fixture",displayName:"Fixture repository",status:"READY"}];
  if(name === "projects:listCodeScopes") return [{_id:"scope-ui-fixture",name:"Fixture scope",active:true}];
  return proposalList;
};
functions["missions:updateDraft"] = async(args) => ({mission:{...args,_id:args.missionId,state:"DRAFT"},updated:true});
functions["workflowRuns:start"] = async() => ({runId:"component-fixture-no-execution"});
functions["workflowMetrics:refreshAll"] = async() => { throw new Error("Synthetic refresh refusal — try again"); };
export const useMutation = (reference: any) =>
  functions[getFunctionName(reference)];

export const useAction = useMutation;
