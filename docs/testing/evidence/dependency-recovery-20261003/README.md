# Dependency preparation recovery

Base: bd176be (current main at recovery start).
Reproducing commit: e126e40.

Recovered one behavior from the primary checkout's saved factoryGitRuntime.ts
changes. No configured operator store now means one online install rather than
an offline attempt against a new scratch store followed by an online install.
Configured stores retain offline-first behavior and one online fallback.

## Observed checks

- Before fix: factoryDependencyInstall.test.ts had 2 failures and 4 passes.
  No-store cases expected one invocation but received two, offline then online.
- After fix: factoryDependencyInstall.test.ts and factoryGitRuntime.test.ts
  passed all 12 tests. The latter runs actual pnpm with candidate lifecycle and
  pnpmfile hooks that would fail if executed; dependency preparation succeeded.
- Full orchestration suite: 64 files passed, 3 skipped; 758 tests passed,
  11 skipped. Exit code 0, 21.18 seconds.
- Orchestration TypeScript: tsc --noEmit passed.
- git diff --check passed.

The command-selection tests inject the process executor while exercising real
scratch-directory creation and cleanup. They cover populated stores, cache
misses, absent stores, online failure, immutable install flags, and invalid
store boundaries. They measure invocation count, not a real-world speedup.

Review retained the public dependency-preparation contract comment and removed
the obsolete fallback explanation. No UI, schema, or public runtime contract
changed. This does not verify a paid model run, live PR publication by the
factory, or production release. The primary checkout's edits remain intact.
