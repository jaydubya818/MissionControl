export interface GuideCounts {
  approvals: number;
  blocked: number;
  failed: number;
  alerts: number;
  workItems: number;
}

export interface NextAction {
  /** Short imperative shown as the primary call to action. */
  label: string;
  /** One sentence explaining why this is the next thing to do. */
  reason: string;
  /** Navigation target understood by the shell's onNavigate. */
  view: string;
}

/**
 * Pick the single most useful next step for a newcomer.
 * Order mirrors how risk accumulates: a human decision gates everything
 * downstream, then stalled work, then failures, then alerts.
 */
export function nextBestAction(counts: GuideCounts): NextAction {
  if (counts.approvals > 0) {
    return {
      label: `Review ${counts.approvals} pending ${counts.approvals === 1 ? "approval" : "approvals"}`,
      reason: "Work is waiting for a human decision before it can continue.",
      view: "control-approvals",
    };
  }
  if (counts.blocked > 0) {
    return {
      label: `Unblock ${counts.blocked} stalled ${counts.blocked === 1 ? "task" : "tasks"}`,
      reason: "These tasks cannot proceed without help, so nothing downstream moves.",
      view: "tasks",
    };
  }
  if (counts.failed > 0) {
    return {
      label: `Inspect ${counts.failed} failed ${counts.failed === 1 ? "task" : "tasks"}`,
      reason: "A failed attempt tells you what the factory got wrong.",
      view: "tasks",
    };
  }
  if (counts.alerts > 0) {
    return {
      label: `Check ${counts.alerts} open ${counts.alerts === 1 ? "alert" : "alerts"}`,
      reason: "Alerts are the factory telling you something drifted.",
      view: "telemetry",
    };
  }
  if (counts.workItems === 0) {
    return {
      label: "Create your first Work Order",
      reason: "A Work Order is the unit of governed work. Everything else hangs off it.",
      view: "control-work-orders",
    };
  }
  return {
    label: "Open your Work Orders",
    reason: "Nothing needs attention. Follow a Work Order from plan to evidence to see the full chain.",
    view: "control-work-orders",
  };
}

export const FLOW_STEPS: ReadonlyArray<{ label: string; hint: string; view: string }> = [
  { label: "Mission", hint: "Why the work exists", view: "missions" },
  { label: "Work Order", hint: "Bounded work released to an agent", view: "control-work-orders" },
  { label: "Evidence", hint: "Proof from an independent check", view: "audit" },
  { label: "Approval", hint: "A person accepts or rejects", view: "control-approvals" },
];
