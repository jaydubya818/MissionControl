import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("shared builder intent authority boundary", () => {
  it("exposes signed agent draft and inspect but no agent decision operation", () => {
    const commands = source("convex/serviceCommands.ts");
    expect(commands).toContain("intent.contributions.inspect");
    expect(commands).toContain("intent.contributions.draft");
    expect(commands).not.toContain("intent.contributions.decide");
    expect(commands).not.toContain("decideMissionIntentContribution");
  });

  it("keeps contribution APIs out of execution, verification, acceptance, routing, and Factory stores", () => {
    const implementation = source("convex/missionIntentContributions.ts");
    for (const forbidden of [
      'insert("workOrders"',
      'insert("workflowRuns"',
      'insert("verificationReceipts"',
      'insert("verificationEvidence"',
      'insert("publicationRecords"',
      'insert("modelRoutingDecisions"',
      'insert("factoryDefinitionVersions"',
      'patch("missionSpecRevisions"',
      'patch("missions"',
      "finalizeMissionSpecRevision",
      "approveMissionPlan",
      "acceptWorkOrder",
    ]) expect(implementation).not.toContain(forbidden);
  });

  it("requires optimistic Spec and contribution identity on every proposal", () => {
    const implementation = source("convex/missionIntentContributions.ts");
    expect(implementation).toContain("expectedCurrentSpecRevisionId");
    expect(implementation).toContain("expectedCurrentSpecDigest");
    expect(implementation).toContain("expectedLatestContributionId");
    expect(implementation).toContain("Mission Spec changed in another session");
    expect(implementation).toContain("Contribution changed in another session");
  });
});
