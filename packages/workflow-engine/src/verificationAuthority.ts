/**
 * Separating CANDIDATE INPUT from VERIFICATION AUTHORITY.
 *
 * ## The problem this exists to solve
 *
 * `FactoryCommandVerifier` runs a frozen command — say `pnpm test` — with
 * `cwd` set to the candidate's own worktree, under an executable allowlist.
 * The allowlist establishes *containment*: the candidate cannot make the
 * verifier run `curl`, `kubectl`, or `rm`.
 *
 * It does not establish *independence*. `pnpm test` means whatever
 * `package.json#scripts.test` says it means, and `package.json` is a file the
 * candidate just wrote. So `{"scripts": {"test": "exit 0"}}` is a passing
 * verification, and so is a `Makefile` whose `test` target echoes PASS. The
 * executable allowlist is satisfied in both cases, because `pnpm` and `make`
 * are on it.
 *
 * That inverts the Factory's central rule. Execution proposes; verification
 * proves. A candidate that can redefine the thing which decides whether it
 * passed is certifying itself.
 *
 * ## Why the existing negative constraints did not cover this
 *
 * `verification.ts` already ships `NO_VERIFICATION_CONFIG_CHANGES`, and its
 * `isVerificationConfigFile` matches `vitest.*`, `jest.*`, `playwright.*`,
 * `tsconfig.*`, `pytest.*` and friends. Two gaps made it insufficient:
 *
 * 1. It does not match `package.json`, `Makefile`, `justfile`, `Rakefile`,
 *    `.npmrc`, `pnpm-workspace.yaml`, or `build.gradle` — i.e. it misses every
 *    file that defines what the *entry point commands* actually run. A
 *    candidate rewriting `scripts.test` was never a violation.
 * 2. Every negative constraint is **opt-in**: it only fires if that constraint
 *    is present in the WorkOrder's frozen spec. A WorkOrder that simply does
 *    not declare it gets no protection at all, and most do not declare it.
 *
 * This module closes both. The authority check is a **system check** — always
 * evaluated, like the change budget — and it fails **closed**.
 *
 * ## What this module actually proves, and what it does not
 *
 * It does NOT make `pnpm test` independent. Nothing can, while the command's
 * meaning lives in the tree under test. What it does is make the dependency
 * *explicit and governed*:
 *
 * - It classifies every check command by whether its meaning is
 *   candidate-defined, and names the files that define it.
 * - It detects when the candidate mutated any of those files.
 * - When both are true, verification is BLOCKED unless the **frozen** contract
 *   — authored before the candidate existed — explicitly allowed that surface
 *   to move, with a stated reason.
 *
 * So the authority to decide "this candidate may rewrite its own test command"
 * belongs to the pre-existing Quality Contract, never to the candidate. That is
 * the strongest property obtainable without a trusted out-of-tree runner, and
 * it is stated here rather than implied, so nobody mistakes containment for
 * independence.
 *
 * @see docs/software-factory/verification-isolation.md for the containment half.
 */

import type { CandidateChange, VerificationCheckSpec } from "./verification.js";

/** Kinds of file whose content can change a verification verdict. */
export type AuthoritySurface =
  /** Declares the scripts an entry-point command runs. */
  | "PACKAGE_MANIFEST"
  /** Pins what the runner resolves; swapping it swaps the runner. */
  | "LOCKFILE"
  /** `make test`, `just test`, `rake test`, gradle/maven targets. */
  | "BUILD_SCRIPT"
  /** Test-runner configuration: which tests run, and how strictly. */
  | "TEST_CONFIG"
  /** The assertions themselves. */
  | "TEST_SOURCE"
  /** Which toolchain/registry the runner resolves against. */
  | "RUNNER_CONFIG"
  /** CI definitions, when CI results are consumed as evidence. */
  | "CI_CONFIG";

export interface AuthorityMutation {
  path: string;
  surface: AuthoritySurface;
  deleted: boolean;
}

/**
 * When a surface mutation is a violation.
 *
 * The line drawn here is deliberate, and it is the difference between a
 * control that gets used and one that gets switched off:
 *
 * - **The candidate may add proof.** Writing a test alongside a feature is
 *   ordinary, correct work. Blocking it would block essentially every real
 *   WorkOrder, and a control that blocks everything is a control that gets
 *   disabled.
 * - **The candidate may not remove proof.** Deleting a test file removes the
 *   assertions that would have failed. (Weakening assertions *inside* a file it
 *   is otherwise allowed to edit is the job of the `NO_ASSERTION_WEAKENING`
 *   negative constraint, which reads the diff.)
 * - **The candidate may never redefine what running the proof means.** There is
 *   no ordinary reason for a feature WorkOrder to rewrite `package.json`
 *   scripts, a `Makefile` target, the test-runner config, the lockfile, the
 *   registry config, or CI. Those are the surfaces where a change is
 *   indistinguishable from an attack, so any change to them is a violation
 *   until the frozen contract says otherwise.
 */
export type SurfaceBlockingRule = "ANY_CHANGE" | "DELETION_ONLY";

export const SURFACE_BLOCKING_RULES: Record<AuthoritySurface, SurfaceBlockingRule> = {
  PACKAGE_MANIFEST: "ANY_CHANGE",
  LOCKFILE: "ANY_CHANGE",
  BUILD_SCRIPT: "ANY_CHANGE",
  TEST_CONFIG: "ANY_CHANGE",
  RUNNER_CONFIG: "ANY_CHANGE",
  CI_CONFIG: "ANY_CHANGE",
  TEST_SOURCE: "DELETION_ONLY",
};

/** Does this mutation require an explicit allowance in the frozen contract? */
export function mutationRequiresAllowance(mutation: AuthorityMutation): boolean {
  return SURFACE_BLOCKING_RULES[mutation.surface] === "ANY_CHANGE" || mutation.deleted;
}

/**
 * Patterns are deliberately broad. A false positive costs one explicit
 * allowance in a Quality Contract; a false negative costs the entire
 * verification guarantee.
 */
const SURFACE_MATCHERS: Array<{ surface: AuthoritySurface; test: RegExp }> = [
  {
    surface: "PACKAGE_MANIFEST",
    test: /(^|\/)(package\.json|Cargo\.toml|pyproject\.toml|setup\.py|setup\.cfg|Gemfile|go\.mod|composer\.json|pubspec\.yaml|Package\.swift)$|\.csproj$/i,
  },
  {
    surface: "LOCKFILE",
    test: /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|go\.sum|Gemfile\.lock|composer\.lock|uv\.lock)$/i,
  },
  {
    surface: "BUILD_SCRIPT",
    test: /(^|\/)(Makefile|makefile|GNUmakefile|justfile|Justfile|Rakefile|Taskfile\.ya?ml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|pom\.xml|BUILD(\.bazel)?|WORKSPACE|CMakeLists\.txt|meson\.build|SConstruct)$|\.mk$/,
  },
  {
    surface: "TEST_CONFIG",
    test: /(^|\/)(vitest|jest|playwright|cypress|karma|mocha|ava|nyc|pytest|tox|nose|phpunit|rspec|sonar|codecov|coverage|tsconfig|jsconfig|babel|swcrc|eslint|biome)[^/]*\.(json|jsonc|js|cjs|mjs|ts|mts|cts|ya?ml|toml|ini|xml)$|(^|\/)\.(mocharc|babelrc|swcrc|nycrc|eslintrc)[^/]*$|(^|\/)(pytest\.ini|tox\.ini|\.coveragerc|conftest\.py)$/i,
  },
  {
    surface: "RUNNER_CONFIG",
    test: /(^|\/)(\.npmrc|\.yarnrc(\.ya?ml)?|\.pnpmfile\.cjs|pnpm-workspace\.yaml|\.nvmrc|\.node-version|\.tool-versions|\.python-version|rust-toolchain(\.toml)?|\.ruby-version|\.envrc)$/i,
  },
  {
    surface: "CI_CONFIG",
    test: /(^|\/)\.github\/workflows\/|(^|\/)(\.gitlab-ci\.ya?ml|azure-pipelines\.ya?ml|Jenkinsfile)$|(^|\/)\.circleci\/|(^|\/)\.buildkite\//i,
  },
  {
    surface: "TEST_SOURCE",
    test: /(^|\/)(__tests__|__test__|tests?|spec|specs|e2e)(\/|$)|[._-](test|spec)\.[^/]+$|(^|\/)test_[^/]*\.py$/i,
  },
];

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Classify one repository path, or `null` if it cannot affect a verdict. */
export function classifyAuthoritySurface(path: string): AuthoritySurface | null {
  const normalized = normalize(path);
  for (const matcher of SURFACE_MATCHERS) {
    if (matcher.test.test(normalized)) return matcher.surface;
  }
  return null;
}

/** Every verification-authority file the candidate added, changed or deleted. */
export function classifyAuthorityMutations(candidate: {
  changedFiles: string[];
  deletedFiles: string[];
}): AuthorityMutation[] {
  const seen = new Map<string, AuthorityMutation>();
  const record = (path: string, deleted: boolean) => {
    const surface = classifyAuthoritySurface(path);
    if (!surface) return;
    const key = normalize(path);
    const existing = seen.get(key);
    if (existing) {
      // A path reported both changed and deleted is treated as deleted, which
      // is the stronger claim (removed assertions beat modified assertions).
      if (deleted) existing.deleted = true;
      return;
    }
    seen.set(key, { path: key, surface, deleted });
  };
  for (const path of candidate.changedFiles) record(path, false);
  for (const path of candidate.deletedFiles) record(path, true);
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export type CommandAuthority = "CANDIDATE_DEFINED" | "TRUSTED_TOOLCHAIN";

export interface CommandAuthorityResolution {
  authority: CommandAuthority;
  /** Surfaces whose content determines what this command does. */
  definedBy: AuthoritySurface[];
  reason: string;
}

/**
 * Which surfaces decide what a given entry-point command actually executes.
 *
 * Being honest here matters more than being clever: nearly every real
 * verification command is candidate-defined, and the point of this function is
 * to say so out loud rather than to find a comforting subset that is not.
 */
const COMMAND_DEFINITIONS: Array<{
  executable: RegExp;
  definedBy: AuthoritySurface[];
  reason: string;
}> = [
  {
    executable: /^(pnpm|npm|yarn|bun|npx|pnpx)$/i,
    definedBy: ["PACKAGE_MANIFEST", "LOCKFILE", "RUNNER_CONFIG", "TEST_CONFIG"],
    reason:
      "Node package-manager entry points execute the script body in package.json and resolve the runner through the lockfile and .npmrc.",
  },
  {
    executable: /^(make|gmake|just|task|rake|mage)$/i,
    definedBy: ["BUILD_SCRIPT"],
    reason: "Task-runner targets are defined by a Makefile/justfile/Rakefile in the candidate tree.",
  },
  {
    executable: /^(gradle|gradlew|mvn|mvnw|bazel|cmake|meson|scons)$/i,
    definedBy: ["BUILD_SCRIPT", "PACKAGE_MANIFEST"],
    reason: "Build-system goals are defined by build files in the candidate tree.",
  },
  {
    executable: /^cargo$/i,
    definedBy: ["PACKAGE_MANIFEST", "LOCKFILE", "TEST_SOURCE"],
    reason: "Cargo aliases and test targets are defined by Cargo.toml and the candidate's own tests.",
  },
  {
    executable: /^go$/i,
    definedBy: ["PACKAGE_MANIFEST", "LOCKFILE", "TEST_SOURCE"],
    reason: "Go test selection and module resolution come from go.mod/go.sum and the candidate's tests.",
  },
  {
    executable: /^(pytest|python|python3|tox|nox)$/i,
    definedBy: ["TEST_CONFIG", "TEST_SOURCE", "PACKAGE_MANIFEST"],
    reason:
      "Python test discovery is driven by pytest/tox configuration and conftest.py in the candidate tree.",
  },
  {
    executable: /^dotnet$/i,
    definedBy: ["PACKAGE_MANIFEST", "TEST_SOURCE"],
    reason: "dotnet test resolves targets from candidate project files.",
  },
  {
    executable: /^(node|deno|ruby|bundle|swift|xcodebuild)$/i,
    definedBy: ["PACKAGE_MANIFEST", "TEST_CONFIG", "TEST_SOURCE"],
    reason: "The interpreter runs a script from the candidate tree and resolves configuration from it.",
  },
];

export function resolveCommandAuthority(command: {
  executable: string;
  args: string[];
}): CommandAuthorityResolution {
  const executable = normalize(command.executable).split("/").pop() ?? command.executable;
  for (const definition of COMMAND_DEFINITIONS) {
    if (definition.executable.test(executable)) {
      return {
        authority: "CANDIDATE_DEFINED",
        definedBy: definition.definedBy,
        reason: definition.reason,
      };
    }
  }
  return {
    authority: "TRUSTED_TOOLCHAIN",
    definedBy: [],
    reason:
      "The executable is not a known candidate-configurable entry point. Its behaviour is assumed to come from the verifier toolchain.",
  };
}

/**
 * The allowance, which lives in the **frozen** verification contract.
 *
 * Present only when a human authored it into the Quality Contract before the
 * candidate existed. Sometimes moving the verification surface genuinely IS
 * the work ("migrate the suite to Vitest"); this is how that is expressed
 * without handing the decision to the candidate.
 */
export interface VerificationAuthorityPolicy {
  /** Surfaces this WorkOrder is permitted to change. */
  allowedSurfaceMutations?: AuthoritySurface[];
  /** Exact repository paths permitted to change, even on a blocked surface. */
  allowedPaths?: string[];
  /** Why the allowance exists. Required whenever anything is allowed. */
  reason?: string;
}

export interface AuthorityFinding {
  surface: AuthoritySurface;
  paths: string[];
  /** Check ids whose verdict this mutation could determine. */
  affectedCheckIds: string[];
  message: string;
}

export interface VerificationAuthorityEvaluation {
  status: "PASS" | "FAIL";
  /** Blocking findings — the candidate moved a surface that decides its own verdict. */
  findings: AuthorityFinding[];
  /** Mutations the frozen contract explicitly permitted. */
  allowed: AuthorityMutation[];
  /**
   * Authority-surface touches that are not violations under
   * `SURFACE_BLOCKING_RULES` (adding or editing a test). Recorded so a reader
   * can see the whole surface that moved, not just the part that was refused.
   */
  observed: AuthorityMutation[];
  /** Every executed check, with the surfaces that define its behaviour. */
  commandAuthority: Array<{
    checkId: string;
    executable: string;
    authority: CommandAuthority;
    definedBy: AuthoritySurface[];
  }>;
  summary: string;
}

function matchesPath(path: string, pattern: string): boolean {
  const file = normalize(path);
  const normalizedPattern = normalize(pattern);
  if (!normalizedPattern.includes("*")) {
    return file === normalizedPattern || file.startsWith(`${normalizedPattern}/`);
  }
  // `**` must survive the single-`*` substitution, so it is parked on a
  // sentinel token that cannot appear in a repository path.
  const DOUBLE_STAR = "\u0000";
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .split("**")
    .join(DOUBLE_STAR)
    .replace(/\*/g, "[^/]*")
    .split(DOUBLE_STAR)
    .join(".*");
  return new RegExp(`^${escaped}$`).test(file);
}

/**
 * Decide whether the candidate redefined its own verification.
 *
 * Fails closed: a mutated authority surface that could determine the outcome
 * of an executed check is a blocking violation unless the frozen policy
 * permitted it.
 */
export function evaluateVerificationAuthority(input: {
  candidate: Pick<CandidateChange, "changedFiles" | "deletedFiles">;
  checks: VerificationCheckSpec[];
  policy?: VerificationAuthorityPolicy;
}): VerificationAuthorityEvaluation {
  const commandChecks = input.checks.filter((check) => check.command);
  const commandAuthority = commandChecks.map((check) => {
    const resolution = resolveCommandAuthority(check.command!);
    return {
      checkId: check.id,
      executable: check.command!.executable,
      authority: resolution.authority,
      definedBy: resolution.definedBy,
    };
  });

  const mutations = classifyAuthorityMutations(input.candidate);
  if (mutations.length === 0) {
    return {
      status: "PASS",
      findings: [],
      allowed: [],
      observed: [],
      commandAuthority,
      summary: "The candidate did not modify any file that determines a verification verdict.",
    };
  }

  const allowedSurfaces = new Set(input.policy?.allowedSurfaceMutations ?? []);
  const allowedPaths = input.policy?.allowedPaths ?? [];
  const allowed: AuthorityMutation[] = [];
  const blocked: AuthorityMutation[] = [];
  const benign: AuthorityMutation[] = [];
  for (const mutation of mutations) {
    if (!mutationRequiresAllowance(mutation)) {
      // e.g. a modified or added test file: ordinary authorship, recorded in
      // the evidence for provenance but not a violation.
      benign.push(mutation);
      continue;
    }
    const permitted =
      allowedSurfaces.has(mutation.surface) ||
      allowedPaths.some((pattern) => matchesPath(mutation.path, pattern));
    (permitted ? allowed : blocked).push(mutation);
  }

  if (blocked.length === 0) {
    return {
      status: "PASS",
      findings: [],
      allowed,
      observed: benign,
      commandAuthority,
      summary:
        `The candidate changed ${allowed.length} verification-authority file(s), each explicitly permitted by the frozen ` +
        `verification contract${input.policy?.reason ? `: ${input.policy.reason}` : "."}`,
    };
  }

  const findings: AuthorityFinding[] = [];
  for (const surface of new Set(blocked.map((mutation) => mutation.surface))) {
    const paths = blocked.filter((mutation) => mutation.surface === surface);
    const affected = commandAuthority.filter((entry) => entry.definedBy.includes(surface));
    findings.push({
      surface,
      paths: paths.map((mutation) => (mutation.deleted ? `${mutation.path} (deleted)` : mutation.path)),
      affectedCheckIds: affected.map((entry) => entry.checkId),
      message:
        affected.length > 0
          ? `The candidate modified ${surface} files that define what ${affected
              .map((entry) => entry.executable)
              .join(", ")} executes for check(s) ${affected.map((entry) => entry.checkId).join(", ")}.`
          : `The candidate modified ${surface} files, which determine verification behaviour.`,
    });
  }

  return {
    status: "FAIL",
    findings,
    allowed,
    observed: benign,
    commandAuthority,
    summary:
      `Verification authority violated: the candidate changed ${blocked.length} file(s) that determine whether it passes, ` +
      "and the frozen verification contract does not permit it. Execution proposes; it does not get to redefine the proof.",
  };
}

/**
 * Stable digest input for the authority evaluation.
 *
 * Bound into evidence so a reader can tell, later and without the worktree,
 * exactly which authority surfaces moved under this candidate.
 */
export function authorityDigestInput(evaluation: VerificationAuthorityEvaluation): string {
  return JSON.stringify({
    v: 1,
    status: evaluation.status,
    blocked: evaluation.findings.map((finding) => ({ s: finding.surface, p: [...finding.paths].sort() })),
    allowed: evaluation.allowed.map((mutation) => ({
      s: mutation.surface,
      p: mutation.path,
      d: mutation.deleted,
    })),
    observed: evaluation.observed.map((mutation) => ({ s: mutation.surface, p: mutation.path })),
    commands: [...evaluation.commandAuthority]
      .map((entry) => ({ c: entry.checkId, e: entry.executable, a: entry.authority }))
      .sort((a, b) => a.c.localeCompare(b.c)),
  });
}

/**
 * Verifier implementations Mission Control owns, whose behaviour the candidate
 * cannot alter from inside its own repository.
 *
 * These read the candidate as *data* — a diff, a file list — rather than
 * executing anything the candidate wrote. That is what makes them independent,
 * and it is why the list is short and explicit rather than inferred: adding to
 * it is a claim that must be justified at review time.
 */
export const TRUSTED_VERIFIER_IDS: ReadonlySet<string> = new Set([
  "factory-change-budget",
  "factory-negative-constraints",
  "factory-verification-authority",
]);

/**
 * Whether a check's evidence may be presented as INDEPENDENT.
 *
 * ## Why this function exists
 *
 * `VerificationEvidenceDraft.producer.independent` was a boolean the producer
 * set about itself, and `FactoryCommandVerifier` hardcoded `independent: true`
 * on every command result — including a `pnpm test` whose `package.json` the
 * candidate had just rewritten. `calculateCriterionCoverage` filters on exactly
 * that flag, so a Quality Contract demanding
 * `requiredEvidence: [{ independent: true }]` was satisfied by the candidate's
 * own definition of passing.
 *
 * The schema was already right; the value was self-declared. Independence is now
 * derived from who defines the check, not asserted by whoever ran it.
 */
export function resolveCheckIndependence(input: {
  verifierId: string;
  command?: { executable: string; args: string[] };
  /** Authority surfaces this candidate mutated, from `classifyAuthorityMutations`. */
  mutatedSurfaces: AuthoritySurface[];
  /** Verifier ids registered as out-of-tree, in addition to the built-ins. */
  trustedVerifierIds?: ReadonlySet<string>;
}): { independent: boolean; reason: string } {
  const trusted = input.trustedVerifierIds ?? TRUSTED_VERIFIER_IDS;
  if (trusted.has(input.verifierId)) {
    return {
      independent: true,
      reason:
        `${input.verifierId} is a Mission Control verifier that inspects the candidate as data; ` +
        "the candidate cannot change what it does.",
    };
  }
  if (!input.command) {
    return {
      independent: false,
      reason:
        `${input.verifierId} is not a registered trusted verifier, so its independence cannot be established.`,
    };
  }

  const resolution = resolveCommandAuthority(input.command);
  if (resolution.authority === "TRUSTED_TOOLCHAIN") {
    return {
      independent: true,
      reason: `${input.command.executable} is not a candidate-configurable entry point.`,
    };
  }

  const overlapping = resolution.definedBy.filter((surface) => input.mutatedSurfaces.includes(surface));
  if (overlapping.length > 0) {
    return {
      independent: false,
      reason:
        `${input.command.executable} is defined by ${resolution.definedBy.join(", ")}, and this candidate ` +
        `modified ${overlapping.join(", ")}. The result is real, but the candidate wrote what passing means.`,
    };
  }

  return {
    independent: false,
    reason:
      `${input.command.executable} resolves its behaviour from ${resolution.definedBy.join(", ")} inside the ` +
      "candidate repository. The candidate did not change them for this candidate, so the result is " +
      "trustworthy as a repository-defined check — but it is candidate-dependent, not independent.",
  };
}
