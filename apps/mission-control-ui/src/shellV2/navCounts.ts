export type NavCountStats = {
  taskCount?: number;
  turns?: number;
  skillCount?: number;
  facts?: number;
  alertCount?: number;
  events?: number;
  traceFiles?: number;
};

/** Pure nav badge resolver — tested without React. */
export function navCountForView(
  view: string,
  stats: NavCountStats,
  taskCount: number,
  approvalCount: number
): number | undefined {
  switch (view) {
    case "tasks":
      return taskCount > 0 ? taskCount : undefined;
    case "trace-inspector":
    case "execution":
      return stats.turns != null && stats.turns > 0 ? stats.turns : undefined;
    case "skills":
      return stats.skillCount != null && stats.skillCount > 0 ? stats.skillCount : undefined;
    case "memory":
      return stats.facts != null && stats.facts > 0 ? stats.facts : undefined;
    case "telemetry":
      return stats.alertCount != null && stats.alertCount > 0 ? stats.alertCount : undefined;
    case "gateway":
      return stats.events != null && stats.events > 0 ? stats.events : undefined;
    case "audit":
    case "control-approvals":
      return approvalCount > 0 ? approvalCount : undefined;
    case "qc-dashboard":
    case "qc-runs":
      return stats.traceFiles != null && stats.traceFiles > 0 ? stats.traceFiles : undefined;
    default:
      return undefined;
  }
}
