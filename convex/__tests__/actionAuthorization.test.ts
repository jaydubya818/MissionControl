/**
 * Structural ratchet for provider-backed Convex actions.
 *
 * A `query`/`mutation`/`action` export is callable by anyone holding the
 * deployment URL, and that URL ships to every browser as `VITE_CONVEX_URL`.
 * "Public" therefore means internet-facing, not internal-to-the-app.
 *
 * These actions reach a provider key — OpenAI, ElevenLabs, GitHub — and spend
 * real money or fetch real data per call. Each must resolve an operator before
 * spending and consume a budget keyed on that server-derived identity.
 *
 * This is a source-level assertion rather than a runtime one because the
 * repository has no Convex test harness that can invoke an action with a forged
 * identity. It catches the regression that matters: someone adding a new
 * provider-backed action, or deleting the gate from an existing one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONVEX_ROOT = path.resolve(__dirname, "..");

/** Every provider-backed action, and the budget operation it must consume. */
const GATED_ACTIONS: Array<{ file: string; action: string; operation: string }> = [
  { file: "github.ts", action: "syncGitHubIssues", operation: "github.syncIssues" },
  { file: "github.ts", action: "updateGitHubIssueStatus", operation: "github.updateIssueStatus" },
  { file: "knowledge.ts", action: "indexDocument", operation: "knowledge.indexDocument" },
  { file: "knowledge.ts", action: "indexAllDocs", operation: "knowledge.indexAllDocs" },
  { file: "knowledge.ts", action: "semanticSearch", operation: "knowledge.semanticSearch" },
  { file: "knowledge.ts", action: "chatWithRepo", operation: "knowledge.chatWithRepo" },
  { file: "mission.ts", action: "reversePrompt", operation: "mission.reversePrompt" },
  { file: "planning.ts", action: "generateQuestions", operation: "planning.generateQuestions" },
  { file: "planning.ts", action: "generatePlanFromAnswers", operation: "planning.generatePlanFromAnswers" },
  { file: "prd.ts", action: "parsePrd", operation: "prd.parsePrd" },
  { file: "voice.ts", action: "synthesize", operation: "voice.synthesize" },
];

/** Source of one action export, from its declaration to the next top-level export. */
function actionBody(file: string, action: string): string {
  const source = readFileSync(path.join(CONVEX_ROOT, file), "utf8");
  const start = source.search(new RegExp(`export const ${action}\\s*=\\s*action\\(\\{`));
  expect(start, `${file}:${action} is no longer an action export`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("provider-backed actions resolve an operator before spending", () => {
  for (const { file, action, operation } of GATED_ACTIONS) {
    it(`${file}:${action} authorizes and consumes its budget`, () => {
      const body = actionBody(file, action);

      // An identity the caller cannot supply.
      expect(body).toContain("internal.companyContext.assertAuthenticated");

      // A budget keyed on that identity, not on anything from `args`.
      expect(body).toContain("internal.companyContext.consumeProviderBudget");
      expect(body).toContain(`operation: "${operation}"`);
      expect(body).toContain("actorId: access.actorId");

      // The refusal must actually stop the handler.
      expect(body).toMatch(/if \(!budget\.allowed\) throw new Error\(budget\.message\);/);
    });

    it(`${file}:${action} authorizes before it reads a provider key`, () => {
      const body = actionBody(file, action);
      const gate = body.indexOf("assertAuthenticated");
      const providerKey = body.search(
        /process\.env\.(OPENAI|OPENROUTER|ANTHROPIC|ELEVENLABS|GITHUB)[A-Z_]*/,
      );
      if (providerKey === -1) return; // key read in a helper; the gate above still applies
      expect(
        gate,
        `${file}:${action} reads a provider key before authorizing`,
      ).toBeLessThan(providerKey);
    });
  }
});

describe("the budget cannot be escaped by naming an unknown operation", () => {
  it("falls back to a conservative default rather than going unlimited", async () => {
    const { PROVIDER_BUDGET_POLICIES, DEFAULT_PROVIDER_BUDGET } = await import("../lib/rateLimit");
    expect(PROVIDER_BUDGET_POLICIES["definitely.not.an.operation"]).toBeUndefined();
    expect(DEFAULT_PROVIDER_BUDGET.limit).toBeGreaterThan(0);
    expect(DEFAULT_PROVIDER_BUDGET.limit).toBeLessThanOrEqual(20);
    // Every gated operation must have an explicit policy — the default is a
    // backstop for something new, not the intended configuration.
    for (const { operation } of GATED_ACTIONS) {
      expect(PROVIDER_BUDGET_POLICIES[operation], `${operation} has no explicit policy`).toBeDefined();
    }
  });
});
