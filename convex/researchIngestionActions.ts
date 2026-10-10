"use node";

import { createHash, randomUUID } from "node:crypto";
import { v } from "convex/values";
import {
  ResearchAdapterError,
  WebRssAdapter,
  type DiscoveryCursor,
  type NormalizedObservation,
} from "@mission-control/research-adapters";
import { internal } from "./_generated/api";
import { action, internalAction } from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import {
  RESEARCH_RUN_VERIFIER,
  evidenceVerificationIssues,
  stableStringify,
} from "./lib/researchIngestionPolicy";

const VERIFIER_IDENTITY = `service:${RESEARCH_RUN_VERIFIER}`;

type BeginManualRunResult = {
  decision: "START" | "REPLAY" | "IN_PROGRESS" | "BACKOFF" | "RETRY" | "EXHAUSTED";
  sourceRunId: Id<"researchSourceRuns">;
  sourceRunStatus: Doc<"researchSourceRuns">["status"];
  workOrderId: Id<"workOrders">;
  workflowRunId: Id<"workflowRuns">;
  source: null | {
    canonicalUrl: string;
    sourceVersion: number;
    maxItemsPerRun: number;
    cursor: {
      providerCursor?: string;
      etag?: string;
      lastModified?: string;
      knownItems: Array<{ providerItemId: string; contentHash: string }>;
    };
    leaseId: string;
  };
};

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function cursorForAdapter(cursor: {
  providerCursor?: string;
  etag?: string;
  lastModified?: string;
  knownItems: Array<{ providerItemId: string; contentHash: string }>;
}): DiscoveryCursor {
  return {
    providerCursor: cursor.providerCursor,
    etag: cursor.etag,
    lastModified: cursor.lastModified,
    knownItems: Object.fromEntries(cursor.knownItems.map((item) => [item.providerItemId, item.contentHash])),
  };
}

function cursorForPersistence(cursor: DiscoveryCursor) {
  return {
    providerCursor: cursor.providerCursor,
    etag: cursor.etag,
    lastModified: cursor.lastModified,
    knownItems: Object.entries(cursor.knownItems ?? {}).slice(-500).map(([providerItemId, contentHash]) => ({
      providerItemId,
      contentHash,
    })),
  };
}

function cleanFailure(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
} {
  if (error instanceof ResearchAdapterError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1_000),
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  }
  return {
    code: "UNEXPECTED_ADAPTER_FAILURE",
    message: error instanceof Error ? error.message.slice(0, 1_000) : "Manual research collection failed unexpectedly.",
    retryable: false,
  };
}

export const verifyPersistedRun = internalAction({
  args: { sourceRunId: v.id("researchSourceRuns") },
  handler: async (ctx, args): Promise<Doc<"researchSourceRuns">> => {
    const bundle = await ctx.runQuery(internal.researchIngestion.getVerificationBundle, args);
    const metadata = bundle.artifact.metadata as { evidence?: {
      sourceId?: string;
      sourceVersion?: number;
      workflowRunId?: string;
      cursorAfter?: unknown;
      observations?: Array<{
        providerItemId?: string;
        contentHash?: string;
        excerptHash?: string;
      }>;
    } } | undefined;
    const recomputedHash = sha256(metadata?.evidence);
    const issues = evidenceVerificationIssues({
      artifactHash: bundle.artifact.contentHash,
      recomputedHash,
      artifactWorkflowRunId: String(bundle.artifact.workflowRunId),
      workflowRunId: String(bundle.sourceRun.workflowRunId),
      artifactProjectId: bundle.artifact.projectId ? String(bundle.artifact.projectId) : undefined,
      projectId: String(bundle.sourceRun.projectId),
      observations: bundle.observations.map((observation) => ({
        runArtifactId: String(observation.runArtifactId),
        workflowRunId: String(observation.workflowRunId),
        sourceId: String(observation.sourceId),
        providerItemId: observation.providerItemId,
        contentHash: observation.contentHash,
        excerptHash: sha256(observation.normalizedExcerpt ?? ""),
      })),
      evidenceObservations: metadata?.evidence?.observations,
      runArtifactId: String(bundle.artifact._id),
      sourceId: String(bundle.sourceRun.sourceId),
      expectedObservationCount: bundle.sourceRun.insertedObservationCount,
      sourceVersion: bundle.sourceRun.sourceVersion,
      evidenceSourceId: metadata?.evidence?.sourceId,
      evidenceSourceVersion: metadata?.evidence?.sourceVersion,
      evidenceWorkflowRunId: metadata?.evidence?.workflowRunId,
      evidenceCursorAfter: metadata?.evidence?.cursorAfter,
      sourceRunCursorAfter: bundle.sourceRun.cursorAfter,
      sourceCursorState: bundle.source.cursorState ? {
        providerCursor: bundle.source.cursorState.providerCursor,
        etag: bundle.source.cursorState.etag,
        lastModified: bundle.source.cursorState.lastModified,
        knownItems: bundle.source.cursorState.knownItems,
      } : undefined,
      sourceCursorWorkflowRunId: bundle.source.cursorState ? String(bundle.source.cursorState.workflowRunId) : undefined,
    });
    if (bundle.artifact.producer === VERIFIER_IDENTITY) {
      issues.push("Collector and verifier identities must be distinct.");
    }
    const verified = await ctx.runMutation(internal.researchIngestion.recordVerification, {
      sourceRunId: args.sourceRunId,
      recomputedHash,
      issues,
    });
    if (verified?.status !== "VERIFIED") {
      throw new Error(issues.join(" ") || "Independent evidence verification did not complete.");
    }
    return verified;
  },
});

export const verifyRun = action({
  args: {
    projectId: v.id("projects"),
    sourceRunId: v.id("researchSourceRuns"),
  },
  handler: async (ctx, args): Promise<Doc<"researchSourceRuns">> => {
    await ctx.runQuery(internal.researchIngestion.authorizeVerification, args);
    return await ctx.runAction(internal.researchIngestionActions.verifyPersistedRun, {
      sourceRunId: args.sourceRunId,
    });
  },
});

export const runOnce = action({
  args: {
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"researchSourceRuns">> => {
    const leaseId = randomUUID();
    const begin = await ctx.runMutation(internal.researchIngestion.beginManualRun, {
      ...args,
      executionId: randomUUID(),
      leaseId,
    }) as BeginManualRunResult;
    if (begin.decision === "IN_PROGRESS") {
      throw new Error("This manual collection is already in progress.");
    }
    if (begin.decision === "EXHAUSTED") {
      throw new Error("This manual collection exhausted its bounded retry allowance; create a new operator run after reviewing the failure.");
    }
    if (begin.decision === "BACKOFF") {
      throw new Error("This manual collection is inside its bounded retry backoff window.");
    }
    if (begin.decision === "REPLAY") {
      if (begin.sourceRunStatus === "AWAITING_VERIFICATION") {
        return await ctx.runAction(internal.researchIngestionActions.verifyPersistedRun, {
          sourceRunId: begin.sourceRunId,
        });
      }
      const bundle = await ctx.runQuery(internal.researchIngestion.getVerificationBundle, {
        sourceRunId: begin.sourceRunId,
      });
      return bundle.sourceRun;
    }
    if (!begin.source) throw new Error("Manual collection source authority was not frozen.");

    const adapter = new WebRssAdapter();
    try {
      const canonicalUrl = new URL(begin.source.canonicalUrl);
      const page = await adapter.discover({
        source: {
          canonicalUrl: canonicalUrl.toString(),
          exactHostAllowlist: [canonicalUrl.hostname.toLowerCase()],
        },
        cursor: cursorForAdapter(begin.source.cursor),
        maxItems: begin.source.maxItemsPerRun,
      });
      const observations: NormalizedObservation[] = [];
      for (const item of page.items) observations.push(await adapter.fetchItem(item));
      const cursorAfter = cursorForPersistence(page.nextCursor);
      const artifactEvidence = {
        schemaVersion: "research-evidence-v1" as const,
        sourceId: String(args.sourceId),
        sourceVersion: begin.source.sourceVersion,
        workflowRunId: String(begin.workflowRunId),
        adapter: {
          name: page.receipt.adapterName,
          version: page.receipt.adapterVersion,
        },
        receipt: {
          finalUrl: page.receipt.finalUrl,
          statusCode: page.receipt.statusCode,
          requestCount: page.receipt.requestCount,
          bytesRead: page.receipt.bytesRead,
          elapsedMs: page.receipt.elapsedMs,
          itemCount: page.receipt.itemCount,
          duplicateCount: page.receipt.duplicateCount,
          changedItemCount: page.receipt.changedItemCount,
          notModified: page.receipt.notModified,
          etag: page.receipt.etag,
          lastModified: page.receipt.lastModified,
        },
        cursorBefore: begin.source.cursor,
        cursorAfter,
        observations: observations.map((observation) => ({
          providerItemId: observation.providerItemId,
          contentHash: observation.contentHash,
          excerptHash: sha256(observation.normalizedExcerpt),
        })),
      };
      const committed = await ctx.runMutation(internal.researchIngestion.commitManualRun, {
        sourceRunId: begin.sourceRunId,
        leaseId: begin.source.leaseId,
        sourceVersion: begin.source.sourceVersion,
        adapterName: page.receipt.adapterName,
        adapterVersion: page.receipt.adapterVersion,
        cursorAfter,
        receipt: artifactEvidence.receipt,
        observations,
        artifactHash: sha256(artifactEvidence),
        artifactEvidence,
      });
      if (!committed) throw new Error("Manual collection commit did not return a source run.");
      return await ctx.runAction(internal.researchIngestionActions.verifyPersistedRun, {
        sourceRunId: begin.sourceRunId,
      });
    } catch (error) {
      const failure = cleanFailure(error);
      await ctx.runMutation(internal.researchIngestion.failManualRun, {
        sourceRunId: begin.sourceRunId,
        leaseId: begin.source.leaseId,
        failureCode: failure.code,
        failureMessage: failure.message,
        retryable: failure.retryable,
        retryAfterMs: failure.retryAfterMs,
      });
      throw new Error(failure.message);
    }
  },
});
