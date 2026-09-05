import { describe, expect, it } from "vitest";
import { canonicalVerificationJson, verificationContractDigest, verificationSha256Hex } from "../verificationIdentity.js";
import {
  createAutomationVerificationSubject,
  createGitVerificationSubject,
  normalizeAttemptPurpose,
  normalizeFactoryPurpose,
  normalizeWorkOrderKind,
} from "../verificationSubject.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const contractDigest = verificationContractDigest({ schemaVersion: 2, checks: [] });

function gitSubject(overrides: Record<string, unknown> = {}) {
  return createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId: "work-order-1",
    workOrderRevisionNumber: 2,
    verificationContractDigest: contractDigest,
    sourceAttemptId: "attempt-implementation-1",
    repositoryId: "repository-1",
    provider: "GITHUB",
    providerRepositoryId: "github-repository-1",
    candidateSha: SHA_A,
    treeSha: SHA_B,
    pullRequest: {
      providerPullRequestId: "PR_kwD_1",
      number: 91,
      url: "https://github.com/example/repo/pull/91",
      baseRef: "main",
      headRef: "mc/candidate",
      headSha: SHA_A,
      draftAtPublication: true,
    },
    ...overrides,
  } as any);
}

describe("Verification Subject identity", () => {
  it("uses canonical JSON and standards-compatible SHA-256", () => {
    expect(canonicalVerificationJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(verificationSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("binds the verification contract to approved Plan quality lineage", () => {
    const contract = { schemaVersion: 2, checks: ["unit"] };
    expect(verificationContractDigest(contract, `sha256:${"a".repeat(64)}`))
      .not.toBe(verificationContractDigest(contract, `sha256:${"b".repeat(64)}`));
    expect(verificationContractDigest(contract))
      .toBe(verificationContractDigest(contract));
  });

  it("binds exact Git commit, tree, WorkOrder, contract, source Attempt, repository, and PR identity", () => {
    const first = gitSubject();
    const changedUrl = gitSubject({ pullRequest: { ...gitSubject().pullRequest, url: "https://github.com/example/repo/pull/91?display=files" } });
    const changedNumber = gitSubject({ pullRequest: { ...gitSubject().pullRequest, number: 92 } });
    const changedCandidate = gitSubject({
      candidateSha: SHA_B,
      pullRequest: { ...gitSubject().pullRequest, headSha: SHA_B },
    });
    expect(first.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(changedUrl.digest).toBe(first.digest);
    expect(changedNumber.digest).not.toBe(first.digest);
    expect(changedCandidate.digest).not.toBe(first.digest);
  });

  it("rejects mutable or mismatched GitHub PR lineage", () => {
    expect(gitSubject({ pullRequest: { ...gitSubject().pullRequest, draftAtPublication: false } }).digest)
      .toBe(gitSubject().digest);
    expect(() => gitSubject({ pullRequest: { ...gitSubject().pullRequest, headSha: SHA_B } })).toThrow(/matching bound head/);
  });

  it("binds an unpublished local candidate without inventing pull-request identity", () => {
    const subject = createGitVerificationSubject({
      version: 1,
      kind: "GIT_CANDIDATE",
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 2,
      verificationContractDigest: contractDigest,
      sourceAttemptId: "attempt-implementation-1",
      repositoryId: "repository-1",
      provider: "LOCAL_GIT",
      providerRepositoryId: "github-repository-1",
      candidateSha: SHA_A,
      treeSha: SHA_B,
      localRef: { baseRef: "main", headRef: "mc/candidate", headSha: SHA_A },
    });
    expect(subject.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(subject.provider).toBe("LOCAL_GIT");
    expect(() => createGitVerificationSubject({
      ...subject,
      localRef: { ...subject.localRef, headSha: SHA_B },
    })).toThrow(/matching bound head/);
  });

  it("binds every reproducibility-critical automation identity and ordered output hash", () => {
    const input = {
      version: 1 as const,
      kind: "AUTOMATION_RUN" as const,
      workOrderId: "work-order-automation",
      workOrderRevisionNumber: 1,
      verificationContractDigest: contractDigest,
      sourceAttemptId: "automation-attempt-1",
      automationWorkflowRunId: "automation-attempt-1",
      automationDefinitionId: "automation-definition-1",
      automationDefinitionVersion: 3,
      adapterIdentity: {
        adapterType: "csv-normalizer/v1",
        runtime: "node-22",
        executionBindingDigest: HASH_A,
        outputContractDigest: HASH_B,
      },
      outputSnapshotArtifactId: "snapshot-artifact-1",
      outputSnapshotContentHash: HASH_A,
      outputArtifactIds: ["artifact-1", "artifact-2"],
      outputArtifactContentHashes: [HASH_A, HASH_B],
    };
    const first = createAutomationVerificationSubject(input);
    const changedBinding = createAutomationVerificationSubject({
      ...input,
      adapterIdentity: { ...input.adapterIdentity, executionBindingDigest: HASH_B },
    });
    const reorderedOutputs = createAutomationVerificationSubject({
      ...input,
      outputArtifactIds: [...input.outputArtifactIds].reverse(),
      outputArtifactContentHashes: [...input.outputArtifactContentHashes].reverse(),
    });
    expect(changedBinding.digest).not.toBe(first.digest);
    expect(reorderedOutputs.digest).not.toBe(first.digest);
  });

  it("normalizes only legacy display defaults without granting verification purpose", () => {
    expect(normalizeFactoryPurpose()).toBe("SOFTWARE");
    expect(normalizeWorkOrderKind()).toBe("SOFTWARE_CHANGE");
    expect(normalizeAttemptPurpose()).toBe("IMPLEMENTATION");
    expect(normalizeAttemptPurpose()).not.toBe("VERIFICATION");
  });
});
