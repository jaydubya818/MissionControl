export type FactorySeedWorkOrder = {
  key: string;
  title: string;
  desiredOutcome: string;
  context: string;
  workflowId: string;
  repository: string;
  branchStrategy: string;
  priority: 1 | 2 | 3 | 4;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requestedBy: string;
  assignedAgent: string;
  assignedSquad: string;
  acceptanceCriteria: Array<{
    id: string;
    title: string;
    description?: string;
    verificationMethod: "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST";
    status: "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";
  }>;
  constraints: string[];
  dependencies?: string[];
  sourceOfTruthRefs: Array<{
    kind: "REPO" | "DOC" | "PRD" | "ISSUE" | "URL";
    label: string;
    location: string;
  }>;
  requiredApprovals?: string[];
  state: "READY" | "IN_PROGRESS" | "BLOCKED" | "AWAITING_APPROVAL" | "AWAITING_VERIFICATION";
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "CONDITIONAL" | "REJECTED" | "REVISION_REQUESTED" | "EXPIRED" | "REVOKED";
  blockingIssue?: string;
  requiredHumanAction?: string;
  runStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELED";
  runStepIndex: number;
  failureReason?: string;
  humanInterventions?: number;
};

export type FactorySeedWorkflow = {
  workflowId: string;
  name: string;
  description: string;
  agents: Array<{ id: string; persona: string }>;
  steps: Array<{ id: string; agent: string; input: string; expects: string; retryLimit: number; timeoutMinutes: number }>;
};

export type FactoryProjectSeed = {
  project: {
    name: string;
    slug: string;
    description: string;
    githubRepo: string;
    githubBranch: string;
    metadata: Record<string, unknown>;
  };
  idempotencyScope: string;
  workflows: FactorySeedWorkflow[];
  workOrders: FactorySeedWorkOrder[];
};

export function normalizeFactoryProjectSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "software-factory";
}

export function buildFactoryProjectSeed(input: {
  name?: string;
  slug?: string;
  description?: string;
  repository?: string;
  githubBranch?: string;
  requestedBy?: string;
} = {}): FactoryProjectSeed {
  const name = input.name?.trim() || "Apple Notes Software Factory";
  const slug = normalizeFactoryProjectSlug(input.slug || name);
  const repository = input.repository?.trim() || "jaydubya818/MissionControl";
  const githubBranch = input.githubBranch?.trim() || "main";
  const requestedBy = input.requestedBy?.trim() || "Hermes";
  const idempotencyScope = `factory-project:${slug}`;

  return {
    idempotencyScope,
    project: {
      name,
      slug,
      description: input.description?.trim() || "Governed software-factory project created from recent Apple Notes synthesis: context packets, scoped execution, receipt evidence, and approval-gated writeback.",
      githubRepo: repository,
      githubBranch,
      metadata: {
        kind: "software-factory",
        source: "apple-notes-synthesis",
        idempotencyScope,
      },
    },
    workflows: [
      {
        workflowId: "factory-intake-plan",
        name: "Factory Intake Plan",
        description: "Convert notes, docs, or external work items into scoped MissionControl WorkOrders with acceptance criteria.",
        agents: [{ id: "hermes", persona: "operator-orchestrator" }],
        steps: [
          { id: "synthesize", agent: "hermes", input: "Synthesize the source note into a bounded factory work item.", expects: "WorkOrder with scope, risk, and acceptance criteria", retryLimit: 1, timeoutMinutes: 20 },
          { id: "route", agent: "hermes", input: "Route the work item to the right repo/runtime lane.", expects: "Repository and runtime envelope selected", retryLimit: 1, timeoutMinutes: 10 },
          { id: "approve", agent: "hermes", input: "Prepare approval checkpoint when risk requires it.", expects: "Approval or not-required decision recorded", retryLimit: 0, timeoutMinutes: 10 },
        ],
      },
      {
        workflowId: "factory-pi-execute-verify",
        name: "Factory Pi Execute + Verify",
        description: "Dispatch scoped implementation to Pi and return receipt packets with evidence before acceptance.",
        agents: [{ id: "pi", persona: "bounded-runtime" }],
        steps: [
          { id: "preflight", agent: "pi", input: "Validate repo root, policy envelope, and allowed scopes.", expects: "Preflight receipt with allowed root and constraints", retryLimit: 1, timeoutMinutes: 10 },
          { id: "execute", agent: "pi", input: "Execute the approved work inside the scoped envelope.", expects: "Artifacts and changed files are reported", retryLimit: 2, timeoutMinutes: 45 },
          { id: "verify", agent: "pi", input: "Run required checks and attach criterion-level evidence.", expects: "Receipt packet linked to every acceptance criterion", retryLimit: 1, timeoutMinutes: 30 },
          { id: "return", agent: "pi", input: "Return result packet to MissionControl for operator review.", expects: "Run result and artifacts persisted", retryLimit: 1, timeoutMinutes: 10 },
        ],
      },
      {
        workflowId: "factory-writeback-preview",
        name: "Factory Writeback Preview",
        description: "Create external-ticket writeback previews only after receipts exist; real writeback stays approval-gated.",
        agents: [{ id: "hermes", persona: "operator-orchestrator" }],
        steps: [
          { id: "summarize-receipts", agent: "hermes", input: "Summarize receipts, risks, and unresolved exceptions.", expects: "Operator-readable receipt summary", retryLimit: 1, timeoutMinutes: 10 },
          { id: "draft-writeback", agent: "hermes", input: "Draft the exact external update without sending it.", expects: "Writeback preview artifact", retryLimit: 1, timeoutMinutes: 10 },
          { id: "approval-gate", agent: "hermes", input: "Request approval before any external mutation.", expects: "Pending human approval", retryLimit: 0, timeoutMinutes: 5 },
        ],
      },
    ],
    workOrders: [
      {
        key: "notes-to-factory-intake",
        title: "Convert Apple Notes signals into governed factory intake",
        desiredOutcome: "Recent Apple Notes can be turned into MissionControl WorkOrders with explicit source refs, repo scope, risk, and acceptance criteria instead of disappearing into chat history.",
        context: "This applies the Apple Notes synthesis loop to MissionControl first. Hermes remains the operator; MissionControl stores work state; Pi executes only after scoped dispatch.",
        workflowId: "factory-intake-plan",
        repository,
        branchStrategy: "Use a narrow MissionControl branch/worktree for contracts and read models; no external writeback in this slice.",
        priority: 1,
        riskLevel: "HIGH",
        requestedBy,
        assignedAgent: "Hermes",
        assignedSquad: "Software Factory",
        acceptanceCriteria: [
          { id: "ac-source-ledger", title: "Source ledger captures note-derived decision and target repo", verificationMethod: "CHECKLIST", status: "PASS" },
          { id: "ac-workorders", title: "At least three governed WorkOrders are visible in the project read model", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-no-writeback", title: "External Jira/Workday writeback is blocked behind an approval preview", verificationMethod: "CHECKLIST", status: "PASS" },
        ],
        constraints: ["Do not store raw Apple Notes content in long-term memory", "Do not write to external systems without approval", "Keep MissionControl as system of record"],
        sourceOfTruthRefs: [
          { kind: "DOC", label: "Apple Notes synthesis plan", location: "docs/plans/2026-07-12-apple-notes-to-workday-software-factory-plan.md" },
          { kind: "REPO", label: "MissionControl", location: repository },
        ],
        requiredApprovals: ["Factory intake scope"],
        state: "AWAITING_APPROVAL",
        approvalStatus: "PENDING",
        requiredHumanAction: "Approve the factory intake scope before enabling external-ticket writeback.",
        runStatus: "PENDING",
        runStepIndex: 0,
      },
      {
        key: "pi-runtime-receipts",
        title: "Wire Pi runtime receipt packets into factory read models",
        desiredOutcome: "Pi-origin execution results, artifacts, and verification receipts are persisted against WorkOrders so MissionControl can distinguish real completion from agent activity.",
        context: "The current factory slice needs true Pi-runtime E2E semantics: Pi session ids, run events, artifact ids, receipt packets, and criterion-level acceptance evidence.",
        workflowId: "factory-pi-execute-verify",
        repository,
        branchStrategy: "Validate against an allowed local repo root before dispatch; store blocked state on failed preflight.",
        priority: 1,
        riskLevel: "CRITICAL",
        requestedBy,
        assignedAgent: "Pi",
        assignedSquad: "Runtime Verification",
        acceptanceCriteria: [
          { id: "ac-pi-session", title: "Pi session/execution ids are stored on run metadata", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-artifacts", title: "Artifacts are linked to the WorkflowRun and WorkOrder", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-receipts", title: "Verification receipts map one-to-one to acceptance criteria", verificationMethod: "TEST", status: "STALE" },
        ],
        constraints: ["Never persist a repo path outside the allowed execution root", "Treat failed Pi preflight as blocked, not as a UI crash"],
        dependencies: ["notes-to-factory-intake"],
        sourceOfTruthRefs: [
          { kind: "DOC", label: "Pi runtime role", location: "/Users/jaywest/Agentic-Pi-Harness/docs/WORKDAY-FACTORY-RUNTIME-ROLE.md" },
          { kind: "REPO", label: "Agentic-Pi-Harness", location: "jaydubya818/Agentic-Pi-Harness" },
        ],
        requiredApprovals: ["Runtime dispatch envelope"],
        state: "IN_PROGRESS",
        approvalStatus: "APPROVED",
        blockingIssue: undefined,
        requiredHumanAction: "Receipt ingestion path available via executor.pi-bridge.",
        runStatus: "RUNNING",
        runStepIndex: 2,
        failureReason: undefined,
        humanInterventions: 0,
      },
      {
        key: "writeback-preview-gate",
        title: "Add approval-gated external writeback preview",
        desiredOutcome: "MissionControl can draft the exact Jira/Workday writeback from accepted receipts while blocking the real external mutation until an operator approves it.",
        context: "Writeback is intentionally last. The safe near-term product value is previewing the exact mutation, evidence summary, unresolved risks, and approval request.",
        workflowId: "factory-writeback-preview",
        repository,
        branchStrategy: "Build read-only preview artifacts first; do not connect live credentials in this slice.",
        priority: 2,
        riskLevel: "HIGH",
        requestedBy,
        assignedAgent: "Hermes",
        assignedSquad: "Governance",
        acceptanceCriteria: [
          { id: "ac-preview", title: "Writeback preview artifact includes external action, payload, and evidence summary", verificationMethod: "CHECKLIST", status: "PENDING" },
          { id: "ac-approval", title: "Real writeback is impossible without an approval decision", verificationMethod: "TEST", status: "PENDING" },
          { id: "ac-secret-handles", title: "Connector credentials remain opaque secret refs", verificationMethod: "CHECKLIST", status: "PASS" },
        ],
        constraints: ["No live external mutation", "Opaque secret refs only", "Approval preview must show exact action before execution"],
        dependencies: ["pi-runtime-receipts"],
        sourceOfTruthRefs: [
          { kind: "DOC", label: "Factory contracts", location: "docs/software-factory/domain-contracts.md" },
          { kind: "URL", label: "External ticket writeback placeholder", location: "connector://jira-or-workday/writeback-preview" },
        ],
        requiredApprovals: ["External writeback approval"],
        state: "READY",
        approvalStatus: "PENDING",
        requiredHumanAction: "Keep writeback in preview-only mode until receipts and operator approval exist.",
        runStatus: "PENDING",
        runStepIndex: 0,
      },
    ],
  };
}
