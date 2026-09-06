/** Signed recovery receipts never create dispatch authority. The caller also
 * fences the canonical Attempt and authenticates the reconciliation service. */
export function dockerRequestRecoveryMatches(allocation: any, receipt: any): boolean {
  const proof = receipt?.allocationRecoveryProof;
  return Boolean(allocation?.provider === 'DOCKER' && !allocation.providerResourceId
    && /^mc-attempt-[a-f0-9]{16}$/.test(allocation.resourceName ?? '')
    && receipt?.resourceName === allocation.resourceName
    && receipt.resourceAbsent === true
    && Number.isSafeInteger(receipt.requestedAt) && Number.isSafeInteger(receipt.confirmedAbsentAt)
    && receipt.confirmedAbsentAt >= receipt.requestedAt
    && /^[a-f0-9]{64}$/.test(receipt.providerResourceId ?? "")
    && proof?.schema === 'factory-docker-request-recovery/v1'
    && /^sha256:[a-f0-9]{64}$/.test(proof.manifestDigest ?? '')
    && typeof proof.attemptLeaseId === 'string' && proof.attemptLeaseId.length > 0
    && proof.attemptLeaseId === allocation.attemptLeaseId
    && proof.manifestDigest === allocation.manifestDigest
    && allocation.profileSnapshot?.provider === 'DOCKER'
    && proof.image === allocation.profileSnapshot?.machine?.image
    && /^[a-z0-9][a-z0-9/._:-]*@sha256:[a-f0-9]{64}$/.test(proof.image ?? ''));
}
