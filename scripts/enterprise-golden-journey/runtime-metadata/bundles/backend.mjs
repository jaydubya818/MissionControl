// apps/orchestration-server/src/isolatedInvocationAdapter.ts
import { spawn, execFile } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// packages/shared/src/constants.ts
var LOOP_DETECTION = {
  commentRateThreshold: 20,
  commentRateWindow: 30 * 60 * 1e3,
  // 30 minutes in ms
  reviewCycleLimit: 3,
  backAndForthLimit: 8,
  backAndForthWindow: 10 * 60 * 1e3,
  // 10 minutes in ms
  retryLimit: 3
};
var SPAWN_LIMITS = {
  maxActive: 30,
  maxPerParent: 3,
  maxDepth: 2,
  ttl: 6 * 60 * 60 * 1e3
  // 6 hours in ms
};
var HEARTBEAT = {
  interval: 30 * 1e3,
  // 30 seconds
  staleThreshold: 5 * 60 * 1e3
  // 5 minutes
};
var APPROVAL_TIMEOUT = {
  yellow: 30 * 60 * 1e3,
  // 30 minutes
  red: 60 * 60 * 1e3
  // 1 hour
};
var SECRET_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /password/i,
  /secret/i,
  /bearer\s+\w+/i,
  /sk-[a-zA-Z0-9]{32,}/,
  /ghp_[a-zA-Z0-9]{36}/
];

// packages/shared/src/utils.ts
var SECRET_KEY_SOURCE = String.raw`(?:api[_-]?key|token|password|secret)`;
var QUOTED_SECRET_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`["']?${SECRET_KEY_SOURCE}["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`,
  "gi"
);
var UNQUOTED_SECRET_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`["']?${SECRET_KEY_SOURCE}["']?\s*[:=]\s*[^\r\n]*?(?=\s+["']?${SECRET_KEY_SOURCE}["']?\s*[:=]|$)`,
  "gi"
);
var GLOBAL_SECRET_PATTERNS = SECRET_PATTERNS.map((pattern) => {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
});

// packages/shared/src/logger.ts
var StructuredLogger = class _StructuredLogger {
  config;
  constructor(config = {}) {
    this.config = {
      enableConsole: true,
      enableFile: false,
      ...config
    };
  }
  /**
   * Create a log entry with all required fields
   */
  createEntry(level, message, context = {}) {
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      agent_id: context.agent_id || this.config.defaultAgentId,
      run_id: context.run_id || this.config.defaultRunId,
      task_id: context.task_id,
      step_id: context.step_id,
      status: context.status,
      error_code: context.error_code,
      metadata: context.metadata
    };
  }
  /**
   * Output log entry as JSON
   */
  output(entry) {
    const json = JSON.stringify(entry);
    if (this.config.enableConsole) {
      const colors = {
        DEBUG: "\x1B[36m",
        // Cyan
        INFO: "\x1B[32m",
        // Green
        WARN: "\x1B[33m",
        // Yellow
        ERROR: "\x1B[31m",
        // Red
        FATAL: "\x1B[35m"
        // Magenta
      };
      const reset = "\x1B[0m";
      console.log(`${colors[entry.level] || ""}[${entry.level}]${reset} ${entry.message}`);
      console.error(json);
    }
  }
  debug(message, context) {
    this.output(this.createEntry("DEBUG", message, context));
  }
  info(message, context) {
    this.output(this.createEntry("INFO", message, context));
  }
  warn(message, context) {
    this.output(this.createEntry("WARN", message, context));
  }
  error(message, error, context) {
    const errorContext = {
      ...context,
      error_code: error?.name || context?.error_code,
      metadata: {
        ...context?.metadata,
        errorStack: error?.stack,
        errorMessage: error?.message
      }
    };
    this.output(this.createEntry("ERROR", message, errorContext));
  }
  fatal(message, error, context) {
    const errorContext = {
      ...context,
      error_code: error?.name || context?.error_code || "FATAL_ERROR",
      metadata: {
        ...context?.metadata,
        errorStack: error?.stack,
        errorMessage: error?.message
      }
    };
    this.output(this.createEntry("FATAL", message, errorContext));
  }
  /**
   * Create a child logger with bound context
   */
  child(context) {
    return new _StructuredLogger({
      ...this.config,
      defaultAgentId: context.agent_id || this.config.defaultAgentId,
      defaultRunId: context.run_id || this.config.defaultRunId
    });
  }
};
var logger = new StructuredLogger();

// packages/shared/src/serviceCommandEnvelope.ts
var SERVICE_COMMAND_MAX_TTL_MS = 5 * 60 * 1e3;
var SERVICE_COMMAND_CLOCK_SKEW_MS = 30 * 1e3;

// packages/shared/src/canonicalDigest.ts
function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === void 0 ? "undefined" : serialized;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => item === void 0 ? "" : canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
var SHA256_K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
function rightRotate(value, amount) {
  return value >>> amount | value << 32 - amount;
}
function sha256Hex(input) {
  const bytes = Array.from(typeof input === "string" ? new TextEncoder().encode(input) : input);
  const bitLength = BigInt(bytes.length) * 8n;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let index = 7; index >= 0; index -= 1) {
    bytes.push(Number(bitLength >> BigInt(index * 8) & 0xffn));
  }
  const hash = [
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ];
  const words = new Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = bytes[base] << 24 | bytes[base + 1] << 16 | bytes[base + 2] << 8 | bytes[base + 3];
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ words[index - 15] >>> 3;
      const s1 = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ words[index - 2] >>> 10;
      words[index] = words[index - 16] + s0 + words[index - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = e & f ^ ~e & g;
      const first = h + s1 + choice + SHA256_K[index] + words[index] >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const second = s0 + majority >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + first >>> 0;
      d = c;
      c = b;
      b = a;
      a = first + second >>> 0;
    }
    hash[0] = hash[0] + a >>> 0;
    hash[1] = hash[1] + b >>> 0;
    hash[2] = hash[2] + c >>> 0;
    hash[3] = hash[3] + d >>> 0;
    hash[4] = hash[4] + e >>> 0;
    hash[5] = hash[5] + f >>> 0;
    hash[6] = hash[6] + g >>> 0;
    hash[7] = hash[7] + h >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}
function canonicalHash(value) {
  return sha256Hex(canonicalJson(value));
}

// packages/shared/src/governedInference.ts
var MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

// packages/shared/src/execution-routing.ts
var METRIC_WEIGHTS = [
  { metric: "verifiedSuccessRate", weight: 30 },
  { metric: "firstPassSuccessRate", weight: 20 },
  { metric: "retryAvoidanceRate", weight: 10 },
  { metric: "timeToVerifiedCandidateMs", weight: 10, lowerIsBetter: true },
  { metric: "totalCostPerVerifiedSuccessUsd", weight: 10, lowerIsBetter: true },
  { metric: "contextMissAvoidanceRate", weight: 5 },
  { metric: "qualityGateAvoidanceRate", weight: 10 },
  { metric: "cancellationFailureAvoidanceRate", weight: 5 }
];
var TOTAL_METRIC_WEIGHT = METRIC_WEIGHTS.reduce((sum, metric) => sum + metric.weight, 0);

// packages/shared/src/missionPlannerIdentity.ts
var BUILT_IN_MISSION_PLANNER_IDENTITY = Object.freeze({
  kind: "BUILT_IN",
  plannerId: "mission-planner",
  version: "v1",
  displayName: "Mission Planner",
  researchPromptVersion: "mission-planner-research/v1",
  generationPromptVersion: "mission-planner-generation/v1"
});
var BUILT_IN_MISSION_PLANNER_CONFIG_DIGEST = `sha256:${canonicalHash(
  BUILT_IN_MISSION_PLANNER_IDENTITY
)}`;

// packages/shared/src/factoryDelegationBinding.ts
var FACTORY_DELEGATION_BINDING_SCHEMA = "factory-delegation-binding/v1";
var textMatching = (pattern) => (value) => typeof value === "string" && pattern.test(value);
var identity = textMatching(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
var sha256 = textMatching(/^[a-f0-9]{64}$/);
var digest = textMatching(/^sha256:[a-f0-9]{64}$/);
var gitSha = textMatching(/^[a-f0-9]{40}$/);
var uuid = textMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
var nonNegativeInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
var positiveInteger = (value) => nonNegativeInteger(value) && Number(value) > 0;
var effects = /* @__PURE__ */ new Set(["repository.read", "sandbox.write", "candidate.create", "verification.request"]);
var fields = {
  schema: (value) => value === FACTORY_DELEGATION_BINDING_SCHEMA,
  delegationId: identity,
  tenantId: identity,
  projectId: identity,
  missionId: identity,
  missionSpecRevisionId: identity,
  missionPlanId: identity,
  missionPlanRevision: positiveInteger,
  missionPlanDigest: digest,
  workOrderId: identity,
  workOrderRevisionId: identity,
  workOrderRevisionNumber: positiveInteger,
  taskId: identity,
  workflowRunId: identity,
  executionManifestDigest: digest,
  qualityContractDigest: digest,
  authorityGeneration: positiveInteger,
  factoryId: identity,
  factoryVersion: sha256,
  executionProtocol: (value) => value === "MYFACTORY_EXECUTION_V2",
  clientId: identity,
  ownerScope: identity,
  partnerWorkId: uuid,
  partnerWorkGeneration: positiveInteger,
  partnerRequestId: uuid,
  partnerRequestDigest: sha256,
  repositoryId: identity,
  repository: textMatching(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/),
  baseCommit: gitSha,
  baseTree: gitSha,
  sourceSnapshotDigest: digest,
  executionProfileDigest: digest,
  modelPolicyDigest: digest,
  verificationPolicyDigest: digest,
  allowedEffects: (value) => Array.isArray(value) && value.length > 0 && value.length <= effects.size && new Set(value).size === value.length && [...value].every((item) => typeof item === "string" && effects.has(item)),
  budgetReservationId: identity,
  maxSpendMicrousd: nonNegativeInteger,
  issuedAt: nonNegativeInteger,
  expiresAt: positiveInteger,
  deadline: positiveInteger
};

// packages/workflow-engine/src/executorAdapter.ts
var GENERIC_HARNESS_CONTRACT_VERSION = "generic-harness-contract/v1";
var NO_HARNESS_AUTHORITY = Object.freeze({
  worker: "NONE",
  verification: "NONE",
  publication: "NONE",
  acceptance: "NONE",
  memory: "NONE",
  observability: "NONE",
  learning: "NONE"
});

// packages/workflow-engine/src/deterministicWorkload.ts
var RENDER_MARKDOWN_OPERATION = "render-markdown/v1";
var RENDER_MARKDOWN_OPERATION_DIGEST = `sha256:${canonicalHash({
  operation: RENDER_MARKDOWN_OPERATION,
  format: "heading-h1-blank-line-paragraphs-separated-by-blank-line-final-newline",
  limits: { titleCharacters: 120, paragraphs: 16, paragraphCharacters: 1e3, outputBytes: 2e4 }
})}`;
function exact(value, fields2) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...fields2].sort().join(",");
}
function text(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}
function deterministicDocumentPath(value) {
  return typeof value === "string" && value.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9_/-]*\.md$/.test(value) && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function renderMarkdownWorkloadIssues(value) {
  if (!exact(value, ["reference", "digest", "input"])) return ["deterministic-workload-fields-invalid"];
  if (value.reference !== RENDER_MARKDOWN_OPERATION || value.digest !== RENDER_MARKDOWN_OPERATION_DIGEST) return ["deterministic-operation-unregistered"];
  if (!exact(value.input, ["title", "paragraphs", "outputPath"])) return ["deterministic-input-fields-invalid"];
  if (!text(value.input.title, 120) || !Array.isArray(value.input.paragraphs) || value.input.paragraphs.length < 1 || value.input.paragraphs.length > 16 || !value.input.paragraphs.every((paragraph) => text(paragraph, 1e3)) || !deterministicDocumentPath(value.input.outputPath)) return ["deterministic-input-invalid"];
  const output = `# ${value.input.title}

${value.input.paragraphs.join("\n\n")}
`;
  return new TextEncoder().encode(output).length > 2e4 ? ["deterministic-output-too-large"] : [];
}
function renderMarkdownCandidate(workload) {
  const issues = renderMarkdownWorkloadIssues(workload);
  if (issues.length) throw new Error(issues.join(","));
  const content = `# ${workload.input.title}

${workload.input.paragraphs.join("\n\n")}
`;
  return {
    path: workload.input.outputPath,
    encoding: "utf8",
    content,
    contentDigest: `sha256:${canonicalHash(content)}`
  };
}

// packages/workflow-engine/src/deterministicVerification.ts
var VERIFY_DOCUMENT_OPERATION = "verify-document-bytes/v1";
var VERIFY_DOCUMENT_OPERATION_DIGEST = `sha256:${canonicalHash({
  operation: VERIFY_DOCUMENT_OPERATION,
  comparison: "sha256-of-utf8-candidate-against-frozen-plan",
  maximumBytes: 2e4
})}`;
function exact2(value, fields2) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...fields2].sort().join(",");
}
function verifyDocumentWorkloadIssues(value) {
  if (!exact2(value, ["reference", "digest", "input"]) || value.reference !== VERIFY_DOCUMENT_OPERATION || value.digest !== VERIFY_DOCUMENT_OPERATION_DIGEST) {
    return ["verification-operation-unregistered"];
  }
  const input = value.input;
  if (!exact2(input, [
    "subjectDigest",
    "verificationPlanDigest",
    "repositoryId",
    "workOrderId",
    "workOrderRevisionNumber",
    "producerAttemptId",
    "candidateSha",
    "candidateTreeSha",
    "path",
    "expectedContentSha256",
    "candidateContent"
  ])) return ["verification-input-fields-invalid"];
  if (![input.subjectDigest, input.verificationPlanDigest, input.expectedContentSha256].every((item) => typeof item === "string" && /^sha256:[a-f0-9]{64}$/.test(item)) || ![input.candidateSha, input.candidateTreeSha].every((item) => typeof item === "string" && /^[a-f0-9]{40,64}$/.test(item)) || ![input.repositoryId, input.workOrderId, input.producerAttemptId].every((item) => typeof item === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(item)) || !Number.isSafeInteger(input.workOrderRevisionNumber) || input.workOrderRevisionNumber < 1 || !deterministicDocumentPath(input.path) || typeof input.candidateContent !== "string" || new TextEncoder().encode(input.candidateContent).length > 2e4) return ["verification-input-invalid"];
  return [];
}
function verifyDocumentBytes(workload) {
  const issues = verifyDocumentWorkloadIssues(workload);
  if (issues.length) throw new Error(issues.join(","));
  const observedContentSha256 = `sha256:${sha256Hex(new TextEncoder().encode(workload.input.candidateContent))}`;
  return {
    operation: VERIFY_DOCUMENT_OPERATION,
    requestDigest: `sha256:${canonicalHash(workload)}`,
    subjectDigest: workload.input.subjectDigest,
    verificationPlanDigest: workload.input.verificationPlanDigest,
    observedContentSha256,
    matches: observedContentSha256 === workload.input.expectedContentSha256,
    evidenceOrigin: "CONTROL_FIXTURE",
    authority: "NONE",
    behavioralPass: false
  };
}

// packages/workflow-engine/src/isolatedInvocation.ts
var INVOCATION_SCHEMA = "factory-isolated-invocation/v2";
var INVOCATION_RESULT_SCHEMA = "factory-isolated-result/v2";
var COMPOSITION_SCHEMA = "factory-invocation-composition/v1";
function invocationDigest(value) {
  return `sha256:${canonicalHash(value)}`;
}
var SYNTHETIC_WORKLOAD_DIGEST = invocationDigest({ reference: "synthetic-receipt/v1", output: "SYNTHETIC_RECEIPT" });
var digest2 = (x) => typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
var identity2 = (x) => typeof x === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(x);
function exact3(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function invocationCompositionIssues(value) {
  if (!exact3(value, ["schema", "profileClass", "bridge", "backend", "runtimeImage", "isolationDigest", "invocationSchema", "resultSchema"])) return ["composition-fields-invalid"];
  const issues = [];
  if (value.schema !== COMPOSITION_SCHEMA || value.profileClass !== "isolated-offline-control/v1") issues.push("composition-class-unsupported");
  for (const key of ["bridge", "backend"]) {
    const binding = value[key];
    if (!exact3(binding, ["id", "version", "digest"]) || !identity2(binding.id) || !identity2(binding.version) || !digest2(binding.digest)) issues.push(`${key}-identity-invalid`);
  }
  if (!digest2(value.runtimeImage) || !digest2(value.isolationDigest)) issues.push("runtime-isolation-identity-invalid");
  if (value.invocationSchema !== INVOCATION_SCHEMA || value.resultSchema !== INVOCATION_RESULT_SCHEMA) issues.push("composition-schema-unsupported");
  return issues;
}
function isolatedInvocationIssues(value) {
  if (!exact3(value, ["schema", "resultSchema", "executionId", "attemptId", "workOrderId", "taskId", "plan", "factoryVersion", "budgetReservationId", "correlationId", "profileId", "profileDigest", "executionManifestDigest", "composition", "compositionDigest", "lease", "workload", "capabilities", "limits", "transmission", "modelRoute"])) return ["request-fields-invalid"];
  const issues = invocationCompositionIssues(value.composition);
  if (value.schema !== INVOCATION_SCHEMA || value.resultSchema !== INVOCATION_RESULT_SCHEMA) issues.push("request-schema-unsupported");
  for (const key of ["executionId", "attemptId", "workOrderId", "taskId", "budgetReservationId", "correlationId", "profileId"]) if (!identity2(value[key])) issues.push(`${key}-invalid`);
  for (const key of ["profileDigest", "executionManifestDigest", "compositionDigest"]) if (!digest2(value[key])) issues.push(`${key}-invalid`);
  if (value.compositionDigest !== invocationDigest(value.composition)) issues.push("composition-digest-mismatch");
  if (!exact3(value.plan, ["id", "version", "digest"]) || !identity2(value.plan.id) || !Number.isSafeInteger(value.plan.version) || Number(value.plan.version) < 1 || !digest2(value.plan.digest)) issues.push("plan-identity-invalid");
  if (!exact3(value.factoryVersion, ["id", "configurationDigest"]) || !identity2(value.factoryVersion.id) || typeof value.factoryVersion.configurationDigest !== "string" || !/^factory-v1-[a-f0-9]{8}$/.test(value.factoryVersion.configurationDigest)) issues.push("factory-version-invalid");
  const lease = value.lease;
  if (!exact3(lease, ["leaseId", "ownerId", "workerId", "sessionId", "generation"]) || ![lease.leaseId, lease.ownerId, lease.workerId, lease.sessionId].every(identity2) || !Number.isSafeInteger(lease.generation) || lease.generation < 1) issues.push("lease-invalid");
  const render = value.workload && typeof value.workload === "object" && value.workload.reference === "render-markdown/v1";
  const verify = value.workload && typeof value.workload === "object" && value.workload.reference === VERIFY_DOCUMENT_OPERATION;
  if (render) issues.push(...renderMarkdownWorkloadIssues(value.workload));
  else if (verify) {
    issues.push(...verifyDocumentWorkloadIssues(value.workload));
    if (value.workload.input?.workOrderId !== value.workOrderId || value.workload.input?.producerAttemptId === value.attemptId) issues.push("verification-lineage-invalid");
  } else if (!exact3(value.workload, ["reference", "digest"]) || value.workload.reference !== "synthetic-receipt/v1" || value.workload.digest !== SYNTHETIC_WORKLOAD_DIGEST) issues.push("workload-unsupported");
  if (!Array.isArray(value.capabilities) || value.capabilities.length !== 1 || value.capabilities[0] !== (render ? "render-markdown" : verify ? "verify-document-bytes" : "synthetic-receipt")) issues.push("capability-unsupported");
  if (!exact3(value.limits, ["timeoutMs", "budgetReference"]) || !Number.isSafeInteger(value.limits.timeoutMs) || value.limits.timeoutMs < 1 || value.limits.timeoutMs > 6e4 || value.limits.budgetReference !== "offline-zero-provider-calls/v1") issues.push("limits-invalid");
  if (value.transmission !== "NONE" || value.modelRoute !== "NONE") issues.push("external-authority-unavailable");
  return issues;
}
function invocationResult(request, status, startedAt, completedAt = Date.now()) {
  const verification = request.workload.reference === VERIFY_DOCUMENT_OPERATION ? verifyDocumentBytes(request.workload) : void 0;
  if (status === "SUCCESS" && verification && !verification.matches) status = "WORKLOAD_FAILURE";
  const candidateFiles = status === "SUCCESS" && request.workload.reference === "render-markdown/v1" ? [renderMarkdownCandidate(request.workload)] : [];
  return {
    schema: INVOCATION_RESULT_SCHEMA,
    executionId: request.executionId,
    attemptId: request.attemptId,
    correlationId: request.correlationId,
    requestDigest: invocationDigest(request),
    compositionDigest: request.compositionDigest,
    status,
    startedAt,
    completedAt,
    summary: status === "SUCCESS" ? candidateFiles.length ? "Deterministic document produced; independent verification required." : verification ? "Exact document byte comparison completed; no acceptance authority." : "Synthetic receipt control executed." : status,
    evidenceOrigin: "CONTROL_FIXTURE",
    behavioralPass: false,
    providerCalls: 0,
    candidateFiles,
    resultDigest: status === "SUCCESS" ? invocationDigest(verification ?? (candidateFiles.length ? candidateFiles : "SYNTHETIC_RECEIPT")) : null
  };
}
function invocationResultMatches(value, request) {
  if (!exact3(value, ["schema", "executionId", "attemptId", "correlationId", "requestDigest", "compositionDigest", "status", "startedAt", "completedAt", "summary", "evidenceOrigin", "behavioralPass", "providerCalls", "resultDigest", "candidateFiles"])) return false;
  if (!["SUCCESS", "WORKLOAD_FAILURE", "INFRASTRUCTURE_FAILURE", "POLICY_DENIED", "BUDGET_DENIED", "CANCELED", "TIMED_OUT", "STALE", "INVALID_REQUEST", "UNSUPPORTED_CAPABILITY"].includes(value.status)) return false;
  if (!Number.isSafeInteger(value.startedAt) || !Number.isSafeInteger(value.completedAt) || value.startedAt < 0 || value.completedAt < value.startedAt) return false;
  return invocationDigest(value) === invocationDigest(invocationResult(request, value.status, value.startedAt, value.completedAt));
}
var ISOLATED_CONTAINER_POLICY = Object.freeze({
  schema: "factory-isolated-container-policy/v1",
  network: "none",
  hostMounts: false,
  readOnlyRoot: true,
  uid: 65534,
  gid: 65534,
  pids: 64,
  memoryBytes: 268435456,
  cpus: 1,
  tmpfsBytes: 16777216,
  noNewPrivileges: true,
  entrypoint: "/runtime/invoke.mjs"
});
var ISOLATED_CONTAINER_POLICY_DIGEST = invocationDigest(ISOLATED_CONTAINER_POLICY);

// packages/workflow-engine/src/isolatedRuntimeImage.ts
function assertIsolatedRuntimeImageBinding(binding, runtimeImage) {
  if (!binding || Object.keys(binding).sort().join(",") !== "architecture,configDigest,manifestDigest,os,sourceSha" || !/^sha256:[a-f0-9]{64}$/.test(binding.manifestDigest) || !/^sha256:[a-f0-9]{64}$/.test(binding.configDigest) || binding.manifestDigest === binding.configDigest || binding.manifestDigest !== runtimeImage || !/^[a-f0-9]{40}$/.test(binding.sourceSha) || binding.os !== "linux" || binding.architecture !== "amd64") {
    throw new Error("Invalid exact runtime image binding");
  }
}
function inspectIsolatedRuntimeImage(binding, reference, inspection) {
  assertIsolatedRuntimeImageBinding(binding, binding.manifestDigest);
  const rows = inspection;
  const image = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const descriptor = image?.Descriptor;
  const descriptorDigest = descriptor?.digest ?? null;
  const descriptorConfigDigest = descriptor?.annotations?.["config.digest"] ?? null;
  if (![binding.manifestDigest, binding.configDigest].includes(reference) || image?.Id !== reference || image?.Os !== binding.os || image?.Architecture !== binding.architecture || image?.Config?.Labels?.["org.opencontainers.image.revision"] !== binding.sourceSha || descriptor && (descriptorDigest !== binding.manifestDigest || descriptorConfigDigest !== binding.configDigest) || reference === binding.manifestDigest && !descriptor) {
    throw new Error("Docker image contradicts the qualified OCI artifact");
  }
  return { ...binding, selectedReference: reference, observedImageId: image.Id, descriptorDigest, descriptorConfigDigest };
}

// apps/orchestration-server/src/isolatedInvocationAdapter.ts
var exec = promisify(execFile);
var IsolatedInvocationAdapter = class {
  constructor(composition, authority, dockerExecutable, imageBinding) {
    this.authority = authority;
    this.dockerExecutable = dockerExecutable;
    if (invocationCompositionIssues(composition).length || composition.isolationDigest !== ISOLATED_CONTAINER_POLICY_DIGEST || composition.bridge.id !== "isolated-invocation" || composition.bridge.version !== "1" || composition.backend.id !== "docker-chroot-offline" || composition.backend.version !== "1") throw new Error("Unsupported exact composition");
    this.composition = structuredClone(composition);
    if (imageBinding) {
      assertIsolatedRuntimeImageBinding(imageBinding, composition.runtimeImage);
      this.imageBinding = Object.freeze(structuredClone(imageBinding));
    }
  }
  composition;
  prepared = /* @__PURE__ */ new WeakMap();
  executions = /* @__PURE__ */ new Set();
  handles = /* @__PURE__ */ new WeakMap();
  collected = /* @__PURE__ */ new WeakSet();
  cleaned = /* @__PURE__ */ new WeakSet();
  imageBinding;
  capabilities() {
    return {
      contractVersion: GENERIC_HARNESS_CONTRACT_VERSION,
      adapter: "isolated-invocation",
      version: "1",
      displayName: "Offline isolated invocation",
      runtimeArtifact: { schemaVersion: "harness-runtime-artifact/v1", kind: "CONTAINER_IMAGE", name: "isolated-invocation", version: "1", executableSha256: null, imageDigest: this.composition.runtimeImage },
      executionBackends: [],
      authority: NO_HARNESS_AUTHORITY,
      supportsCancel: true,
      supportsResume: false,
      supportsRepositoryMutation: false,
      isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
      emittedEvents: ["EXECUTION_STARTED"]
    };
  }
  validateConfiguration(request) {
    const issues = [];
    const allowed = ["executionId", "repositoryRoot", "workingDirectory", "prompt", "allowedPaths", "timeoutMs", "isolation"];
    if (Object.keys(request).some((key) => !allowed.includes(key))) issues.push("unsupported-executor-field");
    if (request.repositoryRoot !== "/workspace" || request.workingDirectory !== "/workspace" || !["READ_ONLY", "WORKSPACE_WRITE"].includes(request.isolation) || !Array.isArray(request.allowedPaths) || request.allowedPaths.length !== 0) issues.push("ambient-workload-forbidden");
    try {
      if (typeof request.prompt !== "string" || Buffer.byteLength(request.prompt) > 16384) throw new Error();
      const invocation = JSON.parse(request.prompt);
      issues.push(...isolatedInvocationIssues(invocation));
      if (request.isolation !== (invocation.workload?.reference === "verify-document-bytes/v1" ? "READ_ONLY" : "WORKSPACE_WRITE")) issues.push("operation-isolation-mismatch");
      if (invocation.executionId !== request.executionId || invocation.limits?.timeoutMs !== request.timeoutMs) issues.push("executor-request-mismatch");
      if (invocationDigest(invocation.composition) !== invocationDigest(this.composition)) issues.push("composition-substitution");
    } catch {
      issues.push("invalid-invocation-json");
    }
    return issues.map((message) => ({ field: "prompt", message }));
  }
  async estimate() {
    return { estimatedCostUsd: null, estimatedRuntimeMinutes: null, confidence: "LOW" };
  }
  async prepare(request, context) {
    const issues = this.validateConfiguration(request);
    if (issues.length) throw new Error(issues.map((x) => x.message).join(","));
    if (context.signal?.aborted) throw new Error("Invocation canceled before preparation");
    const invocation = JSON.parse(request.prompt);
    if (this.executions.has(invocation.executionId)) throw new Error("Invocation replay");
    this.executions.add(invocation.executionId);
    const prepared = { request: invocation, context: { ...context } };
    this.prepared.set(prepared, invocationDigest(invocation));
    return prepared;
  }
  async execute(prepared) {
    if (this.prepared.get(prepared) !== invocationDigest(prepared.request)) throw new Error("Unprepared, modified or replayed invocation");
    this.prepared.delete(prepared);
    prepared = { request: structuredClone(prepared.request), context: prepared.context };
    const handle = { stdout: Buffer.alloc(0), truncated: false, exitCode: null, validatedRuntimeResult: null, prepared, name: `mc-invoke-${randomUUID()}`, promise: Promise.resolve(null), cleanupFailed: false, startedAt: Date.now(), cancellation: new AbortController() };
    handle.promise = this.dispatch(handle);
    const token = Object.freeze({});
    this.handles.set(token, handle);
    return token;
  }
  async dispatch(handle) {
    const { request, context } = handle.prepared;
    const startedAt = handle.startedAt;
    const result = (status) => invocationResult(request, status, startedAt);
    if (context.signal?.aborted || handle.fence) return result("CANCELED");
    try {
      if (!await this.bounded(this.authority(structuredClone(request), "DISPATCH"), handle)) return result("STALE");
    } catch {
      return result(handle.fence ?? "STALE");
    }
    if (context.signal?.aborted || handle.fence) return result("CANCELED");
    if (Date.now() - startedAt >= request.limits.timeoutMs) return result("TIMED_OUT");
    const args = [
      "run",
      "--pull",
      "never",
      "--name",
      handle.name,
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "SYS_CHROOT",
      "--cap-add",
      "SETUID",
      "--cap-add",
      "SETGID",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "64",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "--tmpfs",
      "/jail/workspace:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700",
      "--tmpfs",
      "/jail/tmp:rw,noexec,nosuid,size=16777216,uid=65534,gid=65534,mode=0700",
      "--entrypoint",
      "/usr/bin/env",
      "-i",
      request.composition.runtimeImage,
      "-i",
      "PATH=/runtime",
      "HOME=/workspace",
      "TMPDIR=/tmp",
      "LANG=C",
      "/usr/sbin/chroot",
      "--userspec=65534:65534",
      "/jail",
      "/runtime/node",
      "/runtime/invoke.mjs"
    ];
    let timer;
    let closed;
    const abort = () => {
      void this.cancelState(handle).catch(() => {
        handle.cleanupFailed = true;
      });
    };
    try {
      handle.dockerConfig = await mkdtemp(join(tmpdir(), "mc-offline-docker-"));
      if (this.imageBinding) {
        handle.runtimeImage = await this.bounded(this.resolveImage(handle), handle);
        args[args.indexOf(request.composition.runtimeImage)] = handle.runtimeImage.selectedReference;
      }
      if (context.signal?.aborted || handle.fence || Date.now() - startedAt >= request.limits.timeoutMs) {
        handle.fence ??= context.signal?.aborted ? "CANCELED" : "TIMED_OUT";
        throw new Error(handle.fence);
      }
      args.splice(1, 0, "--cidfile", join(handle.dockerConfig, "container.id"));
      const child = spawn(this.dockerExecutable, [...this.dockerOptions(handle), ...args], { env: { PATH: "/usr/local/bin:/usr/bin:/bin" }, stdio: ["pipe", "pipe", "pipe"] });
      handle.child = child;
      const exit = new Promise((resolve) => {
        child.once("error", () => {
        });
        child.once("close", (code2) => {
          handle.exitCode = code2;
          resolve(code2);
        });
      });
      closed = exit;
      child.stdout.on("data", (chunk) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = 32768 - handle.stdout.length;
        handle.stdout = Buffer.concat([handle.stdout, bytes.subarray(0, remaining)]);
        if (bytes.length > remaining) {
          handle.truncated = true;
          handle.fence ??= "INFRASTRUCTURE_FAILURE";
          child.kill("SIGKILL");
        }
      });
      child.stderr.resume();
      child.stdin.on("error", () => {
      });
      timer = setTimeout(() => {
        handle.fence ??= "TIMED_OUT";
        child.kill("SIGKILL");
      }, Math.max(1, request.limits.timeoutMs - (Date.now() - startedAt)));
      context.signal?.addEventListener("abort", abort, { once: true });
      if (context.signal?.aborted || handle.fence) {
        handle.fence ??= "CANCELED";
        child.kill("SIGKILL");
      }
      child.stdin.end(JSON.stringify(request));
      await this.bounded(Promise.resolve(context.emit({ executionId: request.executionId, sequence: 1, type: "EXECUTION_STARTED", occurredAt: Date.now(), summary: "Offline container invocation started." })), handle);
      const code = await exit;
      handle.exitCode = code;
      if (code === 0 && !handle.truncated) {
        try {
          const candidate = JSON.parse(handle.stdout.toString("utf8"));
          if (invocationResultMatches(candidate, request)) handle.validatedRuntimeResult = candidate;
        } catch {
        }
      }
      if (handle.fence) return result(handle.fence);
      if (code !== 0) return result(code === 2 ? "INVALID_REQUEST" : "INFRASTRUCTURE_FAILURE");
      return handle.validatedRuntimeResult ?? result("INFRASTRUCTURE_FAILURE");
    } catch {
      return result(handle.fence ?? "INFRASTRUCTURE_FAILURE");
    } finally {
      if (timer) clearTimeout(timer);
      context.signal?.removeEventListener("abort", abort);
      handle.child?.kill("SIGKILL");
      if (closed) {
        let drainTimer;
        try {
          const drained = await Promise.race([closed.then(() => true), new Promise((resolve) => {
            drainTimer = setTimeout(() => resolve(false), 1e4);
          })]);
          if (!drained) handle.cleanupFailed = true;
          else if (handle.exitCode === 0 && !handle.truncated) {
            try {
              const observed = JSON.parse(handle.stdout.toString("utf8"));
              if (invocationResultMatches(observed, request)) handle.validatedRuntimeResult = observed;
            } catch {
            }
          }
        } finally {
          if (drainTimer) clearTimeout(drainTimer);
        }
      }
      if (handle.dockerConfig) {
        try {
          const id = (await readFile(join(handle.dockerConfig, "container.id"), "utf8")).trim();
          if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid Docker container identity");
          handle.containerId = id;
          if (this.imageBinding) {
            const observed = await exec(
              this.dockerExecutable,
              [...this.dockerOptions(handle), "container", "inspect", "--format", "{{.Image}}", id],
              { timeout: 1e4, maxBuffer: 128e3, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } }
            );
            handle.containerImageId = observed.stdout.trim();
            if (![this.imageBinding.manifestDigest, this.imageBinding.configDigest].includes(handle.containerImageId)) {
              handle.fence ??= "INFRASTRUCTURE_FAILURE";
            }
          }
        } catch {
          if (handle.validatedRuntimeResult) handle.fence ??= "INFRASTRUCTURE_FAILURE";
        }
      }
      await this.stop(handle);
      if (handle.dockerConfig) {
        try {
          await rm(handle.dockerConfig, { recursive: true, force: true });
        } catch {
          handle.cleanupFailed = true;
        }
      }
    }
  }
  async bounded(operation, handle) {
    const signal = handle.prepared.context.signal;
    let timer;
    let abort = () => {
    };
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        const fail = (status) => {
          handle.fence ??= status;
          handle.child?.kill("SIGKILL");
          reject(new Error(status));
        };
        abort = () => fail("CANCELED");
        signal?.addEventListener("abort", abort, { once: true });
        handle.cancellation.signal.addEventListener("abort", abort, { once: true });
        const remaining = handle.prepared.request.limits.timeoutMs - (Date.now() - handle.startedAt);
        if (signal?.aborted || handle.cancellation.signal.aborted || handle.fence === "CANCELED") fail("CANCELED");
        else if (remaining <= 0) fail("TIMED_OUT");
        else timer = setTimeout(() => fail("TIMED_OUT"), remaining);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      handle.cancellation.signal.removeEventListener("abort", abort);
    }
  }
  dockerOptions(handle) {
    if (!handle.dockerConfig) throw new Error("Isolated Docker configuration is missing");
    return ["--host", "unix:///var/run/docker.sock", "--config", handle.dockerConfig];
  }
  async resolveImage(handle) {
    const binding = this.imageBinding;
    for (const reference of [binding.manifestDigest, binding.configDigest]) {
      let stdout;
      try {
        ({ stdout } = await exec(
          this.dockerExecutable,
          [...this.dockerOptions(handle), "image", "inspect", reference],
          { timeout: 1e4, maxBuffer: 128e3, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } }
        ));
      } catch (error) {
        const failure = error;
        if (failure.code === 1 && typeof failure.stderr === "string" && failure.stderr.trim() === `Error response from daemon: No such image: ${reference}`) continue;
        throw error;
      }
      return inspectIsolatedRuntimeImage(binding, reference, JSON.parse(stdout));
    }
    throw new Error("Exact qualified OCI image is unavailable");
  }
  async stop(handle) {
    if (!handle.dockerConfig) return;
    const resource = handle.containerId ?? handle.name;
    const options = { timeout: 1e4, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } };
    try {
      await exec(this.dockerExecutable, [...this.dockerOptions(handle), "rm", "-f", resource], options);
    } catch {
    }
    try {
      await exec(this.dockerExecutable, [...this.dockerOptions(handle), "container", "inspect", resource], options);
      handle.cleanupFailed = true;
    } catch (error) {
      const failure = error;
      handle.cleanupFailed = handle.cleanupFailed || failure.code !== 1 || typeof failure.stderr !== "string" || !failure.stderr.includes(`No such container: ${resource}`);
    }
  }
  async collectResult(token) {
    const handle = this.requireHandle(token);
    if (this.collected.has(token)) throw new Error("Result already collected");
    this.collected.add(token);
    let receipt = await handle.promise;
    if (handle.fence) receipt = invocationResult(handle.prepared.request, handle.fence, receipt.startedAt);
    else if (handle.cleanupFailed) receipt = invocationResult(handle.prepared.request, "INFRASTRUCTURE_FAILURE", receipt.startedAt);
    else {
      try {
        if (!await this.bounded(this.authority(structuredClone(handle.prepared.request), "RESULT"), handle)) receipt = invocationResult(handle.prepared.request, "STALE", receipt.startedAt);
      } catch {
        receipt = invocationResult(handle.prepared.request, "STALE", receipt.startedAt);
      }
    }
    if (handle.fence) receipt = invocationResult(handle.prepared.request, handle.fence, receipt.startedAt);
    return {
      executionId: receipt.executionId,
      status: receipt.status === "SUCCESS" ? "COMPLETED" : receipt.status === "CANCELED" ? "CANCELED" : "FAILED",
      output: JSON.stringify(receipt),
      invocationEvidence: {
        schema: this.imageBinding ? "factory-isolated-execution-evidence/v3" : "factory-isolated-execution-evidence/v2",
        evidenceOrigin: "CONTROL_FIXTURE",
        authority: "NONE",
        container: { name: handle.name, id: handle.containerId ?? null },
        ...this.imageBinding ? { runtimeImage: structuredClone(handle.runtimeImage ?? null), containerImageId: handle.containerImageId ?? null } : {},
        stdoutBase64: handle.stdout.toString("base64"),
        capturedStdoutSha256: `sha256:${createHash("sha256").update(handle.stdout).digest("hex")}`,
        truncated: handle.truncated,
        exitCode: handle.exitCode,
        cleanupVerified: !handle.cleanupFailed,
        validatedRuntimeResult: structuredClone(handle.validatedRuntimeResult)
      }
    };
  }
  async cancelState(handle) {
    handle.fence ??= "CANCELED";
    handle.cancellation.abort();
    handle.child?.kill("SIGKILL");
    return true;
  }
  requireHandle(token) {
    const state = this.handles.get(token);
    if (!state) throw new Error("Foreign or cleaned invocation handle");
    return state;
  }
  async cancel(token) {
    return this.cancelState(this.requireHandle(token));
  }
  async cleanup(token) {
    if (this.cleaned.has(token)) return;
    const handle = this.requireHandle(token);
    await handle.promise;
    if (handle.cleanupFailed) throw new Error("Container cleanup unverified");
    this.handles.delete(token);
    this.cleaned.add(token);
  }
  async health() {
    return { status: "UNAVAILABLE", checkedAt: Date.now(), adapter: "isolated-invocation", version: "1", details: "Governed profile admission is not qualified. Offline controls only." };
  }
};
export {
  ISOLATED_CONTAINER_POLICY,
  ISOLATED_CONTAINER_POLICY_DIGEST,
  IsolatedInvocationAdapter
};
