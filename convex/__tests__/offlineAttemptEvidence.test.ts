import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { reportInternal, reportVerificationInternal } from "../factory/attempts";
import { sha256Hex } from "@mission-control/shared";
import { COMPOSITION_SCHEMA, INVOCATION_SCHEMA, INVOCATION_RESULT_SCHEMA, SYNTHETIC_WORKLOAD_DIGEST,
  ISOLATED_CONTAINER_POLICY, ISOLATED_CONTAINER_POLICY_DIGEST, invocationDigest, invocationResult, canonicalIsolatedInvocation,
  RENDER_MARKDOWN_OPERATION_DIGEST, type IsolatedInvocation } from "@mission-control/workflow-engine/harness-contract";
import { VERIFY_DOCUMENT_OPERATION, VERIFY_DOCUMENT_OPERATION_DIGEST } from "../../packages/workflow-engine/src/deterministicVerification";
import { validateOfflineAttemptEvidence } from "../lib/offlineAttemptEvidence";

function fixture() {
  const digest = `sha256:${"a".repeat(64)}`;
  const composition = { schema: COMPOSITION_SCHEMA, profileClass: "isolated-offline-control/v1" as const,
    bridge: { id: "isolated-invocation", version: "1", digest }, backend: { id: "docker-chroot-offline", version: "1", digest },
    runtimeImage: digest, isolationDigest: ISOLATED_CONTAINER_POLICY_DIGEST, invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA };
  const request: IsolatedInvocation = { schema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA,
    executionId: "attempt:lease", attemptId: "attempt", workOrderId: "work-order", taskId: "task", correlationId: "run", profileId: "profile",
    profileDigest: digest, executionManifestDigest: digest, plan: { id: "plan", version: 1, digest },
    factoryVersion: { id: "factory", configurationDigest: "factory-v1-12345678" }, budgetReservationId: "run",
    composition, compositionDigest: invocationDigest(composition), lease: { leaseId: "lease", ownerId: "owner", workerId: "worker", sessionId: "session", generation: 1 },
    workload: { reference: "synthetic-receipt/v1", digest: SYNTHETIC_WORKLOAD_DIGEST }, capabilities: ["synthetic-receipt"],
    limits: { timeoutMs: 1000, budgetReference: "offline-zero-provider-calls/v1" }, transmission: "NONE", modelRoute: "NONE" };
  const result = invocationResult(request, "SUCCESS", 1, 2);
  const bytes = Buffer.from(JSON.stringify(result));
  return { request, result, evidence: { schema: "factory-isolated-execution-evidence/v1", evidenceOrigin: "CONTROL_FIXTURE", authority: "NONE",
    stdoutBase64: bytes.toString("base64"), capturedStdoutSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    truncated: false, exitCode: 0, cleanupVerified: true, validatedRuntimeResult: result } };
}

describe("offline response evidence consistency (not execution authority)", () => {
  it("binds the captured Docker resource and rejects success without an observed ID", () => {
    const packet: any = fixture();
    packet.evidence.schema = "factory-isolated-execution-evidence/v2";
    packet.evidence.container = { name: "mc-invoke-00000000-0000-4000-8000-000000000001", id: "b".repeat(64) };
    const validated = validateOfflineAttemptEvidence(packet, packet.request);
    expect(validated.evidence.container.id).toBe("b".repeat(64));
    const changed = structuredClone(packet);
    changed.evidence.container.id = "c".repeat(64);
    expect(validateOfflineAttemptEvidence(changed, changed.request).packetDigest).not.toBe(validated.packetDigest);
    for (const id of [null, "execution:lease", "b".repeat(63)]) {
      changed.evidence.container.id = id;
      expect(() => validateOfflineAttemptEvidence(changed, changed.request)).toThrow();
    }
  });
  it("retains a canceled canonical Attempt response without changing authority and rejects replays", async () => {
    const packet = fixture();
    const profile = { schema: "factory-execution-profile/v2", modelRoute: { schema: "factory-inference-constraint/v1", mode: "DENIED" },
      offlinePolicy: { bridge: { ...packet.request.composition.bridge, implementationDigest: packet.request.composition.bridge.digest,
        invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA },
        backend: { ...packet.request.composition.backend, implementationDigest: packet.request.composition.backend.digest },
        transmission: { schema: "factory-transmission-policy/v1", mode: "DENY_ALL", destinations: [], credentialClasses: [], maxOutboundBytes: 0 },
        budget: { schema: "factory-provider-budget/v1", mode: "NO_PROVIDER_EXECUTION", maxProviderCalls: 0, maxProviderLiabilityUsd: 0 } },
      runtimeArtifact: { snapshot: { imageDigest: packet.request.composition.runtimeImage } },
      sandboxProfile: { profileSnapshot: { isolationPolicy: ISOLATED_CONTAINER_POLICY } } };
    const manifest = { version: "factory-execution-manifest/v4", executionBackend: "isolated-container", budgetReservationId: "run",
      causation: { workflowRunId: "run", workOrderId: "work-order", taskId: "task", missionPlanId: "plan", missionPlanVersion: 1,
        factoryPurpose: "SOFTWARE",
        missionPlanDigest: packet.request.plan.digest, factoryDefinitionVersionId: "factory", factoryConfigurationDigest: "factory-v1-12345678" },
      executionProfile: { profileId: "profile", profileDigest: packet.request.profileDigest, profileSnapshot: profile },
      workflow: { steps: [{ kind: "DETERMINISTIC", timeoutMs: 1000, operation: { reference: "render-markdown/v1",
        digest: RENDER_MARKDOWN_OPERATION_DIGEST, input: { title: "Synthetic", paragraphs: ["Synthetic fixture."], outputPath: "docs/fixture.md" } } }] } };
    const run: any = { _id: "attempt", runId: "run", tenantId: "tenant", projectId: "project", workOrderId: "work-order", parentTaskId: "task",
      status: "CANCELED", cancellationRequestedAt: 2, factoryPurpose: "SOFTWARE", executionManifest: manifest, executionManifestDigest: invocationDigest(manifest),
      executionProfileId: "profile", executionProfileDigest: packet.request.profileDigest,
      lease: { leaseId: "lease", ownerId: "owner", workerId: "worker", workerSessionId: "session", workerGeneration: 1, expiresAt: 2 } };
    packet.request = canonicalIsolatedInvocation(run); packet.result = invocationResult(packet.request, "SUCCESS", 1, 2);
    const bytes = Buffer.from(JSON.stringify(packet.result));
    Object.assign(packet.evidence, { stdoutBase64: bytes.toString("base64"), capturedStdoutSha256: `sha256:${sha256Hex(bytes)}`, validatedRuntimeResult: packet.result });
    const event: any = { workflowRunId: run._id, projectId: run.projectId, tenantId: run.tenantId, actor: "service:owner", eventType: "CHECKPOINT_CREATED",
      metadata: { ...run.lease, executionManifestDigest: run.executionManifestDigest } };
    let artifact: any = null;
    const patch = vi.fn(); const insert = vi.fn(async (table: string, value: any) => {
      expect(table).toBe("runArtifacts"); artifact = { ...value, _id: "artifact" }; return "artifact";
    });
    const ctx: any = { db: { get: async (id: string) => id === "attempt" ? run : null, patch, insert,
      query: (table: string) => ({ withIndex: () => ({ first: async () => table === "runEvents" ? event : artifact, collect: async () => [] }) }) } };
    const args = { workflowRunId: "attempt", ...run.lease, packet: { offlineExecution: packet } };
    const report = (reportInternal as any)._handler;
    expect(await report(ctx, args)).toMatchObject({ retained: true, authoritative: false, duplicate: false });
    expect(artifact.metadata.disposition).toBe("STALE_FENCED");
    expect(artifact.metadata.packet.result.status).toBe("SUCCESS");
    expect(await report(ctx, args)).toMatchObject({ duplicate: true, authoritative: false });
    const retained = structuredClone(artifact);
    for (const mutate of [
      (a: any) => { a.producer = "service:other"; },
      (a: any) => { a.metadata.schema = "untrusted"; },
      (a: any) => { a.metadata.workerGeneration = 9; },
      (a: any) => { a.metadata.packet.evidence.stdoutBase64 = ""; },
      (a: any) => { a.contentHash = "forged"; },
    ]) {
      artifact = structuredClone(retained); mutate(artifact);
      await expect(report(ctx, args)).rejects.toThrow();
    }
    artifact = retained;
    await expect(report(ctx, { ...args, packet: { artifacts: [{
      idempotencyKey: `factory:${run.runId}:lease:offline-response`, artifactType: "STRUCTURED_OUTPUT", name: "forged",
      metadata: { disposition: "CURRENT_AT_INGESTION", packet: { result: { status: "SUCCESS" } } },
    }] } })).rejects.toThrow("dedicated validated ingestion");
    await expect(report(ctx, { ...args, packet: { events: [{
      idempotencyKey: "factory-lease:another-run:lease:claimed", eventType: "CHECKPOINT_CREATED",
    }] } })).rejects.toThrow("server-authored");
    expect(insert).toHaveBeenCalledTimes(1); expect(patch).not.toHaveBeenCalled();
    const conflict = structuredClone(args); conflict.packet.offlineExecution.result = invocationResult(packet.request, "STALE", 1, 3);
    await expect(report(ctx, conflict)).rejects.toThrow("Conflicting offline completion replay");
    for (const change of [{ ownerId: "other" }, { workerId: "other" }, { workerSessionId: "other" }, { workerGeneration: 2 }]) {
      await expect(report(ctx, { ...args, ...change })).rejects.toThrow("authenticated historical");
    }
    await expect(report(ctx, { ...args, packet: { ...args.packet, terminal: { status: "COMPLETED" } } })).rejects.toThrow("evidence-only");
    expect(patch).not.toHaveBeenCalled();
  });
  it("retains an expired verifier response by its historical claim without granting result authority", async () => {
    const packet = fixture();
    const profile = { schema: "factory-execution-profile/v2", modelRoute: { schema: "factory-inference-constraint/v1", mode: "DENIED" },
      offlinePolicy: { bridge: { ...packet.request.composition.bridge, implementationDigest: packet.request.composition.bridge.digest,
        invocationSchema: INVOCATION_SCHEMA, resultSchema: INVOCATION_RESULT_SCHEMA },
        backend: { ...packet.request.composition.backend, implementationDigest: packet.request.composition.backend.digest },
        transmission: { schema: "factory-transmission-policy/v1", mode: "DENY_ALL", destinations: [], credentialClasses: [], maxOutboundBytes: 0 },
        budget: { schema: "factory-provider-budget/v1", mode: "NO_PROVIDER_EXECUTION", maxProviderCalls: 0, maxProviderLiabilityUsd: 0 } },
      runtimeArtifact: { snapshot: { imageDigest: packet.request.composition.runtimeImage } },
      sandboxProfile: { profileSnapshot: { isolationPolicy: ISOLATED_CONTAINER_POLICY } } };
    const manifest = { version: "factory-execution-manifest/v4", executionBackend: "isolated-container", budgetReservationId: "run",
      causation: { workflowRunId: "run", workOrderId: "work-order", taskId: "task", missionPlanId: "plan", missionPlanVersion: 1,
        factoryPurpose: "VERIFICATION", missionPlanDigest: packet.request.plan.digest,
        factoryDefinitionVersionId: "factory", factoryConfigurationDigest: "factory-v1-12345678" },
      executionProfile: { profileId: "profile", profileDigest: packet.request.profileDigest, profileSnapshot: profile },
      workflow: { steps: [{ kind: "DETERMINISTIC", timeoutMs: 1000, operation: { reference: VERIFY_DOCUMENT_OPERATION,
        digest: VERIFY_DOCUMENT_OPERATION_DIGEST, input: { subjectDigest: packet.request.plan.digest,
          verificationPlanDigest: packet.request.plan.digest, repositoryId: "repository", workOrderId: "work-order",
          workOrderRevisionNumber: 1, producerAttemptId: "source", candidateSha: "b".repeat(40), candidateTreeSha: "c".repeat(40),
          path: "docs/fixture.md", expectedContentSha256: `sha256:${"e".repeat(64)}`, candidateContent: "Synthetic fixture." } } }] } };
    const run: any = { _id: "attempt", runId: "run", tenantId: "tenant", projectId: "project", workOrderId: "work-order", parentTaskId: "task",
      status: "CANCELED", cancellationRequestedAt: 2, attemptPurpose: "VERIFICATION", factoryPurpose: "VERIFICATION",
      factoryDefinitionVersionId: "factory", verificationAttemptBinding: { sourceAttemptId: "source", verificationSubjectDigest: packet.request.plan.digest },
      executionManifest: manifest, executionManifestDigest: invocationDigest(manifest), executionProfileId: "profile",
      executionProfileDigest: packet.request.profileDigest,
      lease: { leaseId: "lease", ownerId: "owner", workerId: "worker", workerSessionId: "session", workerGeneration: 1,
        claimedAt: 1, heartbeatAt: 1, expiresAt: 2 } };
    packet.request = canonicalIsolatedInvocation(run);
    packet.result = invocationResult(packet.request, "SUCCESS", 1, 2);
    const bytes = Buffer.from(JSON.stringify(packet.result));
    Object.assign(packet.evidence, { stdoutBase64: bytes.toString("base64"), capturedStdoutSha256: `sha256:${sha256Hex(bytes)}`,
      validatedRuntimeResult: packet.result });
    const event: any = { workflowRunId: run._id, projectId: run.projectId, tenantId: run.tenantId, actor: "service:owner",
      eventType: "CHECKPOINT_CREATED", metadata: { ...run.lease, executionManifestDigest: run.executionManifestDigest } };
    let artifact: any = null;
    const ctx: any = { db: { get: async (id: string) => id === "attempt" ? run : null,
      insert: async (_table: string, value: any) => { artifact = { ...value, _id: "artifact" }; return "artifact"; },
      query: (table: string) => ({ withIndex: () => ({ first: async () => table === "runEvents" ? event : artifact,
        collect: async () => [] }) }) } };
    const args = { workflowRunId: "attempt", ...run.lease, packet: { offlineExecution: packet } };
    const report = (reportVerificationInternal as any)._handler;
    expect(await report(ctx, args)).toMatchObject({ retained: true, authoritative: false, duplicate: false });
    expect(artifact.metadata).toMatchObject({ authority: "NONE", behavioralPass: false, disposition: "STALE_FENCED" });
    await expect(report(ctx, { ...args, packet: { terminal: { status: "COMPLETED" } } }))
      .rejects.toThrow(/active matching Verification Attempt lease/);
  });
  it("checks bytes against an independent SHA-256 implementation", () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from([0, 255, 128, 1]), Buffer.from("Synthetic 界 evidence"),
      ...[55, 56, 63, 64, 65, 32768].map(length => Buffer.alloc(length, 255))]) {
      expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
    const packet = fixture();
    expect(validateOfflineAttemptEvidence(packet, packet.request).runtimeResult).toEqual(packet.result);
  });
  it("retains actual success separately from a fenced host disposition", () => {
    const packet = fixture();
    packet.result = invocationResult(packet.request, "STALE", 1, 3);
    const parsed = validateOfflineAttemptEvidence(packet, packet.request);
    expect(parsed.result.status).toBe("STALE");
    expect(parsed.runtimeResult?.status).toBe("SUCCESS");
    expect(parsed.evidence.authority).toBe("NONE");
  });
  it("rejects substitution, fabricated success, lost bytes and extra authority", () => {
    const mutations: Array<(packet: any) => void> = [
      p => { p.request.taskId = "other"; }, p => { p.result.attemptId = "other"; },
      p => { p.evidence.stdoutBase64 = ""; }, p => { p.evidence.capturedStdoutSha256 = "sha256:" + "0".repeat(64); },
      p => { p.evidence.validatedRuntimeResult = null; }, p => { p.evidence.truncated = true; },
      p => { p.evidence.exitCode = 1; }, p => { p.evidence.cleanupVerified = false; },
      p => { p.evidence.authority = "ACCEPTANCE"; }, p => { p.evidence.evidenceOrigin = "MEASURED"; },
      p => { p.evidence.stdoutBase64 += "\n"; }, p => { p.evidence.qualification = "PASS"; },
      p => { p.evidence.stdoutBase64 = "a".repeat(43696); }, p => { p.extra = true; },
    ];
    for (const mutate of mutations) {
      const packet = fixture(); const expected = structuredClone(packet.request); mutate(packet);
      expect(() => validateOfflineAttemptEvidence(packet, expected)).toThrow();
    }
  });
  it("retains invalid binary bytes as failure evidence without a validated result", () => {
    const packet = fixture(); const bytes = Buffer.from([255, 254, 0]);
    packet.result = invocationResult(packet.request, "INFRASTRUCTURE_FAILURE", 1, 2);
    Object.assign(packet.evidence, { stdoutBase64: bytes.toString("base64"),
      capturedStdoutSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, validatedRuntimeResult: null });
    expect(validateOfflineAttemptEvidence(packet, packet.request).runtimeResult).toBeNull();
  });
});
