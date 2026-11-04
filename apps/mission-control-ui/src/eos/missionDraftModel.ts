export const SOURCE_KINDS = ["REPO", "DOC", "PRD", "ISSUE", "URL"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface MissionSourceRefValue {
  kind: SourceKind;
  label: string;
  location: string;
}

export interface MissionDraftValues {
  title: string;
  objective: string;
  context: string;
  constraints: string[];
  sourceOfTruthRefs: MissionSourceRefValue[];
  owner: string;
  ownerMemberId: string;
  owningTeamId: string;
  repositoryId: string;
  codeScopeIds: string[];
  executionEnvironment?: "" | "LOCAL" | "CLOUD" | "REMOTE" | "POLICY_SELECTED";
  budgetUsd: string;
  stopCondition: string;
  maxReadOnlyConcurrency: string;
  maxCorrectiveIterations: string;
}

export type MissionDraftErrors = Partial<Record<keyof MissionDraftValues, string>>;

export function missionToDraftValues(mission: any): MissionDraftValues {
  return {
    title: mission.title ?? "",
    objective: mission.objective ?? "",
    context: mission.context ?? "",
    constraints: mission.constraints ?? [],
    sourceOfTruthRefs: mission.sourceOfTruthRefs ?? [],
    owner: mission.owner ?? "",
    ownerMemberId: mission.ownerMemberId ?? "",
    owningTeamId: mission.owningTeamId ?? "",
    repositoryId: mission.repositoryId ?? "",
    codeScopeIds: mission.codeScopeIds ?? [],
    executionEnvironment: mission.executionEnvironment ?? "",
    budgetUsd: mission.budgetUsd === undefined ? "" : String(mission.budgetUsd),
    stopCondition: mission.stopCondition ?? "",
    maxReadOnlyConcurrency: String(mission.maxReadOnlyConcurrency ?? 2),
    maxCorrectiveIterations: String(mission.maxCorrectiveIterations ?? 2),
  };
}

function isWholeNumber(value: string, minimum: number): boolean {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum;
}

export function validateMissionDraft(values: MissionDraftValues): MissionDraftErrors {
  const errors: MissionDraftErrors = {};
  if (!values.title.trim()) errors.title = "Title is required.";
  if (!values.objective.trim()) errors.objective = "Objective is required.";
  if (!values.stopCondition.trim()) errors.stopCondition = "Stop condition is required.";
  if (!values.owningTeamId) errors.owningTeamId = "Owning team is required.";
  if (!values.ownerMemberId) errors.ownerMemberId = "Accountable owner is required.";
  if (!values.repositoryId) errors.repositoryId = "Repository is required.";
  if (values.codeScopeIds.length === 0) errors.codeScopeIds = "Code scope is required.";
  if (!values.budgetUsd.trim()) {
    errors.budgetUsd = "Enter a budget. Use zero to keep execution blocked.";
  } else if (!Number.isFinite(Number(values.budgetUsd)) || Number(values.budgetUsd) < 0) {
    errors.budgetUsd = "Budget must be zero or greater.";
  }
  if (!isWholeNumber(values.maxReadOnlyConcurrency, 1)) {
    errors.maxReadOnlyConcurrency = "Concurrency must be a whole number of at least 1.";
  }
  if (!isWholeNumber(values.maxCorrectiveIterations, 0)) {
    errors.maxCorrectiveIterations = "Corrective iterations must be a whole number of at least 0.";
  }
  if (values.constraints.some((constraint) => !constraint.trim())) {
    errors.constraints = "Constraints cannot be empty.";
  }
  if (values.sourceOfTruthRefs.some((ref) => !ref.label.trim() || !ref.location.trim())) {
    errors.sourceOfTruthRefs = "Each source needs a label and location.";
  }
  return errors;
}

export function missionDraftPayload(values: MissionDraftValues) {
  return {
    title: values.title.trim(),
    objective: values.objective.trim(),
    context: values.context.trim(),
    constraints: values.constraints.map((value) => value.trim()),
    sourceOfTruthRefs: values.sourceOfTruthRefs.map((ref) => ({
      kind: ref.kind,
      label: ref.label.trim(),
      location: ref.location.trim(),
    })),
    ownerMemberId: values.ownerMemberId,
    owningTeamId: values.owningTeamId,
    repositoryId: values.repositoryId,
    codeScopeIds: values.codeScopeIds,
    executionEnvironment: values.executionEnvironment || undefined,
    budgetUsd: values.budgetUsd.trim() ? Number(values.budgetUsd) : undefined,
    stopCondition: values.stopCondition.trim(),
    maxReadOnlyConcurrency: Number(values.maxReadOnlyConcurrency),
    maxCorrectiveIterations: Number(values.maxCorrectiveIterations),
  };
}

export function draftsEqual(left: MissionDraftValues, right: MissionDraftValues): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
