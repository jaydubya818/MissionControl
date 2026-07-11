# Context Bill of Materials (CBOM)

> Software Factory Epic 4 (PR 6). Feature flag: `context.cbom` (default off).

A **context snapshot** is the immutable record of everything that shaped an
agent run: model, agent version, context packages (with content hashes),
tools, feature flags, repository state, and workflow/policy versions. It is
to an agent run what an SBOM is to a build artifact — the evidence trail
that makes behavior explainable, reproducible, and diffable.

- Table: `contextSnapshots` (`convex/schema.ts`)
- Functions: `convex/context/snapshots.ts`
- Pure diff/export logic: `convex/lib/contextSnapshots.ts` (no Convex imports)
- Flag gate: `convex/lib/contextCbomGate.ts`
- Tests: `convex/__tests__/contextSnapshots.test.ts`

## The seven questions a CBOM answers

1. **Which instructions** (context packages, by slug + version + content
   hash) did the agent run with?
2. **Which skill/package version** was in effect — and was its content the
   published content (`contentHash` match)?
3. **Which policy** (`policyVersion`, `approvalPolicy`,
   `riskClassification`) governed the run?
4. **Which model** (`model`, `modelVersion`) produced the output?
5. **Which tools** (name, version, server, permissions) were available?
6. **Can we reproduce it?** `exportSnapshot` returns a stable, sorted,
   JSON-serializable object carrying repo state (`repoSlug`,
   `repositorySha`, `branch`, `worktreePath`), environment hashes, and the
   full context surface.
7. **What changed between a good run and a bad one?** `compareSnapshots`
   correlates a regression with the exact context delta.

## Snapshot contract

One row per run. Key fields:

| Group | Fields |
|---|---|
| Attachment | `runId`, `taskId`, `workOrderId` (evidence attachment points) |
| Repository | `repoSlug`, `repositorySha`, `branch`, `worktreePath` |
| Model | `model` (required), `modelVersion` |
| Agent | `agentId`, `agentVersion`, `soulVersionHash` |
| Orchestration | `workflowVersion`, `policyVersion` |
| Context | `packages[]` — `{ packageId?, slug, version, contentHash, sourceCommitSha? }` |
| Tools | `tools[]` — `{ name, version?, server?, permissions? }` |
| Environment | `environmentHash`, `runtimeConfigHash`, `featureFlags[]`, `approvalPolicy`, `riskClassification` |

`packages[].contentHash` must be `sha256:` + 64 lowercase hex chars
(validated with `isValidContentHash` from `lib/contextPackages`).

Session logs are NOT part of the snapshot — `sessionLogRefs` on `runs` is
owned by the executor contract (`docs/software-factory/EXECUTOR_CONTRACT.md`,
PR 2a track) and is not duplicated here. The CBOM records *inputs* to the
run; session logs record its *transcript*.

## Immutability rule

**A snapshot is written once and never modified.**

- `createSnapshot` is the only write path. There is no update mutation for
  `contextSnapshots`, and none may be added — a snapshot that can change is
  worthless as evidence.
- One snapshot per run: `createSnapshot` rejects a `runId` that already has
  a snapshot (checked via the `by_run` index and `runs.contextSnapshotId`).
- `runs.contextSnapshotId` is set exactly once, when the snapshot is
  inserted.

## Creation flow

`createSnapshot` is called **at run start**, after the run row exists and
context resolution has completed, by:

- the **workflow executor** (primary caller), and
- the **Pi-bridge adapter** (PR 21c) for externally executed runs.

Behavior:

1. Gated behind the `context.cbom` feature flag (project override honored
   via the run's `projectId`); throws when disabled.
2. Validates every package `contentHash` format.
3. **Auto-captures feature flags**: the caller does not supply them. The
   mutation reads all `featureFlags` rows and resolves the full surface
   (`resolveAllFlags` over `KNOWN_FLAGS` + database rows, project overrides
   applied), storing the resolved `{ key, enabled }` list — so the CBOM
   records what was actually on, including defaults.
4. Inserts the snapshot, patches `runs.contextSnapshotId`, and writes a
   `CONTEXT_SNAPSHOT_CREATED` audit row to `activities`.

Reads (`getByRun`, `getById`, `listByAgent`, `listByRepo`,
`listByWorkOrder`, `compareSnapshots`, `exportSnapshot`) are open — they are
harmless before the subsystem launches.

## Comparison semantics

`compareSnapshots(aId, bId)` — `a` is the baseline, `b` the candidate —
returns a structured, deterministically sorted diff:

- **`packagesAdded` / `packagesRemoved`** — identified by `slug`.
- **`packagesChanged`** — same slug, different `version` or `contentHash`.
  A hash change with the same version means content was edited in place;
  it is still reported.
- **`modelChanged`** — model identity is `model` or `model@modelVersion`;
  a version-only bump counts as a model change.
- **`repositoryShaChanged`** — `{ from, to }` with `null` for a side that
  recorded no SHA.
- **`flagsChanged`** — flags flipped, or present in only one snapshot
  (`from`/`to` is `null` for the absent side).
- **`toolsAdded` / `toolsRemoved`** — identified by tool `name`.
- **`identical`** — true when no dimension differs.

Use it to correlate a behavior regression with the exact context delta
between a known-good run and a failing one.

## Export and future signing

- `exportSnapshot(id)` returns `normalizeSnapshotForExport(row)`: Convex
  system fields stripped, undefined fields dropped, all object keys sorted
  (deeply), `packages` sorted by slug then version, `tools` by name, and
  `featureFlags` by key. Serializing it is deterministic — the same logical
  snapshot always yields byte-identical JSON.
- `hashableEnvelope(snapshot)` (pure lib) wraps that normalized object in a
  versioned envelope (`schema: "cbom/v1"`) and returns the deterministic
  JSON string — the byte sequence a future signing step will hash.

## Flag note

Everything write-side is gated behind `context.cbom` (see
`convex/lib/flags.ts`, default **off**). Flip it on after the Epic 4 E2E
flow passes; per the Software Factory flag policy the gate is removed at
most two PRs later. Note the self-reference: because flags are
auto-captured, every snapshot will show `context.cbom: true` — a useful
sanity check that capture ran through the gated path.
