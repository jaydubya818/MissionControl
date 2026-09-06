import { readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { canonicalJson, sha256Hex } from "@mission-control/shared";
import { ISOLATED_CONTAINER_POLICY, ISOLATED_INVOCATION_RUNTIME_ARTIFACT, ISOLATED_INVOCATION_EFFECTIVE_CONFIG,
  RENDER_MARKDOWN_OPERATION, RENDER_MARKDOWN_OPERATION_DIGEST, VERIFY_DOCUMENT_OPERATION, VERIFY_DOCUMENT_OPERATION_DIGEST,
  renderMarkdownCandidate } from "@mission-control/workflow-engine/harness-contract";
import { offlineSandboxDigest } from "../../convex/lib/localQualificationSandbox";
const [directory] = process.argv.slice(2);
if (process.env.CONVEX_SELF_HOSTED_URL !== "http://127.0.0.1:3290" || !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || !directory) throw new Error("Exact disposable backend required.");
const a = JSON.parse(await readFile(`${directory}/local-repository-admission.json`, "utf8"));
const repository = JSON.parse(await readFile(`${directory}/local-repository-registration-proof.json`, "utf8"));
const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL);
client.setAdminAuth(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY, { subject: "user_SyntheticHandoffQualification", issuer: "https://synthetic-qualification.example.test",
  email: "qualification@example.test", name: "Synthetic Qualification Operator" });
const statePath = `${directory}/local-factory-setup.json`;
let state: Record<string, any> = {};
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
const mutate = (name: string, args: any) => client.mutation(makeFunctionReference<"mutation">(name), args);
const query = (name: string, args: any) => client.query(makeFunctionReference<"query">(name), args);
async function step(name: string, perform: () => Promise<any>) {
  if (state[name] !== undefined) return state[name];
  const result = await perform(); state[name] = result;
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ completedSetupStep: name })); return result;
}
const componentProof = await Promise.all(["match", "mutation", "canceled", "stale"].map(async name =>
  ({ name, record: JSON.parse(await readFile(`${directory}/../unpublished-verifier-controls-3/${name}.json`, "utf8")) })));
const evidenceDigest = `sha256:${sha256Hex(canonicalJson(componentProof))}`;
const evidenceReference = "local:unpublished-verifier-controls-3/component-controls-not-canonical-pass";
const snapshot = { schema: "local-qualification-sandbox/v1", provider: "LOCAL_CONTAINER", profileKey: "local-repository-fixture", version: 1,
  imageDigest: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest, bridgeDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest,
  backendDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest, isolationPolicy: ISOLATED_CONTAINER_POLICY,
  qualification: { evidenceReference, evidenceDigest, validUntil: a.expiresAt }, localQualification: {
    repositoryId: repository.repositoryId, repositoryAdmissionDigest: repository.repository.admissionDigest,
    environmentId: a.environmentId, projectId: a.projectId, tenantId: a.tenantId, operatorId: a.operatorId, program: a.program,
    operations: ["render-markdown/v1", "verify-document-bytes/v1"], risk: "GREEN", inference: "DENIED", transmission: "DENIED", publication: "NONE", production: "NONE" } };
const sandboxProfileId = await step("sandboxProfileId", () => mutate("factory/configuration:registerIsolatedSandboxProfile", { projectId: a.projectId, snapshot }));
await step("sandboxAdmission", () => mutate("factory/configuration:promoteSandboxProfile", { sandboxProfileId, expectedProfileDigest: offlineSandboxDigest(snapshot) }));
for (const [purpose, isolation, workload] of [["producer", "WORKSPACE_WRITE", "SOFTWARE_CHANGE"], ["verifier", "READ_ONLY", "VERIFICATION"]] as const) {
  const registered = await step(`${purpose}Profile`, () => mutate("factory/executionProfiles:registerVersion", { projectId: a.projectId,
    profileKey: `local-repository-${purpose}`, registrationIdempotencyKey: `local-repository-${purpose}-v1`,
    executor: { adapter: "isolated-invocation", version: "2" }, executionBackend: "isolated-container", sandboxProfileId, isolationModes: [isolation] }));
  const profile = await query("factory/executionProfiles:get", { executionProfileId: registered.executionProfileId });
  await step(`${purpose}ProfileAdmission`, () => mutate("factory/executionProfiles:qualify", {
    executionProfileId: registered.executionProfileId, expectedProfileDigest: profile.profile.profileDigest,
    qualificationIdempotencyKey: `local-repository-${purpose}-qualification-v1`, evidenceReference, evidenceDigest,
    workloadClasses: [workload], riskClasses: ["GREEN"], validUntil: a.expiresAt }));
}
const scope = await step("scope", () => mutate("projects:createRepositoryCodeScope", { repositoryId: repository.repositoryId,
  name: "Synthetic qualification document", slug: "synthetic-document", includePaths: ["docs/**"], excludePaths: [".git/**", ".mission-control/**"],
  requiredReviewers: [a.operatorId], allowedEnvironments: ["LOCAL"] }));
if (!scope.success) throw new Error(`Code scope failed: ${scope.error}`);
const policy = await step("policy", () => mutate("governance/policyEnvelopes:createPolicyEnvelope", { projectId: a.projectId, tenantId: a.tenantId,
  name: "Local synthetic repository bounds", rules: { maxResourceCostUsd: 1, maxProviderCalls: 0, productionAuthority: "NONE", publicationAuthority: "NONE" },
  metadata: { synthetic: true, repositoryId: repository.repositoryId } }));
const verifierId = await step("contextVerifierId", () => mutate("context/verifiers:create", { projectId: a.projectId,
  label: "Exact synthetic document bytes", invariant: "The independent verifier must compare the exact unpublished candidate with the frozen expected bytes.",
  globPatterns: ["docs/qualification.md"], idempotencyKey: "local-repository-byte-verifier-v1" }));
const operation = { reference: RENDER_MARKDOWN_OPERATION, digest: RENDER_MARKDOWN_OPERATION_DIGEST,
  input: { title: "Synthetic Qualification", paragraphs: ["Independent verification precedes any human decision."], outputPath: "docs/qualification.md" } };
const verification = { reference: VERIFY_DOCUMENT_OPERATION, digest: VERIFY_DOCUMENT_OPERATION_DIGEST,
  input: { path: "docs/qualification.md", expectedContentSha256: `sha256:${sha256Hex(renderMarkdownCandidate(operation).content)}` } };
for (const [purpose, workload, factoryPurpose] of [["producer", operation, "SOFTWARE"], ["verifier", verification, "VERIFICATION"]] as const) {
  const workflowId = await step(`${purpose}Workflow`, () => mutate("workflows:registerProduction", { projectId: a.projectId,
    workflowId: `local-repository-${purpose}-v1`, name: `Local synthetic ${purpose}`, description: "Deterministic qualification only; no model or publication authority.",
    topology: "LINEAR", maxConcurrency: 1, agents: [], steps: [{ id: "execute", kind: "DETERMINISTIC", agent: "", retryLimit: 0,
      timeoutMinutes: 1, input: JSON.stringify(workload) }], active: true }));
  const definitionId = await step(`${purpose}Factory`, () => mutate("factory/configuration:create", { repositoryId: repository.repositoryId,
    name: `Local synthetic ${purpose}`, purpose: factoryPurpose }));
  await step(`${purpose}FactoryVersion`, () => mutate("factory/configuration:createVersion", { factoryDefinitionId: definitionId,
    workflowId, executionProfileId: state[`${purpose}Profile`].executionProfileId, codeScopeIds: [scope.scopeId], agentBindings: [],
    policyEnvelopeId: policy._id, environmentId: a.environmentId, budget: { maxCostUsd: 0.01, maxRuntimeMinutes: 1, maxAttempts: 3 },
    verifierIds: [verifierId], riskBoundary: "GREEN", recovery: { pause: false, cancel: true, retry: true, resume: false } }));
}
console.log(JSON.stringify({ classification: "CANONICAL_SYNTHETIC_FACTORY_SETUP", statePath, executionQualified: false }));
