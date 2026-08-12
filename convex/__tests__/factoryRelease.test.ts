import { describe, expect, it } from "vitest";
import {
  evaluateFactoryReleaseVerification,
  evaluateFactoryReleaseProvenance,
  factoryReleaseAllowedOrigins,
  factoryReleaseBoundLineageIssue,
  factoryReleaseEvidenceReplayMatches,
  factoryReleaseMergeIdentityIssue,
  factoryReleaseTransitionAllowed,
  normalizeCommitSha,
  validateFactoryReleaseVerificationUrls,
} from "../lib/factoryRelease";

const mergeSha = "a".repeat(40);

describe("factory release state and evidence", () => {
  it("allows only the governed release sequence", () => {
    expect(factoryReleaseTransitionAllowed("MERGED", "DEPLOYED")).toBe(true);
    expect(factoryReleaseTransitionAllowed("MERGED", "VERIFIED")).toBe(false);
    expect(factoryReleaseTransitionAllowed("DEPLOYED", "VERIFIED")).toBe(true);
    expect(factoryReleaseTransitionAllowed("DEPLOYED", "ROLLED_BACK")).toBe(true);
    expect(factoryReleaseTransitionAllowed("VERIFIED", "ROLLED_BACK")).toBe(true);
    expect(factoryReleaseTransitionAllowed("ROLLED_BACK", "DEPLOYED")).toBe(false);
  });

  it("accepts only full commit identities", () => {
    expect(normalizeCommitSha(mergeSha.toUpperCase())).toBe(mergeSha);
    expect(normalizeCommitSha("abc123")).toBeNull();
  });

  it("requires configured, same-origin HTTPS verification endpoints", () => {
    const urls = {
      deploymentUrl: "https://staging.example.com/releases/42",
      provenanceUrl: "https://staging.example.com/__mission-control/release.json",
      smokeUrl: "https://staging.example.com/",
      healthUrl: "https://staging.example.com/health",
    };
    expect(validateFactoryReleaseVerificationUrls({
      urls,
      allowedOrigins: ["https://staging.example.com"],
    })).toMatchObject({ ok: true, origin: "https://staging.example.com" });
    expect(validateFactoryReleaseVerificationUrls({
      urls: { ...urls, healthUrl: "https://other.example.com/health" },
      allowedOrigins: ["https://staging.example.com", "https://other.example.com"],
    })).toEqual({ ok: false, reason: "verification-urls-must-share-origin" });
    expect(validateFactoryReleaseVerificationUrls({
      urls: { ...urls, healthUrl: "http://127.0.0.1:4100/health" },
      allowedOrigins: ["https://staging.example.com", "http://127.0.0.1:4100"],
    })).toEqual({ ok: false, reason: "healthUrl-requires-https" });
  });

  it("reads only valid allowed origins from environment metadata", () => {
    expect(factoryReleaseAllowedOrigins({
      releaseVerification: {
        allowedOrigins: ["https://staging.example.com", "https://staging.example.com/", "not a url"],
      },
    })).toEqual(["https://staging.example.com"]);
  });

  it("verifies only exact provenance with every required passing check", () => {
    const checks = [
      { kind: "PROVENANCE" as const, passed: true, url: "https://staging.example.com/provenance", summary: "exact" },
      { kind: "SMOKE_TEST" as const, passed: true, url: "https://staging.example.com/", summary: "ok" },
      { kind: "HEALTH_CHECK" as const, passed: true, url: "https://staging.example.com/health", summary: "ok" },
    ];
    expect(evaluateFactoryReleaseVerification({
      mergeCommitSha: mergeSha,
      providerDeploymentId: "dep-42",
      provenance: { commitSha: mergeSha, deploymentId: "dep-42", environment: "staging" },
      checks,
    })).toEqual({ verified: true });
    expect(evaluateFactoryReleaseVerification({
      mergeCommitSha: mergeSha,
      providerDeploymentId: "dep-42",
      provenance: { commitSha: "b".repeat(40), deploymentId: "dep-42", environment: "staging" },
      checks,
    })).toEqual({ verified: false, reason: "provenance-sha-mismatch" });
    expect(evaluateFactoryReleaseVerification({
      mergeCommitSha: mergeSha,
      providerDeploymentId: "dep-42",
      provenance: { commitSha: mergeSha, deploymentId: "dep-42", environment: "staging" },
      checks: checks.map((check) => check.kind === "HEALTH_CHECK" ? { ...check, passed: false } : check),
    })).toEqual({ verified: false, reason: "required-checks-failed:HEALTH_CHECK" });
  });

  it("marks mismatched provenance evidence as failed", () => {
    expect(evaluateFactoryReleaseProvenance({
      mergeCommitSha: mergeSha,
      providerDeploymentId: "dep-42",
      provenance: { commitSha: "b".repeat(40), deploymentId: "dep-42", environment: "staging" },
    })).toEqual({ passed: false, reason: "provenance-sha-mismatch" });
  });

  it("accepts only an exact idempotent evidence replay", () => {
    const existing = {
      kind: "DEPLOYMENT",
      subjectSha: mergeSha,
      providerRef: "dep-42",
      evidenceUrl: "https://staging.example.com/releases/42",
      summary: "provider reported staging deployment dep-42",
      metadata: { origin: "https://staging.example.com", healthUrl: "https://staging.example.com/health" },
    };
    expect(factoryReleaseEvidenceReplayMatches(existing, {
      ...existing,
      metadata: { origin: "https://staging.example.com", healthUrl: "https://staging.example.com/health" },
    })).toBe(true);
    expect(factoryReleaseEvidenceReplayMatches(existing, {
      ...existing,
      evidenceUrl: "https://staging.example.com/releases/43",
      metadata: { origin: "https://staging.example.com" },
    })).toBe(false);
  });

  it("rejects missing, stale, and non-staging release lineage", () => {
    expect(factoryReleaseMergeIdentityIssue({
      prState: "MERGED",
      verifiedLineage: false,
      sourceHeadSha: mergeSha,
      mergeCommitSha: "b".repeat(40),
      mergedAt: Date.now(),
    })).toBe("verified-lineage-missing");
    const bound = {
      evaluationProjectId: "project-1",
      workOrderId: "work-order-1",
      workOrderProjectId: "project-1",
      workflowWorkOrderId: "work-order-1",
      workflowProjectId: "project-1",
      sourceHeadSha: mergeSha,
      workflowHeadSha: mergeSha,
      repositoryProjectId: "project-1",
      repositoryName: "owner/repo",
      evaluationRepositoryName: "owner/repo",
      environmentType: "staging",
      workOrderTenantId: "tenant-1",
      environmentTenantId: "tenant-1",
    };
    expect(factoryReleaseBoundLineageIssue({ ...bound, workflowHeadSha: "b".repeat(40) }))
      .toBe("attempt-head-mismatch");
    expect(factoryReleaseBoundLineageIssue({ ...bound, environmentType: "prod" }))
      .toBe("staging-environment-invalid");
    expect(factoryReleaseBoundLineageIssue(bound)).toBeUndefined();
  });
});
