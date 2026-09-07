import { describe, expect, it } from "vitest";
import { verificationContractDigest } from "../verificationIdentity.js";
import {
  deriveVerificationIndependence,
  verificationIsolationBindingDigest,
  type VerificationIndependenceInput,
} from "../verificationIndependence.js";
import { createGitVerificationSubject } from "../verificationSubject.js";

const contractDigest = verificationContractDigest({ schemaVersion: 2, checks: ["unit"] });
const subject = createGitVerificationSubject({
  version: 1,
  kind: "GIT_CANDIDATE",
  workOrderId: "wo-1",
  workOrderRevisionNumber: 1,
  verificationContractDigest: contractDigest,
  sourceAttemptId: "source-attempt",
  repositoryId: "repository-1",
  provider: "GITHUB",
  providerRepositoryId: "provider-repository-1",
  candidateSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  pullRequest: {
    providerPullRequestId: "provider-pr-1",
    number: 10,
    url: "https://github.com/example/repo/pull/10",
    baseRef: "main",
    headRef: "candidate",
    headSha: "a".repeat(40),
    draftAtPublication: true,
  },
});

const tuple = {
  workOrderId: "wo-1",
  workOrderRevisionNumber: 1,
  verificationContractDigest: contractDigest,
  sourceAttemptId: "source-attempt",
  verificationSubjectDigest: subject.digest,
};

function validInput(): VerificationIndependenceInput {
  return {
    expected: {
      ...tuple,
      verificationAttemptId: "verification-attempt",
      verificationRunId: "verification-run",
      verificationSubjectId: subject.subjectId,
      verificationPlanId: "verification-plan",
      verificationPlanDigest: `sha256:${"c".repeat(64)}`,
    },
    subject,
    sourceAttempt: {
      id: "source-attempt",
      attemptPurpose: "IMPLEMENTATION",
      executorInvocationId: "builder-invocation",
      leaseId: "builder-lease",
      worktree: "/tmp/builder",
    },
    verificationAttempt: {
      id: "verification-attempt",
      attemptPurpose: "VERIFICATION",
      factoryPurpose: "VERIFICATION",
      factoryDefinitionVersionId: "verification-factory-version",
      executorInvocationId: "verifier-invocation",
      leaseId: "verifier-lease",
      worktree: "/tmp/verifier",
      binding: tuple,
    },
    factoryVersion: { id: "verification-factory-version", purpose: "VERIFICATION" },
    verificationRun: {
      ...tuple,
      id: "verification-run",
      workflowRunId: "verification-attempt",
      verificationSubjectId: subject.subjectId,
      verificationPlanId: "verification-plan",
      verificationPlanDigest: `sha256:${"c".repeat(64)}`,
    },
    isolation: isolation(),
    reportCapability: "verification:report",
    authorityStatus: "PASS",
  };
}

function isolation(): VerificationIndependenceInput["isolation"] {
  const binding = {
    mode: "DETACHED_GIT_WORKTREE" as const,
    sandboxId: "sandbox-1",
    subjectDigest: subject.digest,
    verifierRoot: "/tmp/verifier",
    sourceRoot: "/tmp/builder",
    initialClean: true,
    finalSubjectMatch: true,
    repositoryId: "repository-1",
    headSha: "a".repeat(40),
    treeSha: "b".repeat(40),
  };
  return { ...binding, rootBindingDigest: verificationIsolationBindingDigest(binding) };
}

describe("server-derived verification independence", () => {
  it("accepts deterministic evidence from a separate subject-bound Verification Attempt", () => {
    expect(deriveVerificationIndependence(validInput())).toMatchObject({ passed: true, policyVersion: "verification-independence/v1" });
  });

  it("accepts an exact admitted container over a separate subject-bound Git worktree", () => {
    const input = validInput();
    const binding = {
      ...input.isolation,
      mode: "ISOLATED_CONTAINER" as const,
      sandboxId: `docker:${"d".repeat(64)}`,
    };
    const { rootBindingDigest: _priorDigest, ...withoutDigest } = binding;
    input.isolation = { ...withoutDigest, rootBindingDigest: verificationIsolationBindingDigest(withoutDigest) };
    expect(deriveVerificationIndependence(input)).toMatchObject({ passed: true });
    input.isolation.sandboxId = "docker:unmeasured";
    expect(deriveVerificationIndependence(input).passed).toBe(false);
  });

  it("rejects the implementation Attempt as its own verifier regardless of spoofed metadata", () => {
    const input = validInput() as VerificationIndependenceInput & { producerIndependent?: boolean };
    input.producerIndependent = true;
    input.verificationAttempt = {
      ...input.verificationAttempt,
      id: "source-attempt",
    };
    input.expected = { ...input.expected, verificationAttemptId: "source-attempt" };
    input.verificationRun = { ...input.verificationRun, workflowRunId: "source-attempt" };
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("same Attempt");
  });

  it("rejects reused builder worktrees and missing fresh checkout attestation", () => {
    const input = validInput();
    input.verificationAttempt.worktree = input.sourceAttempt.worktree;
    input.isolation.verifierRoot = input.isolation.sourceRoot;
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/reused the builder worktree|builder root/);
  });

  it("rejects caller-authored roots that do not match the authoritative Attempt worktrees", () => {
    const input = validInput();
    const spoofed = {
      ...input.isolation,
      verifierRoot: "/tmp/spoofed-verifier",
      sourceRoot: "/tmp/spoofed-builder",
    };
    const { rootBindingDigest: _oldDigest, ...binding } = spoofed;
    input.isolation = { ...spoofed, rootBindingDigest: verificationIsolationBindingDigest(binding) };
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/authoritative Verification Attempt worktree|authoritative source Attempt worktree/);
  });

  it("does not treat the local Docker canary as Verification Factory independence", () => {
    const input = validInput();
    input.isolation.mode = "LOCAL_DOCKER_CANARY";
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("local Docker canary");
  });

  it("rejects a caller-authored isolation digest and subject-incompatible mode", () => {
    const input = validInput();
    input.isolation.mode = "AUTOMATION_SNAPSHOT";
    input.isolation.rootBindingDigest = `sha256:${"f".repeat(64)}`;
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/server-reproducible|Git-capable/);
  });

  it("does not require a different executor vendor when invocation and lineage are separate", () => {
    const input = validInput() as VerificationIndependenceInput & { executorAdapter?: string };
    input.executorAdapter = "codex/v1";
    expect(deriveVerificationIndependence(input).passed).toBe(true);
  });

  it("fails closed when the verification-authority result is omitted", () => {
    const input = validInput();
    delete input.authorityStatus;
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/not reported|self-certification/);
  });

  it("rejects an explicit verification-authority failure", () => {
    const input = validInput();
    input.authorityStatus = "FAIL";
    const result = deriveVerificationIndependence(input);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/determine.*verdict|cannot make.*independent/);
  });
});
