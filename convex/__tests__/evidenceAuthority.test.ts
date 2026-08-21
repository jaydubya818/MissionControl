/**
 * Structural ratchet for evidence authority.
 *
 * Mission Control's guarantees are a set of separations:
 *
 *     Execution success != Verification success
 *     Verification success != Gate eligibility
 *     Gate eligibility    != Acceptance
 *     Acceptance          != Merge
 *
 * and a set of authority classes that must not be able to promote themselves:
 *
 *     UI               cannot create verifier evidence
 *     Execution worker cannot create acceptance
 *     Harness          cannot create acceptance
 *     LLM              cannot create approval
 *     Verifier         cannot accept a WorkOrder
 *     GitHub publisher cannot accept a WorkOrder
 *
 * Two prior audits each found a fresh instance of the same bug — a writer that
 * could mint a high-authority record from a low-authority caller
 * (`qcRuns` fabricating evidence packs, `execution.storeResult` accepting a
 * client `success: true`, an HTTP route calling `workOrders.accept`). Finding
 * them one at a time by reading code does not scale and does not stay fixed.
 *
 * These tests read the source and fail on the *shape* of the mistake, so a
 * future reintroduction fails CI rather than waiting for the next audit.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const CONVEX_ROOT = path.join(REPO_ROOT, "convex");

/**
 * Strip comments and string literals before scanning.
 *
 * Without this, the ratchet trips on its own documentation: the comments
 * explaining that `mockAssuranceCall` was removed contain the string
 * `mockAssuranceCall`. A source-shape check has to look at code, not prose.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(directory: string, extension = ".ts"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "_generated" || entry === "__tests__") continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extension));
    else if (entry.endsWith(extension)) out.push(full);
  }
  return out;
}

const CONVEX_FILES = walk(CONVEX_ROOT).map((file) => ({
  path: path.relative(REPO_ROOT, file),
  source: codeOnly(readFileSync(file, "utf8")),
}));

function readCode(relativePath: string): string {
  return codeOnly(readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

/** Split a module into `export const NAME = builder({ ... })` blocks. */
function exportedFunctions(source: string): Array<{ name: string; builder: string; body: string }> {
  const results: Array<{ name: string; builder: string; body: string }> = [];
  const pattern = /export const (\w+)(?:\s*:\s*any)?\s*=\s*(\w+)\(\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i += 1) {
      const character = source[i];
      if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    results.push({ name: match[1], builder: match[2], body: source.slice(start, end + 1) });
  }
  return results;
}

const PUBLIC_BUILDERS = new Set(["query", "mutation", "action"]);

describe("acceptance authority", () => {
  it("keeps workOrders.accept as the only producer of WORK_ORDER_ACCEPTED", () => {
    const producers = CONVEX_FILES.filter((file) => file.source.includes("WORK_ORDER_ACCEPTED")).map(
      (file) => file.path,
    );
    // Reading the constant (projections, activity rendering, tests) is fine.
    // Writing it is not. Every writer must live in workOrders.ts.
    const writers = producers.filter((filePath) => {
      const source = CONVEX_FILES.find((file) => file.path === filePath)!.source;
      return /(insert|patch)\([^)]*[\s\S]{0,400}WORK_ORDER_ACCEPTED/.test(source);
    });
    for (const writer of writers) {
      expect(writer, `${writer} writes WORK_ORDER_ACCEPTED outside workOrders.accept`).toBe(
        "convex/workOrders.ts",
      );
    }
  });

  it("does not let a verification route accept a WorkOrder", () => {
    // Regression: POST /workorders/:id/automation-verification defaulted its
    // verdict to PASSED and then called workOrders.accept — an alternative
    // acceptance path reachable with an infrastructure bearer token.
    //
    // A dedicated operator-initiated POST /workorders/:id/accept proxy is
    // legitimate (it forwards to the one governed mutation, which runs its own
    // APPROVE_DELIVERY check and derives the actor). What must never exist is a
    // route that reaches acceptance as a side effect of reporting evidence.
    const orchestration = readCode("apps/orchestration-server/src/index.ts");
    const routeStart = orchestration.indexOf("automation-verification");
    const nextRoute = orchestration.indexOf("app.", routeStart + 200);
    const verificationRoute = orchestration.slice(routeStart, nextRoute > 0 ? nextRoute : undefined);
    expect(verificationRoute).not.toMatch(/workOrders\.accept/);

    // And the acceptance proxy must not let the caller name the actor. This is
    // asserted narrowly, on the accept route alone: four other orchestration
    // routes still forward `body.actorId` into governed mutations
    // (context.activateForWorkflowRun, automationExecutions.requestCancellation,
    // missions.recordValidationResult, workOrders.supersedeWorkOrder). Those are
    // recorded as REMAINING in HARDENING_REPORT.md rather than asserted here,
    // because a test that fails for known-unfixed work gets disabled, not fixed.
    const acceptRouteStart = orchestration.indexOf('/workorders/:workOrderId/accept');
    const acceptRoute = orchestration.slice(
      acceptRouteStart,
      orchestration.indexOf("app.", acceptRouteStart + 200),
    );
    expect(acceptRoute).not.toMatch(/actorId/);
  });

  it("does not expose workOrders.accept to the harness or executor adapters", () => {
    // The worker and the Codex adapter are execution authority. Neither may
    // reference acceptance at all — not even to call the governed mutation.
    const surfaces = [
      "apps/orchestration-server/src/factoryAttemptWorker.ts",
      "apps/orchestration-server/src/durableCodexWorker.ts",
    ];
    for (const surface of surfaces) {
      const source = readCode(surface);
      expect(source, `${surface} references workOrders.accept`).not.toMatch(
        /workOrders[:.]accept\b/,
      );
    }
  });
});

describe("no public writer accepts a verdict as an argument", () => {
  /**
   * A public function that takes a pass/fail verdict AND writes it is the
   * canonical fabrication primitive: the caller supplies the conclusion.
   *
   * Entries here are grandfathered debt with a recorded reason, exactly like
   * the authorization ratchet's baseline. The list may shrink, never grow.
   */
  const KNOWN_VERDICT_ARGUMENT_WRITERS = new Set<string>([
    // Governed: gated on VERIFY_DELIVERY, bound to a COMPLETED run, and the
    // receipt is an attestation the verifier is expected to supply.
    "convex/workOrders.ts:recordVerificationReceipt",
    // Governed: gated on delivery scope; records an execution CLAIM which can
    // only move an evaluation to AWAITING_VERIFICATION, never to VERIFIED.
    "convex/skillAutomations.ts:recordExecutionResult",
    "convex/skillAutomations.ts:finalizeVerification",
    // SYSTEM OBSERVATION, now authorized. These record what a caller reports
    // about its own run for telemetry and learning projections. None of them
    // can promote a claim into verification, gate eligibility, or acceptance —
    // that separation is what makes a self-reported value acceptable here.
    "convex/flakySteps.ts:recordRun",
    "convex/monitoring.ts:logPerformance",
    "convex/agentLearning.ts:recordTaskCompletion",
    // Already authorized (6 and 7 permission calls in their modules
    // respectively) and attributed to a server-derived actor.
    "convex/loopEngineering.ts:recordMeasurement",
    "convex/loopEngineering.ts:decideSource",
    "convex/factory/metaLoop.ts:transitionLifecycle",
  ]);

  const VERDICT_ARG = /\b(success|passed|gatePassed|verified)\s*:\s*v\.(boolean|optional\(v\.boolean)/;
  const VERDICT_LITERAL = /v\.literal\(\s*"(PASSED|VERIFIED|ACCEPTED|passed)"\s*\)/;

  it("finds no ungoverned public writer taking a verdict argument", () => {
    const offenders: string[] = [];
    for (const file of CONVEX_FILES) {
      for (const fn of exportedFunctions(file.source)) {
        if (!PUBLIC_BUILDERS.has(fn.builder)) continue;
        const argsBlock = fn.body.slice(0, fn.body.indexOf("handler:") + 1 || fn.body.length);
        const takesVerdict = VERDICT_ARG.test(argsBlock) || VERDICT_LITERAL.test(argsBlock);
        if (!takesVerdict) continue;
        const writes = /ctx\.db\.(insert|patch|replace)\(/.test(fn.body);
        if (!writes) continue;
        const identifier = `${file.path}:${fn.name}`;
        if (KNOWN_VERDICT_ARGUMENT_WRITERS.has(identifier)) continue;
        offenders.push(identifier);
      }
    }
    expect(
      offenders,
      "A public Convex function accepts a pass/verified verdict as an argument and writes it. " +
        "Either derive the verdict server-side, make the function internal*, or add it to " +
        "KNOWN_VERDICT_ARGUMENT_WRITERS with the authorization that makes it safe.",
    ).toEqual([]);
  });

  it("has not grown the grandfathered list", () => {
    // The list is a ratchet. Shrinking it is the goal; growing it needs a
    // deliberate edit to this number, which shows up in review.
    expect(KNOWN_VERDICT_ARGUMENT_WRITERS.size).toBeLessThanOrEqual(9);
  });
});

describe("execution results are not read as independent verification", () => {
  it("keeps the execution runner fail-closed rather than synthesizing results", () => {
    const execution = readCode("convex/execution.ts");
    expect(execution).toContain("EXECUTION_RUNNER_UNAVAILABLE");
    // storeResult writes pass/fail evidence and must not be internet-callable.
    expect(execution).toMatch(/export const storeResult = internalMutation/);
    expect(execution).not.toMatch(/export const storeResult = mutation/);
    // The simulated executor must stay gone.
    expect(execution).not.toContain("evaluateSteps");
  });

  it("keeps the QC analyzer fail-closed rather than fabricating an evidence pack", () => {
    const qcRuns = readCode("convex/qcRuns.ts");
    expect(qcRuns).toContain("QC_ANALYZER_UNAVAILABLE");
    expect(qcRuns).not.toContain("mockAssuranceCall");
    expect(qcRuns).not.toContain("mockAgentOutputCall");
    expect(qcRuns).not.toContain("abc123def456");
  });
});

describe("verification independence cannot be self-asserted", () => {
  it("derives independence server-side rather than trusting a reported flag", () => {
    const attempts = readCode("convex/factory/attempts.ts");
    expect(attempts).toContain("deriveVerificationIndependence");
    // The verifier reports checks; the control plane decides independence.
    expect(attempts).toContain("serverDerivedIndependence");
  });

  it("feeds the verification-authority verdict into the independence decision", () => {
    // Lineage isolation proves a different process ran the check. It does not
    // prove a different standard was applied — a candidate that rewrote its own
    // package.json is verified by a perfectly isolated verifier running the
    // candidate's own definition of success.
    const attempts = readCode("convex/factory/attempts.ts");
    expect(attempts).toContain("verificationAuthorityStatusFromPacket");

    const independence = readCode("packages/workflow-engine/src/verificationIndependence.ts");
    expect(independence).toContain("authorityStatus");
    // Absent must not read as pass.
    expect(independence).toMatch(/authorityStatus === "FAIL"/);
  });

  it("does not let the orchestration ingestion boundary claim independence", () => {
    // The automation-verification route ingests someone else's verdict; it
    // cannot establish that they were independent of what they judged.
    const orchestration = readCode("apps/orchestration-server/src/index.ts");
    expect(orchestration).not.toMatch(/independent:\s*true/);
  });
});

describe("the verification-authority check cannot be omitted", () => {
  it("is supplied by the engine rather than by whoever constructs it", () => {
    const engine = readCode("packages/workflow-engine/src/verification.ts");
    // Registered structurally in the constructor, so no call site can drop it.
    expect(engine).toMatch(/new VerificationAuthorityVerifier\(\)/);
    // And added to the check list unconditionally, unlike the opt-in
    // change-budget and negative-constraint system checks.
    expect(engine).toMatch(
      /if \(!result\.some\(\(check\) => check\.verifierId === VERIFICATION_AUTHORITY_CHECK\.verifierId\)\)/,
    );
  });
});

describe("merge authority — humans merge", () => {
  it("gives Mission Control no capability to merge a pull request", () => {
    // GitHub's merge endpoint is `PUT /repos/{o}/{r}/pulls/{n}/merge`. The
    // publisher only ever GETs and POSTs to /pulls (list and create), so the
    // capability does not exist rather than being merely unused.
    const publisher = readCode("apps/orchestration-server/src/githubAppPublisher.ts");
    const runtime = readCode("apps/orchestration-server/src/githubAppRuntime.ts");
    for (const [name, source] of [["publisher", publisher], ["runtime", runtime]] as const) {
      expect(source, `${name} references the GitHub merge endpoint`).not.toMatch(
        /pulls\/[^"'`]*\/merge/,
      );
      expect(source, `${name} enables auto-merge`).not.toMatch(/auto_merge|enableAutoMerge/i);
      expect(source, `${name} issues a PUT`).not.toMatch(/method:\s*"PUT"/);
    }
  });

  it("records a merge only behind proven external CI authority", () => {
    // Regression: mergeAuthoritySatisfied required only ciStatus === "PASS",
    // and prChecks derived that PASS from a workflow run reporting its own
    // completion while stamping ciProvider: "github" on it.
    const prChecks = readCode("convex/factory/prChecks.ts");
    expect(prChecks).toContain("evaluateCiMergeAuthority");
    expect(prChecks).toMatch(/ciAuthoritySatisfied:\s*ciAuthority\.satisfied/);
    // And the provider label is no longer stamped on internally-derived rows.
    expect(prChecks).not.toMatch(/ciProvider:\s*"github",/);
  });
});

describe("CI evidence cannot be laundered into acceptance or merge", () => {
  it("classifies PR check authority from provenance rather than a stored label", () => {
    const evidence = readCode("convex/lib/evidenceAuthority.ts");
    expect(evidence).toContain("classifyPrCheckAuthority");
    // The trusted-projection fields are what make it an attestation.
    for (const field of ["installationId", "providerRepositoryId", "headSha", "sourceEventId"]) {
      expect(evidence).toContain(field);
    }
  });

  it("keeps the GitHub webhook fail-closed and provenance-bound", () => {
    const http = readCode("convex/http.ts");
    // Signature required, and unconfigured means refuse rather than accept.
    expect(http).toContain("verifyGithubWebhookSignature");
    expect(http).toMatch(/GitHub webhook is not configured/);
    // Repository and installation identity come from the signed payload.
    expect(http).toMatch(/providerRepositoryId:\s*repository\?\.id/);
    expect(http).toMatch(/installationId:\s*installation\?\.id/);
    // Replays are detected.
    expect(http).toMatch(/delivery\.duplicate/);
  });

  it("does not let a verifier self-declare definition independence", () => {
    // FactoryCommandVerifier hardcoded `independent: true` on every command
    // result, and calculateCriterionCoverage filters acceptance evidence on it.
    const factoryVerification = readCode("apps/orchestration-server/src/factoryVerification.ts");
    expect(factoryVerification).toContain("resolveCheckIndependence");
    expect(factoryVerification).toMatch(/definitionAuthority:/);
  });
});
