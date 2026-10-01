# Mission Control worktree consolidation

## Outcome and authority

The operator requested consolidation of local worktrees, frequent commits, and
end-to-end testing. Start from `origin/main` at
`3105f1ffd4a7a6a8c2a6be318b769e1950587e2a` in the assigned worktree.
Preserve the configured Git author. Keep the primary checkout's existing edits
and active runtime checkouts intact. Do not infer that every old branch belongs
on main. No Mission, WorkOrder, or Task identifier was supplied.

## Delivery sequence

1. Commit the reviewed BuilderIO skills from the previous task.
2. Inventory every registered worktree against freshly fetched main and live PR
   records, including dirty files, unpushed history, and nested worktrees.
3. Preserve Git refs and uncommitted work before any retirement. Classify exact
   merged heads separately from unreviewed or divergent candidates.
4. Review useful pending changes against current main and commit coherent fixes.
5. Run the existing factory qualification, inspect failures, and exercise the
   browser golden path where local services support it. Record the exact tested
   candidate and distinguish composed tests from live release evidence.
6. Publish a reviewable consolidation PR and document held worktrees. Retire only
   verified redundant, unused worktrees with recoverable content; never force
   removal or delete another checkout's uncommitted work.

## Verification

Use `pnpm install --frozen-lockfile`, the existing `qualify:factory` runner with a
new evidence slug, targeted regression checks for recovered changes, and browser
qualification. Do not overwrite historical evidence or claim production release
qualification from mocks. Preserve failure output and concrete blockers.

## Initial observations

Git lists 83 registrations: 67 existing directories and 16 stale entries. The
primary checkout is on `sofie/factory-skillz-and-dispatch`, not `main`, and has
uncommitted UI, orchestration, Convex, documentation, and scratch files. Current
remote main matches the initial assigned worktree's HEAD. The first preservation
commit is `d141b50`.

## Observed compatibility repair

An isolated copy of the Research Lab database could not deploy current main's
schema. A read-only SQLite census of current evidence rows found three retained
noncanonical failure results: `TIMED_OUT` (1), `BLOCKED_BY_DEPENDENCY` (1), and
`NOT_EVALUATED` (1). The same historical values occur in persisted check results.

Preserve these records with a storage-only status validator shared by evidence
and persisted verification checks. Keep canonical input validators and server
packet normalization unchanged. Only `PASS` evidence can satisfy coverage. Add
regression cases that reject each historical value in newly submitted packets.
Validate against a disposable source-database copy; never rewrite or erase the
original evidence to make deployment pass.
