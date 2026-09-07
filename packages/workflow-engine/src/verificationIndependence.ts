import { verificationDigest } from "./verificationIdentity.js";
import type { VerificationSubject } from "./verificationSubject.js";

export type VerificationIdentityTuple = {
  workOrderId: string;
  workOrderRevisionNumber: number;
  verificationContractDigest: string;
  sourceAttemptId: string;
  verificationSubjectDigest: string;
};

export type VerificationIndependenceInput = {
  expected: VerificationIdentityTuple & {
    verificationAttemptId: string;
    verificationRunId: string;
    verificationSubjectId: string;
    verificationPlanId: string;
    verificationPlanDigest: string;
  };
  subject: VerificationSubject;
  sourceAttempt: {
    id: string;
    attemptPurpose?: "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION";
    executorInvocationId?: string;
    leaseId?: string;
    worktree?: string;
  };
  verificationAttempt: {
    id: string;
    attemptPurpose?: "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION";
    factoryPurpose?: "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION";
    factoryDefinitionVersionId?: string;
    executorInvocationId?: string;
    leaseId?: string;
    worktree?: string;
    binding?: VerificationIdentityTuple;
  };
  factoryVersion: {
    id: string;
    purpose?: "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION";
  };
  verificationRun: VerificationIdentityTuple & {
    id: string;
    workflowRunId: string;
    verificationSubjectId?: string;
    verificationPlanId?: string;
    verificationPlanDigest?: string;
  };
  isolation: {
    mode: "DETACHED_GIT_WORKTREE" | "FRESH_CLONE" | "REMOTE_SANDBOX" | "ISOLATED_CONTAINER" | "AUTOMATION_SNAPSHOT" | "LOCAL_DOCKER_CANARY";
    sandboxId: string;
    rootBindingDigest: string;
    subjectDigest: string;
    verifierRoot?: string;
    sourceRoot?: string;
    initialClean: boolean;
    finalSubjectMatch: boolean;
    repositoryId?: string;
    headSha?: string;
    treeSha?: string;
    outputSnapshotContentHash?: string;
  };
  reportCapability: string;
  /**
   * Verdict of the always-on verification-authority check.
   *
   * Lineage isolation (separate Attempt, lease, worktree, invocation) proves
   * the verifier was a *different process*. It does not prove the verifier
   * applied a *different standard*: a candidate that rewrote its own
   * `package.json#scripts.test` is verified by a perfectly isolated verifier
   * running the candidate's own definition of success.
   *
   * Independence is therefore not established when this is "FAIL". Absent is
   * treated as absent, not as pass — see the check below.
   */
  authorityStatus?: "PASS" | "FAIL";
};

export type VerificationIndependenceResult = {
  policyVersion: "verification-independence/v1";
  sourceAttemptId: string;
  verificationAttemptId: string;
  passed: boolean;
  reasons: string[];
};

export function verificationIsolationBindingDigest(
  isolation: Omit<VerificationIndependenceInput["isolation"], "rootBindingDigest">,
) {
  return verificationDigest("verification-isolation-binding/v1", isolation);
}

export function deriveVerificationIndependence(input: VerificationIndependenceInput): VerificationIndependenceResult {
  const reasons: string[] = [];
  const expected = input.expected;
  if (input.sourceAttempt.id === input.verificationAttempt.id) reasons.push("Implementation/automation and verification use the same Attempt.");
  if (input.verificationAttempt.id !== expected.verificationAttemptId) reasons.push("Verification Attempt identity does not match the expected lineage.");
  if (input.verificationAttempt.attemptPurpose !== "VERIFICATION") reasons.push("Attempt purpose is not VERIFICATION.");
  if (input.verificationAttempt.factoryPurpose !== "VERIFICATION") reasons.push("Attempt Factory purpose is not VERIFICATION.");
  if (input.factoryVersion.purpose !== "VERIFICATION") reasons.push("FactoryVersion purpose is not VERIFICATION.");
  if (input.verificationAttempt.factoryDefinitionVersionId !== input.factoryVersion.id) reasons.push("Verification Attempt is not bound to the authoritative FactoryVersion.");
  if (!input.verificationAttempt.binding || !tupleMatches(input.verificationAttempt.binding, expected)) {
    reasons.push("Verification Attempt binding does not match the exact current subject tuple.");
  }
  if (input.verificationRun.id !== expected.verificationRunId || input.verificationRun.workflowRunId !== input.verificationAttempt.id
    || !tupleMatches(input.verificationRun, expected)) {
    reasons.push("Verification Run lineage does not match the Verification Attempt and exact subject tuple.");
  }
  if (input.verificationRun.verificationPlanId !== expected.verificationPlanId
    || input.verificationRun.verificationPlanDigest !== expected.verificationPlanDigest) {
    reasons.push("Verification Run plan identity does not match the frozen plan.");
  }
  if (input.subject.workOrderId !== expected.workOrderId
    || input.subject.workOrderRevisionNumber !== expected.workOrderRevisionNumber
    || input.subject.verificationContractDigest !== expected.verificationContractDigest
    || input.subject.sourceAttemptId !== expected.sourceAttemptId
    || input.subject.subjectId !== expected.verificationSubjectId
    || input.subject.digest !== expected.verificationSubjectDigest) {
    reasons.push("Persisted Verification Subject does not match the expected lineage.");
  }
  if (input.verificationRun.verificationSubjectId !== expected.verificationSubjectId) {
    reasons.push("Verification Run subject ID does not match the immutable subject.");
  }
  const expectedSourcePurpose = input.subject.kind === "GIT_CANDIDATE" ? "IMPLEMENTATION" : "AUTOMATION";
  if (input.sourceAttempt.attemptPurpose !== expectedSourcePurpose) {
    reasons.push(`Source Attempt purpose is not ${expectedSourcePurpose}.`);
  }
  if (!input.sourceAttempt.executorInvocationId || !input.verificationAttempt.executorInvocationId
    || input.sourceAttempt.executorInvocationId === input.verificationAttempt.executorInvocationId) {
    reasons.push("Verification must use a separate executor invocation.");
  }
  if (!input.sourceAttempt.leaseId || !input.verificationAttempt.leaseId
    || input.sourceAttempt.leaseId === input.verificationAttempt.leaseId) {
    reasons.push("Verification must use a separate execution lease.");
  }
  if (input.reportCapability !== "verification:report") reasons.push("Evidence did not arrive through the Verification Factory report capability.");
  if (input.authorityStatus !== "PASS") {
    reasons.push(input.authorityStatus === "FAIL"
      ? "The candidate modified files that determine its own verification verdict; isolation cannot make that independent."
      : "Verification-authority status was not reported, so self-certification was not ruled out.");
  }
  if (input.isolation.mode === "LOCAL_DOCKER_CANARY") reasons.push("The development-only local Docker canary cannot establish verification independence.");
  if (!input.isolation.sandboxId || !input.isolation.rootBindingDigest) reasons.push("Verification isolation attestation is incomplete.");
  const { rootBindingDigest: _reportedRootBindingDigest, ...isolationBinding } = input.isolation;
  if (input.isolation.rootBindingDigest !== verificationIsolationBindingDigest(isolationBinding)) {
    reasons.push("Verification isolation root binding digest is not server-reproducible.");
  }
  if (input.isolation.subjectDigest !== expected.verificationSubjectDigest) reasons.push("Verification isolation is bound to a different subject.");
  if (!input.isolation.initialClean || !input.isolation.finalSubjectMatch) reasons.push("Verification workspace did not preserve the clean immutable subject boundary.");
  if (input.sourceAttempt.worktree && input.verificationAttempt.worktree
    && normalizePath(input.sourceAttempt.worktree) === normalizePath(input.verificationAttempt.worktree)) {
    reasons.push("Verification reused the builder worktree.");
  }
  if (input.verificationAttempt.worktree
    && (!input.isolation.verifierRoot
      || normalizePath(input.isolation.verifierRoot) !== normalizePath(input.verificationAttempt.worktree))) {
    reasons.push("Verification isolation does not name the authoritative Verification Attempt worktree.");
  }
  if (input.sourceAttempt.worktree
    && (!input.isolation.sourceRoot
      || normalizePath(input.isolation.sourceRoot) !== normalizePath(input.sourceAttempt.worktree))) {
    reasons.push("Verification isolation does not name the authoritative source Attempt worktree.");
  }
  if (input.isolation.sourceRoot && input.isolation.verifierRoot
    && normalizePath(input.isolation.sourceRoot) === normalizePath(input.isolation.verifierRoot)) {
    reasons.push("Verification isolation attestation points at the builder root.");
  }
  if (input.subject.kind === "GIT_CANDIDATE") {
    if (!["DETACHED_GIT_WORKTREE", "FRESH_CLONE", "REMOTE_SANDBOX", "ISOLATED_CONTAINER"].includes(input.isolation.mode)) {
      reasons.push("Git verification did not use a fresh Git-capable isolation mode.");
    }
    if (input.isolation.mode === "ISOLATED_CONTAINER"
      && !/^docker:[a-f0-9]{64}$/.test(input.isolation.sandboxId ?? "")) {
      reasons.push("Git verification isolated-container identity is not exact.");
    }
    if (!input.isolation.repositoryId || input.isolation.repositoryId !== input.subject.repositoryId
      || input.isolation.headSha !== input.subject.candidateSha || input.isolation.treeSha !== input.subject.treeSha) {
      reasons.push("Git checkout attestation does not match repository, commit, and tree identity.");
    }
  } else {
    if (!["AUTOMATION_SNAPSHOT", "REMOTE_SANDBOX"].includes(input.isolation.mode)) {
      reasons.push("Automation verification did not use immutable snapshot isolation.");
    }
    if (input.isolation.outputSnapshotContentHash !== input.subject.outputSnapshotContentHash) {
      reasons.push("Automation sandbox did not materialize the immutable output snapshot.");
    }
  }

  return {
    policyVersion: "verification-independence/v1",
    sourceAttemptId: expected.sourceAttemptId,
    verificationAttemptId: expected.verificationAttemptId,
    passed: reasons.length === 0,
    reasons: reasons.length
      ? reasons
      : ["Mission Control proved separate Attempt, FactoryVersion, invocation, lease, capability, isolated subject lineage, and verification-definition authority."],
  };
}

export function tupleMatches(actual: VerificationIdentityTuple, expected: VerificationIdentityTuple) {
  return actual.workOrderId === expected.workOrderId
    && actual.workOrderRevisionNumber === expected.workOrderRevisionNumber
    && actual.verificationContractDigest === expected.verificationContractDigest
    && actual.sourceAttemptId === expected.sourceAttemptId
    && actual.verificationSubjectDigest === expected.verificationSubjectDigest;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
