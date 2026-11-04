import { canonicalDigest, canonicalHash } from "@mission-control/shared";
import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { attemptExposure, validateReservation } from "./enterpriseAttemptAccounting";
import { enterpriseMissionOwner } from "./enterpriseMissionOwner";
import { validateNativeExecutedProof } from "./nativeExecutedProof";
import { resolveCurrentAttemptExecutionProfile } from "./attemptExecutionProfile";
import { loadLocalRepositoryAdmission } from "./localRepositoryAdmission";
import { assertQualificationActivation } from "./factoryQualificationScope";
import { deterministicFactoryVersionIssues } from "./factoryWorkflowContract";
import { computeCanonicalHash } from "./genomeHash";

const specification = (value: any) => ({ requirements: value.requirements ?? [],
  acceptanceCriteria: value.acceptanceCriteria.map(({ status, ...criterion }: any) => criterion),
  negativeConstraints: value.negativeConstraints ?? [], positiveConstraints: value.positiveConstraints ?? [],
  dataBoundaries: value.dataBoundaries ?? [], changeBudget: value.changeBudget, verificationContract: value.verificationContract,
  requiredApprovals: value.requiredApprovals ?? [], riskLevel: value.riskLevel, riskReasons: value.riskReasons ?? [] });

/** Qualification-only projection of already persisted Policy V2 evidence.
 * Never changes the evidence's CONTROL_FIXTURE/authority NONE classification. */
export async function nativeQualificationEvidenceIsCurrent(ctx: any, wo: any, envelope: any, attempts: any[], now: number) {
  return createNativeQualificationEvidenceChecker(ctx, wo, attempts, now)(envelope);
}

/** One read-only Quality Gate snapshot only. The cache cannot escape this
 * checker or be supplied by a caller. Every envelope retains its own checks. */
export function createNativeQualificationEvidenceChecker(ctx: any, wo: any, attempts: any[], now: number) {
  const runProofs = new WeakMap<object, Promise<any>>();
  return async (envelope: any): Promise<boolean> => {
    if (process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION !== "1" || envelope.provenance !== "SYNTHETIC"
      || envelope.metadata?.authority !== "NONE" || envelope.metadata?.evidenceOrigin !== "CONTROL_FIXTURE"
      || envelope.metadata?.serverDerivedIndependence !== true || !envelope.independence?.passed
      || envelope.projectId !== wo.projectId || envelope.tenantId !== wo.tenantId) return false;
    try {
      const source = attempts.find(a => a._id === envelope.sourceAttemptId);
      const verifier = attempts.find(a => a._id === envelope.verificationAttemptId);
      const mission = await ctx.db.get(wo.missionId), plan = await ctx.db.get(wo.missionPlanId);
      const repository = await ctx.db.get(wo.repositoryId), revision = await ctx.db.get(wo.currentRevisionId);
      const observation = envelope.metadata.nativeCandidateObservation;
      if (!source || !verifier || source._id === verifier._id || source.status !== "COMPLETED" || verifier.status !== "COMPLETED"
        || source.attemptPurpose !== "IMPLEMENTATION" || verifier.attemptPurpose !== "VERIFICATION"
        || source.verificationSubject?.provider !== "LOCAL_GIT" || source.repositoryId !== wo.repositoryId || verifier.repositoryId !== wo.repositoryId
        || source.workOrderRevisionId !== wo.currentRevisionId || verifier.workOrderRevisionId !== wo.currentRevisionId
        || source.workOrderRevisionNumber !== wo.currentRevisionNumber || verifier.workOrderRevisionNumber !== wo.currentRevisionNumber
        || revision?.status !== "APPLIED" || !["APPROVED", "NOT_REQUIRED"].includes(wo.approvalStatus)
        || source.qualityContractDigest !== wo.qualityContractDigest || verifier.qualityContractDigest !== wo.qualityContractDigest
        || (wo.currentExecutionRunId && wo.currentExecutionRunId !== verifier._id)
        || attempts.some(a => ["PENDING", "RUNNING", "PAUSED", "WAITING", "WAITING_FOR_APPROVAL"].includes(a.status))
        || mission?.projectId !== wo.projectId || mission.tenantId !== wo.tenantId
        || mission.currentPlanId !== plan?._id || plan.status !== "APPROVED" || plan.revisionNumber !== wo.missionPlanRevision
        || plan.qualityContractDigest !== wo.qualityContractDigest || plan.decidedActorSource !== "AUTHENTICATED"
        || `sha256:${canonicalHash(plan.qualityContractProjection)}` !== wo.qualityContractDigest
        || verificationContractDigest(wo.verificationContract, wo.qualityContractDigest) !== wo.verificationContractDigest
        || repository?.provider !== "LOCAL" || repository.localAdmission?.productionAuthority !== "NONE"
        || repository.localAdmission?.publicationAuthority !== "NONE" || repository.localAdmission.expiresAt <= now
        || !observation || !Number.isSafeInteger(observation.observedAt) || !Number.isSafeInteger(observation.expiresAt)
        || observation.observedAt > now || observation.observedAt > envelope.recordedAt || observation.expiresAt <= now
        || observation.expiresAt > observation.observedAt + 60000
        || observation.candidateCommit !== source.verificationSubject.candidateSha || observation.candidateTree !== source.verificationSubject.treeSha) return false;
      const owner = await enterpriseMissionOwner(ctx, mission);
      const operator = await ctx.db.get(owner);
      if (plan.approvedBy !== owner && plan.approvedBy !== operator?.authId) return false;
      const proofs: any[] = [];
      for (const run of [source, verifier]) {
        const reservation = validateReservation(run.executionCostAuthorization?.enterprise);
        const usage = run.enterpriseSettlement?.nativeUsage;
        if (run.executionManifest?.causation?.missionPlanId !== wo.missionPlanId
          || run.executionManifest.causation.missionPlanVersion !== wo.missionPlanRevision
          || run.executionManifest.causation.missionPlanDigest !== `sha256:${canonicalHash(plan)}`
          || canonicalDigest("native-verification-spec/v1", specification(run.executionManifest.workOrderSpecification))
            !== canonicalDigest("native-verification-spec/v1", specification(wo))) return false;
        if (!runProofs.has(run)) runProofs.set(run, (async () => {
          const definitionVersion = await ctx.db.get(run.factoryDefinitionVersionId);
          const definition = definitionVersion && await ctx.db.get(definitionVersion.factoryDefinitionId);
          const local = await loadLocalRepositoryAdmission(ctx, repository, now, definitionVersion);
          assertQualificationActivation({ definition, version: definitionVersion, environment: local.environment,
            configuredEnvironmentId: process.env.MC_OFFLINE_QUALIFICATION_ENVIRONMENT_ID, now });
          await resolveCurrentAttemptExecutionProfile(ctx, definitionVersion, run, run.executionManifest, now);
          const workflow = await ctx.db.get(definitionVersion.workflowId), policy = await ctx.db.get(definitionVersion.policyEnvelopeId);
          if (reservation.ownerId !== owner || !usage || attemptExposure(run) !== 0
            || definitionVersion.configurationDigest !== run.factoryConfigurationDigest
            || definitionVersion.configurationDigest !== run.executionManifest.causation.factoryConfigurationDigest
            || definitionVersion._id !== run.executionManifest.causation.factoryDefinitionVersionId
            || deterministicFactoryVersionIssues(definitionVersion, workflow).length
            || workflow?.version !== run.executionManifest.workflow.workflowVersion
            || !policy?.active || policy.tenantId !== wo.tenantId || policy.projectId !== wo.projectId
            || run.executionCostAuthorization.policyEnvelopeDigest !== computeCanonicalHash(policy)
            || !Number.isSafeInteger(run.executionProfileQualificationSnapshot?.validUntil) || run.executionProfileQualificationSnapshot.validUntil <= now
            || definition?.status !== "ACTIVE" || definition.activeVersionId !== definitionVersion?._id
            || definitionVersion.executionProfileDigest !== run.executionProfileDigest) return null;
          const proof = await validateNativeExecutedProof(ctx, run, reservation, usage.responseArtifactId);
          if (proof.parsed.result.status !== "SUCCESS" || proof.artifact.metadata?.disposition !== "CURRENT_AT_INGESTION"
            || proof.parsed.packetDigest !== usage.responseDigest || run.enterpriseSettlement.proofDigest !== usage.responseDigest) return null;
          return proof;
        })());
        const proof = await runProofs.get(run);
        if (!proof) return false;
        proofs.push(proof);
      }
      const [producerProof, verifierProof] = proofs;
      const input = verifierProof.parsed.request.workload.input;
      return producerProof.proof.container.id !== verifierProof.proof.container.id
        && envelope.metadata.retainedResponseArtifactId === verifierProof.artifact._id
        && envelope.metadata.retainedResponseDigest === verifierProof.parsed.packetDigest
        && verifierProof.parsed.request.workload.reference === "verify-document-bytes/v1"
        && input.producerAttemptId === source._id && input.candidateSha === observation.candidateCommit
        && input.candidateTreeSha === observation.candidateTree
        && observation.observedAt >= verifierProof.parsed.result.completedAt
        && input.subjectDigest === envelope.verificationSubjectDigest && input.verificationPlanDigest === envelope.verificationPlanDigest
        && canonicalDigest("native-candidate-observation/v1", observation) === envelope.metadata.nativeCandidateObservationDigest;
    } catch { return false; }
  };
}
