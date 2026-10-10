// apps/orchestration-server/src/isolatedInvocationEntry.ts
import { readFileSync } from "node:fs";

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
function sha256Hex(input2) {
  const bytes = Array.from(typeof input2 === "string" ? new TextEncoder().encode(input2) : input2);
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
  const input2 = value.input;
  if (!exact2(input2, [
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
  if (![input2.subjectDigest, input2.verificationPlanDigest, input2.expectedContentSha256].every((item) => typeof item === "string" && /^sha256:[a-f0-9]{64}$/.test(item)) || ![input2.candidateSha, input2.candidateTreeSha].every((item) => typeof item === "string" && /^[a-f0-9]{40,64}$/.test(item)) || ![input2.repositoryId, input2.workOrderId, input2.producerAttemptId].every((item) => typeof item === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(item)) || !Number.isSafeInteger(input2.workOrderRevisionNumber) || input2.workOrderRevisionNumber < 1 || !deterministicDocumentPath(input2.path) || typeof input2.candidateContent !== "string" || new TextEncoder().encode(input2.candidateContent).length > 2e4) return ["verification-input-invalid"];
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
function invocationResult(request, status, startedAt2, completedAt = Date.now()) {
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
    startedAt: startedAt2,
    completedAt,
    summary: status === "SUCCESS" ? candidateFiles.length ? "Deterministic document produced; independent verification required." : verification ? "Exact document byte comparison completed; no acceptance authority." : "Synthetic receipt control executed." : status,
    evidenceOrigin: "CONTROL_FIXTURE",
    behavioralPass: false,
    providerCalls: 0,
    candidateFiles,
    resultDigest: status === "SUCCESS" ? invocationDigest(verification ?? (candidateFiles.length ? candidateFiles : "SYNTHETIC_RECEIPT")) : null
  };
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

// apps/orchestration-server/src/isolatedInvocationEntry.ts
var startedAt = Date.now();
var input = Buffer.alloc(0);
try {
  for await (const chunk of process.stdin) {
    input = Buffer.concat([input, chunk]);
    if (input.length > 16384) throw new Error("request-size-invalid");
  }
  const request = JSON.parse(input.toString("utf8"));
  const issues = isolatedInvocationIssues(request);
  if (issues.length) throw new Error("request-invalid");
  const binding = JSON.parse(readFileSync("/runtime/invocation-binding.json", "utf8"));
  if (request.composition.bridge.digest !== binding.bridgeDigest || request.composition.backend.digest !== binding.backendDigest || request.schema !== binding.invocationSchema || request.resultSchema !== binding.resultSchema || request.composition.isolationDigest !== binding.isolationDigest) throw new Error("composition-mismatch");
  process.stdout.write(JSON.stringify(invocationResult(request, "SUCCESS", startedAt)) + "\n");
} catch {
  process.stdout.write(JSON.stringify({ schema: "factory-isolated-rejection/v1", status: "INVALID_REQUEST" }) + "\n");
  process.exitCode = 2;
}
