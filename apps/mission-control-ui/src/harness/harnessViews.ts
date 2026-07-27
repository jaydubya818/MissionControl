import type { MainView } from "../TopNav";

export type HarnessView = Extract<
  MainView,
  | "harness-health"
  | "harness-loops"
  | "harness-control-plane"
  | "harness-work-ledger"
  | "harness-verifiers"
  | "harness-change-review"
  | "harness-change-risk"
  | "harness-launch"
  | "harness-meta-loop"
  | "harness-team-pulse"
  | "harness-builder"
  | "harness-maintenance"
  | "harness-code-review-wizard"
  | "harness-workshop"
  | "harness-automations"
  | "harness-agent-fleet"
  | "harness-software-factory"
  | "harness-architect"
  | "harness-patterns"
>;

export const HARNESS_VIEWS: HarnessView[] = [
  "harness-patterns",
  "harness-architect",
  "harness-software-factory",
  "harness-workshop",
  "harness-health",
  "harness-agent-fleet",
  "harness-automations",
  "harness-loops",
  "harness-control-plane",
  "harness-work-ledger",
  "harness-verifiers",
  "harness-change-review",
  "harness-change-risk",
  "harness-launch",
  "harness-meta-loop",
  "harness-team-pulse",
  "harness-builder",
  "harness-maintenance",
  "harness-code-review-wizard",
];

export function isHarnessView(view: MainView): view is HarnessView {
  return HARNESS_VIEWS.includes(view as HarnessView);
}
