import { canonicalDigest, factoryDelegationBindingDigest, verifyEngineeringTariff, type EngineeringTariff, type FactoryDelegationBinding } from "@mission-control/shared";

export const LOCAL_PROVIDER_QUALIFICATION_SHA = "e498c31db8b749fa91b0544ecd1d1a661b971c2c";
type LocalVerifier = { sourceSha: string; verifyResult(input: unknown, expected: Record<string, unknown>): { manifest: any; keyValidForCurrentUse: boolean } };
type LocalResultExpectation = { workOrderId: string; runId: string; keys: unknown[]; now: number;
  tariff?: EngineeringTariff; admittedAt?: number };
export function verifyLocalTerminalResult(input: unknown, binding: FactoryDelegationBinding,
  verifier: LocalVerifier, expected: LocalResultExpectation) {
  if (verifier.sourceSha !== LOCAL_PROVIDER_QUALIFICATION_SHA) throw Error("LOCAL_COMPATIBILITY_SOURCE_DENIED");
  const { manifest: m, keyValidForCurrentUse } = verifier.verifyResult(input, { ...expected,
    factoryId: binding.factoryId, factoryVersion: binding.factoryVersion, requestId: binding.partnerRequestId,
    localProvider: { provider: "local-docker", ownerScope: binding.ownerScope, delegationDigest: factoryDelegationBindingDigest(binding).slice(7) } });
  const e = m.execution, l = e.configuration.local, v = m.verification;
  if (!keyValidForCurrentUse || e.version !== 3 || l?.provider !== "local-docker" || l.modelProvider !== "none"
    || l.evidenceClass !== "DETERMINISTIC" || e.configuration.executor !== "deterministic-qualification"
    || e.requestDigest !== binding.partnerRequestDigest || e.inputCommit !== binding.baseCommit || e.inputTree !== binding.baseTree
    || `sha256:${e.configurationDigest}` !== binding.executionProfileDigest
    || `sha256:${l.verificationPolicySha256}` !== binding.verificationPolicyDigest
    || canonicalDigest("factory-fixture-model/v1", { model: e.configuration.model, evidenceClass: "DETERMINISTIC" }) !== binding.modelPolicyDigest
    || e.localBinding.ownerScope !== binding.ownerScope || e.localBinding.delegationDigest !== factoryDelegationBindingDigest(binding).slice(7)
    || e.localBinding.repository !== binding.repository
    || (v && (v.kind !== "INDEPENDENT_LOCAL_VERIFICATION" || v.workId !== binding.partnerWorkId || v.workGeneration !== binding.partnerWorkGeneration || v.cleanupConfirmed !== true))
    || m.localExecution.producerDestroyed !== true || m.localExecution.verifierDestroyed !== true) {
    throw Error("LOCAL_DELEGATION_RESULT_DENIED");
  }
  const tariff = expected.tariff ? verifyEngineeringTariff(binding, expected.tariff, expected.admittedAt ?? NaN) : undefined;
  return { manifest: m, ...(tariff ? { tariffDigest: tariff.digest } : {}), bindingDigest: factoryDelegationBindingDigest(binding), resultDigest: `sha256:${(input as { manifestDigest: string }).manifestDigest}`,
    partnerRunId: expected.runId, partnerWorkOrderId: expected.workOrderId, state: m.status, cleanupConfirmed: true as const, actualMicrousd: 0 as const };
}
export function verifyLocalDelegationResult(input: unknown, binding: FactoryDelegationBinding,
  verifier: LocalVerifier, expected: LocalResultExpectation) {
  const { manifest: m, tariffDigest } = verifyLocalTerminalResult(input, binding, verifier, expected);
  const v = m.verification;
  if (m.status !== "COMPLETED" || !m.candidate || !v || v.outcome !== "PASS") throw Error("LOCAL_DELEGATION_RESULT_DENIED");
  const patch = (input as { artifacts: { id: string; base64: string }[] }).artifacts.find(a => a.id === m.candidate.patchArtifactId);
  if (!patch) throw Error("LOCAL_CANDIDATE_PATCH_MISSING");
  const diff = Buffer.from(patch.base64, "base64").toString("utf8");
  const changedFiles = [...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(match => {
    if (match[1] !== match[2] || !/^[A-Za-z0-9_.\/-]+$/.test(match[1])) throw Error("LOCAL_PATCH_SHAPE_UNSUPPORTED");
    return match[1];
  });
  if (!changedFiles.length || new Set(changedFiles).size !== changedFiles.length || /^deleted file mode/m.test(diff)) throw Error("LOCAL_PATCH_SHAPE_UNSUPPORTED");
  const candidateChange = { sourceRevision: binding.baseCommit, candidateRevision: m.candidate.commit, changedFiles, deletedFiles: [], diff,
    linesAdded: diff.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).length,
    linesDeleted: diff.split("\n").filter(line => line.startsWith("-") && !line.startsWith("---")).length };
  return { candidateChange, executionStartedAt: Date.parse(m.execution.capturedAt), ...(tariffDigest ? { tariffDigest } : {}), bindingDigest: factoryDelegationBindingDigest(binding), resultDigest: `sha256:${(input as { manifestDigest: string }).manifestDigest}`,
    partnerRunId: expected.runId, partnerWorkOrderId: expected.workOrderId, candidateCommit: m.candidate.commit, candidateTree: m.candidate.tree,
    evidenceDigest: `sha256:${m.evidenceDigest}`, artifactDigest: `sha256:${m.artifactDigest}`, checks: v.checks,
    producerSessionId: v.producerSessionId, verifierSessionId: v.providerSessionId, cleanupConfirmed: true as const, actualMicrousd: 0 as const };
}

export function verifyLocalCustodyObservation(observation: any, result: any, binding: FactoryDelegationBinding, now: number) {
  if (!observation || observation.bindingDigest !== factoryDelegationBindingDigest(binding)
    || observation.resultDigest !== result.resultDigest
    || observation.candidateCommit !== result.candidateCommit || observation.candidateTree !== result.candidateTree
    || !Number.isSafeInteger(observation.observedAt) || observation.observedAt > now
    || !Number.isSafeInteger(observation.expiresAt) || observation.expiresAt <= now
    || observation.expiresAt > observation.observedAt + 60_000) throw Error("LOCAL_CUSTODY_OBSERVATION_DENIED");
  return observation;
}
