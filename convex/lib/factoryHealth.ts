/** Pure helpers for Factory Health metrics (harness engineering UI). */

export type MaturityStage =
  | "INTERACTIVE"
  | "MULTI_SESSION"
  | "ISSUE_TO_PR"
  | "FULL_FACTORY";

export interface FactoryPillarMetrics {
  autonomyOneShotRate: number;
  automationHumanReviewBypassRate: number;
  qualityEvalPassRate: number;
}

export interface FactoryHealthMetrics extends FactoryPillarMetrics {
  manualTakeovers: number;
  humanPrComments: number;
  agentInitiatedPrs: number;
  workGenerated: number;
  workConsumed: number;
  duplicateWorkRate: number;
  lostWorkCount: number;
  hygieneScore: number;
  metaSuggestionsOpen: number;
  tokenSpendUsd: number;
  /** Human interventions per agent-originated run (approvals + takeovers + PR comments). */
  humanTouchesPerAgentTask: number;
  /** Touches to shared harness (verifiers, eval scenarios, accepted meta loop) in period. */
  sharedComponentContributions: number;
  /** Scheduled workflow runs token cost (outer loop), not interactive chat. */
  workflowTokenSpendUsd: number;
}

export interface AdoptionMetrics {
  issuesOpened: number;
  shipped: number;
  closedDuplicate: number;
  medianTriageHours: number;
  medianTriageToShipDays: number;
  humanTouchesPerAgentTask: number;
  sharedComponentContributions: number;
  tokenSpendUsd: number;
  workflowTokenSpendUsd: number;
  agentInitiatedPrs: number;
}

export function computeMaturityStage(signals: {
  hasIssueDispatch: boolean;
  hasOuterLoop: boolean;
  hasMetaLoop: boolean;
  interactiveOnly: boolean;
}): MaturityStage {
  if (signals.hasMetaLoop && signals.hasOuterLoop && signals.hasIssueDispatch) {
    return "FULL_FACTORY";
  }
  if (signals.hasIssueDispatch) return "ISSUE_TO_PR";
  if (!signals.interactiveOnly) return "MULTI_SESSION";
  return "INTERACTIVE";
}

export function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function trendDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}
