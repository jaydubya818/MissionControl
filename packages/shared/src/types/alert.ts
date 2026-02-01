/**
 * Alert Types
 * 
 * Alerts notify operators of incidents requiring attention.
 */

export type AlertType =
  | "budget_exceeded"
  | "loop_detected"
  | "agent_error_streak"
  | "approval_timeout"
  | "security_violation"
  | "task_blocked"
  | "agent_quarantined";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Alert {
  _id: string;
  _creationTime: number;
  type: AlertType;
  severity: AlertSeverity;
  taskId?: string;
  agentId?: string;
  message: string;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface CreateAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  taskId?: string;
  agentId?: string;
  message: string;
}

export interface ResolveAlertInput {
  alertId: string;
  resolvedBy: string;
}
