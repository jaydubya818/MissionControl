import { canonicalHash } from "@mission-control/shared";

export const MISSION_SPEC_INTAKE_FLAG = "missions.spec-intake-v1";
export const MISSION_SPEC_RULESET_VERSION = 1;
export const REQUIREMENTS_COVERAGE_SCHEMA_VERSION = 1;

export const MISSION_SPEC_AUTHORITY_PROFILE = Object.freeze({
  releaseWorkOrders: false,
  dispatchAttempts: false,
  establishVerification: false,
  createAuthoritativeEvidence: false,
  publish: false,
  merge: false,
  accept: false,
  mutateWorkerLeases: false,
  mutateRouting: false,
  alterFactoryVersions: false,
});

export const MISSION_SPEC_LIMITS = {
  personas: 10,
  measurableOutcomes: 20,
  stories: 30,
  scenariosPerStory: 20,
  requirements: 50,
  nonFunctionalRequirements: 30,
  acceptanceExpectations: 60,
  verificationExpectations: 60,
  definitionOfDone: 40,
  constraints: 40,
  nonGoals: 30,
  risks: 30,
  edgeCases: 40,
  sources: 30,
  clarifications: 40,
  checklistItems: 80,
  findings: 100,
  principles: 40,
  requiredSpecSections: 20,
  referencesPerItem: 60,
  text: 4_000,
} as const;

export type SpecSection =
  | "OUTCOME"
  | "PERSONAS"
  | "USER_STORIES"
  | "REQUIREMENTS"
  | "NON_FUNCTIONAL_REQUIREMENTS"
  | "ACCEPTANCE_EXPECTATIONS"
  | "DEFINITION_OF_DONE"
  | "NON_GOALS"
  | "CONSTRAINTS"
  | "RISKS"
  | "REPOSITORY_SCOPE"
  | "VERIFICATION_EXPECTATIONS"
  | "SOURCES"
  | "CLARIFICATIONS";

export type ChecklistClassification =
  | "REQUIREMENTS_QUALITY"
  | "GOVERNANCE_CONSTRAINT"
  | "EVIDENCE_BEARING_VERIFICATION";

export interface ConstitutionPrinciple {
  id: string;
  title: string;
  description: string;
  category:
    | "ARCHITECTURE"
    | "SECURITY"
    | "ACCESSIBILITY_UX"
    | "DEPENDENCIES"
    | "TESTING"
    | "DOCUMENTATION"
    | "PERFORMANCE"
    | "REQUIREMENTS_QUALITY";
  policyReference?: {
    kind: "GOVERNANCE_POLICY" | "POLICY_ENVELOPE" | "QUALITY_CONTRACT" | "VERIFICATION_PLAN";
    referenceId: string;
    description: string;
  };
}

export interface ConstitutionChecklistItem {
  id: string;
  title: string;
  description: string;
  classification: ChecklistClassification;
  required: boolean;
  policyReference?: {
    kind: "GOVERNANCE_POLICY" | "POLICY_ENVELOPE" | "QUALITY_CONTRACT" | "VERIFICATION_PLAN";
    referenceId: string;
    description: string;
  };
}

export interface ProjectConstitutionContent {
  summary: string;
  principles: ConstitutionPrinciple[];
  requiredSpecSections: SpecSection[];
  checklistItems: ConstitutionChecklistItem[];
}

export interface MissionSpecContent {
  problem: string;
  outcome: string;
  measurableOutcomes: Array<{
    id: string;
    description: string;
    metric: string;
    target: string;
  }>;
  personas: Array<{
    id: string;
    name: string;
    needs: string;
  }>;
  userStories: Array<{
    id: string;
    personaId: string;
    title: string;
    outcome: string;
    priority: "P0" | "P1" | "P2";
    scenarios: Array<{
      id: string;
      given: string;
      when: string;
      then: string;
    }>;
  }>;
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    priority: "MUST" | "SHOULD";
    sourceStoryIds: string[];
  }>;
  nonFunctionalRequirements: Array<{
    id: string;
    title: string;
    description: string;
    category: "SECURITY" | "RELIABILITY" | "PERFORMANCE" | "ACCESSIBILITY" | "PRIVACY" | "OPERABILITY" | "ARCHITECTURE";
    priority: "MUST" | "SHOULD";
    sourceStoryIds: string[];
  }>;
  acceptanceExpectations: Array<{
    id: string;
    title: string;
    description: string;
    requirementIds: string[];
    verificationExpectationIds: string[];
    givenWhenThen?: {
      given: string;
      when: string;
      then: string;
    };
  }>;
  verificationExpectations: Array<{
    id: string;
    title: string;
    description: string;
    method: "COMMAND" | "TEST" | "BROWSER" | "MANUAL" | "CHECKLIST";
    category: "BUILD" | "TYPECHECK" | "UNIT_TEST" | "INTEGRATION_TEST" | "CONTRACT_TEST" | "SECURITY" | "SECRETS" | "DEPENDENCY" | "POLICY" | "CHANGE_BUDGET" | "ACCEPTANCE" | "INDEPENDENT_REVIEW";
    evidenceCategory: "TEST_RESULT" | "BUILD_RESULT" | "STATIC_ANALYSIS" | "SECURITY_SCAN" | "COMMAND_LOG" | "FILE_DIFF" | "SCREENSHOT" | "BROWSER_RESULT" | "PERFORMANCE_RESULT" | "REVIEW_RESULT" | "POLICY_RESULT" | "CI_RESULT" | "RUNTIME_OBSERVATION";
    acceptanceExpectationIds: string[];
    checklistItemIds: string[];
    mandatory: boolean;
  }>;
  definitionOfDone: Array<{
    id: string;
    description: string;
    acceptanceExpectationIds: string[];
  }>;
  constraints: Array<{
    id: string;
    description: string;
  }>;
  nonGoals: Array<{
    id: string;
    description: string;
  }>;
  risks: Array<{
    id: string;
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    mitigation: string;
  }>;
  edgeCases: Array<{
    id: string;
    description: string;
    expectedBehavior: string;
  }>;
  repositoryScope: {
    repositoryId?: string;
    codeScopeIds: string[];
  };
  sources: Array<{
    id: string;
    kind: "REPO" | "DOC" | "PRD" | "ISSUE" | "URL";
    label: string;
    location: string;
  }>;
  clarifications: Array<{
    id: string;
    findingCode: string;
    question: string;
    answer?: string;
    status: "OPEN" | "RESOLVED";
  }>;
  checklistDispositions: Array<{
    checklistItemId: string;
    classification: ChecklistClassification;
    disposition: "SATISFIED" | "NOT_APPLICABLE" | "MISSING";
    reason?: string;
  }>;
  recipe?: {
    recipeId: string;
    specTemplateVersion: number;
    checklistVersion: number;
    repositoryType: "APPLICATION" | "LIBRARY" | "SERVICE" | "MONOREPO" | "OTHER";
    teamType: "PRODUCT" | "PLATFORM" | "INFRASTRUCTURE" | "OTHER";
    riskProfile: "LOW" | "STANDARD" | "HIGH" | "REGULATED";
    productType: "SAAS" | "MARKETPLACE" | "INTERNAL_TOOL" | "API" | "OTHER";
  };
}

export type SpecFindingSeverity = "BLOCKING" | "ADVISORY";

export interface MissionSpecFinding {
  code: string;
  severity: SpecFindingSeverity;
  blocking: boolean;
  path: string;
  artifactType: "SPEC" | "CONSTITUTION" | "PLAN" | "WORK_ORDER" | "CHECKLIST" | "LINEAGE";
  artifactId?: string;
  message: string;
  nextAction: string;
}

export interface MissionSpecQualityResult {
  rulesetVersion: number;
  result: "PASS" | "FAIL";
  findings: MissionSpecFinding[];
}

export interface RequirementsCoverageRow {
  specRequirementId: string;
  acceptanceExpectationIds: string[];
  planAssertionIds: string[];
  workOrderBlueprintIds: string[];
  acceptanceCriterionIds: string[];
  verificationCheckIds: string[];
  complete: boolean;
}

export interface RequirementsCoverageProjection {
  schemaVersion: number;
  rows: RequirementsCoverageRow[];
  complete: boolean;
  digest: string;
}

const BASE_REQUIRED_SECTIONS: SpecSection[] = [
  "OUTCOME",
  "PERSONAS",
  "USER_STORIES",
  "REQUIREMENTS",
  "ACCEPTANCE_EXPECTATIONS",
  "DEFINITION_OF_DONE",
  "REPOSITORY_SCOPE",
  "VERIFICATION_EXPECTATIONS",
];

const STABLE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const AMBIGUOUS_PLACEHOLDER = /(?:\b(?:TBD|TODO|TBC|FIXME|UNKNOWN)\b|\?{2,}|<[^>]+>)/i;

function compareById<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function sortedStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function trim(value: string | undefined) {
  return value?.trim() ?? "";
}

function canonicalText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function contradictionKey(value: string) {
  return canonicalText(value)
    .replace(/\b(?:must|shall|should|may|do|does|cannot|can|never|not)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNegative(value: string) {
  return /\b(?:must not|shall not|should not|do not|does not|cannot|never)\b/i.test(value);
}

function assertCollectionLimit(name: keyof typeof MISSION_SPEC_LIMITS, count: number) {
  const limit = MISSION_SPEC_LIMITS[name];
  if (count > limit) throw new Error(`${name} is limited to ${limit} items`);
}

function assertTextBounds(value: string, path: string) {
  if (value.length > MISSION_SPEC_LIMITS.text) {
    throw new Error(`${path} is limited to ${MISSION_SPEC_LIMITS.text} characters`);
  }
}

function allTextValues(content: MissionSpecContent): Array<{ path: string; value: string; id?: string }> {
  const values: Array<{ path: string; value: string; id?: string }> = [
    { path: "problem", value: content.problem },
    { path: "outcome", value: content.outcome },
  ];
  const append = (path: string, items: Array<{ id: string } & Record<string, unknown>>, fields: string[]) => {
    for (const item of items) {
      for (const field of fields) {
        const value = item[field];
        if (typeof value === "string") values.push({ path: `${path}.${item.id}.${field}`, value, id: item.id });
      }
    }
  };
  append("measurableOutcomes", content.measurableOutcomes, ["description", "metric", "target"]);
  append("personas", content.personas, ["name", "needs"]);
  append("userStories", content.userStories, ["title", "outcome"]);
  for (const story of content.userStories) append(`userStories.${story.id}.scenarios`, story.scenarios, ["given", "when", "then"]);
  append("requirements", content.requirements, ["title", "description"]);
  append("nonFunctionalRequirements", content.nonFunctionalRequirements, ["title", "description"]);
  append("acceptanceExpectations", content.acceptanceExpectations, ["title", "description"]);
  append("verificationExpectations", content.verificationExpectations, ["title", "description"]);
  append("definitionOfDone", content.definitionOfDone, ["description"]);
  append("constraints", content.constraints, ["description"]);
  append("nonGoals", content.nonGoals, ["description"]);
  append("risks", content.risks, ["description", "mitigation"]);
  append("edgeCases", content.edgeCases, ["description", "expectedBehavior"]);
  append("sources", content.sources, ["label", "location"]);
  append("clarifications", content.clarifications, ["question", "answer"]);
  return values;
}

export function assertProjectConstitutionBounds(content: ProjectConstitutionContent) {
  assertCollectionLimit("principles", content.principles.length);
  assertCollectionLimit("requiredSpecSections", content.requiredSpecSections.length);
  assertCollectionLimit("checklistItems", content.checklistItems.length);
  assertTextBounds(content.summary, "constitution.summary");
  for (const principle of content.principles) {
    assertTextBounds(principle.title, `principles.${principle.id}.title`);
    assertTextBounds(principle.description, `principles.${principle.id}.description`);
  }
  for (const item of content.checklistItems) {
    assertTextBounds(item.title, `checklistItems.${item.id}.title`);
    assertTextBounds(item.description, `checklistItems.${item.id}.description`);
  }
}

export function assertValidProjectConstitution(content: ProjectConstitutionContent) {
  assertProjectConstitutionBounds(content);
  if (!content.summary.trim()) throw new Error("Constitution summary is required");
  if (content.principles.length === 0) throw new Error("At least one Constitution principle is required");
  const ids = [...content.principles.map((item) => item.id), ...content.checklistItems.map((item) => item.id)];
  if (ids.some((id) => !isStableSpecId(id))) throw new Error("Constitution principles and checklist items require stable uppercase identifiers");
  if (new Set(ids).size !== ids.length) throw new Error("Constitution principle and checklist identifiers must be unique");
  if (new Set(content.requiredSpecSections).size !== content.requiredSpecSections.length) throw new Error("Constitution required Spec sections must be unique");
}

export function assertMissionSpecBounds(content: MissionSpecContent) {
  assertCollectionLimit("personas", content.personas.length);
  assertCollectionLimit("measurableOutcomes", content.measurableOutcomes.length);
  assertCollectionLimit("stories", content.userStories.length);
  assertCollectionLimit("requirements", content.requirements.length);
  assertCollectionLimit("nonFunctionalRequirements", content.nonFunctionalRequirements.length);
  assertCollectionLimit("acceptanceExpectations", content.acceptanceExpectations.length);
  assertCollectionLimit("verificationExpectations", content.verificationExpectations.length);
  assertCollectionLimit("definitionOfDone", content.definitionOfDone.length);
  assertCollectionLimit("constraints", content.constraints.length);
  assertCollectionLimit("nonGoals", content.nonGoals.length);
  assertCollectionLimit("risks", content.risks.length);
  assertCollectionLimit("edgeCases", content.edgeCases.length);
  assertCollectionLimit("sources", content.sources.length);
  assertCollectionLimit("clarifications", content.clarifications.length);
  assertCollectionLimit("checklistItems", content.checklistDispositions.length);
  for (const story of content.userStories) {
    if (story.scenarios.length > MISSION_SPEC_LIMITS.scenariosPerStory) {
      throw new Error(`userStories.${story.id}.scenarios is limited to ${MISSION_SPEC_LIMITS.scenariosPerStory} items`);
    }
  }
  for (const { path, value } of allTextValues(content)) assertTextBounds(value, path);
  const referenceLists = [
    ...content.userStories.map((item) => item.scenarios.map((scenario) => scenario.id)),
    ...content.requirements.map((item) => item.sourceStoryIds),
    ...content.nonFunctionalRequirements.map((item) => item.sourceStoryIds),
    ...content.acceptanceExpectations.flatMap((item) => [item.requirementIds, item.verificationExpectationIds]),
    ...content.verificationExpectations.flatMap((item) => [item.acceptanceExpectationIds, item.checklistItemIds]),
    ...content.definitionOfDone.map((item) => item.acceptanceExpectationIds),
    content.repositoryScope.codeScopeIds,
  ];
  if (referenceLists.some((items) => items.length > MISSION_SPEC_LIMITS.referencesPerItem)) {
    throw new Error(`Spec references are limited to ${MISSION_SPEC_LIMITS.referencesPerItem} IDs per item`);
  }
}

export function canonicalizeProjectConstitution(content: ProjectConstitutionContent): ProjectConstitutionContent {
  return {
    summary: content.summary.trim(),
    principles: [...content.principles].sort(compareById).map((item) => ({
      ...item,
      id: item.id.trim(),
      title: item.title.trim(),
      description: item.description.trim(),
    })),
    requiredSpecSections: sortedStrings(content.requiredSpecSections) as SpecSection[],
    checklistItems: [...content.checklistItems].sort(compareById).map((item) => ({
      ...item,
      id: item.id.trim(),
      title: item.title.trim(),
      description: item.description.trim(),
    })),
  };
}

export function canonicalizeMissionSpec(content: MissionSpecContent): MissionSpecContent {
  const sortRefs = <T extends Record<string, unknown>>(item: T, keys: string[]) => {
    const result: Record<string, unknown> = { ...item };
    for (const key of keys) {
      const value = result[key];
      if (Array.isArray(value)) result[key] = sortedStrings(value as string[]);
    }
    return result as T;
  };
  return {
    ...content,
    problem: content.problem.trim(),
    outcome: content.outcome.trim(),
    measurableOutcomes: [...content.measurableOutcomes].sort(compareById),
    personas: [...content.personas].sort(compareById),
    userStories: [...content.userStories].sort(compareById).map((item) => ({
      ...item,
      scenarios: [...item.scenarios].sort(compareById),
    })),
    requirements: [...content.requirements].sort(compareById).map((item) => sortRefs(item, ["sourceStoryIds"])),
    nonFunctionalRequirements: [...content.nonFunctionalRequirements].sort(compareById).map((item) => sortRefs(item, ["sourceStoryIds"])),
    acceptanceExpectations: [...content.acceptanceExpectations].sort(compareById).map((item) => sortRefs(item, ["requirementIds", "verificationExpectationIds"])),
    verificationExpectations: [...content.verificationExpectations].sort(compareById).map((item) => sortRefs(item, ["acceptanceExpectationIds", "checklistItemIds"])),
    definitionOfDone: [...content.definitionOfDone].sort(compareById).map((item) => sortRefs(item, ["acceptanceExpectationIds"])),
    constraints: [...content.constraints].sort(compareById),
    nonGoals: [...content.nonGoals].sort(compareById),
    risks: [...content.risks].sort(compareById),
    edgeCases: [...content.edgeCases].sort(compareById),
    repositoryScope: {
      repositoryId: content.repositoryScope.repositoryId,
      codeScopeIds: sortedStrings(content.repositoryScope.codeScopeIds),
    },
    sources: [...content.sources].sort(compareById),
    clarifications: [...content.clarifications].sort(compareById),
    checklistDispositions: [...content.checklistDispositions].sort((left, right) => left.checklistItemId.localeCompare(right.checklistItemId)),
  };
}

export function projectConstitutionDigest(content: ProjectConstitutionContent) {
  return `sha256:${canonicalHash(canonicalizeProjectConstitution(content))}`;
}

export function missionSpecDigest(content: MissionSpecContent) {
  return `sha256:${canonicalHash(canonicalizeMissionSpec(content))}`;
}

export function isStableSpecId(value: string) {
  return STABLE_ID.test(value);
}

function sectionPresent(section: SpecSection, content: MissionSpecContent) {
  switch (section) {
    case "OUTCOME": return Boolean(trim(content.problem) && trim(content.outcome) && content.measurableOutcomes.length);
    case "PERSONAS": return content.personas.length > 0;
    case "USER_STORIES": return content.userStories.length > 0;
    case "REQUIREMENTS": return content.requirements.length > 0;
    case "NON_FUNCTIONAL_REQUIREMENTS": return content.nonFunctionalRequirements.length > 0;
    case "ACCEPTANCE_EXPECTATIONS": return content.acceptanceExpectations.length > 0;
    case "DEFINITION_OF_DONE": return content.definitionOfDone.length > 0;
    case "NON_GOALS": return content.nonGoals.length > 0;
    case "CONSTRAINTS": return content.constraints.length > 0;
    case "RISKS": return content.risks.length > 0;
    case "REPOSITORY_SCOPE": return Boolean(content.repositoryScope.repositoryId);
    case "VERIFICATION_EXPECTATIONS": return content.verificationExpectations.length > 0;
    case "SOURCES": return content.sources.length > 0;
    case "CLARIFICATIONS": return content.clarifications.every((item) => item.status === "RESOLVED");
  }
}

export function evaluateMissionSpecQuality(input: {
  spec: MissionSpecContent;
  constitution: ProjectConstitutionContent;
}): MissionSpecQualityResult {
  assertMissionSpecBounds(input.spec);
  assertProjectConstitutionBounds(input.constitution);
  const spec = canonicalizeMissionSpec(input.spec);
  const constitution = canonicalizeProjectConstitution(input.constitution);
  const findings: MissionSpecFinding[] = [];
  let overflow = false;
  const add = (finding: Omit<MissionSpecFinding, "blocking">) => {
    if (findings.length >= MISSION_SPEC_LIMITS.findings) {
      overflow = true;
      return;
    }
    findings.push({ ...finding, blocking: finding.severity === "BLOCKING" });
  };
  const blocking = (
    code: string,
    path: string,
    message: string,
    nextAction: string,
    artifactType: MissionSpecFinding["artifactType"] = "SPEC",
    artifactId?: string,
  ) => add({ code, severity: "BLOCKING", path, message, nextAction, artifactType, artifactId });
  const advisory = (
    code: string,
    path: string,
    message: string,
    nextAction: string,
    artifactType: MissionSpecFinding["artifactType"] = "SPEC",
    artifactId?: string,
  ) => add({ code, severity: "ADVISORY", path, message, nextAction, artifactType, artifactId });

  const requiredSections = sortedStrings([...BASE_REQUIRED_SECTIONS, ...constitution.requiredSpecSections]) as SpecSection[];
  for (const section of requiredSections) {
    if (!sectionPresent(section, spec)) {
      blocking(
        "REQUIRED_SECTION_MISSING",
        `sections.${section}`,
        `${section.split("_").join(" ")} is required by the planning contract.`,
        `Complete the ${section.split("_").join(" ").toLowerCase()} section and save a new revision.`,
        "CONSTITUTION",
        section,
      );
    }
  }

  const identified: Array<{ id: string; path: string }> = [
    ...spec.measurableOutcomes.map((item) => ({ id: item.id, path: "measurableOutcomes" })),
    ...spec.personas.map((item) => ({ id: item.id, path: "personas" })),
    ...spec.userStories.map((item) => ({ id: item.id, path: "userStories" })),
    ...spec.userStories.flatMap((story) => story.scenarios.map((item) => ({ id: item.id, path: `userStories.${story.id}.scenarios` }))),
    ...spec.requirements.map((item) => ({ id: item.id, path: "requirements" })),
    ...spec.nonFunctionalRequirements.map((item) => ({ id: item.id, path: "nonFunctionalRequirements" })),
    ...spec.acceptanceExpectations.map((item) => ({ id: item.id, path: "acceptanceExpectations" })),
    ...spec.verificationExpectations.map((item) => ({ id: item.id, path: "verificationExpectations" })),
    ...spec.definitionOfDone.map((item) => ({ id: item.id, path: "definitionOfDone" })),
    ...spec.constraints.map((item) => ({ id: item.id, path: "constraints" })),
    ...spec.nonGoals.map((item) => ({ id: item.id, path: "nonGoals" })),
    ...spec.risks.map((item) => ({ id: item.id, path: "risks" })),
    ...spec.edgeCases.map((item) => ({ id: item.id, path: "edgeCases" })),
    ...spec.sources.map((item) => ({ id: item.id, path: "sources" })),
    ...spec.clarifications.map((item) => ({ id: item.id, path: "clarifications" })),
  ];
  const seenIds = new Set<string>();
  for (const item of identified) {
    if (!isStableSpecId(item.id)) {
      blocking("STABLE_ID_INVALID", `${item.path}.${item.id || "missing"}`, "Every specification item needs a stable uppercase identifier such as REQ-001.", "Assign a stable identifier; do not use array position or display text.", "LINEAGE", item.id || undefined);
    } else if (seenIds.has(item.id)) {
      blocking("STABLE_ID_DUPLICATE", `${item.path}.${item.id}`, `${item.id} is used by more than one specification item.`, "Give each specification item one globally unique stable identifier.", "LINEAGE", item.id);
    }
    seenIds.add(item.id);
  }

  for (const { path, value, id } of allTextValues(spec)) {
    if (AMBIGUOUS_PLACEHOLDER.test(value)) {
      blocking("AMBIGUOUS_PLACEHOLDER", path, `Ambiguous placeholder remains${id ? ` in ${id}` : ""}.`, "Replace TBD/TODO/unknown markers with a testable statement or explicit non-goal.", "SPEC", id);
    }
  }

  if (!trim(spec.problem)) blocking("PROBLEM_MISSING", "problem", "The problem is not defined.", "Describe the user or business problem this Mission solves.");
  if (!trim(spec.outcome)) blocking("OUTCOME_MISSING", "outcome", "The intended outcome is not defined.", "Describe the observable outcome, not the implementation task.");
  if (spec.measurableOutcomes.length === 0) blocking("MEASURABLE_OUTCOME_MISSING", "measurableOutcomes", "At least one measurable outcome is required.", "Add a metric and target that can be evaluated after delivery.");
  for (const outcome of spec.measurableOutcomes) {
    if (!trim(outcome.metric) || !trim(outcome.target)) blocking("MEASURABLE_OUTCOME_UNTESTABLE", `measurableOutcomes.${outcome.id}`, `${outcome.id} does not define both a metric and target.`, "Add an observable metric and explicit target.", "SPEC", outcome.id);
  }

  const personaIds = new Set(spec.personas.map((item) => item.id));
  const storyIds = new Set(spec.userStories.map((item) => item.id));
  for (const story of spec.userStories) {
    if (!personaIds.has(story.personaId)) blocking("STORY_PERSONA_UNKNOWN", `userStories.${story.id}.personaId`, `${story.id} references unknown persona ${story.personaId}.`, "Select an existing persona ID.", "SPEC", story.id);
    if (story.scenarios.length === 0) blocking("STORY_SCENARIO_MISSING", `userStories.${story.id}.scenarios`, `${story.id} has no Given/When/Then scenario.`, "Add at least one independently testable scenario.", "SPEC", story.id);
    for (const scenario of story.scenarios) {
      if (![scenario.given, scenario.when, scenario.then].every((value) => trim(value))) blocking("SCENARIO_INCOMPLETE", `userStories.${story.id}.scenarios.${scenario.id}`, `${scenario.id} is missing Given, When, or Then.`, "Complete all three scenario clauses.", "SPEC", scenario.id);
    }
  }

  const requirements = [...spec.requirements, ...spec.nonFunctionalRequirements];
  const requirementIds = new Set(requirements.map((item) => item.id));
  for (const requirement of requirements) {
    for (const storyId of requirement.sourceStoryIds) {
      if (!storyIds.has(storyId)) blocking("REQUIREMENT_STORY_UNKNOWN", `${requirement.id}.sourceStoryIds`, `${requirement.id} references unknown story ${storyId}.`, "Map the requirement to an existing story ID.", "SPEC", requirement.id);
    }
    if (!trim(requirement.description) || requirement.description.trim().length < 12) blocking("REQUIREMENT_UNTESTABLE", `requirements.${requirement.id}`, `${requirement.id} is too vague to evaluate.`, "State the required observable behavior and boundary.", "SPEC", requirement.id);
  }

  const acceptanceIds = new Set(spec.acceptanceExpectations.map((item) => item.id));
  const verificationIds = new Set(spec.verificationExpectations.map((item) => item.id));
  const acceptedRequirementIds = new Set<string>();
  for (const expectation of spec.acceptanceExpectations) {
    if (expectation.requirementIds.length === 0) blocking("ACCEPTANCE_REQUIREMENT_MISSING", `acceptanceExpectations.${expectation.id}.requirementIds`, `${expectation.id} is not linked to a requirement.`, "Link the acceptance expectation to at least one stable requirement ID.", "SPEC", expectation.id);
    for (const requirementId of expectation.requirementIds) {
      if (!requirementIds.has(requirementId)) blocking("ACCEPTANCE_REQUIREMENT_UNKNOWN", `acceptanceExpectations.${expectation.id}.requirementIds`, `${expectation.id} references unknown requirement ${requirementId}.`, "Use an existing requirement ID.", "SPEC", expectation.id);
      else acceptedRequirementIds.add(requirementId);
    }
    if (expectation.verificationExpectationIds.length === 0) blocking("ACCEPTANCE_VERIFICATION_MISSING", `acceptanceExpectations.${expectation.id}.verificationExpectationIds`, `${expectation.id} has no verification expectation.`, "Link at least one evidence-bearing verification expectation.", "SPEC", expectation.id);
    for (const verificationId of expectation.verificationExpectationIds) {
      if (!verificationIds.has(verificationId)) blocking("ACCEPTANCE_VERIFICATION_UNKNOWN", `acceptanceExpectations.${expectation.id}.verificationExpectationIds`, `${expectation.id} references unknown verification expectation ${verificationId}.`, "Use an existing verification expectation ID.", "SPEC", expectation.id);
    }
    const gwt = expectation.givenWhenThen;
    if (!gwt && expectation.description.trim().length < 20) blocking("ACCEPTANCE_UNTESTABLE", `acceptanceExpectations.${expectation.id}`, `${expectation.id} does not define a testable condition.`, "Add Given/When/Then or a precise observable pass condition.", "SPEC", expectation.id);
    if (gwt && ![gwt.given, gwt.when, gwt.then].every((value) => trim(value))) blocking("ACCEPTANCE_SCENARIO_INCOMPLETE", `acceptanceExpectations.${expectation.id}.givenWhenThen`, `${expectation.id} has an incomplete Given/When/Then condition.`, "Complete Given, When, and Then.", "SPEC", expectation.id);
  }
  for (const requirement of requirements) {
    if (!acceptedRequirementIds.has(requirement.id)) {
      const report = requirement.priority === "MUST" ? blocking : advisory;
      report("REQUIREMENT_ACCEPTANCE_UNCOVERED", `requirements.${requirement.id}`, `${requirement.id} is not covered by an acceptance expectation.`, "Map it to an acceptance expectation or remove it from this revision.", "SPEC", requirement.id);
    }
  }

  const constitutionChecklist = new Map(constitution.checklistItems.map((item) => [item.id, item]));
  const dispositions = new Map(spec.checklistDispositions.map((item) => [item.checklistItemId, item]));
  for (const item of constitution.checklistItems) {
    const disposition = dispositions.get(item.id);
    if (item.required && (!disposition || disposition.disposition === "MISSING")) blocking("CHECKLIST_ITEM_MISSING", `checklistDispositions.${item.id}`, `Required ${item.classification.toLowerCase().split("_").join(" ")} item ${item.id} is unresolved.`, "Satisfy it or record an attributable not-applicable reason.", "CHECKLIST", item.id);
    if (disposition?.classification !== undefined && disposition.classification !== item.classification) blocking("CHECKLIST_CLASSIFICATION_MISMATCH", `checklistDispositions.${item.id}`, `${item.id} changed classification from ${item.classification}.`, "Use the classification frozen in the Constitution revision.", "CHECKLIST", item.id);
    if (disposition?.disposition === "NOT_APPLICABLE" && !trim(disposition.reason)) blocking("CHECKLIST_NOT_APPLICABLE_REASON_MISSING", `checklistDispositions.${item.id}.reason`, `${item.id} is not applicable without a reason.`, "Record why this exact check does not apply.", "CHECKLIST", item.id);
  }
  for (const disposition of spec.checklistDispositions) {
    if (!constitutionChecklist.has(disposition.checklistItemId)) blocking("CHECKLIST_ITEM_UNKNOWN", `checklistDispositions.${disposition.checklistItemId}`, `Unknown Constitution checklist item ${disposition.checklistItemId}.`, "Remove it or adopt a Constitution revision containing that stable ID.", "CHECKLIST", disposition.checklistItemId);
  }

  for (const expectation of spec.verificationExpectations) {
    if (expectation.acceptanceExpectationIds.length === 0) blocking("VERIFICATION_ACCEPTANCE_MISSING", `verificationExpectations.${expectation.id}.acceptanceExpectationIds`, `${expectation.id} is not linked to an acceptance expectation.`, "Link the verification expectation to an acceptance expectation ID.", "SPEC", expectation.id);
    for (const acceptanceId of expectation.acceptanceExpectationIds) {
      if (!acceptanceIds.has(acceptanceId)) blocking("VERIFICATION_ACCEPTANCE_UNKNOWN", `verificationExpectations.${expectation.id}.acceptanceExpectationIds`, `${expectation.id} references unknown acceptance expectation ${acceptanceId}.`, "Use an existing acceptance expectation ID.", "SPEC", expectation.id);
    }
    for (const checklistId of expectation.checklistItemIds) {
      const checklist = constitutionChecklist.get(checklistId);
      if (!checklist) blocking("VERIFICATION_CHECKLIST_UNKNOWN", `verificationExpectations.${expectation.id}.checklistItemIds`, `${expectation.id} references unknown checklist item ${checklistId}.`, "Use an existing evidence-bearing checklist ID.", "CHECKLIST", checklistId);
      else if (checklist.classification !== "EVIDENCE_BEARING_VERIFICATION") blocking("NON_EVIDENCE_CHECKLIST_USED_FOR_VERIFICATION", `verificationExpectations.${expectation.id}.checklistItemIds`, `${checklistId} is ${checklist.classification} and cannot satisfy delivery verification.`, "Reference only evidence-bearing verification items here.", "CHECKLIST", checklistId);
    }
  }

  for (const item of spec.definitionOfDone) {
    if (item.acceptanceExpectationIds.length === 0) blocking("DOD_ACCEPTANCE_MISSING", `definitionOfDone.${item.id}.acceptanceExpectationIds`, `${item.id} is not tied to acceptance.`, "Link the Definition of Done item to an acceptance expectation.", "SPEC", item.id);
    for (const acceptanceId of item.acceptanceExpectationIds) {
      if (!acceptanceIds.has(acceptanceId)) blocking("DOD_ACCEPTANCE_UNKNOWN", `definitionOfDone.${item.id}.acceptanceExpectationIds`, `${item.id} references unknown acceptance expectation ${acceptanceId}.`, "Use an existing acceptance expectation ID.", "SPEC", item.id);
    }
  }

  if (!spec.repositoryScope.repositoryId) blocking("REPOSITORY_SCOPE_MISSING", "repositoryScope.repositoryId", "Repository scope is not explicit.", "Select the Mission repository before finalizing this revision.");

  const statements = [
    ...requirements.map((item) => ({ id: item.id, value: item.description, path: `requirements.${item.id}` })),
    ...spec.constraints.map((item) => ({ id: item.id, value: item.description, path: `constraints.${item.id}` })),
    ...spec.nonGoals.map((item) => ({ id: item.id, value: item.description, path: `nonGoals.${item.id}` })),
  ];
  const byContradictionKey = new Map<string, typeof statements>();
  for (const statement of statements) {
    const key = contradictionKey(statement.value);
    if (!key) continue;
    const matches = byContradictionKey.get(key) ?? [];
    for (const match of matches) {
      if (isNegative(match.value) !== isNegative(statement.value)) blocking("UNRESOLVED_CONTRADICTION", statement.path, `${statement.id} contradicts ${match.id}.`, "Resolve the conflicting statements in a new Spec revision.", "SPEC", statement.id);
      if (canonicalText(match.value) === canonicalText(statement.value) && match.path.startsWith("nonGoals") !== statement.path.startsWith("nonGoals")) blocking("NON_GOAL_CONFLICT", statement.path, `${statement.id} duplicates ${match.id} across required and excluded scope.`, "Keep the behavior either in scope or out of scope, not both.", "SPEC", statement.id);
    }
    matches.push(statement);
    byContradictionKey.set(key, matches);
  }

  for (const clarification of spec.clarifications) {
    if (clarification.status === "OPEN" || !trim(clarification.answer)) blocking("CLARIFICATION_UNRESOLVED", `clarifications.${clarification.id}`, `${clarification.id} is unresolved.`, "Answer the structured question and save a new Spec revision.", "SPEC", clarification.id);
  }

  if (overflow) {
    findings[lastFindingIndex(findings)] = {
      code: "FINDINGS_LIMIT_REACHED",
      severity: "BLOCKING",
      blocking: true,
      path: "findings",
      artifactType: "SPEC",
      message: `The evaluator reached its deterministic ${MISSION_SPEC_LIMITS.findings}-finding limit.`,
      nextAction: "Resolve the reported findings before evaluating again.",
    };
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || (left.artifactId ?? "").localeCompare(right.artifactId ?? ""));
  return {
    rulesetVersion: MISSION_SPEC_RULESET_VERSION,
    result: findings.some((finding) => finding.blocking) ? "FAIL" : "PASS",
    findings,
  };
}

function lastFindingIndex(findings: MissionSpecFinding[]) {
  return Math.max(0, findings.length - 1);
}

export interface SpecBoundPlanAssertion {
  assertionId: string;
  title: string;
  outcome: string;
  passCondition: string;
  requiredEvidence: string;
  sourceRequirementIds?: string[];
  sourceAcceptanceExpectationIds?: string[];
  sourceVerificationExpectationIds?: string[];
}

export interface SpecBoundPlanBlueprint {
  id: string;
  title: string;
  desiredOutcome: string;
  assertionIds: string[];
  constraints?: string[];
}

export function specVerificationCheckId(verificationExpectationId: string) {
  return `spec:${verificationExpectationId}`;
}

const NEGATED_SCOPE_PREFIX = /(?:\bdo not|\bdoes not|\bdid not|\bmust not|\bshall not|\bwill not|\bnever|\bwithout|\bavoid(?:s|ed|ing)?|\bexclude(?:s|d|ing)?|\bprohibit(?:s|ed|ing)?|\bprevent(?:s|ed|ing)?|\bno)\s+(?:\w+\s+){0,4}$/;
const NEGATED_SCOPE_SUFFIX = /^(?:\s+\w+){0,3}\s+(?:is|are|remains?|remain)\s+(?:explicitly\s+)?(?:out of scope|excluded|prohibited|not permitted)\b/;

/**
 * Exact non-goal text is useful as a conservative signal, but Plans also repeat
 * non-goals as explicit guardrails. Treat an occurrence as included scope only
 * when it is not locally negated or marked out of scope.
 */
export function planIncludesExcludedScope(planText: string, nonGoalDescription: string): boolean {
  const normalizedPlan = canonicalText(planText);
  const excluded = canonicalText(nonGoalDescription);
  if (excluded.length < 8) return false;

  let offset = 0;
  while (offset < normalizedPlan.length) {
    const index = normalizedPlan.indexOf(excluded, offset);
    if (index < 0) return false;
    const prefix = normalizedPlan.slice(Math.max(0, index - 80), index);
    const suffix = normalizedPlan.slice(index + excluded.length, index + excluded.length + 80);
    if (!NEGATED_SCOPE_PREFIX.test(prefix) && !NEGATED_SCOPE_SUFFIX.test(suffix)) return true;
    offset = index + excluded.length;
  }
  return false;
}

export function buildRequirementsCoverageProjection(input: {
  spec: MissionSpecContent;
  assertions: SpecBoundPlanAssertion[];
  workOrderBlueprints: SpecBoundPlanBlueprint[];
}): RequirementsCoverageProjection {
  const requirements = [...input.spec.requirements, ...input.spec.nonFunctionalRequirements];
  const rows = requirements.sort(compareById).map((requirement) => {
    const acceptanceExpectationIds = input.spec.acceptanceExpectations
      .filter((item) => item.requirementIds.includes(requirement.id))
      .map((item) => item.id)
      .sort();
    const planAssertions = input.assertions
      .filter((assertion) => assertion.sourceRequirementIds?.includes(requirement.id))
      .sort((left, right) => left.assertionId.localeCompare(right.assertionId));
    const planAssertionIds = planAssertions.map((item) => item.assertionId);
    const workOrderBlueprintIds = input.workOrderBlueprints
      .filter((blueprint) => blueprint.assertionIds.some((assertionId) => planAssertionIds.includes(assertionId)))
      .map((item) => item.id)
      .sort();
    const acceptanceCriterionIds = [...planAssertionIds];
    const verificationCheckIds = sortedStrings(planAssertions.flatMap((assertion) =>
      (assertion.sourceVerificationExpectationIds ?? []).map(specVerificationCheckId)
    ));
    return {
      specRequirementId: requirement.id,
      acceptanceExpectationIds,
      planAssertionIds,
      workOrderBlueprintIds,
      acceptanceCriterionIds,
      verificationCheckIds,
      complete: acceptanceExpectationIds.length > 0
        && planAssertionIds.length > 0
        && workOrderBlueprintIds.length > 0
        && acceptanceCriterionIds.length > 0
        && verificationCheckIds.length > 0,
    };
  });
  const projection = {
    schemaVersion: REQUIREMENTS_COVERAGE_SCHEMA_VERSION,
    rows,
    complete: rows.length > 0 && rows.every((row) => row.complete),
  };
  return {
    ...projection,
    digest: `sha256:${canonicalHash(projection)}`,
  };
}

export function analyzeSpecPlanConsistency(input: {
  spec: MissionSpecContent;
  assertions: SpecBoundPlanAssertion[];
  workOrderBlueprints: SpecBoundPlanBlueprint[];
  planSummary: string;
  repositoryId?: string;
}): { coverage: RequirementsCoverageProjection; findings: MissionSpecFinding[]; digest: string } {
  const coverage = buildRequirementsCoverageProjection(input);
  const findings: MissionSpecFinding[] = [];
  for (const row of coverage.rows) {
    if (row.planAssertionIds.length === 0) findings.push({ code: "SPEC_PLAN_REQUIREMENT_UNCOVERED", severity: "BLOCKING", blocking: true, path: `coverage.${row.specRequirementId}`, artifactType: "PLAN", artifactId: row.specRequirementId, message: `${row.specRequirementId} has no Plan assertion.`, nextAction: "Map the requirement to at least one Plan assertion." });
    if (row.planAssertionIds.length > 0 && row.workOrderBlueprintIds.length === 0) findings.push({ code: "PLAN_WORK_ORDER_COVERAGE_MISSING", severity: "BLOCKING", blocking: true, path: `coverage.${row.specRequirementId}`, artifactType: "WORK_ORDER", artifactId: row.specRequirementId, message: `${row.specRequirementId} has no WorkOrder blueprint.`, nextAction: "Link its Plan assertion to at least one WorkOrder blueprint." });
    if (row.planAssertionIds.length > 0 && row.verificationCheckIds.length === 0) findings.push({ code: "ACCEPTANCE_VERIFICATION_COVERAGE_MISSING", severity: "BLOCKING", blocking: true, path: `coverage.${row.specRequirementId}`, artifactType: "PLAN", artifactId: row.specRequirementId, message: `${row.specRequirementId} has no evidence-bearing verification check.`, nextAction: "Map its Plan assertion to a Spec verification expectation." });
  }
  const requirementIds = new Set([...input.spec.requirements, ...input.spec.nonFunctionalRequirements].map((item) => item.id));
  const acceptanceIds = new Set(input.spec.acceptanceExpectations.map((item) => item.id));
  const verificationIds = new Set(input.spec.verificationExpectations.map((item) => item.id));
  for (const assertion of input.assertions) {
    for (const id of assertion.sourceRequirementIds ?? []) if (!requirementIds.has(id)) findings.push({ code: "PLAN_SPEC_REQUIREMENT_UNKNOWN", severity: "BLOCKING", blocking: true, path: `assertions.${assertion.assertionId}.sourceRequirementIds`, artifactType: "PLAN", artifactId: assertion.assertionId, message: `${assertion.assertionId} references unknown requirement ${id}.`, nextAction: "Use a requirement ID from the bound Spec revision." });
    for (const id of assertion.sourceAcceptanceExpectationIds ?? []) if (!acceptanceIds.has(id)) findings.push({ code: "PLAN_SPEC_ACCEPTANCE_UNKNOWN", severity: "BLOCKING", blocking: true, path: `assertions.${assertion.assertionId}.sourceAcceptanceExpectationIds`, artifactType: "PLAN", artifactId: assertion.assertionId, message: `${assertion.assertionId} references unknown acceptance expectation ${id}.`, nextAction: "Use an acceptance expectation ID from the bound Spec revision." });
    for (const id of assertion.sourceVerificationExpectationIds ?? []) if (!verificationIds.has(id)) findings.push({ code: "PLAN_SPEC_VERIFICATION_UNKNOWN", severity: "BLOCKING", blocking: true, path: `assertions.${assertion.assertionId}.sourceVerificationExpectationIds`, artifactType: "PLAN", artifactId: assertion.assertionId, message: `${assertion.assertionId} references unknown verification expectation ${id}.`, nextAction: "Use a verification expectation ID from the bound Spec revision." });
  }
  if (!input.repositoryId || input.repositoryId !== input.spec.repositoryScope.repositoryId) findings.push({ code: "PLAN_REPOSITORY_SCOPE_MISMATCH", severity: "BLOCKING", blocking: true, path: "repositoryScope.repositoryId", artifactType: "LINEAGE", message: "The Plan repository does not match the bound Spec repository scope.", nextAction: "Create a new Plan revision using the bound Spec repository." });
  const planText = canonicalText([input.planSummary, ...input.workOrderBlueprints.flatMap((item) => [item.title, item.desiredOutcome, ...(item.constraints ?? [])])].join(" "));
  for (const nonGoal of input.spec.nonGoals) {
    if (planIncludesExcludedScope(planText, nonGoal.description)) findings.push({ code: "PLAN_NON_GOAL_VIOLATION", severity: "BLOCKING", blocking: true, path: `nonGoals.${nonGoal.id}`, artifactType: "PLAN", artifactId: nonGoal.id, message: `The Plan appears to include excluded scope ${nonGoal.id}.`, nextAction: "Remove the excluded scope or finalize a new Spec revision." });
  }
  findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path));
  const digestInput = { coverageDigest: coverage.digest, findings };
  return { coverage, findings, digest: `sha256:${canonicalHash(digestInput)}` };
}
