import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { InferenceEconomicsCard, type InferenceEconomicsData } from "../src/controlPlane/ExecutionRunInspector";
import "../src/index.css";

const empty: InferenceEconomicsData = {
  gatewayAdmissionEnabled: false, reservations: [], intents: [], receipts: [], reconciliations: [],
  latestProjection: null, latestComparison: null, state: "EMPTY",
};
const fence = { fencedAt: 1788672000000, sourceDigest: `sha256:${"a".repeat(64)}`,
  violationCodes: ["RESERVATION_OUTPUT_TOKEN_LIMIT_EXCEEDED"] };
const fenced: InferenceEconomicsData = {
  ...empty, gatewayAdmissionEnabled: true, inferenceSpendingFence: fence,
  reservations: [{ state: "EXHAUSTED" }], intents: [{ state: "RECEIPTED" }], state: "COMPLETE",
  receipts: [{ _id: "fixture-receipt", physicalOrdinal: 1, route: { provider: "openai", modelId: "gpt-4o-mini-2024-07-18" },
    delivery: "DELIVERED", status: "SUCCEEDED", costCompleteness: "COMPLETE", costMicrousd: 6750,
    costClassification: "ESTIMATED", providerRequestId: "fixture-provider-request", violationCodes: fence.violationCodes }],
  latestProjection: { outcome: "ACCEPTED", knownCostMicrousd: 6750, totalCostMicrousd: 6750,
    costCoverage: 1, confidence: "HIGH", formulaVersion: "accepted-outcome-economics/v1" },
};
const params = new URLSearchParams(location.search);
const mode = params.get("state") ?? "fenced";
const overflow: InferenceEconomicsData = {
  ...fenced, inferenceSpendingFence: undefined, state: "UNKNOWN",
  receipts: [1, 2].map(physicalOrdinal => ({ ...fenced.receipts[0],
    _id: `overflow-${physicalOrdinal}`, physicalOrdinal, costMicrousd: Number.MAX_SAFE_INTEGER,
    violationCodes: [],
  })),
  latestProjection: { outcome: "ACCEPTED", costCoverage: 1, costCompleteness: "UNKNOWN",
    confidence: "NONE", formulaVersion: "accepted-outcome-economics/v2" },
};
const data = mode === "loading" ? undefined : mode === "empty" ? empty : mode === "empty-fenced" ? { ...empty, inferenceSpendingFence: fence } : mode === "overflow" ? overflow : fenced;
function PersistedCard() {
  const persisted = useQuery(makeFunctionReference<"query">("gateway:getAttemptEconomics"), {
    workflowRunId: params.get("workflowRunId"),
  });
  return <InferenceEconomicsCard data={persisted} />;
}
const backend = params.get("backend");
if (mode === "persisted" && (!backend || new URL(backend).hostname !== "127.0.0.1")) throw new Error("Loopback qualification backend required");
const client = mode === "persisted" ? new ConvexReactClient(backend!) : null;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-6xl p-4"><h1 className="mb-4 text-lg font-medium">{client ? "Persisted local observation qualification" : "Synthetic local observation fixture"}</h1>
    {client ? <ConvexProvider client={client}><PersistedCard /></ConvexProvider> : <InferenceEconomicsCard data={data} />}</main>,
);
