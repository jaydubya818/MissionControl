import type {
  MissionSpecContent,
  ProjectConstitutionContent,
} from "../../../../convex/lib/missionSpec";
import type { FactoryRecipe } from "../factoryExperience/recipeCatalog";

export type MissionSpecValues = MissionSpecContent;

interface MissionSpecSeedMission {
  objective?: string;
  constraints?: string[];
  repositoryId?: string;
  codeScopeIds?: string[];
  sourceOfTruthRefs?: Array<
    Pick<MissionSpecContent["sources"][number], "kind" | "label" | "location">
  >;
}

export function defaultProjectConstitution(): ProjectConstitutionContent {
  return {
    summary:
      "Mission requirements must be explicit, scoped, accessible, secure, testable, and independently verifiable before planning.",
    principles: [
      {
        id: "PRINCIPLE-ARCH-001",
        title: "Simple architecture",
        description:
          "Prefer the simplest design that preserves current product boundaries and durable lineage.",
        category: "ARCHITECTURE",
      },
      {
        id: "PRINCIPLE-SEC-001",
        title: "Least authority",
        description:
          "Planning artifacts grant no execution, evidence, publication, or acceptance authority.",
        category: "SECURITY",
      },
      {
        id: "PRINCIPLE-UX-001",
        title: "Complete operator states",
        description:
          "Operator flows cover loading, empty, error, success, disabled, and recovery states with accessible controls.",
        category: "ACCESSIBILITY_UX",
      },
      {
        id: "PRINCIPLE-TEST-001",
        title: "Evidence first",
        description:
          "Every delivery outcome maps to explicit evidence-bearing verification and independent proof when required.",
        category: "TESTING",
      },
      {
        id: "PRINCIPLE-DOC-001",
        title: "Durable decisions",
        description:
          "Material implementation and operator decisions remain attributable and documented.",
        category: "DOCUMENTATION",
      },
    ],
    requiredSpecSections: [
      "OUTCOME",
      "PERSONAS",
      "USER_STORIES",
      "REQUIREMENTS",
      "NON_FUNCTIONAL_REQUIREMENTS",
      "ACCEPTANCE_EXPECTATIONS",
      "VERIFICATION_EXPECTATIONS",
      "DEFINITION_OF_DONE",
      "NON_GOALS",
      "CONSTRAINTS",
      "RISKS",
      "REPOSITORY_SCOPE",
      "SOURCES",
    ],
    checklistItems: [
      {
        id: "CHECK-REQ-001",
        title: "Requirements are clear and testable",
        description:
          "Every requirement describes one observable result and maps to acceptance.",
        classification: "REQUIREMENTS_QUALITY",
        required: true,
      },
      {
        id: "CHECK-GOV-001",
        title: "Project boundaries are preserved",
        description:
          "The proposed scope follows the active Constitution and runtime policy references.",
        classification: "GOVERNANCE_CONSTRAINT",
        required: true,
      },
      {
        id: "CHECK-VERIFY-001",
        title: "Delivery produces exact evidence",
        description:
          "Execution must produce durable evidence for the exact approved subject.",
        classification: "EVIDENCE_BEARING_VERIFICATION",
        required: true,
      },
    ],
  };
}

function nextId(prefix: string, ids: string[]): string {
  const used = new Set(ids);
  let index = 1;
  while (used.has(`${prefix}-${String(index).padStart(3, "0")}`)) index += 1;
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

export function nextMissionSpecId(
  spec: MissionSpecValues,
  prefix: string,
): string {
  const ids = [
    ...spec.measurableOutcomes.map((item) => item.id),
    ...spec.personas.map((item) => item.id),
    ...spec.userStories.flatMap((item) => [
      item.id,
      ...item.scenarios.map((scenario) => scenario.id),
    ]),
    ...spec.requirements.map((item) => item.id),
    ...spec.nonFunctionalRequirements.map((item) => item.id),
    ...spec.acceptanceExpectations.map((item) => item.id),
    ...spec.verificationExpectations.map((item) => item.id),
    ...spec.definitionOfDone.map((item) => item.id),
    ...spec.constraints.map((item) => item.id),
    ...spec.nonGoals.map((item) => item.id),
    ...spec.risks.map((item) => item.id),
    ...spec.edgeCases.map((item) => item.id),
    ...spec.sources.map((item) => item.id),
    ...spec.clarifications.map((item) => item.id),
  ];
  return nextId(prefix, ids);
}

export function emptyMissionSpec(input: {
  mission: MissionSpecSeedMission;
  recipe?: FactoryRecipe;
}): MissionSpecValues {
  const sourceRefs = input.mission.sourceOfTruthRefs ?? [];
  return {
    problem: "",
    outcome: input.mission.objective ?? "",
    measurableOutcomes: [],
    personas: [],
    userStories: [],
    requirements: [],
    nonFunctionalRequirements: [],
    acceptanceExpectations: [],
    verificationExpectations: [],
    definitionOfDone: [],
    constraints: (input.mission.constraints ?? []).map(
      (description: string, index: number) => ({
        id: `CONSTRAINT-${String(index + 1).padStart(3, "0")}`,
        description,
      }),
    ),
    nonGoals: [],
    risks: [],
    edgeCases: [],
    repositoryScope: {
      repositoryId: input.mission.repositoryId
        ? String(input.mission.repositoryId)
        : undefined,
      codeScopeIds: (input.mission.codeScopeIds ?? []).map(String),
    },
    sources: sourceRefs.map((source, index) => ({
      id: `SOURCE-${String(index + 1).padStart(3, "0")}`,
      kind: source.kind,
      label: source.label,
      location: source.location,
    })),
    clarifications: [],
    checklistDispositions: [],
    recipe: input.recipe
      ? {
          recipeId: input.recipe.id,
          specTemplateVersion: input.recipe.specTemplateVersion,
          checklistVersion: input.recipe.checklistVersion,
          ...input.recipe.specProfileDefaults,
        }
      : undefined,
  };
}

export function missionSpecWithCurrentMissionScope(
  values: MissionSpecValues,
  mission: MissionSpecSeedMission,
): MissionSpecValues {
  const repositoryId = mission.repositoryId
    ? String(mission.repositoryId)
    : undefined;
  const codeScopeIds = (mission.codeScopeIds ?? []).map(String);
  if (
    values.repositoryScope.repositoryId === repositoryId &&
    values.repositoryScope.codeScopeIds.length === codeScopeIds.length &&
    values.repositoryScope.codeScopeIds.every(
      (codeScopeId, index) => codeScopeId === codeScopeIds[index],
    )
  ) {
    return values;
  }
  return {
    ...values,
    repositoryScope: {
      repositoryId,
      codeScopeIds,
    },
  };
}

export function hydrateChecklistDispositions(
  values: MissionSpecValues,
  constitution?: { content?: ProjectConstitutionContent } | null,
): MissionSpecValues {
  if (!constitution?.content) return values;
  const existing = new Map(
    values.checklistDispositions.map((item) => [item.checklistItemId, item]),
  );
  return {
    ...values,
    checklistDispositions: constitution.content.checklistItems.map(
      (item) =>
        existing.get(item.id) ?? {
          checklistItemId: item.id,
          classification: item.classification,
          disposition: "MISSING" as const,
        },
    ),
  };
}

export function missionSpecValuesEqual(
  left: MissionSpecValues,
  right: MissionSpecValues,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function missionSpecCompleteness(values: MissionSpecValues) {
  const checks = [
    Boolean(values.problem.trim()),
    Boolean(values.outcome.trim()),
    values.measurableOutcomes.length > 0,
    values.personas.length > 0,
    values.userStories.length > 0,
    values.requirements.length + values.nonFunctionalRequirements.length > 0,
    values.acceptanceExpectations.length > 0,
    values.verificationExpectations.length > 0,
    values.definitionOfDone.length > 0,
    Boolean(
      values.repositoryScope.repositoryId &&
      values.repositoryScope.codeScopeIds.length,
    ),
    values.sources.length > 0,
    values.checklistDispositions.every(
      (item) => item.disposition !== "MISSING",
    ),
  ];
  const complete = checks.filter(Boolean).length;
  return {
    complete,
    total: checks.length,
    percentage: Math.round((complete / checks.length) * 100),
  };
}

export function evaluationForRevision<
  Evaluation extends {
    missionSpecRevisionId: string;
    evaluatedAt: number;
  },
>(evaluations: Evaluation[], revisionId?: string) {
  return (
    evaluations
      .filter(
        (evaluation) =>
          String(evaluation.missionSpecRevisionId) === String(revisionId),
      )
      .sort((left, right) => right.evaluatedAt - left.evaluatedAt)[0] ?? null
  );
}

export function finalizationForRevision<
  Decision extends {
    missionSpecRevisionId: string;
    decisionType: string;
  },
>(decisions: Decision[], revisionId?: string) {
  return (
    decisions.find(
      (decision) =>
        String(decision.missionSpecRevisionId) === String(revisionId) &&
        decision.decisionType === "FINALIZED",
    ) ?? null
  );
}
