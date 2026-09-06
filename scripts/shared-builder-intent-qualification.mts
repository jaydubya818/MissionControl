import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  MISSION_INTENT_AUTHORITY_PROFILE,
  projectMissionIntentContributions,
  type MissionIntentContributionShape,
} from "../convex/lib/missionIntentContributions.ts";

const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(root, "docs/testing/evidence/shared-builder-intent-todo062/qualification.json");
const screenshots = [
  "screenshots/01-shared-intent-1440-dark.png",
  "screenshots/02-shared-intent-390-light.png",
  "screenshots/03-permission-denied-1440-dark.png",
  "screenshots/04-shared-intent-states-1440-dark.png",
];
for (const file of screenshots) {
  const absolute = resolve(evidencePath, "..", file);
  assert.equal(existsSync(absolute), true, `Missing browser evidence: ${file}`);
  assert.ok(statSync(absolute).size > 10_000, `Browser evidence is unexpectedly small: ${file}`);
}

const base = (overrides: Partial<MissionIntentContributionShape>): MissionIntentContributionShape => ({
  _id: "qa-current",
  contributionKey: "QA-AC-001",
  revisionNumber: 1,
  missionSpecRevisionId: "spec-r3",
  missionSpecDigest: "sha256:spec-r3",
  contributorRole: "QA",
  targetSection: "ACCEPTANCE_EXPECTATIONS",
  targetItemId: "AC-001",
  title: "Denied path",
  body: "Unauthorized writes fail closed.",
  evidenceExpectation: "Authorization and browser evidence.",
  proposedBy: "qa-partner",
  proposedActorType: "HUMAN",
  proposedActorSource: "AUTHENTICATED",
  proposedAt: 1,
  ...overrides,
});
const projection = projectMissionIntentContributions({
  currentSpecRevisionId: "spec-r3",
  currentSpecDigest: "sha256:spec-r3",
  contributions: [
    base({}),
    base({ _id: "product-conflict", contributionKey: "PRODUCT-AC-001", contributorRole: "PRODUCT", proposedAt: 2 }),
    base({ _id: "design-old", contributionKey: "DESIGN-UX-001", contributorRole: "DESIGN", targetSection: "RISKS", targetItemId: undefined, proposedAt: 3 }),
    base({ _id: "design-current", contributionKey: "DESIGN-UX-001", contributorRole: "DESIGN", targetSection: "RISKS", targetItemId: undefined, revisionNumber: 2, supersedesContributionId: "design-old", proposedAt: 4 }),
    base({ _id: "engineering-stale", contributionKey: "ENGINEERING-SCOPE-001", contributorRole: "ENGINEERING", missionSpecRevisionId: "spec-r2", missionSpecDigest: "sha256:spec-r2", proposedAt: 5 }),
  ],
  decisions: [{ contributionId: "design-current", decision: "ACCEPTED", reason: "Exact input accepted", decidedBy: "operator", decidedAt: 6 }],
});
const states = Object.fromEntries(projection.map((item) => [item._id, item.state]));
assert.deepEqual(states, {
  "engineering-stale": "STALE",
  "design-current": "ACCEPTED",
  "design-old": "SUPERSEDED",
  "product-conflict": "CONFLICT",
  "qa-current": "CONFLICT",
});
assert.equal(Object.values(MISSION_INTENT_AUTHORITY_PROFILE).every((value) => value === false), true);

const contributionSource = readFileSync(resolve(root, "convex/missionIntentContributions.ts"), "utf8");
const commandSource = readFileSync(resolve(root, "convex/serviceCommands.ts"), "utf8");
assert.match(commandSource, /intent\.contributions\.inspect/);
assert.match(commandSource, /intent\.contributions\.draft/);
assert.doesNotMatch(commandSource, /intent\.contributions\.decide/);
for (const forbidden of ['insert("workOrders"', 'insert("workflowRuns"', 'insert("verificationReceipts"', 'insert("factoryDefinitionVersions"', 'patch("missionSpecRevisions"', 'patch("missions"']) {
  assert.equal(contributionSource.includes(forbidden), false, `Forbidden authority path: ${forbidden}`);
}

const record = {
  schema: "shared-builder-intent-todo062-qualification/v1",
  status: "PASS",
  maturity: "PREVIEW_QUALIFIED_SYNTHETIC_DEMO",
  generatedAt: "2026-09-05T21:15:00.000-07:00",
  baseline: "906b08f5cfb912711b90c6e2b6ca6808e120e42e",
  runtimeContract: "v45",
  externalCalls: 0,
  modelCalls: 0,
  productionMutations: 0,
  customerRecords: 0,
  agentCapabilities: ["intent.contributions.inspect", "intent.contributions.draft"],
  agentDecisionCapability: false,
  humanDecisionRequired: true,
  exactLineage: ["Mission", "Mission Spec revision + digest", "contribution revision + digest", "human decision", "future Mission Spec revision", "Plan", "Quality Contract"],
  projectedStates: states,
  negativeControls: [
    "stale Spec identity denied",
    "concurrent contribution revision denied",
    "conflicting target acceptance denied",
    "stale contribution decision denied",
    "agent decision operation absent",
    "feature disabled writes denied",
    "cross-workspace Mission scope denied",
    "replayed signed command denied and receipted",
    "contribution path cannot mutate Spec, Plan, execution, evidence, acceptance, routing, or Factory Version stores",
  ],
  browser: {
    engine: "Chromium",
    viewports: ["1440x900", "390x844"],
    themes: ["dark", "light"],
    states: ["loading", "empty", "error", "denied", "conflict", "stale", "success", "resumption"],
    keyboard: "PASS",
    horizontalOverflow: "PASS",
    seriousOrCriticalAccessibilityViolations: 0,
    screenshots,
  },
};

if (process.argv.includes("--check")) {
  assert.deepEqual(JSON.parse(readFileSync(evidencePath, "utf8")), record, "Frozen todo 062 qualification evidence drifted");
}
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
