import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareRouteEconomics,
  inferencePriceBook,
  inferenceReservation,
  summarizeRouteEconomics,
} from "@mission-control/shared";

const schemaSource = readFileSync(new URL("../schema.ts", import.meta.url), "utf8");
const gatewaySource = readFileSync(new URL("../inferenceGateway.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../serviceCommands.ts", import.meta.url), "utf8");

const sha = (letter: string) => `sha256:${letter.repeat(64)}`;

describe("governed inference schema contract", () => {
  it("lands the full append-only ledger and required identity indexes atomically", () => {
    for (const table of [
      "inferencePriceBooks", "inferenceReservations", "inferencePhysicalIntents",
      "inferencePhysicalReceipts", "inferenceReconciliations", "factoryOutcomeEvents",
      "factoryOutcomeProjections",
      "inferenceRouteComparisons",
    ]) expect(schemaSource).toContain(`${table}: defineTable`);
    for (const index of ["by_registration", "by_logical_request", "by_provider_request", "by_provider_event", "by_source"]) {
      expect(schemaSource).toContain(`.index("${index}"`);
    }
  });

  it("exposes signed service capabilities while keeping transport mutations internal", () => {
    for (const capability of [
      "inference.intents.persist", "inference.intents.claim", "inference.receipts.append",
      "inference.reconciliations.append",
    ]) expect(serviceSource).toContain(`"${capability}"`);
    for (const mutation of ["persistIntentInternal", "claimIntentInternal", "appendReceiptInternal", "appendReconciliationInternal"]) {
      expect(gatewaySource).toContain(`export const ${mutation} = internalMutation`);
    }
    expect(gatewaySource).toContain("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED");
    expect(gatewaySource).toContain("Inference receipt replay conflicts with immutable history.");
    expect(gatewaySource).toContain("Inference intent replay conflicts with immutable history.");
    expect(gatewaySource).toContain("reservation.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain("intent.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain("receipt.workflowRunId !== args.workflowRunId");
    expect(gatewaySource).toContain('workOrder.approvalStatus !== "APPROVED"');
    expect(gatewaySource).toContain("args.policyDigest !== run.executionManifestDigest");
    expect(gatewaySource).toContain("priceBook.effectiveUntil <= reservationCreatedAt");
  });

  it("retains unknown cost and autonomous-promotion denials in public projections", () => {
    expect(gatewaySource).toContain('maturity: "EXPERIMENTAL_OFFLINE_QUALIFIED"');
    expect(gatewaySource).toContain('"No autonomous route promotion"');
    expect(schemaSource).toContain('v.literal("UNKNOWN")');
    expect(schemaSource).toContain('v.literal("IN_PROGRESS")');
  });
});

describe("worst-case reservation and comparison controls", () => {
  it("denies a reservation whose full exposure exceeds its money ceiling", () => {
    const priceBook = inferencePriceBook({
      priceBookId: "pb", version: 1, currency: "USD",
      source: { kind: "OPERATOR_APPROVED", reference: "fixture", digest: sha("a") },
      effectiveFrom: 1,
      rates: [{
        routeDigest: sha("b"), inputMicrousdPerMillionTokens: 1_000_000,
        outputMicrousdPerMillionTokens: 1_000_000, cacheReadMicrousdPerMillionTokens: 0,
        cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0,
      }],
    });
    expect(() => inferenceReservation({
      reservationId: "r", projectId: "p", workOrderId: "w", taskId: "t", attemptId: "a",
      logicalRequestKey: "p:a:s:1",
      executionProfileId: "ep", executionProfileDigest: sha("c"),
      primaryRoute: { provider: "fixture", providerRoute: "fixture", modelId: "m", routeDigest: sha("b"), adapter: "fixture", adapterVersion: "1", endpoint: "https://example.invalid" },
      allowedFallbacks: [], maxPhysicalCalls: 1, maxInputTokens: 100, maxOutputTokens: 100,
      maxCacheReadTokens: 1, maxCacheWriteTokens: 1, maxReasoningTokens: 1,
      maxCostMicrousd: 1, currency: "USD", deadlineAt: 3, priceBookId: "pb",
      priceBookDigest: priceBook.digest, policyDigest: sha("d"), leaseId: "l", leaseExpiresAt: 2, createdAt: 1,
    }, priceBook)).toThrow(/Worst-case dispatch exposure/);
  });

  it("returns NO_GO when either route has unknown or missing evidence", () => {
    const absent = summarizeRouteEconomics([], { routeDigest: sha("a"), cohortDigest: sha("b"), minimumSampleSize: 1, now: 100, maxAgeMs: 100 });
    expect(compareRouteEconomics(absent, { ...absent, routeDigest: sha("c") })).toMatchObject({
      status: "NO_GO",
      blockers: expect.arrayContaining(["ROUTE_NOT_QUALIFIED_BY_ECONOMICS", "ACCEPTED_OUTCOME_COST_UNKNOWN"]),
    });
  });
});
