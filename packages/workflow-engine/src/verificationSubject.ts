import { verificationDigest } from "./verificationIdentity.js";

export type FactoryPurpose = "SOFTWARE" | "VERIFICATION" | "INTELLIGENT_AUTOMATION";
export type WorkOrderKind = "SOFTWARE_CHANGE" | "VERIFICATION" | "AUTOMATION";
export type AttemptPurpose = "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION";

export const normalizeFactoryPurpose = (purpose?: FactoryPurpose): FactoryPurpose => purpose ?? "SOFTWARE";
export const normalizeWorkOrderKind = (kind?: WorkOrderKind): WorkOrderKind => kind ?? "SOFTWARE_CHANGE";
export const normalizeAttemptPurpose = (purpose?: AttemptPurpose): AttemptPurpose => purpose ?? "IMPLEMENTATION";

type SubjectIdentity = {
  version: 1 | 2;
  subjectId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  verificationContractDigest: string;
  sourceAttemptId: string;
  digest: string;
};

type GitVerificationSubjectIdentity = SubjectIdentity & {
  version: 1;
  kind: "GIT_CANDIDATE";
  repositoryId: string;
  providerRepositoryId: string;
  candidateSha: string;
  treeSha: string;
};

export type GithubVerificationSubject = GitVerificationSubjectIdentity & {
  provider: "GITHUB";
  pullRequest: {
    providerPullRequestId: string;
    number: number;
    url: string;
    baseRef: string;
    headRef: string;
    headSha: string;
    draftAtPublication: boolean;
  };
};

export type LocalGitVerificationSubject = GitVerificationSubjectIdentity & {
  provider: "LOCAL_GIT";
  localRef: {
    baseRef: string;
    headRef: string;
    headSha: string;
  };
};

export type GitVerificationSubject = GithubVerificationSubject | LocalGitVerificationSubject;

export type AutomationVerificationSubject = SubjectIdentity & {
  version: 1;
  kind: "AUTOMATION_RUN";
  automationWorkflowRunId: string;
  automationDefinitionId: string;
  automationDefinitionVersion: number;
  adapterIdentity: {
    adapterType: string;
    runtime?: string;
    executionBindingDigest: string;
    outputContractDigest: string;
  };
  outputSnapshotArtifactId: string;
  outputSnapshotContentHash: string;
  outputArtifactIds: string[];
  outputArtifactContentHashes: string[];
};

export type PublishedGitVerificationSubject = GithubVerificationSubject;
export type PrepublicationGitVerificationSubject = Omit<GithubVerificationSubject, "version" | "pullRequest"> & {
  version: 2;
  baseSha: string;
  rawDiffSha256: string;
  baseRef: string;
  headRef: string;
};
export type VerificationSubject = GitVerificationSubject | PrepublicationGitVerificationSubject | AutomationVerificationSubject;

type GithubSubjectInput = Omit<GithubVerificationSubject, "subjectId" | "digest">;
type LocalGitSubjectInput = Omit<LocalGitVerificationSubject, "subjectId" | "digest">;
type GitSubjectInput = GithubSubjectInput | LocalGitSubjectInput;
type PrepublicationSubjectInput = Omit<PrepublicationGitVerificationSubject, "subjectId" | "digest">;
type AutomationSubjectInput = Omit<AutomationVerificationSubject, "subjectId" | "digest">;

const SHA = /^[0-9a-f]{40,64}$/;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

export function createGitVerificationSubject(input: GithubSubjectInput): GithubVerificationSubject;
export function createGitVerificationSubject(input: LocalGitSubjectInput): LocalGitVerificationSubject;
export function createGitVerificationSubject(input: GitSubjectInput): GitVerificationSubject {
  assertCommonIdentity(input);
  if (input.kind !== "GIT_CANDIDATE" || !["GITHUB", "LOCAL_GIT"].includes(input.provider)) {
    throw new Error("Git verification subject requires a supported kind and provider.");
  }
  if (input.version !== 1) throw new Error("Legacy Git subject requires version 1.");
  if (!input.repositoryId || !input.providerRepositoryId) {
    throw new Error("Git verification subject requires internal and provider repository identity.");
  }
  const boundHeadSha = input.provider === "GITHUB" ? input.pullRequest.headSha : input.localRef.headSha;
  if (!SHA.test(input.candidateSha) || !SHA.test(input.treeSha) || boundHeadSha !== input.candidateSha) {
    throw new Error("Git verification subject requires exact lowercase commit/tree SHA lineage and a matching bound head.");
  }
  if (input.provider === "GITHUB"
    && (!input.pullRequest.providerPullRequestId
      || !Number.isSafeInteger(input.pullRequest.number)
      || input.pullRequest.number < 1)) {
    throw new Error("GitHub verification subject requires an exact pull request identity.");
  }
  if (input.provider === "LOCAL_GIT" && (!input.localRef.baseRef || !input.localRef.headRef)) {
    throw new Error("Local Git verification subject requires exact base and head refs.");
  }
  const digest = verificationDigest("verification-subject/git/v1", {
    version: input.version,
    kind: input.kind,
    workOrderId: input.workOrderId,
    workOrderRevisionNumber: input.workOrderRevisionNumber,
    verificationContractDigest: input.verificationContractDigest,
    sourceAttemptId: input.sourceAttemptId,
    repositoryId: input.repositoryId,
    provider: input.provider,
    providerRepositoryId: input.providerRepositoryId,
    ...(input.provider === "GITHUB" ? {
      providerPullRequestId: input.pullRequest.providerPullRequestId,
      providerPullRequestNumber: input.pullRequest.number,
    } : {
      baseRef: input.localRef.baseRef,
      headRef: input.localRef.headRef,
    }),
    candidateSha: input.candidateSha,
    treeSha: input.treeSha,
  });
  return { ...input, subjectId: `verification-subject:${digest.slice("sha256:".length)}`, digest } as GitVerificationSubject;
}

export function createPrepublicationGitVerificationSubject(input: PrepublicationSubjectInput): PrepublicationGitVerificationSubject {
  assertCommonIdentity(input);
  if (input.version !== 2 || input.kind !== "GIT_CANDIDATE" || input.provider !== "GITHUB"
    || !input.repositoryId || !input.providerRepositoryId || !SHA.test(input.baseSha)
    || !SHA.test(input.candidateSha) || !SHA.test(input.treeSha) || !CONTENT_HASH.test(input.rawDiffSha256)
    || input.baseSha === input.candidateSha || !gitBranch(input.baseRef) || !gitBranch(input.headRef)
    || input.baseRef === input.headRef || "pullRequest" in input) {
    throw new Error("Pre-publication subject requires exact repository, frozen base, candidate, tree, raw diff and branch identity without a pull request.");
  }
  // Explicit projection: no caller-supplied extra field can participate in or bypass identity.
  const identity = { version: 2 as const, kind: "GIT_CANDIDATE" as const,
    workOrderId: input.workOrderId, workOrderRevisionNumber: input.workOrderRevisionNumber,
    verificationContractDigest: input.verificationContractDigest, sourceAttemptId: input.sourceAttemptId,
    repositoryId: input.repositoryId, provider: "GITHUB" as const, providerRepositoryId: input.providerRepositoryId,
    baseSha: input.baseSha, candidateSha: input.candidateSha, treeSha: input.treeSha,
    rawDiffSha256: input.rawDiffSha256, baseRef: input.baseRef, headRef: input.headRef };
  const digest = verificationDigest("verification-subject/git/v2", identity);
  return { ...identity, subjectId: `verification-subject:${digest.slice("sha256:".length)}`, digest };
}

export type GitSubjectPublicationBinding = {
  version: 1; verificationSubjectDigest: string; sourceAttemptId: string; repositoryId: string;
  publicationPermitId: string; publicationPermitLeaseId: string; approvalDecisionId: string;
  verificationReceiptId: string; pullRequest: PublishedGitVerificationSubject["pullRequest"]; digest: string;
};

export function createGitSubjectPublicationBinding(
  subject: PrepublicationGitVerificationSubject,
  input: Omit<GitSubjectPublicationBinding, "version" | "verificationSubjectDigest" | "sourceAttemptId" | "repositoryId" | "digest">,
): GitSubjectPublicationBinding {
  if (!verifyVerificationSubjectIdentity(subject) || !input.publicationPermitId || !input.publicationPermitLeaseId
    || !input.approvalDecisionId || !input.verificationReceiptId || !input.pullRequest.providerPullRequestId
    || !Number.isSafeInteger(input.pullRequest.number) || input.pullRequest.number < 1
    || !/^https:\/\/[^\s]+\/pull\/\d+$/.test(input.pullRequest.url)
    || input.pullRequest.headSha !== subject.candidateSha || input.pullRequest.headRef !== subject.headRef
    || input.pullRequest.baseRef !== subject.baseRef || input.pullRequest.draftAtPublication !== true) {
    throw new Error("Publication binding does not match the verified subject and consumed human-authorized permit.");
  }
  const identity = { version: 1 as const, verificationSubjectDigest: subject.digest, sourceAttemptId: subject.sourceAttemptId,
    repositoryId: subject.repositoryId, publicationPermitId: input.publicationPermitId,
    publicationPermitLeaseId: input.publicationPermitLeaseId, approvalDecisionId: input.approvalDecisionId,
    verificationReceiptId: input.verificationReceiptId, pullRequest: { ...input.pullRequest } };
  return { ...identity, digest: verificationDigest("verification-subject/publication/v1", identity) };
}

export function verifyGitSubjectPublicationBinding(subject: PrepublicationGitVerificationSubject, binding: GitSubjectPublicationBinding): boolean {
  try {
    const rebuilt = createGitSubjectPublicationBinding(subject, binding);
    return rebuilt.digest === binding.digest && binding.version === rebuilt.version
      && binding.verificationSubjectDigest === subject.digest && binding.sourceAttemptId === subject.sourceAttemptId
      && binding.repositoryId === subject.repositoryId;
  } catch { return false; }
}

function gitBranch(value: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 250 && !value.startsWith("-")
    && !/[\x00-\x20~^:?*\[\\]/.test(value) && !value.includes("..") && !value.includes("@{")
    && !value.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"));
}

export function verifyVerificationSubjectIdentity(subject: VerificationSubject): boolean {
  const { subjectId, digest, ...input } = subject;
  try {
    const rebuilt = input.kind === "GIT_CANDIDATE"
      ? input.version === 2 ? createPrepublicationGitVerificationSubject(input) : input.provider === "GITHUB"
        ? createGitVerificationSubject(input as GithubSubjectInput)
        : createGitVerificationSubject(input as LocalGitSubjectInput)
      : createAutomationVerificationSubject(input);
    return rebuilt.subjectId === subjectId && rebuilt.digest === digest;
  } catch {
    return false;
  }
}

export function createAutomationVerificationSubject(input: AutomationSubjectInput): AutomationVerificationSubject {
  assertCommonIdentity(input);
  if (input.version !== 1) throw new Error("Automation subject requires version 1.");
  if (input.automationWorkflowRunId !== input.sourceAttemptId) {
    throw new Error("Automation workflow run must be the source Attempt.");
  }
  if (!input.automationDefinitionId || !Number.isSafeInteger(input.automationDefinitionVersion) || input.automationDefinitionVersion < 1) {
    throw new Error("Automation verification subject requires immutable definition identity.");
  }
  if (!input.adapterIdentity.adapterType || !CONTENT_HASH.test(input.adapterIdentity.executionBindingDigest)
    || !CONTENT_HASH.test(input.adapterIdentity.outputContractDigest)) {
    throw new Error("Automation verification subject requires adapter, execution-binding, and output-contract identity.");
  }
  if (!input.outputSnapshotArtifactId || !CONTENT_HASH.test(input.outputSnapshotContentHash)) {
    throw new Error("Automation verification subject requires an immutable output snapshot.");
  }
  if (input.outputArtifactIds.length !== input.outputArtifactContentHashes.length
    || input.outputArtifactContentHashes.some((hash) => !CONTENT_HASH.test(hash))) {
    throw new Error("Automation verification subject requires an ordered content hash for every output artifact.");
  }
  const digest = verificationDigest("verification-subject/automation/v1", {
    version: input.version,
    kind: input.kind,
    workOrderId: input.workOrderId,
    workOrderRevisionNumber: input.workOrderRevisionNumber,
    verificationContractDigest: input.verificationContractDigest,
    sourceAttemptId: input.sourceAttemptId,
    automationDefinitionId: input.automationDefinitionId,
    automationDefinitionVersion: input.automationDefinitionVersion,
    adapterIdentity: input.adapterIdentity,
    outputSnapshotArtifactId: input.outputSnapshotArtifactId,
    outputSnapshotContentHash: input.outputSnapshotContentHash,
    outputArtifactIds: input.outputArtifactIds,
    outputArtifactContentHashes: input.outputArtifactContentHashes,
  });
  return { ...input, subjectId: `verification-subject:${digest.slice("sha256:".length)}`, digest };
}

function assertCommonIdentity(input: GitSubjectInput | PrepublicationSubjectInput | AutomationSubjectInput) {
  if (![1, 2].includes(input.version) || !input.workOrderId || !input.sourceAttemptId || !Number.isSafeInteger(input.workOrderRevisionNumber) || input.workOrderRevisionNumber < 1) {
    throw new Error("Verification subject requires a versioned WorkOrder revision and source Attempt.");
  }
  if (!CONTENT_HASH.test(input.verificationContractDigest)) {
    throw new Error("Verification subject requires a canonical verification contract digest.");
  }
}
