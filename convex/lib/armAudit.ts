import type { Id } from "../_generated/dataModel";

interface ChangeRecordInput {
  tenantId?: Id<"tenants">;
  projectId?: Id<"projects">;
  templateId?: Id<"agentTemplates">;
  versionId?: Id<"agentVersions">;
  instanceId?: Id<"agentInstances">;
  operatorId?: Id<"operators">;
  legacyAgentId?: Id<"agents">;
  type:
    | "TEMPLATE_CREATED"
    | "VERSION_CREATED"
    | "VERSION_TRANSITIONED"
    | "INSTANCE_CREATED"
    | "INSTANCE_TRANSITIONED"
    | "IDENTITY_UPDATED"
    | "POLICY_ATTACHED"
    | "TASK_TRANSITIONED"
    | "APPROVAL_REQUESTED"
    | "APPROVAL_DECIDED"
    | "DEPLOYMENT_CREATED"
    | "DEPLOYMENT_ACTIVATED"
    | "DEPLOYMENT_ROLLED_BACK"
    | "EMERGENCY_PAUSE"
    | "POLICY_DENIED"
    | "QC_RUN_CREATED"
    | "QC_FINDINGS_RECORDED";
  summary: string;
  payload?: unknown;
  relatedTable?: string;
  relatedId?: string;
  metadata?: unknown;
}

interface OpEventInput {
  tenantId?: Id<"tenants">;
  projectId?: Id<"projects">;
  instanceId?: Id<"agentInstances">;
  versionId?: Id<"agentVersions">;
  taskId?: Id<"tasks">;
  runId?: Id<"runs">;
  toolCallId?: Id<"toolCalls">;
  workflowRunId?: Id<"workflowRuns">;
  qcRunId?: Id<"qcRuns">;
  changeRecordId?: Id<"changeRecords">;
  type:
    | "RUN_STARTED"
    | "RUN_STEP"
    | "RUN_COMPLETED"
    | "RUN_FAILED"
    | "TOOL_CALL_STARTED"
    | "TOOL_CALL_COMPLETED"
    | "TOOL_CALL_BLOCKED"
    | "WORKFLOW_STEP_STARTED"
    | "WORKFLOW_STEP_COMPLETED"
    | "WORKFLOW_STEP_FAILED"
    | "HEARTBEAT"
    | "COST_TICK"
    | "MESSAGE_SENT"
    | "DECISION_MADE"
    | "QC_RUN_STARTED"
    | "QC_RUN_COMPLETED"
    | "QC_RUN_FAILED";
  payload?: unknown;
}

export async function appendChangeRecord(
  db: { insert: (table: "changeRecords", value: Record<string, unknown>) => Promise<Id<"changeRecords">> },
  input: ChangeRecordInput
) {
  return db.insert("changeRecords", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    templateId: input.templateId,
    versionId: input.versionId,
    instanceId: input.instanceId,
    operatorId: input.operatorId,
    legacyAgentId: input.legacyAgentId,
    type: input.type,
    summary: input.summary,
    payload: input.payload,
    relatedTable: input.relatedTable,
    relatedId: input.relatedId,
    timestamp: Date.now(),
    metadata: input.metadata,
  });
}

export async function appendOpEvent(
  db: { insert: (table: "opEvents", value: Record<string, unknown>) => Promise<Id<"opEvents">> },
  input: OpEventInput
) {
  return db.insert("opEvents", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    type: input.type,
    timestamp: Date.now(),
    instanceId: input.instanceId,
    versionId: input.versionId,
    taskId: input.taskId,
    runId: input.runId,
    toolCallId: input.toolCallId,
    workflowRunId: input.workflowRunId,
    qcRunId: input.qcRunId,
    changeRecordId: input.changeRecordId,
    payload: input.payload,
  });
}
