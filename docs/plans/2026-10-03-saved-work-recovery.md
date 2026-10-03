# Recover saved factory work

## Scope

The operator authorized reviewing saved changes, recovering useful fixes in small
commits, and testing the factory. Start from main at bd176be. No Mission,
WorkOrder, or Task identifier was supplied; do not invent delivery records.

The primary checkout still contains 40 modified tracked files and untracked
presentation helpers, retry tests, screenshots, and scratch artifacts. Leave it
intact. Recover selected changes into the assigned clean worktree.

## First unit: dependency preparation

Without MISSION_CONTROL_FACTORY_PNPM_STORE_DIR, the installer creates a fresh
scratch store, attempts offline installation, then retries online. Skip that
unproductive first attempt. An explicit store retains offline-first behavior
with a single online fallback. Preserve frozen lockfiles, disabled hooks and
lifecycle scripts, sanitized environment, source-state checks, and cleanup.

The existing implementation already permits the online fallback; this change
does not add network authority. Existing store-boundary checks remain required.

Compare two designs: a process mock around the private installer, or an optional
process executor argument on the installer. Use the latter, matching the saved
patch and the existing dependency-injection pattern. Tests can exercise real
scratch-directory handling and inspect commands without changing global process
functions. Production callers retain the default executor.

## Review queue

- Dependency preparation: first bounded repair.
- Codex process exit handling and cached model adaptation: review separately.
- Verification command policy and completed-verifier retry: require independent
  review of authorization and lineage before recovery.
- Task projections and reporting: check project isolation and parent inheritance.
- Command Center, taskboard, navigation, and docs: compare with newer main UI;
  preserve current approval-count and navigation fixes.
- Factory-owned-path filtering: current main already implements filtering; do
  not replace it with the older saved helper.

## Verification

Commit a reproducing test before the fix. Cover absent, populated, and missing
operator cache entries; one fallback only; frozen arguments; and failures.
Run the real pnpm fixture that rejects candidate hooks and lifecycle execution,
the orchestration test suite, and TypeScript. Keep CI mandatory before merge.
A passing dependency repair is not proof of live model execution or release.
