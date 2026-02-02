/**
 * Mission Control OpenClaw SDK - Type Definitions
 */

export type Id<T extends string> = string & { __tableName: T };

export type AgentRole = "LEAD" | "SPECIALIST" | "REVIEWER" | "CHALLENGER" | "INTERN";
export type AgentStatus = "ACTIVE" | "PAUSED" | "QUARANTINED" | "OFFLINE";

export type TaskStatus =
  | "INBOX"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "DONE"
  | "CANCELED";

export type TaskType =
  | "CODE_CHANGE"
  | "CUSTOMER_RESEARCH"
  | "SEO_RESEARCH"
  | "CONTENT"
  | "DOCS"
  | "EMAIL_MARKETING"
  | "SOCIAL"
  | "ENGINEERING"
  | "OPS";

export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "CANCELED" | "EXPIRED";

export interface AgentConfig {
  name: string;
  role?: AgentRole;
  emoji?: string;
  allowedTaskTypes?: TaskType[];
  workspacePath?: string;
  budgetDaily?: number;
  budgetPerRun?: number;
}

export interface Agent {
  _id: Id<"agents">;
  projectId: Id<"projects">;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  emoji?: string;
  allowedTaskTypes: TaskType[];
  workspacePath?: string;
  budgetDaily: number;
  budgetPerRun: number;
  spendToday: number;
  lastHeartbeatAt?: number;
  _creationTime: number;
}

export interface Task {
  _id: Id<"tasks">;
  projectId: Id<"projects">;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  assigneeIds: Id<"agents">[];
  createdBy: string;
  estimatedCost?: number;
  actualCost: number;
  budgetAllocated?: number;
  budgetRemaining?: number;
  workPlan?: {
    bullets: string[];
    estimatedCost: number;
  };
  deliverable?: string;
  artifactIds?: string[];
  blockedReason?: string;
  dependencies?: Id<"tasks">[];
  reviewCycles: number;
  _creationTime: number;
}

export interface Approval {
  _id: Id<"approvals">;
  projectId: Id<"projects">;
  taskId?: Id<"tasks">;
  toolCallId?: Id<"toolCalls">;
  requestorAgentId: Id<"agents">;
  actionType: string;
  actionSummary: string;
  riskLevel: "GREEN" | "YELLOW" | "RED";
  status: ApprovalStatus;
  estimatedCost?: number;
  justification?: string;
  decidedByUserId?: string;
  decidedAt?: number;
  reason?: string;
  expiresAt: number;
  _creationTime: number;
}

export interface Run {
  _id: Id<"runs">;
  projectId: Id<"projects">;
  agentId: Id<"agents">;
  taskId?: Id<"tasks">;
  sessionKey: string;
  model: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
  budgetAllocated?: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  error?: string;
  _creationTime: number;
}

export interface WorkPlan {
  bullets: string[];
  estimatedCost: number;
}

export interface Deliverable {
  summary: string;
  artifactIds?: string[];
  evidence?: string;
}

export interface HeartbeatResult {
  success: boolean;
  pendingTasks: Task[];
  claimableTasks: Task[];
  pendingNotifications: any[];
  pendingApprovals: Approval[];
}

export interface SDKConfig {
  convexUrl: string;
  projectSlug: string;
  agent: AgentConfig;
  heartbeatIntervalMs?: number;
  autoRetry?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  onError?: (error: Error) => void;
  onHeartbeat?: (result: HeartbeatResult) => void;
  onTaskClaimed?: (task: Task) => void;
  onTaskCompleted?: (task: Task) => void;
  onApprovalNeeded?: (approval: Approval) => void;
}

export interface TaskExecutionContext {
  task: Task;
  agent: Agent;
  run: Run;
  requestApproval: (action: string, justification: string, estimatedCost?: number) => Promise<Approval>;
  postComment: (content: string) => Promise<void>;
  updateProgress: (status: string) => Promise<void>;
}

export interface TaskHandler {
  (context: TaskExecutionContext): Promise<Deliverable>;
}
