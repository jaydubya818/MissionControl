/**
 * Self-contained supervisor source uploaded to an execution-only VM.
 * Keep this dependency-free: the remote image receives Node, Git, frozen
 * inputs, and no Mission Control source tree.
 */
export function standaloneRemoteSupervisorSource() {
  return String.raw`
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BYTES = 1048576;
const MAX_LINES = 10000;
const LIFECYCLE_PATH = "/var/lib/mission-control/attempt/lifecycle.jsonl";
const lifecycleEvents = [];
const arrayFields = ["completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds", "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks"];
const canonical = (value) => value === null || typeof value !== "object"
  ? (JSON.stringify(value) ?? "undefined")
  : Array.isArray(value)
    ? "[" + value.map((item) => item === undefined ? "" : canonical(item)).join(",") + "]"
    : "{" + Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
const digest = (namespace, value) => "sha256:" + createHash("sha256").update(canonical({ namespace, value })).digest("hex");
const objectDigest = (value) => "sha256:" + createHash("sha256").update(canonical(value)).digest("hex");
const boundedIdentity = (value, maximum) => typeof value === "string" && value === value.trim()
  && value.length > 0 && value.length <= maximum && !/[\0\r\n]/.test(value);
const runtimeArtifactValid = (artifact) => artifact && typeof artifact === "object" && !Array.isArray(artifact)
  && Object.keys(artifact).every((key) => ["schemaVersion", "kind", "name", "version", "executableSha256", "closureSha256", "imageDigest"].includes(key))
  && artifact.schemaVersion === "harness-runtime-artifact/v1"
  && ["EXECUTABLE", "CONTAINER_IMAGE"].includes(artifact.kind)
  && typeof artifact.name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(artifact.name)
  && (artifact.version === null || (typeof artifact.version === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/.test(artifact.version)))
  && (artifact.executableSha256 === null || (typeof artifact.executableSha256 === "string" && /^[a-f0-9]{64}$/.test(artifact.executableSha256)))
  && (artifact.closureSha256 === undefined || (typeof artifact.closureSha256 === "string" && /^[a-f0-9]{64}$/.test(artifact.closureSha256)))
  && (artifact.imageDigest === null || (typeof artifact.imageDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(artifact.imageDigest)))
  && (artifact.kind !== "EXECUTABLE" || (artifact.executableSha256 !== null && artifact.imageDigest === null))
  && (artifact.kind !== "CONTAINER_IMAGE" || (artifact.imageDigest !== null && artifact.executableSha256 === null));
const v2RouteValid = (route) => route && route.schema === "factory-model-route/v2"
  && Object.keys(route).every((key) => ["schema", "provider", "providerRoute", "modelId", "reasoningConfig"].includes(key))
  && !Object.prototype.hasOwnProperty.call(route, "capabilityIdentity")
  && !Object.prototype.hasOwnProperty.call(route, "runtimeIdentity")
  && boundedIdentity(route.provider, 100) && route.provider === route.provider.toLowerCase()
  && boundedIdentity(route.providerRoute, 100) && route.providerRoute === route.providerRoute.toLowerCase()
  && boundedIdentity(route.modelId, 200)
  && (route.reasoningConfig === undefined || (
    route.reasoningConfig && typeof route.reasoningConfig === "object" && !Array.isArray(route.reasoningConfig)
    && Object.keys(route.reasoningConfig).length > 0
    && Object.keys(route.reasoningConfig).every((key) => ["effort", "temperature", "maxTokens"].includes(key))
    && (route.reasoningConfig.effort === undefined || (boundedIdentity(route.reasoningConfig.effort, 64) && route.reasoningConfig.effort === route.reasoningConfig.effort.toLowerCase()))
    && (route.reasoningConfig.temperature === undefined || (typeof route.reasoningConfig.temperature === "number" && Number.isFinite(route.reasoningConfig.temperature) && route.reasoningConfig.temperature >= 0 && route.reasoningConfig.temperature <= 2))
    && (route.reasoningConfig.maxTokens === undefined || (Number.isSafeInteger(route.reasoningConfig.maxTokens) && route.reasoningConfig.maxTokens >= 1 && route.reasoningConfig.maxTokens <= 10000000))
  ));
const plainObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys) => plainObject(value) && Object.keys(value).every((key) => keys.includes(key));
const sha256 = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const bareSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sameCanonical = (left, right) => canonical(left) === canonical(right);
const sortedUnique = (values) => Array.isArray(values) && new Set(values).size === values.length
  && values.every((value, index) => index === 0 || String(values[index - 1]).localeCompare(String(value)) < 0);
const boundedList = (values, maximumItems, maximumLength) => Array.isArray(values) && values.length <= maximumItems
  && new Set(values).size === values.length && values.every((value) => boundedIdentity(value, maximumLength));
const supportRank = { UNKNOWN: 0, UNSUPPORTED: 0, PARTIAL: 1, SUPPORTED: 2 };
const capabilitySupport = (manifest, capability) => {
  const parts = capability.split(".");
  if (parts.length !== 2) return undefined;
  const value = manifest?.[parts[0]]?.[parts[1]];
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(supportRank, value) ? value : undefined;
};
const requirementsSatisfied = (manifest, requirements) => Array.isArray(requirements) && requirements.every((requirement) => {
  const support = capabilitySupport(manifest, requirement.capability);
  return support !== undefined && supportRank[support] >= supportRank[requirement.minimumSupport];
});
const harnessManifestValid = (manifest) => {
  const identity = manifest?.identity;
  const boundedId = (value, maximum = 100) => typeof value === "string" && value === value.trim()
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value.length <= maximum;
  const capabilityPaths = [
    "models.providerSelection", "models.modelSelection", "models.reasoningControls",
    "filesystem.read", "filesystem.write", "filesystem.pathAllowlist", "filesystem.changedFileCapture",
    "shell.available", "shell.commandTimeout", "shell.processTreeCancellation", "shell.credentialEnvironmentScrub",
    "git.status", "git.diff", "git.commit", "git.branch", "git.remotePublication",
    "browser.webSearch", "browser.webFetch", "browser.interactiveBrowser",
    "tools.native", "tools.mcp", "tools.structuredOutput", "tools.telemetry",
    "subagents.available", "subagents.parallel", "subagents.background", "subagents.eventVisibility",
    "streaming.events", "streaming.modelDeltas", "streaming.durableReplay",
    "context.persistentSessions", "context.resume", "context.fork", "context.compaction", "context.instructionFiles",
    "headless.support", "cancellation.support", "network.runtimeEgressControl", "credentials.redaction",
    "telemetry.tokens", "telemetry.cost", "telemetry.toolCalls", "telemetry.modelRequests", "telemetry.retries",
  ];
  const prohibited = ["worker-leases", "verification-subjects", "verification-plans", "evidence-authority", "github-publication", "acceptance"];
  return plainObject(manifest) && plainObject(identity) && manifest.schemaVersion === "harness-capability-manifest/v1"
    && manifest.scope === "ADAPTER_EFFECTIVE"
    && [identity.harnessId, identity.harnessVersion, identity.adapterId, identity.adapterVersion].every((value) => boundedId(value))
    && typeof identity.harnessCommit === "string" && /^[a-f0-9]{40}$/i.test(identity.harnessCommit)
    && bareSha256(manifest.effectiveConfigSha256)
    && Array.isArray(manifest.models?.supported) && manifest.models.supported.length >= 1 && manifest.models.supported.length <= 100
    && manifest.models.supported.every((model) => boundedIdentity(model?.provider, 100) && boundedIdentity(model?.modelId, 200)
      && ["ADVERTISED", "PASSTHROUGH", "DYNAMIC"].includes(model.selection)
      && (model.contextWindowTokens === null || (Number.isSafeInteger(model.contextWindowTokens) && model.contextWindowTokens >= 1))
      && boundedList(model.modalities, 20, 50))
    && capabilityPaths.every((capability) => capabilitySupport(manifest, capability) !== undefined)
    && Array.isArray(manifest.sandbox?.isolationModes) && manifest.sandbox.isolationModes.length >= 1
    && new Set(manifest.sandbox.isolationModes).size === manifest.sandbox.isolationModes.length
    && Array.isArray(manifest.admission?.executionBackends) && manifest.admission.executionBackends.length >= 1 && manifest.admission.executionBackends.length <= 16
    && boundedList(manifest.sandbox.requirements, 100, 500)
    && boundedList(manifest.network?.destinations, 100, 500)
    && boundedList(manifest.credentials?.classes, 100, 200)
    && boundedList(manifest.admission.requiredExternalControls, 100, 200)
    && boundedList(manifest.admission.prohibitedAuthorities, 100, 200)
    && prohibited.every((authority) => manifest.admission.prohibitedAuthorities.includes(authority))
    && Array.isArray(manifest.limitations) && manifest.limitations.length <= 100
    && manifest.limitations.every((item) => boundedIdentity(item, 1000));
};
const harnessSupportsModel = (manifest, route) => Array.isArray(manifest?.models?.supported)
  && manifest.models.supported.some((candidate) => candidate?.provider === route?.provider
    && (candidate.modelId === route?.modelId || candidate.modelId === "*"));
const deniedProfileAuthority = (authority) => onlyKeys(authority, ["routing", "verification", "publication", "acceptance", "merge", "policyMutation", "workerLeases"])
  && Object.values(authority).length === 7 && Object.values(authority).every((value) => value === false);
const harnessRequirementsValid = (requirements) => Array.isArray(requirements) && requirements.length > 0 && requirements.length <= 50
  && requirements.every((item) => onlyKeys(item, ["capability", "minimumSupport"])
    && boundedIdentity(item.capability, 100) && ["PARTIAL", "SUPPORTED"].includes(item.minimumSupport))
  && sortedUnique(requirements.map((item) => item.capability));
const sandboxRequirementsValid = (requirements) => Array.isArray(requirements) && requirements.length > 0 && requirements.length <= 16
  && requirements.every((item) => boundedIdentity(item, 100)) && sortedUnique(requirements);
const requirementsAllowed = (allowed, selected) => Array.isArray(allowed) && Array.isArray(selected) && selected.length > 0
  && selected.every((item) => allowed.some((candidate) => sameCanonical(candidate, item)));
const selectedHarnessRequirements = (isolation) => !["READ_ONLY", "WORKSPACE_WRITE"].includes(isolation) ? [] : [
  { capability: "filesystem.read", minimumSupport: "SUPPORTED" },
  ...(isolation === "WORKSPACE_WRITE" ? [{ capability: "filesystem.write", minimumSupport: "SUPPORTED" }] : []),
  { capability: "filesystem.pathAllowlist", minimumSupport: "PARTIAL" },
  { capability: "shell.available", minimumSupport: "PARTIAL" },
  { capability: "shell.processTreeCancellation", minimumSupport: "PARTIAL" },
  { capability: "git.status", minimumSupport: "SUPPORTED" },
  { capability: "git.diff", minimumSupport: "SUPPORTED" },
  { capability: "tools.structuredOutput", minimumSupport: "PARTIAL" },
  { capability: "headless.support", minimumSupport: "PARTIAL" },
  { capability: "cancellation.support", minimumSupport: "PARTIAL" },
];
const profileHarnessRequirements = (isolationModes) => {
  const requirements = new Map();
  for (const isolation of isolationModes) {
    for (const requirement of selectedHarnessRequirements(isolation)) {
      if (requirements.get(requirement.capability) !== "SUPPORTED") requirements.set(requirement.capability, requirement.minimumSupport);
    }
  }
  return [...requirements.entries()].map(([capability, minimumSupport]) => ({ capability, minimumSupport }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
};
const selectedSandboxCapabilities = (backend, isolation, sandboxSnapshot) => {
  if (!["READ_ONLY", "WORKSPACE_WRITE"].includes(isolation)) return [];
  const values = ["git-worktree", isolation === "READ_ONLY" ? "read-only" : "workspace-write"];
  if (backend === "remote-sandbox") {
    values.push("remote-sandbox", "sandbox-provider:" + String(sandboxSnapshot?.provider ?? "").toLowerCase().replace(/_/g, "-"));
  }
  return values.sort();
};
const profileSandboxCapabilities = (isolationModes, backend, sandboxSnapshot) => {
  const values = new Set(["git-worktree"]);
  if (isolationModes.includes("READ_ONLY")) values.add("read-only");
  if (isolationModes.includes("WORKSPACE_WRITE")) values.add("workspace-write");
  if (backend === "remote-sandbox") {
    values.add("remote-sandbox");
    if (boundedIdentity(sandboxSnapshot?.provider, 100)) {
      values.add("sandbox-provider:" + sandboxSnapshot.provider.toLowerCase().replace(/_/g, "-"));
    }
  }
  return [...values].sort();
};
const sameRequirements = (left, right) => Array.isArray(left) && Array.isArray(right)
  && sameCanonical(left.map((item) => String(item?.capability) + ":" + String(item?.minimumSupport)).sort(), right.map((item) => String(item?.capability) + ":" + String(item?.minimumSupport)).sort());
const sameStringSet = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.every((item) => typeof item === "string") && right.every((item) => typeof item === "string")
  && sameCanonical([...left].sort(), [...right].sort());
const v3ExecutionProfileValid = (manifest, profileAdmittedAt) => {
  if (manifest?.version !== "factory-execution-manifest/v3") return false;
  if (!Number.isSafeInteger(profileAdmittedAt) || profileAdmittedAt < 0) return false;
  const binding = manifest.executionProfile;
  if (!onlyKeys(binding, ["profileId", "profileKey", "version", "profileDigest", "profileSnapshot", "qualificationDigest", "qualificationSnapshot"])
    || !boundedIdentity(binding.profileId, 200) || !boundedIdentity(binding.profileKey, 100)
    || !Number.isSafeInteger(binding.version) || binding.version < 1 || !sha256(binding.profileDigest) || !sha256(binding.qualificationDigest)) return false;
  const profile = binding.profileSnapshot;
  const qualification = binding.qualificationSnapshot;
  if (!onlyKeys(profile, ["schema", "profileKey", "version", "harness", "runtimeArtifact", "executionBackend", "modelRoute", "sandboxProfile", "isolationModes", "requiredHarnessCapabilities", "requiredSandboxCapabilities", "lifecycle", "authority"])
    || profile.schema !== "factory-execution-profile/v1" || profile.profileKey !== binding.profileKey || profile.version !== binding.version
    || binding.profileDigest !== digest("factory-execution-profile/v1", profile)
    || !onlyKeys(profile.harness, ["adapter", "version", "capabilityManifest", "capabilityManifestDigest", "effectiveConfigSha256"])
    || !onlyKeys(profile.runtimeArtifact, ["snapshot", "digest"])
    || !onlyKeys(profile.modelRoute, ["catalogId", "routeSnapshot", "routeDigest", "qualificationSnapshot", "qualificationDigest"])
    || profile.executionBackend !== "remote-sandbox"
    || !onlyKeys(profile.sandboxProfile, ["profileId", "profileSnapshot", "profileDigest"])
    || !boundedIdentity(profile.sandboxProfile.profileId, 200) || !sha256(profile.sandboxProfile.profileDigest)
    || profile.sandboxProfile.profileDigest !== digest("factory-sandbox-profile/v1", profile.sandboxProfile.profileSnapshot)
    || profile.sandboxProfile.profileSnapshot?.schema !== "factory-sandbox-profile/v1"
    || !boundedIdentity(profile.sandboxProfile.profileSnapshot?.profileKey, 100)
    || !Number.isSafeInteger(profile.sandboxProfile.profileSnapshot?.version) || profile.sandboxProfile.profileSnapshot.version < 1
    || !Array.isArray(profile.isolationModes) || profile.isolationModes.length < 1 || profile.isolationModes.length > 2
    || !sortedUnique(profile.isolationModes) || profile.isolationModes.some((mode) => !["READ_ONLY", "WORKSPACE_WRITE"].includes(mode))
    || !harnessRequirementsValid(profile.requiredHarnessCapabilities) || !sandboxRequirementsValid(profile.requiredSandboxCapabilities)
    || !onlyKeys(profile.lifecycle, ["contractVersion", "cancellationMode", "idempotentCleanup", "retryCreatesNewAttempt", "inFlightRevocationPolicy", "componentSubstitution"])
    || profile.lifecycle.contractVersion !== "generic-harness-contract/v1"
    || profile.lifecycle.cancellationMode !== profile.harness?.capabilityManifest?.cancellation?.mode
    || profile.lifecycle.idempotentCleanup !== profile.harness?.capabilityManifest?.cancellation?.idempotentCleanup
    || profile.lifecycle.retryCreatesNewAttempt !== true || profile.lifecycle.inFlightRevocationPolicy !== "LEASED_ATTEMPT_MAY_COMPLETE"
    || profile.lifecycle.componentSubstitution !== "DENIED" || !deniedProfileAuthority(profile.authority)) return false;
  if (!harnessManifestValid(profile.harness.capabilityManifest)
    || profile.isolationModes.some((mode) => !profile.harness.capabilityManifest.sandbox.isolationModes.includes(mode))
    || !profile.harness.capabilityManifest.admission.executionBackends.includes(profile.executionBackend)
    || !requirementsSatisfied(profile.harness.capabilityManifest, profile.requiredHarnessCapabilities)
    || !harnessSupportsModel(profile.harness.capabilityManifest, profile.modelRoute.routeSnapshot)
    || !sameCanonical(profile.requiredHarnessCapabilities, profileHarnessRequirements(profile.isolationModes))
    || !sameCanonical(profile.requiredSandboxCapabilities, profileSandboxCapabilities(
      profile.isolationModes,
      profile.executionBackend,
      profile.sandboxProfile.profileSnapshot,
    ))) return false;
  const sandboxImageDigest = profile.sandboxProfile.profileSnapshot?.security?.image?.digest;
  const sandboxReferenceDigest = typeof profile.sandboxProfile.profileSnapshot?.machine?.image === "string"
    ? profile.sandboxProfile.profileSnapshot.machine.image.match(/@(sha256:[a-f0-9]{64})$/)?.[1] : undefined;
  if (!sha256(sandboxImageDigest) || sandboxImageDigest !== sandboxReferenceDigest
    || profile.runtimeArtifact.snapshot?.kind !== "CONTAINER_IMAGE"
    || profile.runtimeArtifact.snapshot?.executableSha256 !== null
    || profile.runtimeArtifact.snapshot?.imageDigest !== sandboxImageDigest) return false;
  if (!onlyKeys(qualification, ["schema", "profile", "components", "scope", "evidence", "approvedBy", "approvedAt", "validUntil", "authority"])
    || qualification.schema !== "factory-execution-profile-qualification/v1"
    || binding.qualificationDigest !== digest("factory-execution-profile-qualification/v1", qualification)
    || !onlyKeys(qualification.profile, ["id", "key", "version", "digest"])
    || qualification.profile.id !== binding.profileId || qualification.profile.key !== binding.profileKey
    || qualification.profile.version !== binding.version || qualification.profile.digest !== binding.profileDigest
    || !onlyKeys(qualification.scope, ["workloadClasses", "riskClasses"])
    || !sortedUnique(qualification.scope.workloadClasses) || qualification.scope.workloadClasses.length < 1 || qualification.scope.workloadClasses.length > 50
    || qualification.scope.workloadClasses.some((value) => !boundedIdentity(value, 64) || !/^[A-Z][A-Z0-9_]{1,63}$/.test(value))
    || !sortedUnique(qualification.scope.riskClasses) || qualification.scope.riskClasses.length < 1 || qualification.scope.riskClasses.length > 3
    || qualification.scope.riskClasses.some((risk) => !["GREEN", "YELLOW", "RED"].includes(risk))
    || !onlyKeys(qualification.evidence, ["reference", "digest"]) || !boundedIdentity(qualification.evidence.reference, 1000)
    || !sha256(qualification.evidence.digest) || !boundedIdentity(qualification.approvedBy, 200)
    || !Number.isFinite(qualification.approvedAt) || qualification.approvedAt < 0 || qualification.approvedAt > profileAdmittedAt
    || !Number.isFinite(qualification.validUntil) || qualification.validUntil <= profileAdmittedAt
    || qualification.validUntil <= qualification.approvedAt || qualification.validUntil - qualification.approvedAt > 31622400000
    || !deniedProfileAuthority(qualification.authority)) return false;
  const expectedComponents = {
    harness: { adapter: profile.harness.adapter, version: profile.harness.version, capabilityManifestDigest: profile.harness.capabilityManifestDigest, effectiveConfigSha256: profile.harness.effectiveConfigSha256 },
    runtimeArtifactDigest: profile.runtimeArtifact.digest,
    executionBackend: profile.executionBackend,
    modelRoute: { catalogId: profile.modelRoute.catalogId, routeDigest: profile.modelRoute.routeDigest, qualificationDigest: profile.modelRoute.qualificationDigest },
    sandboxProfile: { profileId: profile.sandboxProfile.profileId, profileDigest: profile.sandboxProfile.profileDigest },
    isolationModes: profile.isolationModes,
    requiredHarnessCapabilities: profile.requiredHarnessCapabilities,
    requiredSandboxCapabilities: profile.requiredSandboxCapabilities,
  };
  const expectedHarnessRequirements = selectedHarnessRequirements(manifest.harness?.isolation);
  const expectedSandboxCapabilities = selectedSandboxCapabilities(
    manifest.executionBackend,
    manifest.harness?.isolation,
    profile.sandboxProfile.profileSnapshot,
  );
  return sameCanonical(qualification.components, expectedComponents)
    && profile.harness.adapter === manifest.harness?.adapter && profile.harness.version === manifest.harness?.version
    && profile.harness.capabilityManifestDigest === manifest.harness?.capabilityManifestSha256
    && profile.harness.effectiveConfigSha256 === manifest.harness?.effectiveConfigSha256
    && sameCanonical(profile.harness.capabilityManifest, manifest.harness?.capabilityManifest)
    && profile.runtimeArtifact.digest === manifest.harness?.runtimeArtifactDigest
    && sameCanonical(profile.runtimeArtifact.snapshot, manifest.harness?.runtimeArtifact)
    && profile.executionBackend === manifest.executionBackend
    && profile.modelRoute.catalogId === manifest.modelRoute?.catalogId && profile.modelRoute.routeDigest === manifest.modelRoute?.routeDigest
    && profile.modelRoute.qualificationDigest === manifest.modelRoute?.qualificationDigest
    && sameCanonical(profile.modelRoute.routeSnapshot, manifest.modelRoute?.routeSnapshot)
    && sameCanonical(profile.modelRoute.qualificationSnapshot, manifest.modelRoute?.qualificationSnapshot)
    && profile.sandboxProfile.profileId === manifest.sandbox?.profileId && profile.sandboxProfile.profileDigest === manifest.sandbox?.profileDigest
    && sameCanonical(profile.sandboxProfile.profileSnapshot, manifest.sandbox?.profileSnapshot)
    && profile.isolationModes.includes(manifest.harness?.isolation)
    && sameRequirements(manifest.harness?.requiredHarnessCapabilities, expectedHarnessRequirements)
    && requirementsAllowed(profile.requiredHarnessCapabilities, expectedHarnessRequirements)
    && sameStringSet(manifest.harness?.requiredCapabilities, expectedSandboxCapabilities)
    && requirementsAllowed(profile.requiredSandboxCapabilities, expectedSandboxCapabilities);
};
const redact = (value) => String(value)
  .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
  .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_PROVIDER_TOKEN]")
  .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
const atomicWrite = (file, content) => {
  const directory = dirname(file);
  mkdirSync(directory, { recursive: true, mode: 448 });
  const temporary = file + ".tmp-" + process.pid + "-" + Date.now();
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 384);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    const directoryDescriptor = openSync(directory, "r");
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
  }
};
const fileObservation = (file) => {
  if (!file) return { state: "NOT_REQUESTED" };
  try {
    const entry = lstatSync(file);
    return {
      state: "PRESENT",
      type: entry.isDirectory() ? "DIRECTORY" : entry.isFile() ? "FILE" : entry.isSymbolicLink() ? "SYMLINK" : "OTHER",
      mode: (entry.mode & 0o777).toString(8).padStart(3, "0"),
      uid: entry.uid,
      gid: entry.gid,
      byteLength: entry.size,
    };
  } catch (error) {
    return { state: error?.code === "ENOENT" ? "ABSENT" : "STAT_ERROR" };
  }
};
const trace = (stage, details = {}) => {
  const event = { stage, occurredAt: Date.now(), ...details };
  lifecycleEvents.push(event);
  try {
    const currentSize = fileObservation(LIFECYCLE_PATH).byteLength ?? 0;
    if (currentSize < 65536) appendFileSync(LIFECYCLE_PATH, JSON.stringify(event) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {}
  return event;
};
const observeNetworkPolicy = () => {
  try {
    const ruleset = execFileSync("nft", ["list", "chain", "inet", "mission_control_egress", "output"], { encoding: "utf8", timeout: 5000 });
    return { state: "OBSERVED", rulesetDigest: digest("factory-sandbox-network-counters/v1", ruleset), rulesetTail: redact(ruleset).slice(-16000) };
  } catch (error) {
    return { state: "UNAVAILABLE", reason: redact(error?.message ?? error).slice(0, 1000) };
  }
};
const resultValidationIssues = (candidate) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return ["RESULT_NOT_OBJECT"];
  const allowed = new Set(["schema", "status", "summary", ...arrayFields, "nextAction"]);
  const issues = [];
  const unexpected = Object.keys(candidate).filter((key) => !allowed.has(key)).sort();
  if (unexpected.length) issues.push("UNEXPECTED_FIELDS:" + unexpected.join(","));
  if (candidate.schema !== "factory-result/v1") issues.push("SCHEMA_DISCRIMINATOR_INVALID");
  if (!["COMPLETED", "BLOCKED", "FAILED"].includes(candidate.status)) issues.push("STATUS_INVALID");
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 4000) issues.push("SUMMARY_INVALID");
  if (typeof candidate.nextAction !== "string" || candidate.nextAction.length > 4000) issues.push("NEXT_ACTION_INVALID");
  for (const field of arrayFields) {
    if (!Array.isArray(candidate[field]) || candidate[field].length > 200 || candidate[field].some((item) => typeof item !== "string" || item.length > 2000)) issues.push(field.toUpperCase() + "_INVALID");
  }
  if (arrayFields.slice(0, 3).every((field) => Array.isArray(candidate[field]))) {
    const criteria = [...candidate.completedAcceptanceCriterionIds, ...candidate.incompleteAcceptanceCriterionIds, ...candidate.unknownAcceptanceCriterionIds];
    if (new Set(criteria).size !== criteria.length) issues.push("ACCEPTANCE_CRITERION_DUPLICATED");
  }
  return issues;
};
const parseResult = (text) => {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) return undefined;
  let candidate;
  try { candidate = JSON.parse(text.trim()); } catch { return undefined; }
  if (resultValidationIssues(candidate).length) return undefined;
  return candidate;
};
const resultContextIssues = (result, expectedCriterionIds) => {
  if (!Array.isArray(expectedCriterionIds) || expectedCriterionIds.some((id) => typeof id !== "string" || !id) || new Set(expectedCriterionIds).size !== expectedCriterionIds.length) return ["EXPECTED_ACCEPTANCE_CRITERIA_INVALID"];
  const expected = [...expectedCriterionIds].sort();
  const reported = [...result.completedAcceptanceCriterionIds, ...result.incompleteAcceptanceCriterionIds, ...result.unknownAcceptanceCriterionIds].sort();
  const issues = [];
  if (JSON.stringify(reported) !== JSON.stringify(expected)) issues.push("ACCEPTANCE_CRITERIA_ACCOUNTING_INVALID");
  if (result.status === "COMPLETED" && (result.incompleteAcceptanceCriterionIds.length || result.unknownAcceptanceCriterionIds.length)) issues.push("COMPLETED_RESULT_HAS_UNRESOLVED_CRITERIA");
  return issues;
};
const inspectFile = (file) => {
  if (!file) return { state: "NOT_REQUESTED", byteLength: null, digest: null, tail: "", validationIssues: [] };
  let content;
  try { content = readFileSync(file, "utf8"); } catch (error) {
    return error?.code === "ENOENT"
      ? { state: "ABSENT", byteLength: null, digest: null, tail: "", validationIssues: [] }
      : { state: "READ_ERROR", byteLength: null, digest: null, tail: "", validationIssues: [] };
  }
  const byteLength = Buffer.byteLength(content, "utf8");
  const evidence = { byteLength, digest: digest("factory-executor-result-output/v1", content), tail: redact(content).slice(-4000) };
  if (byteLength > MAX_BYTES) return { state: "TOO_LARGE", ...evidence, validationIssues: ["RESULT_TOO_LARGE"] };
  const trimmed = content.trim();
  if (!trimmed) return { state: "EMPTY", ...evidence, validationIssues: ["RESULT_EMPTY"] };
  let candidate;
  try { candidate = JSON.parse(trimmed); } catch (error) {
    const truncated = /unexpected end|unterminated/i.test(String(error?.message ?? "")) || !/[}\]]$/.test(trimmed);
    const state = truncated ? "TRUNCATED" : "INVALID_JSON";
    return { state, ...evidence, validationIssues: [state === "TRUNCATED" ? "JSON_TRUNCATED" : "JSON_INVALID"] };
  }
  const validationIssues = resultValidationIssues(candidate);
  const result = parseResult(JSON.stringify(candidate));
  return result ? { state: "VALID", ...evidence, validationIssues: [], result } : { state: "SCHEMA_INVALID", ...evidence, validationIssues };
};
const inspectJsonl = (stdout, byteLength = Buffer.byteLength(stdout, "utf8")) => {
  const lines = stdout.split("\n").filter((line) => line.trim());
  let malformedLineCount = 0;
  let terminalCompletedCount = 0;
  let terminalFailureCount = 0;
  let completedIndex = -1;
  let inputTokens = null;
  let outputTokens = null;
  const candidates = [];
  if (byteLength <= MAX_BYTES && lines.length <= MAX_LINES) lines.forEach((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { malformedLineCount += 1; return; }
    if (event?.type === "turn.completed") {
      terminalCompletedCount += 1;
      completedIndex = index;
      const observedInput = event.usage?.input_tokens ?? event.usage?.inputTokens;
      const observedOutput = event.usage?.output_tokens ?? event.usage?.outputTokens;
      inputTokens = Number.isSafeInteger(observedInput) && observedInput >= 0 ? observedInput : null;
      outputTokens = Number.isSafeInteger(observedOutput) && observedOutput >= 0 ? observedOutput : null;
    }
    if (["turn.failed", "turn.canceled", "error"].includes(event?.type)) terminalFailureCount += 1;
    if (event?.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
      const result = parseResult(event.item.text);
      if (result) candidates.push({ result, index });
    }
  });
  const result = byteLength <= MAX_BYTES && lines.length <= MAX_LINES && malformedLineCount === 0
    && terminalCompletedCount === 1 && terminalFailureCount === 0 && candidates.length === 1
    && candidates[0].index < completedIndex ? candidates[0].result : undefined;
  return {
    result,
    inputTokens,
    outputTokens,
    tooLarge: byteLength > MAX_BYTES || lines.length > MAX_LINES,
    provenance: { byteLength, lineCount: Math.min(lines.length, MAX_LINES + 1), malformedLineCount, terminalCompletedCount, terminalFailureCount, validCandidateCount: candidates.length },
  };
};
const makeFailure = (failureClass, code, stage, summary) => ({
  class: failureClass,
  code,
  stage,
  retryable: failureClass === "RETRYABLE_INFRA" || failureClass === "RETRYABLE_EXECUTION",
  summary: redact(summary).slice(0, 1000),
});
const failedResult = (decision) => ({
  schema: "factory-result/v1",
  status: "FAILED",
  summary: decision.summary,
  completedAcceptanceCriterionIds: [],
  incompleteAcceptanceCriterionIds: [],
  unknownAcceptanceCriterionIds: [],
  verificationCommands: [],
  knownRisks: [decision.class + ":" + decision.code],
  nextAction: "Inspect the bounded remote execution evidence before deciding whether to retry.",
});
const chooseFailure = (file, jsonl) => {
  if (jsonl.tooLarge) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_TOO_LARGE", "RESULT_RECONSTRUCTION", "Codex JSONL exceeded the frozen reconstruction bound.");
  if (jsonl.provenance.malformedLineCount > 0) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_MALFORMED", "RESULT_RECONSTRUCTION", "Codex JSONL contained malformed non-empty lines.");
  if (jsonl.provenance.validCandidateCount > 1) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_AMBIGUOUS", "RESULT_RECONSTRUCTION", "Codex JSONL contained multiple schema-valid result candidates.");
  if (jsonl.provenance.terminalFailureCount > 0) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_TERMINAL_FAILURE", "RESULT_RECONSTRUCTION", "Codex JSONL ended in a terminal failure state.");
  if (jsonl.provenance.validCandidateCount === 1 && jsonl.provenance.terminalCompletedCount !== 1) return makeFailure("NON_RETRYABLE_RESULT", "JSONL_INCOMPLETE", "RESULT_RECONSTRUCTION", "Codex JSONL had a result candidate without exactly one terminal completion event.");
  const codes = { NOT_REQUESTED: "RESULT_MISSING", ABSENT: "RESULT_FILE_MISSING", EMPTY: "RESULT_FILE_EMPTY", TRUNCATED: "RESULT_FILE_TRUNCATED", INVALID_JSON: "RESULT_INVALID_JSON", SCHEMA_INVALID: "RESULT_SCHEMA_INVALID", TOO_LARGE: "RESULT_FILE_TOO_LARGE", READ_ERROR: "RESULT_FILE_READ_ERROR", VALID: "RESULT_UNACCEPTED" };
  return makeFailure("NON_RETRYABLE_RESULT", codes[file.state], "RESULT_RECONSTRUCTION", "No accepted factory-result/v1 was available; output-file state was " + file.state + ".");
};

let fatalDiagnosticsPath = "/var/lib/mission-control/attempt/diagnostics.json";
trace("SUPERVISOR_STARTED", { pid: process.pid, uid: process.getuid?.() ?? null, gid: process.getgid?.() ?? null });
try {
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
fatalDiagnosticsPath = config.diagnosticsPath ?? config.outputPath + ".diagnostics.json";
trace("CONFIG_LOADED", {
  attemptId: config.attemptId,
  files: {
    repository: fileObservation(config.repositoryRoot),
    home: fileObservation(config.executionSecurity?.homePath),
    temporary: fileObservation(config.executionSecurity?.temporaryPath),
    outputSchema: fileObservation(config.outputSchemaPath),
    executorResult: fileObservation(config.executor?.resultPath),
    supervisorResult: fileObservation(config.outputPath),
    diagnostics: fileObservation(fatalDiagnosticsPath),
  },
});
const manifest = config.executionManifest;
const manifestDigest = "sha256:" + createHash("sha256").update(canonical(manifest)).digest("hex");
const harnessFields = ["adapter", "version", "harnessId", "harnessVersion"];
const v3 = manifest?.version === "factory-execution-manifest/v3";
const decomposed = manifest?.version === "factory-execution-manifest/v2" || v3;
const executionBackend = decomposed ? manifest.executionBackend : manifest?.harness?.executionBackend;
const modelProvider = decomposed ? manifest?.modelRoute?.routeSnapshot?.provider : manifest?.harness?.provider;
const modelId = decomposed ? manifest?.modelRoute?.routeSnapshot?.modelId : manifest?.harness?.model;
const modelRouteDigest = decomposed ? manifest?.modelRoute?.routeDigest : undefined;
const providerRoute = decomposed ? manifest?.modelRoute?.routeSnapshot?.providerRoute : undefined;
const reasoningConfig = decomposed ? manifest?.modelRoute?.routeSnapshot?.reasoningConfig : undefined;
const capabilityManifest = manifest?.harness?.capabilityManifest;
const qualification = manifest?.modelRoute?.qualificationSnapshot;
const compatibility = qualification?.compatibility;
const decomposedBindingsValid = !decomposed || (
  manifest.harness?.provider === undefined && manifest.harness?.model === undefined && manifest.harness?.executionBackend === undefined
  && v2RouteValid(manifest.modelRoute?.routeSnapshot)
  && manifest.modelRoute.routeDigest === digest("factory-model-route/v2", manifest.modelRoute.routeSnapshot)
  && qualification?.schema === "factory-model-route-qualification/v2"
  && qualification.routeDigest === manifest.modelRoute.routeDigest
  && manifest.modelRoute.qualificationDigest === digest("factory-model-route-qualification/v2", qualification)
  && /^[a-f0-9]{40}$/i.test(manifest.harness?.harnessCommit ?? "")
  && capabilityManifest?.identity?.adapterId === manifest.harness.adapter
  && capabilityManifest?.identity?.adapterVersion === manifest.harness.version
  && capabilityManifest?.identity?.harnessId === manifest.harness.harnessId
  && capabilityManifest?.identity?.harnessVersion === manifest.harness.harnessVersion
  && capabilityManifest?.identity?.harnessCommit === manifest.harness.harnessCommit
  && objectDigest(capabilityManifest) === manifest.harness.capabilityManifestSha256
  && capabilityManifest?.effectiveConfigSha256 === manifest.harness.effectiveConfigSha256
  && runtimeArtifactValid(manifest.harness.runtimeArtifact)
  && digest("harness-runtime-artifact/v1", manifest.harness.runtimeArtifact) === manifest.harness.runtimeArtifactDigest
  && compatibility?.adapter === manifest.harness.adapter
  && compatibility?.version === manifest.harness.version
  && compatibility?.capabilityManifestDigest === manifest.harness.capabilityManifestSha256
  && compatibility?.effectiveConfigSha256 === manifest.harness.effectiveConfigSha256
  && compatibility?.runtimeArtifactDigest === manifest.harness.runtimeArtifactDigest
  && compatibility?.executionBackend === executionBackend
  && config.executor?.provider === modelProvider
  && config.executor?.model === modelId
  && config.executor?.modelRouteDigest === modelRouteDigest
  && config.executor?.providerRoute === providerRoute
  && providerRoute === "openrouter"
  && config.environment?.OPENAI_BASE_URL === "https://openrouter.ai/api/v1"
  && canonical(config.executor?.reasoningConfig ?? null) === canonical(reasoningConfig ?? null)
  && qualification.authority?.executionOnly === true
  && qualification.authority?.routing === false
  && qualification.authority?.verification === false
  && qualification.authority?.acceptance === false
  && qualification.authority?.publication === false
  && qualification.authority?.merge === false
);
if (!manifest || !["factory-execution-manifest/v1", "factory-execution-manifest/v2", "factory-execution-manifest/v3"].includes(manifest.version) || manifestDigest !== config.manifestDigest
  || manifest.causation?.workOrderId !== config.workOrderId || manifest.causation?.workOrderRevisionNumber !== config.workOrderRevisionNumber
  || manifest.causation?.workflowRunId !== config.workflowRunId || manifest.repository?.baseSha !== config.sourceSha
  || manifest.sandbox?.profileDigest !== config.profileDigest || manifest.sandbox?.supervisorVersion !== "mission-control-supervisor/v1"
  || manifest.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY" || executionBackend !== "remote-sandbox"
  || harnessFields.some((field) => typeof manifest.harness?.[field] !== "string" || !manifest.harness[field])
  || !boundedIdentity(modelProvider, 100) || !boundedIdentity(modelId, 200) || !decomposedBindingsValid
  || (v3 && !v3ExecutionProfileValid(manifest, config.profileAdmittedAt))
  || !Array.isArray(manifest.intent?.acceptanceCriterionIds) || manifest.intent.acceptanceCriterionIds.some((id) => typeof id !== "string" || !id)
  || new Set(manifest.intent.acceptanceCriterionIds).size !== manifest.intent.acceptanceCriterionIds.length
  || !Array.isArray(manifest.sandbox?.credentialGrants)
  || manifest.sandbox.credentialGrants.some((grant) => grant.secretValueIncluded !== false || grant.githubAuthority !== "NONE" || grant.providerAuthority !== "NONE")) {
  throw new Error("Frozen execution manifest is invalid or exceeds sandbox authority.");
}
trace("MANIFEST_VALIDATED", { attemptId: config.attemptId, sourceSha: config.sourceSha });
const executionSecurity = config.executionSecurity;
if (executionSecurity && (executionSecurity.user !== "mc-attempt" || executionSecurity.uid !== 10001 || executionSecurity.gid !== 10001
  || executionSecurity.homePath !== "/var/lib/mission-control/attempt/home"
  || executionSecurity.temporaryPath !== "/var/lib/mission-control/attempt/tmp" || executionSecurity.noNewPrivileges !== true
  || executionSecurity.capabilityMode !== "DROP_ALL")) {
  throw new Error("Frozen non-root execution identity is invalid.");
}
const confinementArgs = executionSecurity ? [
  "--no-new-privs",
  "--bounding-set=-all",
  "--inh-caps=-all",
  "--ambient-caps=-all",
  "--reuid=" + executionSecurity.uid,
  "--regid=" + executionSecurity.gid,
  "--clear-groups",
] : [];
const confinedEnvironment = executionSecurity
  ? { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: executionSecurity.homePath, TMPDIR: executionSecurity.temporaryPath, SHELL: "/bin/sh" }
  : { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
const repositoryGit = (args, options = {}) => execFileSync(
  executionSecurity ? "setpriv" : "git",
  executionSecurity ? [...confinementArgs, "--", "git", ...args] : args,
  { cwd: config.repositoryRoot, env: confinedEnvironment, ...options },
);
const startedAt = Date.now();
trace("REPOSITORY_VALIDATION_STARTED", { repository: fileObservation(config.repositoryRoot) });
const source = repositoryGit(["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (source !== config.sourceSha) throw new Error("Frozen source SHA mismatch.");
trace("REPOSITORY_VALIDATED", { sourceSha: source });
const childCommand = executionSecurity ? "setpriv" : config.executor.command;
const childArgs = executionSecurity ? [
  ...confinementArgs,
  "--",
  config.executor.command,
  ...config.executor.args,
] : config.executor.args;
const childEnvironment = executionSecurity
  ? { ...confinedEnvironment, ...config.environment }
  : { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...config.environment };
trace("CODEX_SPAWN_STARTED", {
  command: config.executor.command,
  uid: executionSecurity?.uid ?? process.getuid?.() ?? null,
  gid: executionSecurity?.gid ?? process.getgid?.() ?? null,
  environmentKeys: Object.keys(childEnvironment).sort(),
});
const child = spawn(childCommand, childArgs, { cwd: config.repositoryRoot, env: childEnvironment, stdio: ["ignore", "pipe", "pipe"], detached: true });
trace("CODEX_SPAWNED", { pid: child.pid ?? null, detached: true });
const boundedCapture = (namespace) => {
  const hash = createHash("sha256").update(namespace + "\0");
  let byteLength = 0;
  let tail = "";
  return {
    push(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      byteLength += buffer.length;
      tail = (tail + buffer.toString("utf8")).slice(-MAX_BYTES);
    },
    finish() {
      const retainedBytes = Buffer.byteLength(tail, "utf8");
      return { tail, byteLength, truncatedBytes: Math.max(0, byteLength - retainedBytes), digest: "sha256:" + hash.digest("hex") };
    },
  };
};
const stdoutCapture = boundedCapture("factory-sandbox-stdout/v1");
const stderrCapture = boundedCapture("factory-sandbox-stderr/v1");
let timedOut = false;
let canceled = false;
let firstExecutorOutputObserved = false;
const captureExecutorOutput = (stream, capture, chunk) => {
  capture.push(chunk);
  if (!firstExecutorOutputObserved) {
    firstExecutorOutputObserved = true;
    trace("CODEX_FIRST_EVENT", { stream, byteLength: Buffer.byteLength(chunk) });
  }
};
child.stdout.on("data", (chunk) => captureExecutorOutput("stdout", stdoutCapture, chunk));
child.stderr.on("data", (chunk) => captureExecutorOutput("stderr", stderrCapture, chunk));
const terminateChild = (signal) => {
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
};
let forceKillTimer;
const requestTermination = (reason) => {
  if (reason === "timeout") timedOut = true;
  else canceled = true;
  terminateChild("SIGTERM");
  forceKillTimer = setTimeout(() => terminateChild("SIGKILL"), 2000);
  forceKillTimer.unref();
};
const cancel = () => requestTermination("canceled");
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
const timer = setTimeout(() => requestTermination("timeout"), config.executor.timeoutMs);
const childExit = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});
trace("CODEX_TERMINAL", { exitCode: childExit.code, signal: childExit.signal, timedOut, canceled });
clearTimeout(timer);
if (forceKillTimer) clearTimeout(forceKillTimer);
process.removeListener("SIGTERM", cancel);
process.removeListener("SIGINT", cancel);
const exitCode = childExit.code ?? (childExit.signal === "SIGKILL" ? 137 : childExit.signal === "SIGTERM" ? 143 : 1);
const stdoutEvidence = stdoutCapture.finish();
const stderrEvidence = stderrCapture.finish();
const stdout = stdoutEvidence.tail;
const stderr = stderrEvidence.tail;

const file = inspectFile(config.executor.resultPath);
trace("EXECUTOR_OUTPUT_INSPECTED", { state: file.state, byteLength: file.byteLength, file: fileObservation(config.executor.resultPath) });
const jsonl = inspectJsonl(stdout, stdoutEvidence.byteLength);
let structured = file.result;
let resultSource = structured ? "OUTPUT_FILE" : "NONE";
if (!structured && file.state === "NOT_REQUESTED" && stdoutEvidence.byteLength <= MAX_BYTES) {
  structured = parseResult(stdout);
  if (structured) resultSource = "EXECUTOR_STDOUT";
}
if (!structured && jsonl.result) {
  structured = jsonl.result;
  resultSource = "CODEX_JSONL_RECONSTRUCTION";
}
let decision;
if (canceled) decision = makeFailure("UNKNOWN", "ATTEMPT_CANCELED", "EXECUTOR", "Remote executor was canceled by the control plane.");
else if (timedOut) decision = makeFailure("RETRYABLE_EXECUTION", "EXECUTOR_TIMEOUT", "EXECUTOR", "Remote executor exceeded the frozen Attempt timeout.");
else if (exitCode !== 0) {
  const detail = stderr || "Remote executor exited non-zero.";
  if (/\b429\b|rate[ -]?limit|too many requests/i.test(detail)) decision = makeFailure("RETRYABLE_EXECUTION", "MODEL_RATE_LIMIT", "EXECUTOR", detail);
  else if (/\b(502|503|504)\b|temporar(?:y|ily) unavailable|provider overloaded|connection reset/i.test(detail)) decision = makeFailure("RETRYABLE_EXECUTION", "MODEL_TRANSIENT_PROVIDER", "EXECUTOR", detail);
  else decision = makeFailure("UNKNOWN", "EXECUTOR_UNCLASSIFIED", "EXECUTOR", detail);
}
else if (!structured) decision = chooseFailure(file, jsonl);
else if (resultContextIssues(structured, manifest.intent.acceptanceCriterionIds).length) decision = makeFailure("NON_RETRYABLE_RESULT", "RESULT_ACCEPTANCE_CONTEXT_INVALID", "RESULT_VALIDATION", "factory-result/v1 acceptance-criterion accounting did not match the frozen WorkOrder.");
else if (structured.status !== "COMPLETED") decision = makeFailure("NON_RETRYABLE_RESULT", "DETERMINISTIC_GATE_FAILURE", "RESULT_VALIDATION", "Executor returned " + structured.status + ": " + structured.nextAction);
if (!structured) structured = failedResult(decision);
const accepted = !decision && structured.status === "COMPLETED";
const resultProvenance = { source: resultSource, outputFile: { state: file.state, byteLength: file.byteLength }, jsonl: jsonl.provenance };
const diagnosticsPath = config.diagnosticsPath ?? config.outputPath + ".diagnostics.json";
const networkPolicy = observeNetworkPolicy();
trace("DIAGNOSTICS_WRITE_STARTED", { path: diagnosticsPath, networkPolicyState: networkPolicy.state });
atomicWrite(diagnosticsPath, JSON.stringify({
  attemptId: config.attemptId,
  manifestDigest: config.manifestDigest,
  sourceSha: config.sourceSha,
  phase: "EXECUTOR_FINISHED",
  executor: {
    exitCode,
    timedOut,
    canceled,
    stdoutDigest: stdoutEvidence.digest,
    stderrDigest: stderrEvidence.digest,
    stdoutByteLength: stdoutEvidence.byteLength,
    stderrByteLength: stderrEvidence.byteLength,
    stdoutTruncatedBytes: stdoutEvidence.truncatedBytes,
    stderrTruncatedBytes: stderrEvidence.truncatedBytes,
    stdoutTail: redact(stdout).slice(-16000),
    stderrTail: redact(stderr).slice(-16000),
  },
  resultProvenance,
  resultOutput: { state: file.state, byteLength: file.byteLength, digest: file.digest, tail: file.tail, validationIssues: file.validationIssues },
  networkPolicy,
  lifecycleTrace: lifecycleEvents,
  failure: decision ?? null,
}));
trace("DIAGNOSTICS_WRITTEN", { file: fileObservation(diagnosticsPath) });
if (config.faultInjection?.crashAfterDiagnostics) throw new Error("Injected supervisor crash after executor diagnostics persistence.");

// Stage the harness's changes (respecting .gitignore) before computing the
// candidate, bounded by the frozen code scope. A harness creates new files
// without staging them, and \`git diff <sha>\` cannot see untracked paths, so
// the bundle would carry a half-change that the host's changed-file
// cross-check cannot detect — the host list is derived from the same patch.
// The pathspec mirrors the host-side \`stagingPathspec\` in sandboxSupervisor.ts;
// an executing test asserts the two backends stay equivalent.
const stagePaths = (Array.isArray(manifest.repository && manifest.repository.allowedPaths) ? manifest.repository.allowedPaths : [])
  .map((entry) => String(entry === undefined || entry === null ? "" : entry).trim())
  .filter((entry) => entry.length > 0 && !entry.startsWith("/") && !entry.includes(".."));
repositoryGit(["add", "-A", "--", ...(stagePaths.length > 0 ? stagePaths : ["."])], { encoding: "utf8" });
const patch = repositoryGit(["diff", "--cached", "--binary", "--full-index", config.sourceSha, "--"], { maxBuffer: 8388608 });
const patchContent = patch.toString("base64");
const changedFiles = repositoryGit(["diff", "--cached", "--name-only", config.sourceSha, "--"], { encoding: "utf8" }).split("\n").map((item) => item.trim()).filter(Boolean).sort();
const finishedAt = Date.now();
trace("RESULT_FINALIZATION_STARTED", { changedFileCount: changedFiles.length });
const bundle = {
  schema: "factory-sandbox-result/v1",
  attemptId: config.attemptId,
  workOrderId: config.workOrderId,
  workOrderRevisionNumber: config.workOrderRevisionNumber,
  workflowRunId: config.workflowRunId,
  manifestDigest: config.manifestDigest,
  profileDigest: config.profileDigest,
  sourceSha: config.sourceSha,
  supervisorVersion: "mission-control-supervisor/v1",
  harness: {
    adapter: manifest.harness.adapter,
    version: manifest.harness.version,
    harnessId: manifest.harness.harnessId,
    harnessVersion: manifest.harness.harnessVersion,
    provider: modelProvider,
    model: modelId,
    ...(decomposed ? {
      modelRouteDigest,
      providerRoute,
      ...(reasoningConfig === undefined ? {} : { reasoningConfig }),
    } : {}),
  },
  environment: config.environmentDescriptor,
  startedAt,
  finishedAt,
  status: canceled ? "CANCELED" : timedOut ? "TIMED_OUT" : accepted ? "COMPLETED" : "FAILED",
  resultProvenance: { ...resultProvenance, context: { attemptId: config.attemptId, manifestDigest: config.manifestDigest, sourceSha: config.sourceSha } },
  ...(decision ? { failure: decision } : {}),
  structuredResult: structured,
  changedFiles,
  diff: { filesChanged: changedFiles.length },
  commandResults: [{ commandClass: "EXECUTOR", exitCode, durationMs: finishedAt - startedAt, timedOut }],
  verificationInputs: { reportedCommands: structured.verificationCommands },
  artifacts: [],
  events: lifecycleEvents.map((event) => ({ type: event.stage, occurredAt: event.occurredAt })),
  patch: { format: "GIT_BINARY_DIFF", encoding: "BASE64", byteLength: patch.length, digest: digest("factory-sandbox-patch/v1", patchContent), content: patchContent },
  executor: { exitCode, stdoutDigest: stdoutEvidence.digest, stderrDigest: stderrEvidence.digest, stdoutTail: redact(stdout).slice(-16000), stderrTail: redact(stderr).slice(-16000), resultOutput: { state: file.state, byteLength: file.byteLength, digest: file.digest, tail: file.tail, validationIssues: file.validationIssues } },
  usage: { providerCostUsd: null, inferenceCostUsd: null, inputTokens: jsonl.inputTokens, outputTokens: jsonl.outputTokens, observedAt: finishedAt, providerRuntimeMs: finishedAt - startedAt, enforcement: "OBSERVATION_ONLY" },
};
bundle.digest = digest("factory-sandbox-result/v1", bundle);
atomicWrite(config.outputPath, JSON.stringify(bundle));
trace("RESULT_WRITTEN", { status: bundle.status, file: fileObservation(config.outputPath) });
trace("SUPERVISOR_TERMINAL", { exitCode: 0, signal: null });
} catch (error) {
  const fatal = {
    name: String(error?.name ?? "Error"),
    code: error?.code == null ? null : String(error.code),
    message: redact(error?.message ?? error).slice(0, 4000),
    stack: redact(error?.stack ?? "").slice(-16000),
  };
  trace("SUPERVISOR_TERMINAL", { exitCode: 1, signal: null, fatal: { name: fatal.name, code: fatal.code, message: fatal.message } });
  try {
    if (fileObservation(fatalDiagnosticsPath).state !== "PRESENT") {
      atomicWrite(fatalDiagnosticsPath, JSON.stringify({
        phase: "SUPERVISOR_FATAL",
        fatal,
        networkPolicy: observeNetworkPolicy(),
        lifecycleTrace: lifecycleEvents,
      }));
    }
  } catch {}
  process.stderr.write(fatal.message + "\n");
  process.exitCode = 1;
}
`.trim();
}
