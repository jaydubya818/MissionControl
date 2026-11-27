export interface MissionDraftInput {
  title: string;
  objective: string;
  context?: string;
  constraints?: string[];
  sourceOfTruthRefs?: Array<{ kind: string; label: string; location: string }>;
  owner?: string;
  budgetUsd?: number;
  stopCondition: string;
  maxReadOnlyConcurrency?: number;
  maxCorrectiveIterations?: number;
  ownerMemberId?: string;
  owningTeamId?: string;
  repositoryId?: string;
  codeScopeIds?: string[];
  executionEnvironment?: "LOCAL" | "CLOUD" | "REMOTE" | "POLICY_SELECTED";
}

export function missionDraftNextAction(mission: Pick<MissionDraftInput,
  "ownerMemberId" | "owningTeamId" | "repositoryId" | "codeScopeIds" | "budgetUsd" | "executionEnvironment">): string {
  return mission.ownerMemberId && mission.owningTeamId && mission.repositoryId && mission.codeScopeIds?.length
    && (mission.budgetUsd ?? 0) > 0 && mission.executionEnvironment
    ? "Prepare and review the canonical Plan."
    : "Assign owner, team, repository, code scope, positive budget and execution environment before preparing a Plan.";
}

export function validateMissionDraftInput(input: MissionDraftInput): void {
  if (!input.title.trim()) throw new Error("Mission title is required");
  if (!input.objective.trim()) throw new Error("Mission objective is required");
  if (!input.stopCondition.trim()) throw new Error("Mission stop condition is required");
  if (input.budgetUsd !== undefined && (!Number.isFinite(input.budgetUsd) || input.budgetUsd < 0)) {
    throw new Error("Mission budget must be zero or greater");
  }
  if (
    input.maxReadOnlyConcurrency !== undefined &&
    (!Number.isInteger(input.maxReadOnlyConcurrency) || input.maxReadOnlyConcurrency < 1)
  ) {
    throw new Error("Mission read-only concurrency must be a whole number of at least 1");
  }
  if (
    input.maxCorrectiveIterations !== undefined &&
    (!Number.isInteger(input.maxCorrectiveIterations) || input.maxCorrectiveIterations < 0)
  ) {
    throw new Error("Mission corrective iterations must be a whole number of at least 0");
  }
  if (input.constraints?.some((constraint) => !constraint.trim())) {
    throw new Error("Mission constraints cannot be empty");
  }
  if (input.sourceOfTruthRefs?.some((ref) => !ref.label.trim() || !ref.location.trim())) {
    throw new Error("Mission source references require a label and location");
  }
  const scopedDeliveryFields = [
    input.ownerMemberId,
    input.owningTeamId,
    input.repositoryId,
    input.codeScopeIds?.length ? input.codeScopeIds : undefined,
  ];
  if (scopedDeliveryFields.some(Boolean) && scopedDeliveryFields.some((value) => !value)) {
    throw new Error("Mission delivery scope requires an owner, team, repository, and code scope");
  }
}

const DRAFT_FIELDS = [
  "title",
  "objective",
  "context",
  "constraints",
  "sourceOfTruthRefs",
  "owner",
  "budgetUsd",
  "stopCondition",
  "maxReadOnlyConcurrency",
  "maxCorrectiveIterations",
  "ownerMemberId",
  "owningTeamId",
  "repositoryId",
  "codeScopeIds",
  "executionEnvironment",
] as const;

export function changedMissionDraftFields(
  mission: Record<string, unknown>,
  next: MissionDraftInput
): string[] {
  return DRAFT_FIELDS.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(next, field)) return false;
    const before = mission[field];
    const after = next[field];
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  });
}

export function missionScopeStatus(
  mission: { projectId?: string } | null,
  projectId: string
): "FOUND" | "NOT_FOUND" | "SCOPE_MISMATCH" {
  if (!mission) return "NOT_FOUND";
  return mission.projectId === projectId ? "FOUND" : "SCOPE_MISMATCH";
}

export function assertMissionDraftWorkspace(
  mission: { projectId?: string },
  projectId: string
): void {
  if (missionScopeStatus(mission, projectId) !== "FOUND") {
    throw new Error("Mission does not belong to the active workspace");
  }
}
