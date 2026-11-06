// Synthetic Result fixture adapted from MyEve; domain/signature/artifact assertions unchanged.
import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { digest } from "../../packages/shared/src/factoryResult/factory-producer-protocol";
import {
  RESULT_PROTOCOL,
  operationId,
  signResult,
  type ResultManifest,
  type SignedResult,
} from "../../packages/shared/src/factoryResult/factory-producer-protocol";
type Work = {id:string};
type ExternalAlphaPolicy = Record<string,unknown>;
type WorkAuthorityRecord = {id:string;requestId:string;workGeneration:number;envelope:{document:any}};

/** Test support only. Every value is synthetic; no key, tester or provider is real. */
export const fixtureFiles = ["src/app.ts", "src/tasks.ts", "test/tasks.test.ts"];
export const fixtureCommands = ["npm test"];
export const fixtureFactoryId = "myfactory-external-alpha";
export const fixtureSourceDigest = "3".repeat(64);
const immutable = "registry.example/fixture@sha256:" + "5".repeat(64);
export const fixtureVerifierPolicySha256 = "6".repeat(64);

export function fixtureConfiguration(files = fixtureFiles, commands = fixtureCommands) {
  return {
    model: "openai/gpt-5.4-mini",
    executor: "fixture-executor",
    executorVersion: "1",
    skillRevision: "1",
    workerProfile: "container",
    verificationImage: immutable,
    nodeVersion: "v22.0.0",
    platform: "linux",
    architecture: "x64",
    commands: [...commands],
    allowedPaths: [...files],
    timeoutMs: 180000,
    cloud: {
      provider: "vercel-sandbox",
      providerVersion: "fixture",
      region: "iad1",
      workerImage: immutable,
      networkPolicy: "deny-all",
      toolPolicySha256: "7".repeat(64),
      contextPolicySha256: "8".repeat(64),
      verificationPolicySha256: fixtureVerifierPolicySha256,
      evidenceClass: "DETERMINISTIC",
      resources: { vcpus: 1, memoryMb: 1024, timeoutMs: 180000, maxArtifactBytes: 1048576 },
      skills: [],
    },
  };
}
export const fixtureConfigurationDigest = digest(fixtureConfiguration());
/** The policy's FactoryVersion is exactly digest({sourceDigest, configurationDigest}). */
export const fixtureFactoryVersion = digest({
  sourceDigest: fixtureSourceDigest,
  configurationDigest: fixtureConfigurationDigest,
});

export function fixtureResultKeys() {
  const pair = generateKeyPairSync("ed25519");
  const key = {
    factoryId: fixtureFactoryId,
    keyId: "external-alpha-result-v1",
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }) as string,
    activeFrom: new Date(Date.now() - 86_400_000).toISOString(),
    notAfter: new Date(Date.now() + 86_400_000).toISOString(),
  };
  return { privateKey: pair.privateKey as KeyObject, key };
}
export type FixtureResultKeys = ReturnType<typeof fixtureResultKeys>;

const gitId = (type: string, bytes: Buffer) =>
  createHash("sha1").update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export interface BuildOptions {
  verification?: "PASS" | "FAIL" | "UNKNOWN" | "none";
  /** Files the signed patch touches (defaults to two allowed files). */
  patchFiles?: string[];
  patchExtra?: string;
  runId?: string;
  requestDigest?: string;
  status?: "COMPLETED" | "FAILED";
  mutate?: (m: ResultManifest) => void;
  /** Overrides applied to the verifier attestation. */
  verifier?: Record<string, unknown>;
}

/** Builds and signs a synthetic MYFACTORY_RESULT_V1 bound to one consumed authority. */
export function buildSignedResult(input: {
  policy?: ExternalAlphaPolicy;
  authority: WorkAuthorityRecord;
  work: Work;
  workOrderId: string;
  keys: FixtureResultKeys;
  opts?: BuildOptions;
}): { signed: SignedResult; manifest: ResultManifest } {
  const { authority, work, keys } = input;
  const o = input.opts ?? {};
  const doc = authority.envelope.document;
  const runId = o.runId ?? "00000000-0000-4000-8000-0000000000a1";
  const t0 = Date.now() - 60_000;
  const at = (s: number) => new Date(t0 + s * 1000).toISOString();
  const configuration = fixtureConfiguration(doc.source.allowedFiles, fixtureCommands);
  const configurationDigest = digest(configuration);
  const factoryVersion = digest({ sourceDigest: fixtureSourceDigest, configurationDigest });
  const files = o.patchFiles ?? doc.source.allowedFiles.slice(0, 2);
  const patch = Buffer.from(
    files.map((f) => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-old\n+new\n`).join("") + (o.patchExtra ?? ""),
  );
  const treeBytes = Buffer.from("fixture-tree-" + authority.id);
  const tree = gitId("tree", treeBytes);
  const commitBytes = Buffer.from(
    `tree ${tree}\nparent ${doc.source.baseSha}\nauthor f <f@example.invalid> 1 +0000\ncommitter f <f@example.invalid> 1 +0000\n\nfixture\n`,
  );
  const commit = gitId("commit", commitBytes);
  const log = Buffer.from("npm test: ok\n");
  const art = (id: string, kind: string, b: Buffer, s: number) => ({
    id, kind, producer: fixtureFactoryId, runId, candidateCommit: commit, sha256: sha(b), size: b.length, createdAt: at(s),
  });
  const artifacts = [
    art("candidate.commit", "git-commit", commitBytes, 20),
    art("candidate.tree", "git-tree", treeBytes, 20),
    art("candidate.patch", "patch", patch, 20),
    art("check.0.log", "check-log", log, 30),
  ];
  const execution = {
    version: 2 as const,
    inputTree: doc.source.treeSha,
    factoryId: fixtureFactoryId,
    factoryVersion,
    sourceDigest: fixtureSourceDigest,
    configurationDigest,
    configuration,
    requestId: authority.requestId,
    requestDigest: o.requestDigest ?? digest({ requestId: authority.requestId, synthetic: true }),
    workOrderId: input.workOrderId,
    runId,
    attemptNumber: 1,
    inputCommit: doc.source.baseSha,
    capturedAt: at(1),
  };
  const evidence = [
    {
      id: "check.0", producer: fixtureFactoryId, runId, candidateCommit: commit, command: fixtureCommands[0],
      status: "passed", exitCode: 0, startedAt: at(25), finishedAt: at(30), logArtifactId: "check.0.log",
    },
  ];
  const outcome = o.verification ?? "PASS";
  const verification =
    outcome === "none"
      ? undefined
      : {
          version: 1 as const,
          kind: "INDEPENDENT_CLOUD_VERIFICATION" as const,
          runId,
          workId: work.id,
          workGeneration: authority.workGeneration,
          candidateCommit: commit,
          candidateTree: tree,
          custodySha256: "9".repeat(64),
          policySha256: fixtureVerifierPolicySha256,
          image: immutable,
          providerSessionId: outcome === "UNKNOWN" ? null : "sbx_verifier1",
          producerSessionId: "sbx_producer1",
          cleanupConfirmed: true as const,
          outcome,
          checks: outcome === "UNKNOWN" ? [] : Array.from({length:10},(_,i)=>({ id: `alpha-tasks-criterion-${i+1}`, result: outcome === "PASS" ? "PASS" as const : "FAIL" as const })),
          startedAt: at(35),
          finishedAt: at(40),
          ...o.verifier,
        };
  const manifest = {
    protocol: RESULT_PROTOCOL,
    keyId: keys.key.keyId,
    producer: fixtureFactoryId,
    operationId: operationId(execution as never),
    execution,
    status: "COMPLETED",
    candidate: { commit, tree, base: doc.source.baseSha, patchDigest: sha(patch), commitArtifactId: "candidate.commit", treeArtifactId: "candidate.tree", patchArtifactId: "candidate.patch" },
    evidence,
    artifacts,
    evidenceDigest: digest(evidence),
    artifactDigest: digest(artifacts),
    completedAt: at(45),
    issuedAt: at(46),
    ...(verification ? { verification } : {}),
  } as unknown as ResultManifest;
  o.mutate?.(manifest);
  const bytes = [commitBytes, treeBytes, patch, log];
  const signed = signResult(
    manifest,
    manifest.artifacts.map((a, i) => ({ id: a.id, base64: bytes[i].toString("base64") })),
    keys.privateKey,
  );
  return { signed, manifest };
}
