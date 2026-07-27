import { describe, expect, it } from "vitest";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  parseGitHubPrUrl,
  parseGitHubRepoUrl,
} from "../lib/harnessPrChecks";

describe("harnessPrChecks lib", () => {
  it("parses GitHub repo URLs", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
    });
    expect(parseGitHubPrUrl("https://github.com/acme/widgets/pull/42")?.prNumber).toBe(42);
  });

  it("builds change review lenses from QC signals", () => {
    const lenses = buildChangeReviewLenses({
      qcFindings: [{ severity: "RED", category: "security" }],
      verificationPassRate: 90,
    });
    expect(lenses.find((l) => l.id === "security")?.score).toBeLessThan(90);
    expect(lenses.find((l) => l.id === "custom")?.enabled).toBe(false);
  });

  it("builds mutation testing report with fallback findings", () => {
    const report = buildMutationTestingReport({
      qcFindings: [],
      diffLineCount: 24,
      testPassCount: 3,
      testFailCount: 1,
    });
    expect(report.diffCoveragePct).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });
});
