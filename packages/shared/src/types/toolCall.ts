/**
 * Tool Call Types
 * 
 * Tool calls log every tool invocation with risk classification and redaction.
 */

export type ToolRisk = "green" | "yellow" | "red";
export type ToolCallStatus = "success" | "failed" | "blocked" | "needs_approval";

export interface ToolCall {
  _id: string;
  _creationTime: number;
  runId: string;
  taskId: string;
  agentId: string;
  tool: string;
  risk: ToolRisk;
  input: string;
  output: string;
  duration: number;
  status: ToolCallStatus;
  cost?: number;
  approvalId?: string;
}

export interface CreateToolCallInput {
  runId: string;
  taskId: string;
  agentId: string;
  tool: string;
  risk: ToolRisk;
  input: string;
  output: string;
  duration: number;
  status: ToolCallStatus;
  cost?: number;
  approvalId?: string;
}

export interface UpdateToolCallInput {
  status?: ToolCallStatus;
  duration?: number;
  output?: string;
  cost?: number;
  approvalId?: string;
}
