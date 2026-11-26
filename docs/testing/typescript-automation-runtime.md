# TypeScript automation runtime

## Execution contract

`ExecutionManifest` already supplies the approved artifact, repository root,
working directory, hash, timeout, and secret references. The repair keeps that
data shape and the shared `executeArgv` process controls.

The TypeScript adapter must run the approved artifact with the orchestration
server's Node executable and installed `tsx` loader. Loader resolution must
start at the orchestration module, independent of the candidate repository and
its `PATH`. The artifact remains an absolute path inside the approved root.

The intended argv is `process.execPath --import <host loader URL> <artifact>`.
`createRequire(import.meta.url)` resolves the host dependency, and
`pathToFileURL` preserves loader paths containing spaces. Resolution happens
only for a TypeScript execution. Other adapters retain their existing runtime.

## Reproduced failure

At base `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`, the adapter invokes
`pnpm exec tsx <artifact>`. On the qualification host, `tsx` 4.21.0 fails in
`createIpcServer` before running the artifact.

```text
Error: listen EPERM: operation not permitted /tmp/tsx-1000/88.pipe
Tests  1 failed | 12 passed (13)
```

The reproduction uses Node 24.22.3 and the repository's pinned pnpm 9.0.0.
The command runs from `apps/orchestration-server`.

```sh
npx --yes pnpm@9.0.0 exec vitest run src/__tests__/automationAdapter.test.ts --reporter=verbose
```

## Regression coverage

- Execute real TypeScript and Python artifacts through `executeAutomation`.
- Execute a TypeScript enum and a relative import from a temporary repository
  outside the server tree, with spaces in its path and a nested working directory.
  The enum requires transformation beyond Node's native type stripping.
- Put a competing `tsx` package and fake launchers in the candidate repository.
  Confirm that the host runtime executes the approved artifact without loading them.
- Rerun timeout, cancellation, process-group cleanup, redaction, hash, and path checks.

The hostile-runtime regression fails against the original adapter with
`Adapter exited with 97`, proving that the old command selects the candidate's
fake executable. The repaired adapter returns the expected value, preserves the
requested working directory, and never creates the candidate's execution marker.

## Verification results

The focused adapter suite passes all 14 tests, including real TypeScript and
Python execution. The suite also passes all 14 tests with `TMPDIR` pointing
through a directory symlink. The expected working directory uses `realpath` to
match Node's `process.cwd()` semantics. No test is skipped in these Linux runs.

```sh
npx --yes pnpm@9.0.0 exec vitest run src/__tests__/automationAdapter.test.ts --reporter=verbose
npx --yes pnpm@9.0.0 exec tsc
```

TypeScript compilation passes. The package builds with `tsc` and emits ESM,
so `createRequire(import.meta.url)` retains its host-module anchor after build.
A separate smoke test imports
`dist/apps/orchestration-server/src/automationAdapter.js` with plain Node,
sets `PATH=/usr/bin:/bin`, and executes TypeScript and Python artifacts from an
external temporary repository. Both return `passed` and the expected value `42`.

The initial combined adapter and `systemFactoryQualification.test.ts` run
reported 17 passing tests and one failing test. The remaining failure was in
that test's generated `testScript()`, which independently invoked
`spawnSync("tsx", ...)` and encountered the same IPC restriction.

The integrated repair also changes that generated test launcher to use the
host Node executable and the host-resolved loader URL. It still runs Node's
test runner against the same fixture test. All four composed qualification
tests now pass. The retained run is
`.audit/system-qualification-fixture-retest.log`.

`tsx` remains an existing development dependency. These checks use the pinned
complete dependency installation. They do not qualify an installation that omits
development dependencies.

This check covers automation execution. It does not establish live factory
generation, WorkOrder acceptance, deployment, or approval authority.
