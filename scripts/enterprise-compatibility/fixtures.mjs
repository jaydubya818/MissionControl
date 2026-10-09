import { generateKeyPairSync, createHash, randomBytes } from "node:crypto";
import { canonicalDigest } from "@mission-control/shared";

export const compatibility = {
  myFactory: "fa48a820ba185eb9b891130c78166463b61cba74", myEve: "8338309582d6806829dec1ae1beef301d6b52425",
  mySkillsFoundation: "d57ff77b8522f897fc6ae392cf59b3141295ba82", mySkillsBehavior: "21ae05a7be2f73be1378deb896f138700c473e84",
};
export function makeFixture(seed, partner) {
  const { digest, sha256, operationId, signResult, verifyResult } = partner.result;
  const now = Date.now(), hash = "a".repeat(64), hash40 = "b".repeat(40), iso = n => new Date(n).toISOString();
  const request = { protocol: "MYFACTORY_EXECUTION_V2", requestId: "00000000-0000-4000-8000-000000000002",
    workId: "00000000-0000-4000-8000-000000000001", workGeneration: 1, repository: "fixture/source",
    deadline: iso(now + 600000), maxSpendUsd: 0.00008, source: { repository: "fixture/source", commit: hash40, tree: "c".repeat(40) },
    input: { title: "Fixture", description: "Deterministic fixture", kind: "feature", acceptanceCriteria: ["fixture"], checkCommands: ["fixture-check"], allowedPaths: ["fixture.txt"] } };
  const image = "fixture/image@sha256:" + hash;
  const configuration = { model: "fixture/deterministic", executor: "fixture", executorVersion: "1", skillRevision: "none", workerProfile: "container",
    verificationImage: image, nodeVersion: "24", platform: "linux", architecture: "x64", commands: request.input.checkCommands,
    allowedPaths: request.input.allowedPaths, timeoutMs: 600000, cloud: { provider: "vercel-sandbox", providerVersion: "fixture", region: "iad1",
      workerImage: image, networkPolicy: "DENY_ALL", toolPolicySha256: hash, contextPolicySha256: hash, verificationPolicySha256: hash,
      evidenceClass: "DETERMINISTIC", resources: { vcpus: 1, memoryMb: 1024, timeoutMs: 600000, maxArtifactBytes: 10000 }, skills: [] } };
  const configurationDigest = digest(configuration), sourceDigest = "d".repeat(64), factoryVersion = digest({ sourceDigest, configurationDigest });
  const binding = { schema: "factory-delegation-binding/v1", delegationId: "trial-1", tenantId: seed.tenantId, projectId: seed.projectId,
    missionId: seed.missionId, missionSpecRevisionId: seed.missionSpecRevisionId, missionPlanId: seed.missionPlanId, missionPlanRevision: 1,
    missionPlanDigest: canonicalDigest("mission-plan-fixture/v1", { revision: 1, summary: "Fixture plan", blueprints: [], assertions: [] }),
    workOrderId: seed.workOrderId, workOrderRevisionId: seed.workOrderRevisionId, workOrderRevisionNumber: 1, taskId: seed.taskId,
    workflowRunId: seed.workflowRunId, executionManifestDigest: "sha256:" + hash, qualityContractDigest: "sha256:" + hash, authorityGeneration: 1,
    factoryId: "myfactory-fixture", factoryVersion, executionProtocol: "MYFACTORY_EXECUTION_V2", clientId: "fixture-client", ownerScope: "fixture-owner",
    partnerWorkId: request.workId, partnerWorkGeneration: 1, partnerRequestId: request.requestId, partnerRequestDigest: digest(request),
    repositoryId: seed.repositoryId, repository: request.repository, baseCommit: request.source.commit, baseTree: request.source.tree,
    sourceSnapshotDigest: canonicalDigest("factory-fixture-source/v1", request.source), executionProfileDigest: "sha256:" + configurationDigest,
    modelPolicyDigest: canonicalDigest("factory-fixture-model/v1", { model: configuration.model, evidenceClass: "DETERMINISTIC" }),
    verificationPolicyDigest: "sha256:" + hash, allowedEffects: ["repository.read", "sandbox.write", "candidate.create", "verification.request"],
    budgetReservationId: "trial-1", maxSpendMicrousd: 80, issuedAt: now - 1000, expiresAt: now + 600000, deadline: now + 600000 };
  const config = { kind: "MYFACTORY", factoryId: binding.factoryId, factoryVersion, definitionVersionId: seed.definitionVersionId,
    capabilities: ["BOUNDED_DELEGATION", "SIGNED_RESULT"], capacity: 2, admissionPolicy: "FIXTURE_ONLY", compatibility };
  const keyPair = generateKeyPairSync("ed25519");
  const resultKeys = [{ factoryId: binding.factoryId, keyId: "fixture-result", publicKey: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    activeFrom: iso(now - 60000), notAfter: iso(now + 3600000) }];
  const contract = { sourceSha: compatibility.myFactory,
    parsePrepare(input, b, at) {
      const parsed = partner.cloud.parseCloudPrepare(input, { clientId: b.clientId, source: request.source, commands: request.input.checkCommands,
        allowedPaths: request.input.allowedPaths, maxDurationMs: 600000, maxSpendUsd: b.maxSpendMicrousd / 1000000 }, at);
      if (parsed.requestId !== b.partnerRequestId || parsed.workId !== b.partnerWorkId || parsed.workGeneration !== b.partnerWorkGeneration
        || Date.parse(parsed.deadline) !== b.deadline || parsed.maxSpendUsd * 1000000 !== b.maxSpendMicrousd
        || canonicalDigest("factory-fixture-source/v1", parsed.source) !== b.sourceSnapshotDigest) throw Error("BINDING_MISMATCH");
      return parsed;
    }, requestDigest: digest,
    verifyResult: (input, expected) => verifyResult(input, { ...expected, keys: resultKeys }),
  };
  const execution = { version: 2, inputTree: request.source.tree, factoryId: binding.factoryId, factoryVersion, sourceDigest,
    configurationDigest, configuration, requestId: request.requestId, requestDigest: digest(request), workOrderId: "partner-wo", runId: "partner-run",
    attemptNumber: 1, inputCommit: request.source.commit, capturedAt: iso(now - 1000) };
  const treeBytes = Buffer.alloc(0);
  const gitId = (kind, bytes) => createHash("sha1").update(`${kind} ${bytes.length}\0`).update(bytes).digest("hex");
  const tree = gitId("tree", treeBytes);
  const commitBytes = Buffer.from(`tree ${tree}\nparent ${request.source.commit}\nauthor Fixture <fixture@example.test> 1 +0000\ncommitter Fixture <fixture@example.test> 1 +0000\n\nFixture\n`);
  const commit = gitId("commit", commitBytes), patch = Buffer.from("fixture patch\n"), log = Buffer.from("fixture passed\n");
  const data = [["commit", "git-commit", commitBytes], ["tree", "git-tree", treeBytes], ["patch", "patch", patch], ["check", "check-log", log]];
  const artifacts = data.map(([id, kind, bytes]) => ({ id, kind, producer: binding.factoryId, runId: "partner-run", candidateCommit: commit,
    sha256: sha256(bytes), size: bytes.length, createdAt: iso(now - 500) }));
  const evidence = [{ id: "check", producer: binding.factoryId, runId: "partner-run", candidateCommit: commit, command: "fixture-check", status: "passed",
    exitCode: 0, startedAt: iso(now - 600), finishedAt: iso(now - 500), logArtifactId: "check" }];
  const manifest = { protocol: "MYFACTORY_RESULT_V1", keyId: "fixture-result", producer: binding.factoryId, operationId: operationId(execution), execution,
    status: "COMPLETED", candidate: { commit, tree, base: request.source.commit, patchDigest: sha256(patch), commitArtifactId: "commit", treeArtifactId: "tree", patchArtifactId: "patch" },
    evidence, artifacts, evidenceDigest: digest(evidence), artifactDigest: digest(artifacts), completedAt: iso(now - 100), issuedAt: iso(now - 50),
    verification: { version: 1, kind: "INDEPENDENT_CLOUD_VERIFICATION", runId: "partner-run", workId: request.workId, workGeneration: 1,
      candidateCommit: commit, candidateTree: tree, custodySha256: hash, policySha256: hash, image, providerSessionId: "sbx_verifier", producerSessionId: "sbx_producer",
      cleanupConfirmed: true, outcome: "PASS", checks: [{ id: "fixture", result: "PASS" }], startedAt: iso(now - 400), finishedAt: iso(now - 200) } };
  const artifactBytes = data.map(([id, , bytes]) => ({ id, base64: bytes.toString("base64") }));
  const signedResult = signResult(manifest, artifactBytes, keyPair.privateKey);
  const keyBase = { id: "fixture-wire", tenantId: seed.tenantId, projectId: seed.projectId, factoryId: binding.factoryId, validUntil: now + 3600000, revoked: false };
  return { request, binding, config, contract, signedResult, manifest, artifactBytes, keyPair, resultKeys,
    requestKey: { ...keyBase, secret: randomBytes(32) }, responseKey: { ...keyBase, secret: randomBytes(32) } };
}
