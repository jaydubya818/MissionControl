import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { RESEARCH_LAB_PROJECT_ID } from "./lib/research-lab-runtime.mjs";

const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3214";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(convexUrl)) {
  throw new Error(`Refusing to seed qualification evidence outside a local Convex backend: ${convexUrl}`);
}

const evidencePath = process.argv[2] ?? ".audit/post-relay-hardening/synthetic-qualification.json";
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
if (evidence.memberCount !== 3 || evidence.happyPath?.outcome?.outcome !== "ACCEPTED") {
  throw new Error("Browser evidence requires a passing, exactly-three-member synthetic qualification packet.");
}

const result = await new ConvexHttpClient(convexUrl).mutation(
  makeFunctionReference("postRelayQualification:seedBrowserEvidence"),
  {
    projectId: RESEARCH_LAB_PROJECT_ID,
    confirmation: "POST_RELAY_SYNTHETIC_QUALIFICATION",
    candidates: evidence.candidates.map(({ commit, tree }) => ({ commit, tree })),
  },
);

console.log(JSON.stringify(result, null, 2));
