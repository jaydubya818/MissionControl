import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { canonicalHash } from "@mission-control/shared";

export const RESEARCH_PACKET_SCHEMA_ID = "repository-research-packet/v1";
export const PLAN_CANDIDATE_SCHEMA_ID = "mission-plan-candidate/v1";

const stringArray = (maxItems: number, maxLength = 2_000) => ({
  type: "array",
  maxItems,
  items: { type: "string", maxLength },
});

export const RESEARCH_PACKET_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "files", "citations", "findings", "unknowns"],
  properties: {
    schema: { type: "string", enum: [RESEARCH_PACKET_SCHEMA_ID] },
    files: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "reason"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 1_000 },
          reason: { type: "string", minLength: 1, maxLength: 1_000 },
        },
      },
    },
    citations: {
      type: "array",
      minItems: 1,
      maxItems: 300,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "startLine", "endLine"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          path: { type: "string", minLength: 1, maxLength: 1_000 },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 },
        },
      },
    },
    findings: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail", "citationIds"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          detail: { type: "string", minLength: 1, maxLength: 4_000 },
          citationIds: stringArray(30, 100),
        },
      },
    },
    unknowns: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "impact"],
        properties: {
          question: { type: "string", minLength: 1, maxLength: 1_000 },
          impact: { type: "string", minLength: 1, maxLength: 2_000 },
        },
      },
    },
  },
};

const independentVerificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executable", "args", "category", "commandClass", "evidenceCategory", "timeoutMs"],
  properties: {
    executable: { type: "string", minLength: 1, maxLength: 500 },
    args: stringArray(100),
    category: { type: "string", enum: ["BUILD", "TYPECHECK", "UNIT_TEST", "INTEGRATION_TEST", "CONTRACT_TEST", "SECURITY"] },
    commandClass: { type: "string", enum: ["BUILD", "TYPECHECK", "TEST", "LINT", "SECURITY_SCAN", "DEPENDENCY_SCAN"] },
    evidenceCategory: { type: "string", enum: ["TEST_RESULT", "BUILD_RESULT", "STATIC_ANALYSIS", "SECURITY_SCAN", "COMMAND_LOG", "BROWSER_RESULT"] },
    timeoutMs: { type: "integer", minimum: 1_000, maximum: 1_800_000 },
  },
};

const implementationPolicySchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["allowedCommands", "independentVerification", "maxFilesChanged", "maxLinesChanged", "maxCostUsd", "maxAttempts", "timeoutMinutes", "stopCondition"],
  properties: {
    allowedCommands: stringArray(20, 1_000),
    independentVerification: { ...independentVerificationSchema, type: ["object", "null"] },
    maxFilesChanged: { type: ["integer", "null"], minimum: 1, maximum: 500 },
    maxLinesChanged: { type: ["integer", "null"], minimum: 1, maximum: 100_000 },
    maxCostUsd: { type: ["number", "null"], minimum: 0 },
    maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
    timeoutMinutes: { type: "integer", minimum: 1, maximum: 480 },
    stopCondition: { type: "string", minLength: 1, maxLength: 4_000 },
  },
};

export const PLAN_CANDIDATE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "summary", "rollbackApproach", "estimatedCostUsd", "workOrderBlueprints", "assertions"],
  properties: {
    schema: { type: "string", enum: [PLAN_CANDIDATE_SCHEMA_ID] },
    summary: { type: "string", minLength: 1, maxLength: 8_000 },
    rollbackApproach: { type: "string", minLength: 1, maxLength: 4_000 },
    estimatedCostUsd: { type: ["number", "null"], minimum: 0 },
    workOrderBlueprints: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "title", "desiredOutcome", "workflowId", "workflowVersion", "sequence",
          "role", "isMutating", "priority", "riskLevel", "modelComplexity", "branchStrategy",
          "constraints", "requiredApprovals", "estimatedCostUsd", "implementationPolicy",
          "dependsOnBlueprintIds", "assertionIds",
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          desiredOutcome: { type: "string", minLength: 1, maxLength: 4_000 },
          workflowId: { type: "string", minLength: 1, maxLength: 200 },
          workflowVersion: { type: "integer", minimum: 1 },
          sequence: { type: "integer", minimum: 1, maximum: 30 },
          role: { type: "string", enum: ["WORKER", "VALIDATOR"] },
          isMutating: { type: "boolean" },
          priority: { type: "integer", enum: [1, 2, 3, 4] },
          riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          modelComplexity: { type: ["string", "null"], enum: ["SMALL", "STANDARD", "LARGE", null] },
          branchStrategy: { type: ["string", "null"], maxLength: 500 },
          constraints: stringArray(100),
          requiredApprovals: stringArray(50, 500),
          estimatedCostUsd: { type: ["number", "null"], minimum: 0 },
          implementationPolicy: implementationPolicySchema,
          dependsOnBlueprintIds: stringArray(30, 100),
          assertionIds: stringArray(100, 100),
        },
      },
    },
    assertions: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "assertionId", "title", "outcome", "verificationMethod", "passCondition",
          "requiredEvidence", "requiresIndependentValidation", "waiverAllowed",
          "sourceRequirementIds", "sourceAcceptanceExpectationIds", "sourceVerificationExpectationIds",
        ],
        properties: {
          assertionId: { type: "string", minLength: 1, maxLength: 100 },
          title: { type: "string", minLength: 1, maxLength: 500 },
          outcome: { type: "string", minLength: 1, maxLength: 4_000 },
          verificationMethod: { type: "string", enum: ["COMMAND", "TEST", "BROWSER", "MANUAL", "CHECKLIST"] },
          passCondition: { type: "string", minLength: 1, maxLength: 4_000 },
          requiredEvidence: { type: "string", minLength: 1, maxLength: 4_000 },
          requiresIndependentValidation: { type: "boolean" },
          waiverAllowed: { type: "boolean" },
          sourceRequirementIds: stringArray(100, 100),
          sourceAcceptanceExpectationIds: stringArray(100, 100),
          sourceVerificationExpectationIds: stringArray(100, 100),
        },
      },
    },
  },
};

export interface PlanningResearchPacket {
  schema: typeof RESEARCH_PACKET_SCHEMA_ID;
  repository: string;
  sha: string;
  files: Array<{ path: string; reason: string }>;
  citations: Array<{ id: string; path: string; startLine: number; endLine: number; excerpt: string }>;
  findings: Array<{ id: string; title: string; detail: string; citationIds: string[] }>;
  unknowns: Array<{ question: string; impact: string }>;
  digest: string;
}

export function researchPrompt(inputSnapshot: unknown) {
  return [
    "You are the repository-research phase of a governed Mission Planning Agent.",
    "Inspect the exact checkout available in the current working directory. Use repository-local read commands only.",
    "Do not use web search, network fetches, external memory, provider APIs, file writes, Git mutation, or process backgrounding.",
    "Every material finding must cite real repository-relative file paths and exact line ranges that you inspected.",
    "Keep citation ranges focused. endLine must be greater than or equal to startLine, and both endpoints must exist in the cited file.",
    "Report unknowns explicitly. Do not invent files, behavior, architecture, commands, or capabilities.",
    "Return only the JSON object required by repository-research-packet/v1.",
    "",
    "Frozen planning input:",
    JSON.stringify(inputSnapshot, null, 2),
  ].join("\n");
}

export function generationPrompt(inputSnapshot: unknown, researchPacket: PlanningResearchPacket) {
  return [
    "You are the candidate-generation phase of a governed Mission Planning Agent.",
    "Create an editable Mission Plan candidate from the frozen Mission intent and the validated exact-SHA repository research packet below.",
    "Do not use web search, network fetches, external memory, provider APIs, file writes, Git mutation, or process backgrounding.",
    "Use only workflow IDs and versions present in the frozen input. Keep WorkOrders bounded, sequenced, dependency-valid, and directly tied to assertions.",
    "Every mutating WorkOrder needs a concrete branch strategy, approved verification commands, independent verification, bounded files/lines/cost/attempts/time, and a stop condition.",
    "Validator WorkOrders must be read-only and depend on an earlier WorkOrder. Never grant the planner submission, approval, execution, verification, publication, merge, or acceptance authority.",
    "Use null for optional scalar/object fields required by the output contract. Return only mission-plan-candidate/v1 JSON.",
    "",
    "Frozen planning input:",
    JSON.stringify(inputSnapshot, null, 2),
    "",
    "Validated repository research packet:",
    JSON.stringify(researchPacket, null, 2),
  ].join("\n");
}

export async function validateResearchOutput(input: {
  output: string;
  worktree: string;
  repository: string;
  sha: string;
}): Promise<PlanningResearchPacket> {
  const value = parseObject(input.output, "Repository research output");
  if (value.schema !== RESEARCH_PACKET_SCHEMA_ID) throw new Error("Repository research output schema is invalid.");
  const files = boundedArray(value.files, 1, 200, "research files").map((item, index) => {
    const file = object(item, `research file ${index + 1}`);
    return { path: relativePath(file.path, "research file path"), reason: text(file.reason, 1_000, "research file reason") };
  });
  const filePaths = new Set(files.map((file) => file.path));
  if (filePaths.size !== files.length) throw new Error("Repository research files must be unique.");
  for (const file of files) await requireRegularRepositoryFile(input.worktree, file.path);

  const citationIds = new Set<string>();
  const citations = [];
  for (const [index, item] of boundedArray(value.citations, 1, 300, "research citations").entries()) {
    const citation = object(item, `research citation ${index + 1}`);
    const id = text(citation.id, 100, "citation id");
    if (citationIds.has(id)) throw new Error(`Repository research citation ID is duplicated: ${id}.`);
    citationIds.add(id);
    const citationPath = relativePath(citation.path, "citation path");
    if (!filePaths.has(citationPath)) throw new Error(`Citation path was not declared in research files: ${citationPath}.`);
    const startLine = integer(citation.startLine, 1, Number.MAX_SAFE_INTEGER, "citation start line");
    const endLine = integer(citation.endLine, startLine, Number.MAX_SAFE_INTEGER, "citation end line");
    const source = await requireRegularRepositoryFile(input.worktree, citationPath);
    const lines = source.split(/\r?\n/);
    if (startLine > lines.length || endLine > lines.length) {
      throw new Error(`Citation ${id} is outside ${citationPath} (${lines.length} lines).`);
    }
    citations.push({
      id,
      path: citationPath,
      startLine,
      endLine,
      excerpt: lines.slice(startLine - 1, endLine).join("\n").slice(0, 4_000),
    });
  }
  const findings = boundedArray(value.findings, 1, 100, "research findings").map((item, index) => {
    const finding = object(item, `research finding ${index + 1}`);
    const ids = boundedArray(finding.citationIds, 1, 30, "finding citations").map((id) => text(id, 100, "finding citation id"));
    if (ids.some((id) => !citationIds.has(id))) throw new Error("Research finding references an unknown citation.");
    return {
      id: text(finding.id, 100, "finding id"),
      title: text(finding.title, 500, "finding title"),
      detail: text(finding.detail, 4_000, "finding detail"),
      citationIds: [...new Set(ids)],
    };
  });
  if (new Set(findings.map((finding) => finding.id)).size !== findings.length) throw new Error("Research finding IDs must be unique.");
  const unknowns = boundedArray(value.unknowns, 0, 100, "research unknowns").map((item, index) => {
    const unknown = object(item, `research unknown ${index + 1}`);
    return { question: text(unknown.question, 1_000, "unknown question"), impact: text(unknown.impact, 2_000, "unknown impact") };
  });
  const content = {
    schema: RESEARCH_PACKET_SCHEMA_ID as typeof RESEARCH_PACKET_SCHEMA_ID,
    repository: input.repository,
    sha: input.sha,
    files,
    citations,
    findings,
    unknowns,
  };
  if (Buffer.byteLength(JSON.stringify(content)) > 180_000) {
    throw new Error("Validated repository research packet exceeds the 180 KB persistence limit.");
  }
  return { ...content, digest: digest(content) };
}

export function validateCandidateOutput(input: {
  output: string;
  inputSnapshot: any;
}) {
  const value = parseObject(input.output, "Plan candidate output");
  if (value.schema !== PLAN_CANDIDATE_SCHEMA_ID) throw new Error("Plan candidate output schema is invalid.");
  const repository = input.inputSnapshot?.repository;
  const workflows = new Map((input.inputSnapshot?.workflows ?? []).map((workflow: any) => [workflow.workflowId, workflow.version]));
  const assertions = boundedArray(value.assertions, 1, 100, "Plan assertions").map((item, index) => normalizeAssertion(object(item, `assertion ${index + 1}`)));
  const workOrderBlueprints = boundedArray(value.workOrderBlueprints, 1, 30, "WorkOrder blueprints")
    .map((item, index) => normalizeBlueprint(object(item, `WorkOrder ${index + 1}`)));
  for (const blueprint of workOrderBlueprints) {
    if (workflows.get(blueprint.workflowId) !== blueprint.workflowVersion) {
      throw new Error(`Candidate WorkOrder ${blueprint.id} uses an unavailable workflow version.`);
    }
  }
  const plan = {
    summary: text(value.summary, 8_000, "Plan summary"),
    rollbackApproach: text(value.rollbackApproach, 4_000, "rollback approach"),
    estimatedCostUsd: nullableNumber(value.estimatedCostUsd, "Plan estimated cost"),
    repository: text(repository?.repository, 500, "frozen repository"),
    repositoryBranch: text(repository?.defaultBranch, 500, "frozen repository branch"),
    workOrderBlueprints,
    assertions,
  };
  const candidatePlan = JSON.parse(JSON.stringify(plan));
  const issues = candidatePlanIssues(candidatePlan, input.inputSnapshot);
  if (issues.length > 0) throw new Error(`Plan candidate validation failed (${issues.join(", ")}).`);
  return { candidatePlan, candidateDigest: digest(candidatePlan), outputDigest: digest(value) };
}

function normalizeAssertion(value: Record<string, unknown>) {
  return {
    assertionId: text(value.assertionId, 100, "assertion ID"),
    title: text(value.title, 500, "assertion title"),
    outcome: text(value.outcome, 4_000, "assertion outcome"),
    verificationMethod: enumValue(value.verificationMethod, ["COMMAND", "TEST", "BROWSER", "MANUAL", "CHECKLIST"] as const, "verification method"),
    passCondition: text(value.passCondition, 4_000, "assertion pass condition"),
    requiredEvidence: text(value.requiredEvidence, 4_000, "assertion evidence"),
    requiresIndependentValidation: boolean(value.requiresIndependentValidation, "independent validation"),
    waiverAllowed: boolean(value.waiverAllowed, "waiver allowed"),
    sourceRequirementIds: uniqueStrings(value.sourceRequirementIds, 100, 100, "source requirement IDs"),
    sourceAcceptanceExpectationIds: uniqueStrings(value.sourceAcceptanceExpectationIds, 100, 100, "acceptance expectation IDs"),
    sourceVerificationExpectationIds: uniqueStrings(value.sourceVerificationExpectationIds, 100, 100, "verification expectation IDs"),
  };
}

function normalizeBlueprint(value: Record<string, unknown>) {
  const isMutating = boolean(value.isMutating, "WorkOrder mutation flag");
  const policy = value.implementationPolicy === null ? undefined : normalizeImplementationPolicy(object(value.implementationPolicy, "implementation policy"));
  return {
    id: text(value.id, 100, "WorkOrder ID"),
    title: text(value.title, 500, "WorkOrder title"),
    desiredOutcome: text(value.desiredOutcome, 4_000, "WorkOrder desired outcome"),
    workflowId: text(value.workflowId, 200, "WorkOrder workflow"),
    workflowVersion: integer(value.workflowVersion, 1, Number.MAX_SAFE_INTEGER, "workflow version"),
    sequence: integer(value.sequence, 1, 30, "WorkOrder sequence"),
    role: enumValue(value.role, ["WORKER", "VALIDATOR"] as const, "WorkOrder role"),
    isMutating,
    priority: enumValue(value.priority, [1, 2, 3, 4] as const, "WorkOrder priority"),
    riskLevel: enumValue(value.riskLevel, ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const, "WorkOrder risk"),
    modelComplexity: value.modelComplexity === null ? undefined : enumValue(value.modelComplexity, ["SMALL", "STANDARD", "LARGE"] as const, "model complexity"),
    branchStrategy: value.branchStrategy === null ? undefined : text(value.branchStrategy, 500, "branch strategy"),
    constraints: uniqueStrings(value.constraints, 100, 2_000, "WorkOrder constraints"),
    requiredApprovals: uniqueStrings(value.requiredApprovals, 50, 500, "required approvals"),
    estimatedCostUsd: nullableNumber(value.estimatedCostUsd, "WorkOrder estimated cost"),
    implementationPolicy: isMutating ? policy : undefined,
    dependsOnBlueprintIds: uniqueStrings(value.dependsOnBlueprintIds, 30, 100, "WorkOrder dependencies"),
    assertionIds: uniqueStrings(value.assertionIds, 100, 100, "WorkOrder assertion IDs"),
  };
}

function normalizeImplementationPolicy(value: Record<string, unknown>) {
  const verification = value.independentVerification === null
    ? undefined
    : object(value.independentVerification, "independent verification");
  return {
    allowedCommands: uniqueStrings(value.allowedCommands, 20, 1_000, "allowed verification commands"),
    independentVerification: verification ? {
      executable: text(verification.executable, 500, "independent verifier executable"),
      args: boundedArray(verification.args, 0, 100, "independent verifier args").map((item) => typeof item === "string" && item.length <= 2_000 ? item : invalid("independent verifier argument")),
      category: enumValue(verification.category, ["BUILD", "TYPECHECK", "UNIT_TEST", "INTEGRATION_TEST", "CONTRACT_TEST", "SECURITY"] as const, "verification category"),
      commandClass: enumValue(verification.commandClass, ["BUILD", "TYPECHECK", "TEST", "LINT", "SECURITY_SCAN", "DEPENDENCY_SCAN"] as const, "verification command class"),
      evidenceCategory: enumValue(verification.evidenceCategory, ["TEST_RESULT", "BUILD_RESULT", "STATIC_ANALYSIS", "SECURITY_SCAN", "COMMAND_LOG", "BROWSER_RESULT"] as const, "verification evidence category"),
      timeoutMs: integer(verification.timeoutMs, 1_000, 1_800_000, "verification timeout"),
    } : undefined,
    maxFilesChanged: nullableInteger(value.maxFilesChanged, 1, 500, "maximum files changed"),
    maxLinesChanged: nullableInteger(value.maxLinesChanged, 1, 100_000, "maximum lines changed"),
    maxCostUsd: nullableNumber(value.maxCostUsd, "maximum implementation cost"),
    maxAttempts: integer(value.maxAttempts, 1, 10, "maximum attempts"),
    timeoutMinutes: integer(value.timeoutMinutes, 1, 480, "implementation timeout"),
    stopCondition: text(value.stopCondition, 4_000, "implementation stop condition"),
  };
}

function candidatePlanIssues(plan: any, inputSnapshot: any) {
  const issues: string[] = [];
  const blueprintIds = plan.workOrderBlueprints.map((item: any) => item.id);
  const assertionIds = plan.assertions.map((item: any) => item.assertionId);
  if (new Set(blueprintIds).size !== blueprintIds.length) issues.push("blueprint-ids-duplicate");
  if (new Set(assertionIds).size !== assertionIds.length) issues.push("assertion-ids-duplicate");
  if (new Set(plan.workOrderBlueprints.map((item: any) => item.sequence)).size !== plan.workOrderBlueprints.length) issues.push("blueprint-sequences-duplicate");
  const assertionSet = new Set(assertionIds);
  const blueprintSet = new Set(blueprintIds);
  const covered = new Set<string>();
  for (const blueprint of plan.workOrderBlueprints) {
    if (blueprint.role === "VALIDATOR" && (blueprint.isMutating || blueprint.dependsOnBlueprintIds.length === 0)) issues.push(`validator-invalid:${blueprint.id}`);
    if (blueprint.isMutating && (!blueprint.branchStrategy || !blueprint.implementationPolicy?.allowedCommands.length || !blueprint.implementationPolicy.independentVerification)) issues.push(`mutation-policy-invalid:${blueprint.id}`);
    if (!blueprint.assertionIds.length || blueprint.assertionIds.some((id: string) => !assertionSet.has(id))) issues.push(`assertion-link-invalid:${blueprint.id}`);
    blueprint.assertionIds.forEach((id: string) => covered.add(id));
    for (const dependency of blueprint.dependsOnBlueprintIds) {
      const target = plan.workOrderBlueprints.find((item: any) => item.id === dependency);
      if (!blueprintSet.has(dependency) || !target || target.sequence >= blueprint.sequence) issues.push(`dependency-invalid:${blueprint.id}`);
    }
  }
  if (assertionIds.some((id: string) => !covered.has(id))) issues.push("assertion-uncovered");
  const spec = inputSnapshot?.specification?.content;
  if (spec) {
    const requirements = new Set([...(spec.requirements ?? []), ...(spec.nonFunctionalRequirements ?? [])].map((item: any) => item.id));
    const acceptance = new Set((spec.acceptanceExpectations ?? []).map((item: any) => item.id));
    const verification = new Set((spec.verificationExpectations ?? []).map((item: any) => item.id));
    for (const assertion of plan.assertions) {
      if (assertion.sourceRequirementIds.some((id: string) => !requirements.has(id))
        || assertion.sourceAcceptanceExpectationIds.some((id: string) => !acceptance.has(id))
        || assertion.sourceVerificationExpectationIds.some((id: string) => !verification.has(id))) issues.push(`spec-source-invalid:${assertion.assertionId}`);
    }
  }
  return [...new Set(issues)];
}

async function requireRegularRepositoryFile(root: string, relative: string) {
  const rootReal = await realpath(root);
  const candidate = path.resolve(rootReal, relative);
  if (!inside(rootReal, candidate)) throw new Error(`Repository research path escapes the exact checkout: ${relative}.`);
  const candidateReal = await realpath(candidate);
  if (!inside(rootReal, candidateReal)) throw new Error(`Repository research path resolves outside the exact checkout: ${relative}.`);
  const details = await stat(candidateReal);
  if (!details.isFile() || details.size > 5 * 1024 * 1024) throw new Error(`Repository research path is not a bounded regular file: ${relative}.`);
  return await readFile(candidateReal, "utf8");
}

function inside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseObject(value: string, label: string) {
  if (Buffer.byteLength(value) > 180_000) throw new Error(`${label} exceeds the 180 KB limit.`);
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON.`);
    throw error;
  }
}

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, any>;
}

function boundedArray(value: unknown, minimum: number, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label} must contain ${minimum}-${maximum} items.`);
  return value;
}

function relativePath(value: unknown, label: string) {
  const result = text(value, 1_000, label);
  if (path.isAbsolute(result) || result.split(/[\\/]/).includes("..") || result.includes("\0")) throw new Error(`${label} must be repository-relative.`);
  return result.replace(/^\.\//, "");
}

function text(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function uniqueStrings(value: unknown, maximumItems: number, maximumLength: number, label: string) {
  return [...new Set(boundedArray(value, 0, maximumItems, label).map((item) => text(item, maximumLength, label)))];
}

function integer(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`${label} is invalid.`);
  return value as number;
}

function nullableInteger(value: unknown, minimum: number, maximum: number, label: string) {
  return value === null ? undefined : integer(value, minimum, maximum, label);
}

function nullableNumber(value: unknown, label: string) {
  if (value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function enumValue<T extends readonly unknown[]>(value: unknown, values: T, label: string): T[number] {
  if (!values.includes(value)) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function invalid(label: string): never {
  throw new Error(`${label} is invalid.`);
}

function digest(value: unknown) {
  return `sha256:${canonicalHash(value)}`;
}
