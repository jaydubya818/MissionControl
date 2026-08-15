import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

import {
  DEFAULT_WORKFLOW_EXECUTION_POLICY,
  type WorkflowExecutionPolicy,
} from "./workflowExecutionControl";

export type OperatorMode = "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";

export interface EffectiveOperatorControl {
  mode: OperatorMode;
  reason?: string;
  updatedAt?: number;
  updatedBy?: string;
  source: "PROJECT" | "GLOBAL" | "DEFAULT";
  executionPolicy: WorkflowExecutionPolicy;
}

function executionPolicyFromControl(control?: Partial<WorkflowExecutionPolicy>) {
  return {
    continuousSchedulingEnabled:
      control?.continuousSchedulingEnabled
      ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.continuousSchedulingEnabled,
    dailyBudgetUsd: control?.dailyBudgetUsd ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.dailyBudgetUsd,
    perRunBudgetUsd: control?.perRunBudgetUsd ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.perRunBudgetUsd,
    maxConcurrentRuns:
      control?.maxConcurrentRuns ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.maxConcurrentRuns,
    leaseDurationMs:
      control?.leaseDurationMs ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.leaseDurationMs,
    staleRecoveryLimit:
      control?.staleRecoveryLimit ?? DEFAULT_WORKFLOW_EXECUTION_POLICY.staleRecoveryLimit,
  };
}

export async function getEffectiveOperatorControl(
  db: DatabaseReader,
  projectId?: Id<"projects">
): Promise<EffectiveOperatorControl> {
  if (projectId) {
    const projectControl = await db
      .query("operatorControls")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .first();

    if (projectControl) {
      return {
        mode: projectControl.mode,
        reason: projectControl.reason,
        updatedAt: projectControl.updatedAt,
        updatedBy: projectControl.updatedBy,
        source: "PROJECT",
        executionPolicy: executionPolicyFromControl(projectControl),
      };
    }
  }

  const all = await db.query("operatorControls").collect();
  const globalControl = all
    .filter((control) => control.projectId === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (globalControl) {
    return {
      mode: globalControl.mode,
      reason: globalControl.reason,
      updatedAt: globalControl.updatedAt,
      updatedBy: globalControl.updatedBy,
      source: "GLOBAL",
      executionPolicy: executionPolicyFromControl(globalControl),
    };
  }

  return {
    mode: "NORMAL",
    source: "DEFAULT",
    executionPolicy: executionPolicyFromControl(),
  };
}

export function evaluateOperatorGate(args: {
  mode: OperatorMode;
  actorType: "AGENT" | "HUMAN" | "SYSTEM";
  operation: "RUN_START" | "TRANSITION" | "TOOL_CALL";
}): {
  decision: "ALLOW" | "NEEDS_APPROVAL" | "DENY";
  reason: string;
} {
  const { mode, actorType, operation } = args;

  if (mode === "NORMAL") {
    return { decision: "ALLOW", reason: "Operator control mode is NORMAL" };
  }

  if (mode === "PAUSED") {
    if (actorType === "HUMAN") {
      return {
        decision: "NEEDS_APPROVAL",
        reason: "System is PAUSED. Human action requires explicit confirmation.",
      };
    }
    return {
      decision: "DENY",
      reason: `System is PAUSED. ${operation} is blocked for ${actorType.toLowerCase()} actors.`,
    };
  }

  if (mode === "DRAINING") {
    if (operation === "RUN_START") {
      return {
        decision: "DENY",
        reason: "System is DRAINING. New runs are blocked until drain completes.",
      };
    }

    if (actorType === "SYSTEM") {
      return {
        decision: "NEEDS_APPROVAL",
        reason: "System is DRAINING. System transitions require human approval.",
      };
    }

    return {
      decision: "ALLOW",
      reason: "System is DRAINING. Non-run operation allowed.",
    };
  }

  if (mode === "KILLED") {
    return {
      decision: "DENY",
      reason: `System is KILLED. ${operation} is blocked until an operator explicitly restores normal mode.`,
    };
  }

  // QUARANTINED
  if (actorType === "HUMAN") {
    return {
      decision: "NEEDS_APPROVAL",
      reason: "System is QUARANTINED. Human action requires explicit override approval.",
    };
  }

  return {
    decision: "DENY",
    reason: `System is QUARANTINED. ${operation} is blocked for ${actorType.toLowerCase()} actors.`,
  };
}
