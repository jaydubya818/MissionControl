import { describe, expect, it } from "vitest";
import {
  authorityDigestInput,
  classifyAuthorityMutations,
  classifyAuthoritySurface,
  evaluateVerificationAuthority,
  resolveCommandAuthority,
} from "../verificationAuthority.js";
import {
  TRUSTED_VERIFIER_IDS,
  resolveCheckIndependence,
} from "../verificationAuthority.js";
import {
  calculateCriterionCoverage,
  ChangeBudgetVerifier,
  NegativeConstraintVerifier,
  VerificationAuthorityVerifier,
  VerificationEngine,
  type CandidateChange,
  type VerificationCheckSpec,
  type Verifier,
  type WorkOrderVerificationSpec,
} from "../verification.js";

const TEST_CHECK: VerificationCheckSpec = {
  id: "unit-tests",
  name: "Unit tests",
  category: "UNIT_TEST",
  verifierId: "factory-command/v1",
  mandatory: true,
  acceptanceCriterionIds: ["ac-1"],
  evidenceCategory: "TEST_RESULT",
  command: { executable: "pnpm", args: ["test"], commandClass: "TEST", timeoutMs: 60_000 },
};

function candidate(overrides: Partial<CandidateChange> = {}): CandidateChange {
  return {
    sourceRevision: "base000",
    candidateRevision: "cand000",
    changedFiles: [],
    deletedFiles: [],
    linesAdded: 1,
    linesDeleted: 0,
    diff: "",
    ...overrides,
  };
}

describe("verification authority surface classification", () => {
  it("classifies the files that decide what an entry-point command runs", () => {
    // The pre-existing `isVerificationConfigFile` in verification.ts matched
    // vitest/jest/tsconfig but NOT package.json or Makefile — so the two most
    // direct ways to redefine `pnpm test` / `make test` were unclassified.
    expect(classifyAuthoritySurface("package.json")).toBe("PACKAGE_MANIFEST");
    expect(classifyAuthoritySurface("apps/api/package.json")).toBe("PACKAGE_MANIFEST");
    expect(classifyAuthoritySurface("Makefile")).toBe("BUILD_SCRIPT");
    expect(classifyAuthoritySurface("build/ci.mk")).toBe("BUILD_SCRIPT");
    expect(classifyAuthoritySurface("justfile")).toBe("BUILD_SCRIPT");
    expect(classifyAuthoritySurface("pnpm-lock.yaml")).toBe("LOCKFILE");
    expect(classifyAuthoritySurface(".npmrc")).toBe("RUNNER_CONFIG");
    expect(classifyAuthoritySurface("vitest.config.ts")).toBe("TEST_CONFIG");
    expect(classifyAuthoritySurface("pytest.ini")).toBe("TEST_CONFIG");
    expect(classifyAuthoritySurface("src/__tests__/auth.test.ts")).toBe("TEST_SOURCE");
    expect(classifyAuthoritySurface(".github/workflows/ci.yml")).toBe("CI_CONFIG");
  });

  it("does not classify ordinary product source as verification authority", () => {
    expect(classifyAuthoritySurface("src/server/router.ts")).toBeNull();
    expect(classifyAuthoritySurface("README.md")).toBeNull();
    expect(classifyAuthoritySurface("apps/ui/src/Button.tsx")).toBeNull();
  });

  it("reports a deleted authority file as deleted even when also listed as changed", () => {
    const mutations = classifyAuthorityMutations({
      changedFiles: ["src/__tests__/auth.test.ts"],
      deletedFiles: ["src/__tests__/auth.test.ts"],
    });
    expect(mutations).toEqual([
      { path: "src/__tests__/auth.test.ts", surface: "TEST_SOURCE", deleted: true },
    ]);
  });
});

describe("command authority resolution", () => {
  it("names package managers and task runners as candidate-defined", () => {
    expect(resolveCommandAuthority({ executable: "pnpm", args: ["test"] })).toMatchObject({
      authority: "CANDIDATE_DEFINED",
    });
    expect(resolveCommandAuthority({ executable: "make", args: ["test"] }).definedBy).toContain(
      "BUILD_SCRIPT",
    );
    expect(resolveCommandAuthority({ executable: "/usr/bin/npm", args: ["run", "verify"] })).toMatchObject(
      { authority: "CANDIDATE_DEFINED" },
    );
  });
});

describe("adversarial candidates cannot manufacture verification success", () => {
  const contract = (checks: VerificationCheckSpec[], authorityPolicy?: any) => ({
    schemaVersion: 1,
    enforcementMode: "ENFORCED" as const,
    checks,
    requireHumanReview: false,
    ...(authorityPolicy ? { authorityPolicy } : {}),
  });

  it("blocks a candidate that rewrites package.json to make its own test command trivial", () => {
    // The attack: {"scripts": {"test": "exit 0"}}. `pnpm` is allowlisted, the
    // command exits 0, and every command-level check reports PASS.
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["package.json", "src/feature.ts"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings[0].surface).toBe("PACKAGE_MANIFEST");
    expect(evaluation.findings[0].affectedCheckIds).toEqual(["unit-tests"]);
    expect(evaluation.summary).toMatch(/does not permit/);
  });

  it("blocks a candidate that rewrites the Makefile target the contract runs", () => {
    const makeCheck: VerificationCheckSpec = {
      ...TEST_CHECK,
      command: { executable: "make", args: ["test"], commandClass: "TEST", timeoutMs: 60_000 },
    };
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["Makefile"] }),
      checks: [makeCheck],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings[0].surface).toBe("BUILD_SCRIPT");
  });

  it("blocks a candidate that rewrites test configuration", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["vitest.config.ts"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings[0].surface).toBe("TEST_CONFIG");
  });

  it("blocks a candidate that deletes the tests it is supposed to satisfy", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ deletedFiles: ["src/__tests__/auth.test.ts"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings[0].paths[0]).toMatch(/\(deleted\)$/);
  });

  it("blocks a candidate that swaps the lockfile or .npmrc under the runner", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["pnpm-lock.yaml", ".npmrc"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings.map((finding) => finding.surface).sort()).toEqual([
      "LOCKFILE",
      "RUNNER_CONFIG",
    ]);
  });

  it("blocks a candidate that rewrites the CI definition consumed as evidence", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: [".github/workflows/ci.yml"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings[0].surface).toBe("CI_CONFIG");
  });

  it("passes an ordinary candidate that only touches product source", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["src/server/router.ts", "README.md"] }),
      checks: [TEST_CHECK],
    });
    expect(evaluation.status).toBe("PASS");
    expect(evaluation.findings).toEqual([]);
  });

  it("permits a surface mutation only when the FROZEN contract authorised it in advance", () => {
    // "Migrate the suite to Vitest" is legitimate work. The distinction that
    // matters is that this allowance is authored into the Quality Contract
    // before the candidate exists — the candidate cannot grant it to itself.
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["vitest.config.ts", "src/__tests__/auth.test.ts"] }),
      checks: [TEST_CHECK],
      policy: {
        allowedSurfaceMutations: ["TEST_CONFIG", "TEST_SOURCE"],
        reason: "WorkOrder is the Jest-to-Vitest migration.",
      },
    });
    expect(evaluation.status).toBe("PASS");
    // The config change needed the allowance; editing a test file did not
    // (SURFACE_BLOCKING_RULES.TEST_SOURCE is DELETION_ONLY), so it is recorded
    // as observed rather than consuming an allowance.
    expect(evaluation.allowed.map((mutation) => mutation.path)).toEqual(["vitest.config.ts"]);
    expect(evaluation.observed.map((mutation) => mutation.path)).toEqual([
      "src/__tests__/auth.test.ts",
    ]);
    expect(evaluation.summary).toMatch(/Jest-to-Vitest/);
  });

  it("does not let an allowance for one surface leak into another", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["vitest.config.ts", "package.json"] }),
      checks: [TEST_CHECK],
      policy: { allowedSurfaceMutations: ["TEST_CONFIG"], reason: "config only" },
    });
    expect(evaluation.status).toBe("FAIL");
    expect(evaluation.findings.map((finding) => finding.surface)).toEqual(["PACKAGE_MANIFEST"]);
  });

  it("scopes a path allowance to the exact paths named", () => {
    const allowedOnly = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["packages/legacy/package.json"] }),
      checks: [TEST_CHECK],
      policy: { allowedPaths: ["packages/legacy/**"], reason: "retiring the legacy package" },
    });
    expect(allowedOnly.status).toBe("PASS");

    const outsideScope = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["packages/core/package.json"] }),
      checks: [TEST_CHECK],
      policy: { allowedPaths: ["packages/legacy/**"], reason: "retiring the legacy package" },
    });
    expect(outsideScope.status).toBe("FAIL");
  });

  it("produces a stable digest input that records which surfaces moved", () => {
    const evaluation = evaluateVerificationAuthority({
      candidate: candidate({ changedFiles: ["package.json"] }),
      checks: [TEST_CHECK],
    });
    const digest = authorityDigestInput(evaluation);
    expect(JSON.parse(digest)).toMatchObject({
      v: 1,
      status: "FAIL",
      commands: [{ c: "unit-tests", e: "pnpm", a: "CANDIDATE_DEFINED" }],
    });
    // Stable across repeated evaluation of the same inputs.
    expect(authorityDigestInput(evaluation)).toBe(digest);
  });
});

describe("engine integration", () => {
  class AlwaysPassingCommandVerifier implements Verifier {
    readonly id = "factory-command/v1";
    readonly name = "Command verifier that always passes";
    supports(check: VerificationCheckSpec) {
      return check.verifierId === this.id;
    }
    async execute(context: any, check: VerificationCheckSpec) {
      const now = Date.now();
      return {
        checkId: check.id,
        name: check.name,
        category: check.category,
        verifierId: this.id,
        mandatory: check.mandatory,
        status: "PASS" as const,
        summary: "Command exited 0.",
        acceptanceCriterionIds: check.acceptanceCriterionIds,
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        violations: [],
        evidence: [
          {
            evidenceKey: `${check.id}:out`,
            category: check.evidenceCategory,
            result: "PASS" as const,
            summary: "Command exited 0.",
            acceptanceCriterionIds: check.acceptanceCriterionIds,
            producer: { id: this.id, role: "INDEPENDENT_VERIFIER", independent: true },
          },
        ],
        metadata: {},
      };
    }
  }

  function workOrder(checks: VerificationCheckSpec[]): WorkOrderVerificationSpec {
    return {
      id: "wo-1",
      revisionNumber: 1,
      title: "Adversarial candidate",
      riskLevel: "MEDIUM",
      riskReasons: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Feature works" }],
      negativeConstraints: [],
      verificationContract: {
        schemaVersion: 1,
        enforcementMode: "ENFORCED",
        checks,
        requireHumanReview: false,
      },
      requiredApprovals: [],
    };
  }

  it("returns BLOCKED, not VERIFIED, when a self-certifying candidate makes every command pass", () => {
    // This is the end-to-end proof: the command verifier reports PASS for
    // everything (exactly what `{"scripts":{"test":"exit 0"}}` produces), yet
    // the engine refuses to certify because the candidate moved the surface
    // that decides the verdict.
    const engine = new VerificationEngine([
      new VerificationAuthorityVerifier(),
      new ChangeBudgetVerifier(),
      new NegativeConstraintVerifier(),
      new AlwaysPassingCommandVerifier(),
    ]);
    return engine
      .execute({
        workflowRunId: "run-1",
        workOrder: workOrder([TEST_CHECK]),
        candidate: candidate({ changedFiles: ["package.json", "src/feature.ts"] }),
      })
      .then((result) => {
        expect(result.verdict).toBe("BLOCKED");
        expect(result.verdictReasons.join(" ")).toMatch(/PACKAGE_MANIFEST/);
      });
  });

  it("still certifies a well-behaved candidate whose commands pass", async () => {
    const engine = new VerificationEngine([
      new VerificationAuthorityVerifier(),
      new ChangeBudgetVerifier(),
      new NegativeConstraintVerifier(),
      new AlwaysPassingCommandVerifier(),
    ]);
    const result = await engine.execute({
      workflowRunId: "run-2",
      workOrder: workOrder([TEST_CHECK]),
      candidate: candidate({ changedFiles: ["src/feature.ts"] }),
    });
    expect(result.verdict).toBe("VERIFIED");
  });

  it("evaluates the authority check even when the WorkOrder declares no negative constraints", async () => {
    // The pre-existing NO_VERIFICATION_CONFIG_CHANGES constraint was opt-in:
    // a WorkOrder that simply omitted it got no protection. This check is a
    // system check and cannot be omitted by the WorkOrder being verified.
    const engine = new VerificationEngine([
      new VerificationAuthorityVerifier(),
      new AlwaysPassingCommandVerifier(),
    ]);
    const result = await engine.execute({
      workflowRunId: "run-3",
      workOrder: workOrder([TEST_CHECK]),
      candidate: candidate({ changedFiles: ["Makefile"] }),
    });
    expect(result.checks.some((check) => check.verifierId === "factory-verification-authority")).toBe(
      true,
    );
    expect(result.verdict).toBe("BLOCKED");
  });
});

describe("independence requirement levels (D1)", () => {
  it("derives definition independence instead of letting the verifier assert it", () => {
    // Regression: FactoryCommandVerifier hardcoded `independent: true` on every
    // command result, including `pnpm test` against a package.json the candidate
    // had just rewritten. calculateCriterionCoverage filters on that exact flag.
    const candidateDefined = resolveCheckIndependence({
      verifierId: "factory-command/v1",
      command: { executable: "pnpm", args: ["test"] },
      mutatedSurfaces: ["PACKAGE_MANIFEST"],
    });
    expect(candidateDefined.independent).toBe(false);
    expect(candidateDefined.reason).toMatch(/wrote what passing means/);
  });

  it("still refuses independence for an unmodified but candidate-defined command", () => {
    // Not changing package.json this time does not make `pnpm test` independent
    // — the definition still lives in the tree under test.
    const resolution = resolveCheckIndependence({
      verifierId: "factory-command/v1",
      command: { executable: "pnpm", args: ["test"] },
      mutatedSurfaces: [],
    });
    expect(resolution.independent).toBe(false);
    expect(resolution.reason).toMatch(/candidate-dependent, not independent/);
  });

  it("treats Mission Control's own diff-reading verifiers as independent", () => {
    for (const verifierId of TRUSTED_VERIFIER_IDS) {
      expect(resolveCheckIndependence({ verifierId, mutatedSurfaces: [] }).independent).toBe(true);
    }
  });

  it("defaults to CANDIDATE_DEPENDENT_ALLOWED so existing contracts are unchanged", () => {
    // The migration property: a contract that never asked for definition
    // independence keeps passing on repository-defined checks.
    const coverage = calculateCriterionCoverage(
      [{ id: "ac-1", title: "Feature works", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
      [passingCheck({ independent: true, definitionAuthority: "CANDIDATE_DEPENDENT" })],
    );
    expect(coverage[0].status).toBe("EVIDENCED");
  });

  it("refuses candidate-defined evidence for an INDEPENDENT_REQUIRED criterion", () => {
    const coverage = calculateCriterionCoverage(
      [{
        id: "ac-1",
        title: "Authorization cannot be bypassed",
        requiredEvidence: [{
          category: "TEST_RESULT",
          minimumCount: 1,
          independent: true,
          independenceLevel: "INDEPENDENT_REQUIRED",
        }],
      }],
      [passingCheck({ independent: true, definitionAuthority: "CANDIDATE_DEPENDENT" })],
    );
    expect(coverage[0].status).toBe("MISSING");
    expect(coverage[0].missingEvidence[0]).toMatch(/candidate-independent/);
  });

  it("accepts definition-independent evidence for an INDEPENDENT_REQUIRED criterion", () => {
    const coverage = calculateCriterionCoverage(
      [{
        id: "ac-1",
        title: "Authorization cannot be bypassed",
        requiredEvidence: [{
          category: "TEST_RESULT",
          minimumCount: 1,
          independent: true,
          independenceLevel: "INDEPENDENT_REQUIRED",
        }],
      }],
      [passingCheck({ independent: true, definitionAuthority: "INDEPENDENT" })],
    );
    expect(coverage[0].status).toBe("EVIDENCED");
  });

  it("does not let evidence predating the axis satisfy INDEPENDENT_REQUIRED by omission", () => {
    const coverage = calculateCriterionCoverage(
      [{
        id: "ac-1",
        title: "Legacy",
        requiredEvidence: [{
          category: "TEST_RESULT",
          minimumCount: 1,
          independent: true,
          independenceLevel: "INDEPENDENT_REQUIRED",
        }],
      }],
      [passingCheck({ independent: true })],
    );
    expect(coverage[0].status).toBe("MISSING");
  });
});

function passingCheck(producer: { independent: boolean; definitionAuthority?: "CANDIDATE_DEPENDENT" | "INDEPENDENT" }) {
  return {
    checkId: "unit-tests",
    name: "Unit tests",
    category: "UNIT_TEST" as const,
    verifierId: "factory-command/v1",
    mandatory: true,
    status: "PASS" as const,
    summary: "ok",
    acceptanceCriterionIds: ["ac-1"],
    startedAt: 0,
    completedAt: 0,
    durationMs: 0,
    violations: [],
    evidence: [{
      evidenceKey: "unit-tests:out",
      category: "TEST_RESULT" as const,
      result: "PASS" as const,
      summary: "ok",
      acceptanceCriterionIds: ["ac-1"],
      producer: { id: "factory-command/v1", role: "INDEPENDENT_VERIFIER", ...producer },
    }],
    metadata: {},
  };
}
