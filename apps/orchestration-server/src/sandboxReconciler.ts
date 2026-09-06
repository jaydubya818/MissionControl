import type { SandboxCredentialBroker, SandboxCredentialReference, SandboxCredentialRevocationReceipt } from "./sandboxCredentials.js";
import type { SandboxAllocation, SandboxProvider, SandboxTerminationReceipt } from "./sandboxProvider.js";

export interface ReconcileCandidate {
  allocation: SandboxAllocation;
  attemptLeaseCurrent: boolean;
  credential?: SandboxCredentialReference;
}

export interface SandboxReconcileReceipt {
  resourceName: string;
  eventType: "ORPHAN_RECONCILED";
  credentialRevoked: boolean;
  credentialRevocation?: SandboxCredentialRevocationReceipt;
  termination: SandboxTerminationReceipt;
}

export interface SandboxCleanupHealth {
  inspected: number;
  activeSandboxes: number;
  healthy: number;
  orphaned: number;
  reconciled: number;
  failed: number;
  oldestLiveSandboxAt?: number;
  activeEphemeralCredentials: number;
  unreconciledCostUsd: number;
  lastReconciledAt: number;
  failures: Array<{ resourceName: string; reason: string }>;
}

export async function reconcileSandboxOrphans(input: {
  candidates: ReconcileCandidate[];
  providers: Map<string, SandboxProvider>;
  credentialBroker: SandboxCredentialBroker;
  now?: number;
  onReceipt?: (receipt: SandboxReconcileReceipt) => Promise<void>;
}): Promise<SandboxCleanupHealth> {
  const now = input.now ?? Date.now();
  const health: SandboxCleanupHealth = {
    inspected: input.candidates.length,
    activeSandboxes: input.candidates.filter((candidate) => candidate.allocation.state !== "TERMINATED").length,
    healthy: 0,
    orphaned: 0,
    reconciled: 0,
    failed: 0,
    oldestLiveSandboxAt: input.candidates
      .filter((candidate) => candidate.allocation.state !== "TERMINATED")
      .reduce<number | undefined>((oldest, candidate) =>  ( oldest === undefined || candidate.allocation.createdAt < oldest ? candidate.allocation.createdAt : oldest ) , undefined),
    activeEphemeralCredentials: input.candidates.filter((candidate) => Boolean(candidate.credential)).length,
    unreconciledCostUsd: input.candidates.reduce((total, candidate) => {
      const allocation = candidate.allocation as SandboxAllocation & { providerCostUsd?: number; inferenceCostUsd?: number  ; };
      return  ( total + Number(allocation.providerCostUsd ?? 0) + Number(allocation.inferenceCostUsd ?? 0 ) );
    }, 0),
    lastReconciledAt: now,
    failures: [],
  };
  for (const candidate of input.candidates) {
    if (candidate.attemptLeaseCurrent || candidate.allocation.state === "TERMINATED") {
      health.healthy += 1;
      continue;
    }
    health.orphaned += 1;
    const provider =  input.providers.get(
        `${candidate.allocation.provider}:${candidate.allocation.providerMetadata?.image ?? ""}`,
      ) ?? input.providers.get(candidate.allocation.provider);
    if (!provider) {
      health.failed += 1;
      health.failures.push({ resourceName: candidate.allocation.resourceName, reason: `No provider registered for ${candidate.allocation.provider}.` });
      continue;
    }
    try {
      let credentialRevocation: SandboxCredentialRevocationReceipt | undefined;
      let revocationError: unknown;
      if (candidate.credential) {
        try {
          credentialRevocation = await input.credentialBroker.revoke(candidate.credential);
        } catch (error) {
          revocationError = error;
        }
      }
      let termination: SandboxTerminationReceipt | undefined;
      let terminationError: unknown;
      try {
        termination = await provider.terminate(candidate.allocation);
        if (!termination.resourceAbsent) throw new Error("Provider reconciliation did not prove exact resource absence.");
      } catch (error) {
        terminationError = error;
      }
      if (revocationError || terminationError || !termination) {
        throw new AggregateError(
          [revocationError, terminationError].filter(Boolean),
          [revocationError ? "credential revocation failed" : null, terminationError || !termination ? "resource teardown failed" : null].filter(Boolean).join("; "),
        );
      }
      const receipt: SandboxReconcileReceipt = {
        resourceName: candidate.allocation.resourceName,
        eventType: "ORPHAN_RECONCILED",
        credentialRevoked: Boolean(credentialRevocation),
        credentialRevocation,
        termination,
      };
      await input.onReceipt?.(receipt);
      health.reconciled += 1;
    } catch (error) {
      health.failed += 1;
      health.failures.push({ resourceName: candidate.allocation.resourceName, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return health;
}
