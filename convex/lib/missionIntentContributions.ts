import { canonicalHash } from "@mission-control/shared";

export const MISSION_INTENT_CONTRIBUTION_FLAG = "missions.shared-builder-intent-v1";

export const MISSION_INTENT_AUTHORITY_PROFILE = Object.freeze({
  mutateMissionSpec: false,
  finalizeMissionSpec: false,
  approvePlan: false,
  releaseWorkOrders: false,
  dispatchAttempts: false,
  establishVerification: false,
  createAuthoritativeEvidence: false,
  publish: false,
  merge: false,
  accept: false,
  mutateRouting: false,
  alterFactoryVersions: false,
});

export const MISSION_INTENT_LIMITS = {
  title: 160,
  body: 4_000,
  evidenceExpectation: 2_000,
  decisionReason: 1_000,
  key: 120,
  targetItemId: 120,
  list: 200,
} as const;

export type MissionIntentContributorRole =
  | "PRODUCT"
  | "QA"
  | "DESIGN"
  | "ENGINEERING"
  | "SECURITY_OPERATIONS";

export type MissionIntentTargetSection =
  | "OUTCOME"
  | "REQUIREMENTS"
  | "NON_FUNCTIONAL_REQUIREMENTS"
  | "ACCEPTANCE_EXPECTATIONS"
  | "VERIFICATION_EXPECTATIONS"
  | "NON_GOALS"
  | "CONSTRAINTS"
  | "RISKS"
  | "REPOSITORY_SCOPE";

export type MissionIntentDecision = "ACCEPTED" | "REJECTED";

export interface MissionIntentContributionShape {
  _id: string;
  contributionKey: string;
  revisionNumber: number;
  supersedesContributionId?: string;
  missionSpecRevisionId: string;
  missionSpecDigest: string;
  contributorRole: MissionIntentContributorRole;
  targetSection: MissionIntentTargetSection;
  targetItemId?: string;
  title: string;
  body: string;
  evidenceExpectation: string;
  proposedBy: string;
  proposedActorType: "HUMAN" | "AGENT";
  proposedActorSource: "AUTHENTICATED" | "DEVELOPMENT_FALLBACK" | "SERVICE_COMMAND";
  proposedAt: number;
}

export interface MissionIntentDecisionShape {
  contributionId: string;
  decision: MissionIntentDecision;
  reason: string;
  decidedBy: string;
  decidedAt: number;
}

export type MissionIntentProjectedState =
  | "PROPOSED"
  | "ACCEPTED"
  | "REJECTED"
  | "STALE"
  | "CONFLICT"
  | "SUPERSEDED";

export function assertMissionIntentText(
  value: string,
  name: string,
  maxLength: number,
) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  if (trimmed.length > maxLength) {
    throw new Error(`${name} is limited to ${maxLength} characters`);
  }
  return trimmed;
}

export function missionIntentContributionDigest(input: Omit<
  MissionIntentContributionShape,
  "_id" | "proposedAt"
>) {
  return `sha256:${canonicalHash(input)}`;
}

export function projectMissionIntentContributions(args: {
  contributions: MissionIntentContributionShape[];
  decisions: MissionIntentDecisionShape[];
  currentSpecRevisionId?: string;
  currentSpecDigest?: string;
}) {
  const decisionByContribution = new Map(
    args.decisions.map((decision) => [decision.contributionId, decision]),
  );
  const latestByKey = new Map<string, MissionIntentContributionShape>();
  for (const contribution of args.contributions) {
    const prior = latestByKey.get(contribution.contributionKey);
    if (!prior || contribution.revisionNumber > prior.revisionNumber) {
      latestByKey.set(contribution.contributionKey, contribution);
    }
  }
  const currentUndecidedTargets = new Map<string, string[]>();
  for (const contribution of latestByKey.values()) {
    const current = contribution.missionSpecRevisionId === args.currentSpecRevisionId
      && contribution.missionSpecDigest === args.currentSpecDigest;
    if (!current || decisionByContribution.has(contribution._id)) continue;
    const target = `${contribution.targetSection}:${contribution.targetItemId ?? "*"}`;
    currentUndecidedTargets.set(target, [
      ...(currentUndecidedTargets.get(target) ?? []),
      contribution._id,
    ]);
  }
  return [...args.contributions]
    .sort((left, right) => right.proposedAt - left.proposedAt)
    .map((contribution) => {
      const decision = decisionByContribution.get(contribution._id);
      const latest = latestByKey.get(contribution.contributionKey)?._id === contribution._id;
      const current = contribution.missionSpecRevisionId === args.currentSpecRevisionId
        && contribution.missionSpecDigest === args.currentSpecDigest;
      const target = `${contribution.targetSection}:${contribution.targetItemId ?? "*"}`;
      const conflictIds = (currentUndecidedTargets.get(target) ?? [])
        .filter((id) => id !== contribution._id);
      let state: MissionIntentProjectedState;
      if (!latest) state = "SUPERSEDED";
      else if (decision) state = decision.decision;
      else if (!current) state = "STALE";
      else if (conflictIds.length) state = "CONFLICT";
      else state = "PROPOSED";
      return {
        ...contribution,
        state,
        currentness: current ? "CURRENT" as const : "STALE" as const,
        decision,
        conflictIds,
      };
    });
}
