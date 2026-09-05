export interface FactoryDispatchPreflightInput {
  factoryRequired: boolean;
  versionProvided: boolean;
  definitionActive: boolean;
  versionIsActive: boolean;
  assessmentPasses: boolean;
  assessmentCurrent: boolean;
  digestMatches: boolean;
  repositoryReady: boolean;
  repositoryPolicyReady: boolean;
  remoteEgressPolicyReady: boolean;
  githubReady: boolean;
  workflowMatches: boolean;
  workflowContractReady: boolean;
  executorReady: boolean;
  codeScopesReady: boolean;
  agentManifestsReady: boolean;
  policyReady: boolean;
  verifiersReady: boolean;
  hostReady: boolean;
  budgetReady: boolean;
  recoveryReady: boolean;
  worktreeProvided: boolean;
  mutating: boolean;
  activeRepositoryMutation: boolean;
}

export interface FactoryDispatchPreflightResult {
  ok: boolean;
  blocker?: string;
  remediation?: string;
}

const FACTORY_HOST_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export interface FactoryHostCandidate {
  hostId: string;
  repository: string;
  status: string;
  dirty: boolean;
  checkedAt: number;
}

export function factoryVersionApprovesWorkOrderScopes(
  factoryCodeScopeIds: readonly string[],
  workOrderCodeScopeIds: readonly string[],
): boolean {
  if (workOrderCodeScopeIds.length === 0) return false;
  const approved = new Set(factoryCodeScopeIds);
  return workOrderCodeScopeIds.every((scopeId) => approved.has(scopeId));
}

export function selectCurrentFactoryHost<T extends FactoryHostCandidate>(
  hosts: readonly T[],
  repository: string,
  now: number,
  requestedHostId?: string,
): T | null {
  const repositoryKey = repository.trim().toLowerCase();
  const eligible = hosts
    .filter((host) =>
      (!requestedHostId || host.hostId === requestedHostId)
      && host.repository.trim().toLowerCase() === repositoryKey
      && host.status === "READY"
      && !host.dirty
      && now - host.checkedAt <= FACTORY_HOST_MAX_AGE_MS
    )
    .sort((left, right) =>
      right.checkedAt - left.checkedAt
      || left.hostId.localeCompare(right.hostId)
    );
  return eligible[0] ?? null;
}

export function genericHarnessV1RecoveryReady(input: {
  pause: boolean;
  cancel: boolean;
  retry: boolean;
  resume: boolean;
}): boolean {
  return !input.pause && input.cancel && input.retry && !input.resume;
}

const checks: Array<{
  key: keyof FactoryDispatchPreflightInput;
  blocker: string;
  remediation: string;
}> = [
  { key: "versionProvided", blocker: "factory-version-required", remediation: "Select the active Factory version before dispatch." },
  { key: "definitionActive", blocker: "factory-not-active", remediation: "Activate a passing Factory version." },
  { key: "versionIsActive", blocker: "factory-version-not-active", remediation: "Dispatch the exact active Factory version." },
  { key: "assessmentPasses", blocker: "factory-readiness-blocked", remediation: "Resolve the Factory readiness blockers and reassess." },
  { key: "assessmentCurrent", blocker: "factory-readiness-stale", remediation: "Run a current Factory readiness assessment." },
  { key: "digestMatches", blocker: "factory-digest-mismatch", remediation: "Reassess the immutable Factory version." },
  { key: "repositoryReady", blocker: "repository-not-ready", remediation: "Repair repository access before dispatch." },
  { key: "repositoryPolicyReady", blocker: "repository-classification-stale", remediation: "Classify the repository and create, assess, and activate a new immutable Factory version." },
  { key: "remoteEgressPolicyReady", blocker: "provider-egress-required", remediation: "Use Local execution or a remote profile with provider-enforced egress evidence." },
  { key: "githubReady", blocker: "github-app-not-ready", remediation: "Repair and reverify the GitHub App installation." },
  { key: "workflowMatches", blocker: "workflow-version-mismatch", remediation: "Use the workflow frozen in the Factory version." },
  { key: "workflowContractReady", blocker: "workflow-contract-unsafe", remediation: "Replace heuristic completion and provider authority with structured handoffs." },
  { key: "executorReady", blocker: "executor-not-ready", remediation: "Use an exact harness adapter/version advertised by the canonical worker." },
  { key: "codeScopesReady", blocker: "code-scopes-not-ready", remediation: "Create a Factory version with active repository code scopes." },
  { key: "agentManifestsReady", blocker: "agent-manifests-not-ready", remediation: "Bind every workflow agent to an approved agent version." },
  { key: "policyReady", blocker: "policy-not-ready", remediation: "Activate the Factory policy envelope." },
  { key: "verifiersReady", blocker: "verifiers-not-ready", remediation: "Restore every independent verifier frozen in the Factory version." },
  { key: "hostReady", blocker: "host-not-ready", remediation: "Report a clean, current READY repository host binding." },
  { key: "budgetReady", blocker: "budget-not-ready", remediation: "Use bounded positive V1 cost, runtime, and attempt limits." },
  { key: "recoveryReady", blocker: "recovery-not-ready", remediation: "Generic Harness Contract V1 supports cancel and bounded retry, not pause or in-process resume." },
  { key: "worktreeProvided", blocker: "worktree-required", remediation: "Allocate an attempt-specific repository worktree." },
];

export function factoryDispatchChecks(input: FactoryDispatchPreflightInput) {
  if (!input.factoryRequired && !input.versionProvided) return [];
  const results = checks.map((check) => ({
    code: check.blocker,
    label: check.key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()),
    passed: Boolean(input[check.key]),
    reason: check.remediation,
  }));
  if (input.mutating && input.activeRepositoryMutation) {
    results.push({ code: "repository-mutation-already-active", label: "Repository mutation capacity", passed: false,
      reason: "Wait for, cancel, or reconcile the active mutating attempt for this repository." });
  }
  return results;
}

export function evaluateFactoryDispatchPreflight(input: FactoryDispatchPreflightInput): FactoryDispatchPreflightResult {
  const failed = factoryDispatchChecks(input).find((check) => !check.passed);
  return failed ? { ok: false, blocker: failed.code, remediation: failed.reason } : { ok: true };
}
