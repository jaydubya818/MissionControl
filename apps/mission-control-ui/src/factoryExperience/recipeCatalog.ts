export type FactoryExperienceLevel = "basic" | "intermediate" | "advanced";
export type FactoryPhaseKind = "human" | "agent" | "code";
export type ModelRoutingIntent =
  | "cheapest-capable"
  | "balanced"
  | "high-confidence"
  | "frontier";

export interface FactoryRecipePhase {
  id: string;
  label: string;
  kind: FactoryPhaseKind;
  owner: string;
}

export interface FactoryRecipe {
  id: string;
  name: string;
  shortDescription: string;
  useWhen: string;
  timeEstimate: string;
  costPosture: string;
  roles: string[];
  deterministicGates: string[];
  verificationLevel: string;
  phases: FactoryRecipePhase[];
  workflowCandidates: string[];
  modelRoutingIntent: ModelRoutingIntent;
  contextStrategy: string;
  reviewStrategy: string;
  testStrategy: string;
  maxCorrectiveIterations: number;
  mutatesRepository: boolean;
  complexity: "Focused" | "Standard" | "Comprehensive";
  specTemplateVersion: number;
  checklistVersion: number;
  requiredSpecSectionIds: string[];
  checklistReferences: Array<{
    id: string;
    classification:
      | "REQUIREMENTS_QUALITY"
      | "GOVERNANCE_CONSTRAINT"
      | "EVIDENCE_BEARING_VERIFICATION";
  }>;
  specProfileDefaults: {
    repositoryType: "APPLICATION" | "LIBRARY" | "SERVICE" | "MONOREPO" | "OTHER";
    teamType: "PRODUCT" | "PLATFORM" | "INFRASTRUCTURE" | "OTHER";
    riskProfile: "LOW" | "STANDARD" | "HIGH" | "REGULATED";
    productType: "SAAS" | "MARKETPLACE" | "INTERNAL_TOOL" | "API" | "OTHER";
  };
}

export interface FactoryRecipeRecommendation {
  recipeId: string;
  rationale: string;
  signals: string[];
}

const human = (
  id: string,
  label: string,
  owner = "Operator",
): FactoryRecipePhase => ({ id, label, kind: "human", owner });
const agent = (
  id: string,
  label: string,
  owner: string,
): FactoryRecipePhase => ({ id, label, kind: "agent", owner });
const code = (
  id: string,
  label: string,
  owner: string,
): FactoryRecipePhase => ({ id, label, kind: "code", owner });

const SPEC_INTAKE_DEFAULTS: Pick<
  FactoryRecipe,
  | "specTemplateVersion"
  | "checklistVersion"
  | "requiredSpecSectionIds"
  | "checklistReferences"
  | "specProfileDefaults"
> = {
  specTemplateVersion: 1,
  checklistVersion: 1,
  requiredSpecSectionIds: [
    "OUTCOME",
    "PERSONAS",
    "USER_STORIES",
    "REQUIREMENTS",
    "ACCEPTANCE_EXPECTATIONS",
    "VERIFICATION_EXPECTATIONS",
    "DEFINITION_OF_DONE",
    "NON_GOALS",
    "CONSTRAINTS",
    "RISKS",
    "REPOSITORY_SCOPE",
    "SOURCES",
  ],
  checklistReferences: [
    { id: "RQ-CLEAR-001", classification: "REQUIREMENTS_QUALITY" },
    { id: "GOV-SCOPE-001", classification: "GOVERNANCE_CONSTRAINT" },
    { id: "EV-PROOF-001", classification: "EVIDENCE_BEARING_VERIFICATION" },
  ],
  specProfileDefaults: {
    repositoryType: "APPLICATION",
    teamType: "PRODUCT",
    riskProfile: "STANDARD",
    productType: "SAAS",
  },
};

export const FACTORY_RECIPES: FactoryRecipe[] = [
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "scout",
    name: "Scout",
    shortDescription:
      "Investigate the repository and return a cited, read-only finding packet.",
    useWhen:
      "You need facts, impact analysis, or root-cause context before deciding what to build.",
    timeEstimate: "Shortest · one read-only investigation",
    costPosture:
      "Low · one judgment phase; actual usage is recorded at run time",
    roles: ["Scout"],
    deterministicGates: [
      "Repository remains unchanged",
      "Structured findings parse",
    ],
    verificationLevel: "Read-only scope and artifact checks",
    phases: [
      human("request", "Request"),
      agent("scout", "Scout", "Scout"),
      code("scope-check", "Scope check", "Repository guard"),
    ],
    workflowCandidates: ["continuous-research", "loop-engineering"],
    modelRoutingIntent: "cheapest-capable",
    contextStrategy: "Targeted repository retrieval",
    reviewStrategy: "Operator reviews cited findings",
    testStrategy: "No mutation; verify repository state and result schema",
    maxCorrectiveIterations: 1,
    mutatesRepository: false,
    complexity: "Focused",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "plan",
    name: "Plan",
    shortDescription:
      "Turn a request into an implementation plan without modifying code.",
    useWhen:
      "The work needs sequencing, acceptance criteria, risk analysis, or an approval-ready design.",
    timeEstimate: "Short · one planning pass plus plan checks",
    costPosture:
      "Low · planner usage only; actual usage is recorded at run time",
    roles: ["Planner"],
    deterministicGates: [
      "Plan schema",
      "Required sections",
      "Repository remains unchanged",
    ],
    verificationLevel: "Plan contract validation",
    phases: [
      human("request", "Request"),
      agent("plan", "Plan", "Planner"),
      code("plan-gates", "Plan gates", "Plan validator"),
      human("plan-review", "Plan review"),
    ],
    workflowCandidates: ["feature-dev"],
    modelRoutingIntent: "balanced",
    contextStrategy: "Repository context plus explicit sources of truth",
    reviewStrategy: "Human plan approval",
    testStrategy: "Validate plan structure and referenced commands",
    maxCorrectiveIterations: 1,
    mutatesRepository: false,
    complexity: "Focused",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "build",
    name: "Build",
    shortDescription:
      "Implement a small, well-understood change and run the mandatory baseline checks.",
    useWhen:
      "The solution is obvious, scope is narrow, and a separate planning phase adds little value.",
    timeEstimate: "Short · one build pass plus mandatory gates",
    costPosture:
      "Low to moderate · one builder; pricing comes from the active model route",
    roles: ["Builder"],
    deterministicGates: [
      "Formatting",
      "Typecheck",
      "Required repository checks",
    ],
    verificationLevel: "Deterministic quality contract",
    phases: [
      human("request", "Request"),
      agent("build", "Build", "Builder"),
      code("quality", "Quality gates", "Repository checks"),
      human("review", "Review result"),
    ],
    workflowCandidates: ["feature-dev", "bug-fix"],
    modelRoutingIntent: "balanced",
    contextStrategy: "Scoped implementation context",
    reviewStrategy: "Human reviews the change and evidence",
    testStrategy: "Repository-defined mandatory checks",
    maxCorrectiveIterations: 1,
    mutatesRepository: true,
    complexity: "Focused",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "quality",
    name: "Quality",
    shortDescription:
      "Run known deterministic quality checks and return structured failures.",
    useWhen:
      "The implementation already exists and the question is whether the repository gates pass.",
    timeEstimate: "Shortest · bounded by repository commands",
    costPosture:
      "Deterministic-first · no model cost unless governed remediation is requested",
    roles: [],
    deterministicGates: ["Lint", "Format", "Typecheck", "Tests", "Build"],
    verificationLevel: "Deterministic command evidence",
    phases: [
      human("request", "Request"),
      code("quality", "Quality gates", "Repository checks"),
      human("review", "Review result"),
    ],
    workflowCandidates: ["quality-audit"],
    modelRoutingIntent: "cheapest-capable",
    contextStrategy: "No model context for a passing run",
    reviewStrategy: "Human reviews failures or the green receipt",
    testStrategy: "Run configured commands without model interpretation",
    maxCorrectiveIterations: 0,
    mutatesRepository: false,
    complexity: "Focused",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "build-test",
    name: "Build + Test",
    shortDescription:
      "Implement, test deterministically, and permit a bounded repair cycle.",
    useWhen:
      "The change is understood but regression risk requires explicit test evidence.",
    timeEstimate: "Medium · build, test, and up to two repairs",
    costPosture: "Moderate · builder usage plus deterministic compute",
    roles: ["Builder"],
    deterministicGates: [
      "Lint",
      "Typecheck",
      "Unit tests",
      "Integration tests when required",
      "Build",
    ],
    verificationLevel: "Deterministic tests plus exact evidence",
    phases: [
      human("request", "Request"),
      agent("build", "Build", "Builder"),
      code("test", "Test", "Test runner"),
      agent("repair", "Bounded repair", "Builder"),
      code("retest", "Retest", "Test runner"),
      human("review", "Review result"),
    ],
    workflowCandidates: ["bug-fix", "feature-dev"],
    modelRoutingIntent: "balanced",
    contextStrategy: "Scoped context plus structured test failure handoff",
    reviewStrategy: "Human reviews the change and test evidence",
    testStrategy: "Run tests directly; hand failures to the builder",
    maxCorrectiveIterations: 2,
    mutatesRepository: true,
    complexity: "Standard",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "build-review",
    name: "Build + Review",
    shortDescription:
      "Implement, run independent review, and allow a bounded revision.",
    useWhen:
      "Meeting the request precisely matters more than a broad planning phase.",
    timeEstimate: "Medium · build, review, and up to one revision",
    costPosture: "Moderate · builder and independent reviewer usage",
    roles: ["Builder", "Reviewer"],
    deterministicGates: [
      "Formatting",
      "Typecheck",
      "Required repository checks",
    ],
    verificationLevel:
      "Independent review recommendation plus deterministic evidence",
    phases: [
      human("request", "Request"),
      agent("build", "Build", "Builder"),
      code("quality", "Quality gates", "Repository checks"),
      agent("review", "Independent review", "Reviewer"),
      agent("revise", "Bounded revision", "Builder"),
      human("review-result", "Review result"),
    ],
    workflowCandidates: ["feature-dev", "code-review"],
    modelRoutingIntent: "high-confidence",
    contextStrategy: "Builder context plus review packet",
    reviewStrategy: "Independent reviewer; human retains acceptance",
    testStrategy: "Mandatory repository checks before review",
    maxCorrectiveIterations: 1,
    mutatesRepository: true,
    complexity: "Standard",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "plan-build-test",
    name: "Plan + Build + Test",
    shortDescription:
      "Plan the work, implement it, run deterministic gates, and return review-ready evidence.",
    useWhen:
      "Most moderate product and engineering changes with known risk boundaries.",
    timeEstimate: "Medium · standard governed delivery path",
    costPosture:
      "Moderate · planner and builder usage; actual estimate is set on the Plan",
    roles: ["Planner", "Builder"],
    deterministicGates: ["Plan checks", "Lint", "Typecheck", "Tests", "Build"],
    verificationLevel:
      "Quality contract and independent checks required by policy",
    phases: [
      human("request", "Request"),
      agent("plan", "Plan", "Planner"),
      human("approve-plan", "Approve plan"),
      agent("build", "Build", "Builder"),
      code("test", "Test", "Test runner"),
      agent("repair", "Bounded repair", "Builder"),
      code("verify", "Verification adapters", "Verifier"),
      human("accept", "Accept result"),
    ],
    workflowCandidates: ["feature-dev"],
    modelRoutingIntent: "balanced",
    contextStrategy:
      "Versioned planning context and scoped implementation package",
    reviewStrategy: "Plan approval and human acceptance",
    testStrategy: "Deterministic gates with bounded remediation",
    maxCorrectiveIterations: 2,
    mutatesRepository: true,
    complexity: "Standard",
  },
  {
    ...SPEC_INTAKE_DEFAULTS,
    id: "full-sdlc",
    specProfileDefaults: {
      ...SPEC_INTAKE_DEFAULTS.specProfileDefaults,
      riskProfile: "HIGH",
    },
    name: "Full SDLC",
    shortDescription:
      "Research, plan, build, test, independently review, verify, publish a candidate, and wait for human acceptance.",
    useWhen:
      "The request is ambiguous, high-risk, cross-cutting, security-sensitive, or changes runtime and acceptance boundaries.",
    timeEstimate: "Longest · comprehensive governed delivery path",
    costPosture:
      "Highest · multiple judgment phases; bounded by the approved Plan and Factory budget",
    roles: ["Scout", "Planner", "Builder", "Reviewer", "Independent verifier"],
    deterministicGates: [
      "Plan checks",
      "Lint",
      "Format",
      "Typecheck",
      "Tests",
      "Schema checks",
      "Build",
      "Policy gates",
    ],
    verificationLevel:
      "Independent verification over the exact candidate subject",
    phases: [
      human("request", "Request"),
      agent("scout", "Scout", "Scout"),
      agent("plan", "Plan", "Planner"),
      human("approve-plan", "Approve plan"),
      agent("build", "Build", "Builder"),
      code("test", "Deterministic gates", "Repository checks"),
      agent("review", "Independent review", "Reviewer"),
      code("verify", "Exact-subject verification", "Verifier"),
      code("publish", "Candidate publication", "GitHub App"),
      human("accept", "Accept and merge"),
    ],
    workflowCandidates: ["feature-dev", "security-audit", "bug-fix"],
    modelRoutingIntent: "high-confidence",
    contextStrategy:
      "Versioned research, Plan, Context Package, and typed evidence",
    reviewStrategy: "Independent review and human acceptance",
    testStrategy:
      "Full deterministic contract with bounded repair and revision",
    maxCorrectiveIterations: 2,
    mutatesRepository: true,
    complexity: "Comprehensive",
  },
];

const RECIPE_BY_ID = new Map(
  FACTORY_RECIPES.map((recipe) => [recipe.id, recipe]),
);

export function getFactoryRecipe(
  recipeId?: string | null,
): FactoryRecipe | undefined {
  return recipeId ? RECIPE_BY_ID.get(recipeId) : undefined;
}

export function recommendFactoryRecipe(
  request: string,
): FactoryRecipeRecommendation | null {
  const normalized = request.trim().toLowerCase();
  if (normalized.length < 8) return null;

  const matches = (pattern: RegExp) => pattern.test(normalized);
  const mutationVerb = /\b(add|build|change|create|delete|edit|fix|implement|migrate|modify|refactor|remove|rename|repair|update|write|deploy|release|publish|merge|approve)\b/;
  const asksForMutation = normalized
    .split(/[.!?;,\n]|\b(?:and|then|but|also|(?:before|while)\s+you)\b/)
    .some((part) => {
      const clause = part.trim().replace(
        /^(?:(?:please|can you|could you|would you)\s+)+/,
        "",
      );
      if (/^(?:do not|don['’]t|never|without)\b/.test(clause)) return false;
      if (
        /^(?:investigate|inspect|research|audit|analy[sz]e|explain|understand|find root cause|assess|how|why|what|where|which)\b/.test(clause)
      ) {
        const directive = clause.slice(clause.indexOf(":") + 1).trim().replace(
          /^(?:(?:please|can you|could you|would you)\s+)+/,
          "",
        );
        return clause.includes(":") && mutationVerb.exec(directive)?.index === 0;
      }
      if (
        /^(?:(?:write|create|draft|prepare)\s+(?:(?:an?|the)\s+)?(?:(?:implementation|project)\s+)?(?:plan|specification|design proposal)|plan|design)\b/.test(clause)
      ) return false;
      return mutationVerb.test(
        clause.replace(/\bbuild check\b/g, ""),
      );
    });

  const asksForPlanDeliverable = matches(
    /\b(implementation plan|project plan|write (?:a )?plan|create (?:a )?plan|plan only|specification|design proposal)\b/,
  );
  if (asksForPlanDeliverable && !asksForMutation) {
    return {
      recipeId: "plan",
      rationale:
        "The desired output is a plan or design, so Mission Control can stop before repository mutation.",
      signals: ["planning deliverable", "human review before execution"],
    };
  }

  const asksForResearch = matches(
    /\b(investigate|inspect|research|audit|analy[sz]e|explain|understand|find root cause|assess)\b/,
  );
  if (asksForResearch && !asksForMutation) {
    return {
      recipeId: "scout",
      rationale:
        "The request asks for repository understanding without a code change, so a read-only Scout is the cheapest sufficient workflow.",
      signals: ["read-only investigation", "no mutation requested"],
    };
  }

  if (
    matches(/\b(plan|spec|design|proposal|approach|break down)\b/) &&
    !asksForMutation
  ) {
    return {
      recipeId: "plan",
      rationale:
        "The desired output is a plan or design, so Mission Control can stop before repository mutation.",
      signals: ["planning deliverable", "human review before execution"],
    };
  }

  const qualityOnly =
    matches(
      /\b(lint|format|typecheck|type check|run tests?|test suite|quality checks?|build check)\b/,
    ) && !asksForMutation;
  if (qualityOnly) {
    return {
      recipeId: "quality",
      rationale:
        "The request names known repository checks and no remediation, so deterministic execution is sufficient unless a gate fails.",
      signals: ["known commands", "deterministic-first"],
    };
  }

  const highRisk = matches(
    /\b(security|auth(?:entication|orization)?|permission|secret|payment|schema|migration|runtime|policy|acceptance|verification|production|deploy|release|data loss|breaking change)\b/,
  );
  if (highRisk) {
    return {
      recipeId: "full-sdlc",
      rationale:
        "The request touches a safety, runtime, data, or acceptance boundary, so it needs planning, independent review, and exact-subject verification.",
      signals: [
        "governance-sensitive change",
        "independent verification required",
      ],
    };
  }

  const obviousSmallChange = matches(
    /\b(tiny|small|simple|obvious|one-line|single file|typo|rename)\b/,
  );
  if (obviousSmallChange) {
    return {
      recipeId: "build-test",
      rationale:
        "The change is described as small and concrete, but deterministic tests should still prove the result.",
      signals: ["small implementation", "test evidence required"],
    };
  }

  const docsOnly =
    matches(/\b(readme|documentation|docs|copy|typo|comment)\b/) &&
    !matches(/\b(api|schema|runtime|security)\b/);
  if (docsOnly) {
    return {
      recipeId: "build",
      rationale:
        "This is a narrow documentation change; one bounded builder plus repository checks is sufficient.",
      signals: ["documentation-only", "narrow scope"],
    };
  }

  const ambiguous =
    matches(
      /\b(ambiguous|explore|multiple|cross-cutting|unknown|not sure|figure out)\b/,
    ) || normalized.split(/\s+/).length > 90;
  if (ambiguous) {
    return {
      recipeId: "full-sdlc",
      rationale:
        "The request is broad or ambiguous, so research, planning, review, and independent verification reduce rework and hidden risk.",
      signals: ["broad scope", "research before mutation"],
    };
  }

  return {
    recipeId: "plan-build-test",
    rationale:
      "This is a moderate implementation request; a reviewed plan, bounded build, and deterministic tests are the simplest sufficient governed path.",
    signals: ["moderate implementation", "standard governed delivery"],
  };
}

export function resolveRecipeWorkflow<
  T extends { workflowId: string; name: string },
>(recipeId: string | undefined, workflows: T[]): T | undefined {
  const recipe = getFactoryRecipe(recipeId);
  if (!recipe) return undefined;
  for (const candidate of recipe.workflowCandidates) {
    const exact = workflows.find(
      (workflow) => workflow.workflowId === candidate,
    );
    if (exact) return exact;
  }
  const searchable = recipe.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return workflows.find((workflow) => {
    const haystack = `${workflow.workflowId} ${workflow.name}`.toLowerCase();
    return searchable.every((token) => haystack.includes(token));
  });
}

export function factoryExperienceMetadata(input: {
  recommendation: FactoryRecipeRecommendation;
  selectedRecipeId: string;
  routingIntent?: ModelRoutingIntent;
  repositoryIntent?: string;
  executionEnvironment?: string;
}) {
  const recipe = getFactoryRecipe(input.selectedRecipeId);
  if (!recipe) throw new Error("Selected Factory recipe is not available.");
  return {
    schemaVersion: 1,
    recommendedRecipeId: input.recommendation.recipeId,
    recommendationRationale: input.recommendation.rationale,
    recommendationSignals: input.recommendation.signals,
    selectedRecipeId: recipe.id,
    operatorOverrodeRecommendation: recipe.id !== input.recommendation.recipeId,
    workflowCandidates: recipe.workflowCandidates,
    modelRoutingIntent: input.routingIntent ?? recipe.modelRoutingIntent,
    repositoryIntent: input.repositoryIntent,
    executionEnvironment: input.executionEnvironment ?? "POLICY_SELECTED",
    deterministicGateIntent: recipe.deterministicGates,
    verificationLevel: recipe.verificationLevel,
    requestedAt: Date.now(),
  };
}

export function recipeIdFromTrace(trace: {
  tags?: string[];
  metadata?: unknown;
}): string | undefined {
  const metadata =
    trace.metadata && typeof trace.metadata === "object"
      ? (trace.metadata as Record<string, unknown>)
      : {};
  const factoryExperience =
    metadata.factoryExperience && typeof metadata.factoryExperience === "object"
      ? (metadata.factoryExperience as Record<string, unknown>)
      : {};
  const metadataId = factoryExperience.selectedRecipeId ?? metadata.recipeId;
  if (typeof metadataId === "string" && getFactoryRecipe(metadataId))
    return metadataId;
  const tag = trace.tags?.find((value) => value.startsWith("recipe:"));
  const tagId = tag?.slice("recipe:".length);
  return getFactoryRecipe(tagId)?.id;
}
