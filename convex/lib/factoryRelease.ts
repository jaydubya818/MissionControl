export type FactoryReleaseState = "MERGED" | "DEPLOYED" | "VERIFIED" | "ROLLED_BACK";

export interface FactoryReleaseVerificationUrls {
  deploymentUrl: string;
  provenanceUrl: string;
  smokeUrl: string;
  healthUrl: string;
}

export interface FactoryReleaseCheckResult {
  kind: "PROVENANCE" | "SMOKE_TEST" | "HEALTH_CHECK";
  passed: boolean;
  url: string;
  httpStatus?: number;
  latencyMs?: number;
  contentDigest?: string;
  summary: string;
}

const TRANSITIONS: Record<FactoryReleaseState, FactoryReleaseState[]> = {
  MERGED: ["DEPLOYED"],
  DEPLOYED: ["VERIFIED", "ROLLED_BACK"],
  VERIFIED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};

export function factoryReleaseTransitionAllowed(
  from: FactoryReleaseState,
  to: FactoryReleaseState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function factoryReleaseMergeIdentityIssue(input: {
  prState?: string;
  verifiedLineage: boolean;
  projectId?: string;
  workOrderId?: string;
  workflowRunId?: string;
  sourceHeadSha?: string;
  mergeCommitSha?: string;
  mergedAt?: number;
}): string | undefined {
  if (input.prState !== "MERGED") return "pull-request-not-merged";
  if (!input.projectId || !input.workOrderId || !input.workflowRunId || !input.verifiedLineage) {
    return "verified-lineage-missing";
  }
  if (!normalizeCommitSha(input.sourceHeadSha ?? "")
    || !normalizeCommitSha(input.mergeCommitSha ?? "")
    || !input.mergedAt) {
    return "trusted-merge-evidence-missing";
  }
  return undefined;
}

export function factoryReleaseBoundLineageIssue(input: {
  evaluationProjectId: string;
  workOrderId: string;
  workOrderProjectId?: string;
  workflowWorkOrderId?: string;
  workflowProjectId?: string;
  sourceHeadSha: string;
  workflowHeadSha?: string;
  repositoryProjectId?: string;
  repositoryName?: string;
  evaluationRepositoryName: string;
  environmentType?: string;
  workOrderTenantId?: string;
  environmentTenantId?: string;
}): string | undefined {
  if (input.workflowWorkOrderId !== input.workOrderId
    || input.workOrderProjectId !== input.evaluationProjectId
    || input.workflowProjectId !== input.evaluationProjectId) {
    return "lineage-scope-mismatch";
  }
  if (normalizeCommitSha(input.workflowHeadSha ?? "") !== input.sourceHeadSha) {
    return "attempt-head-mismatch";
  }
  if (input.repositoryProjectId !== input.evaluationProjectId
    || input.repositoryName !== input.evaluationRepositoryName) {
    return "repository-binding-mismatch";
  }
  if (input.environmentType !== "staging"
    || (input.workOrderTenantId && input.environmentTenantId !== input.workOrderTenantId)) {
    return "staging-environment-invalid";
  }
  return undefined;
}

export function normalizeCommitSha(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

export function factoryReleaseEvidenceReplayMatches(
  existing: {
    kind: string;
    subjectSha: string;
    providerRef?: string;
    evidenceUrl?: string;
    summary: string;
    metadata?: unknown;
  },
  expected: {
    kind: string;
    subjectSha: string;
    providerRef?: string;
    evidenceUrl?: string;
    summary: string;
    metadata?: Record<string, string>;
  },
): boolean {
  if (existing.kind !== expected.kind
    || existing.subjectSha !== expected.subjectSha
    || existing.providerRef !== expected.providerRef
    || existing.evidenceUrl !== expected.evidenceUrl
    || existing.summary !== expected.summary) {
    return false;
  }
  const existingMetadata = existing.metadata && typeof existing.metadata === "object"
    ? existing.metadata as Record<string, unknown>
    : {};
  return Object.entries(expected.metadata ?? {}).every(
    ([key, value]) => existingMetadata[key] === value,
  );
}

export function factoryReleaseAllowedOrigins(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const releaseVerification = (metadata as Record<string, unknown>).releaseVerification;
  if (!releaseVerification || typeof releaseVerification !== "object") return [];
  const candidates = (releaseVerification as Record<string, unknown>).allowedOrigins;
  if (!Array.isArray(candidates)) return [];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    try {
      const url = new URL(candidate.trim());
      if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) continue;
      origins.add(url.origin.toLowerCase());
    } catch {
      // Invalid configuration is ignored and therefore fails closed later.
    }
  }
  return [...origins];
}

export function validateFactoryReleaseVerificationUrls(input: {
  urls: FactoryReleaseVerificationUrls;
  allowedOrigins: string[];
  allowLocalhost?: boolean;
}):
  | { ok: true; urls: FactoryReleaseVerificationUrls; origin: string }
  | { ok: false; reason: string } {
  const allowedOrigins = new Set(
    input.allowedOrigins.flatMap((candidate) => {
      try {
        return [new URL(candidate).origin.toLowerCase()];
      } catch {
        return [];
      }
    }),
  );
  if (allowedOrigins.size === 0) {
    return { ok: false, reason: "staging-origin-not-configured" };
  }

  const parsed: Record<keyof FactoryReleaseVerificationUrls, URL> = {} as Record<
    keyof FactoryReleaseVerificationUrls,
    URL
  >;
  for (const [key, candidate] of Object.entries(input.urls) as Array<
    [keyof FactoryReleaseVerificationUrls, string]
  >) {
    if (!candidate.trim() || candidate.length > 2_048) {
      return { ok: false, reason: `${key}-invalid` };
    }
    let url: URL;
    try {
      url = new URL(candidate.trim());
    } catch {
      return { ok: false, reason: `${key}-invalid` };
    }
    if (url.username || url.password || url.hash) {
      return { ok: false, reason: `${key}-contains-credentials-or-fragment` };
    }
    const local = isLocalOrPrivateHostname(url.hostname);
    if (url.protocol !== "https:" && !(input.allowLocalhost && local && url.protocol === "http:")) {
      return { ok: false, reason: `${key}-requires-https` };
    }
    if (local && !input.allowLocalhost) {
      return { ok: false, reason: `${key}-private-host-denied` };
    }
    if (!allowedOrigins.has(url.origin.toLowerCase())) {
      return { ok: false, reason: `${key}-origin-not-allowed` };
    }
    parsed[key] = url;
  }

  const origin = parsed.deploymentUrl.origin.toLowerCase();
  if (Object.values(parsed).some((url) => url.origin.toLowerCase() !== origin)) {
    return { ok: false, reason: "verification-urls-must-share-origin" };
  }

  return {
    ok: true,
    origin,
    urls: {
      deploymentUrl: parsed.deploymentUrl.toString(),
      provenanceUrl: parsed.provenanceUrl.toString(),
      smokeUrl: parsed.smokeUrl.toString(),
      healthUrl: parsed.healthUrl.toString(),
    },
  };
}

export function evaluateFactoryReleaseVerification(input: {
  mergeCommitSha: string;
  providerDeploymentId: string;
  provenance: unknown;
  checks: FactoryReleaseCheckResult[];
}): { verified: boolean; reason?: string } {
  const provenanceResult = evaluateFactoryReleaseProvenance(input);
  if ("reason" in provenanceResult) {
    return { verified: false, reason: provenanceResult.reason };
  }
  const required = new Set(["PROVENANCE", "SMOKE_TEST", "HEALTH_CHECK"]);
  for (const check of input.checks) {
    if (check.passed) required.delete(check.kind);
  }
  if (required.size > 0) {
    return {
      verified: false,
      reason: `required-checks-failed:${[...required].sort().join(",")}`,
    };
  }
  return { verified: true };
}

export function evaluateFactoryReleaseProvenance(input: {
  mergeCommitSha: string;
  providerDeploymentId: string;
  provenance: unknown;
}): { passed: true } | { passed: false; reason: string } {
  const mergeCommitSha = normalizeCommitSha(input.mergeCommitSha);
  if (!mergeCommitSha) return { passed: false, reason: "merge-sha-invalid" };
  if (!input.provenance || typeof input.provenance !== "object") {
    return { passed: false, reason: "provenance-invalid" };
  }
  const provenance = input.provenance as Record<string, unknown>;
  if (normalizeCommitSha(String(provenance.commitSha ?? "")) !== mergeCommitSha) {
    return { passed: false, reason: "provenance-sha-mismatch" };
  }
  if (String(provenance.deploymentId ?? "") !== input.providerDeploymentId) {
    return { passed: false, reason: "provenance-deployment-mismatch" };
  }
  if (provenance.environment !== "staging") {
    return { passed: false, reason: "provenance-environment-mismatch" };
  }
  return { passed: true };
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    return true;
  }
  if (normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}
