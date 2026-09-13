# Relay first factory run

## Session pickup

- [x] Locate the prior trail. A local transcript under Claude Code's per-project transcripts directory at `~/.claude/projects/<encoded-cwd>/*.jsonl` (where `<encoded-cwd>` is the workspace cwd with `/` → `-`; do not glob across other directories under `~/.claude/projects/`, that crosses workspace boundaries and reads private chats from unrelated projects), a cloud-agent URL, or a pushed branch. Read the metadata overview and last messages first, then scan back for the decision points. Parse a long transcript in a subagent and keep the reduced timeline in the main thread (the **principle-guard-the-context-window** skill).
- [x] Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open todos, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
- [x] Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass means you're treating the trail as untrustworthy when it's authoritative.
- [x] Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here; the routed playbook owns the rest.
- [ ] Verify the inherited claims against the original goal on the real artifact (the **principle-prove-it-works** skill). A passing prior self-report is not the proof.

## Autonomous run

- [x] State the exit condition as a checkable predicate before the first iteration (tests green, repro fixed, all N PRs merged, pixel-diff zero).
- [x] Pick the wake mechanism using Claude Code's `loop` skill (built-in). An event to watch (CI, a merge, a ref advancing) gets a watcher subagent that wakes you on the event, with a long time-based heartbeat as fallback. No event gets a fixed-interval heartbeat sized to when the result is worth re-checking.
- [ ] Each iteration makes the smallest change the evidence justifies, verifies it against the predicate, commits if it advanced, discards changes that didn't help. Belt-and-suspenders that "might help" gets reverted, not left to ride.
- [ ] Mid-run discoveries are yours. Address broken skills, related bugs, flaky verifiers, review noise, tooling failures, orphaned follow-ups, and fixable drift yourself via poteto-mode. Put an out-of-band fix in its own PR only when the standing task authorizes that scope and publication. Otherwise log it as follow-up work and return to the predicate. Surface only irreversible actions, genuine product or preference calls no experiment can settle, or a real dead end. Keep the predicate as the main drive, and return to it after each side fix.
- [ ] Checkpoint every iteration via the **show-me-your-work** skill, a row for what changed and whether the predicate moved.
- [ ] Stop when the predicate is met. A plateau is not a stop, so keep going and pivot your approach to push past it. Surface a genuine dead end rather than spinning, and never relax the predicate to declare victory.

## Run-specific work

- [x] Inventory every live project, mission, WorkOrder, Task, Attempt, approval, dependency, factory binding, and worker lease.
- [x] Confirm the Relay project and map all work orders in dependency order.
- [x] Reconcile and restart the local Convex, orchestration worker, and demo UI services without overwriting factory-owned work.
- [x] Resume WO-001 verification from its latest revised contract.
- [x] Reject and cancel the revision-3 candidate that violated the exact `pnpm@9.0.0` pin.
- [x] Submit WO-001 revision 4 with executable package-manager and lockfile gates.
- [x] Obtain Product Owner approval for WO-001 revision 4 before redispatch.
- [x] Materialize a revision-4-scoped Factory execution Task and dispatch Attempt `s18z7yrf`.
- [x] Diagnose revision-4 candidate `3e3fcc4` verifier-induced `next-env.d.ts` drift and dispatch clean-build recovery Attempt `3nfhvjpf`.
- [x] Reconcile hung recovery Attempt `3nfhvjpf` to a terminal state without accepting a candidate.
- [x] Implement the Codex executor exit/stdio lifecycle hardening and a request-scoped, credential-safe model-catalog compatibility boundary, with focused regression coverage.
- [x] Reopen WO-001, reissue the exact revision-4 approval, and retry canceled Attempt `3nfhvjpf` on existing Task `R-017` with a fresh branch/worktree as run `ojwqn3k9`.
- [x] Qualify the lifecycle and model-catalog hardening by carrying canonical retry `ojwqn3k9` through candidate capture and exact revision-4 verification Attempt `12n3z309`; both Attempts reached a terminal state without the prior executor hang or shared-cache parse failure.
- [x] Diagnose terminal revision-4 candidate `394414750427c9ea12fe51e46a0b17007691209f`: seven of nine required checks passed; `spec:frozen-offline-install` was denied by the verifier allowlist and `spec:health` used an invalid pnpm/Next.js argument boundary while discarding child stderr.
- [ ] Verify the FAC-026 dependency-preparation and FAC-027 exact-corepack-allowlist factory fixes with focused tests and one live verifier run.
- [ ] Review, create, and explicitly approve WO-001 revision 5 before any retry; the draft changes only `spec:health` and remains non-operative.
- [ ] Obtain Product Owner approval for Relay Mission Plan revision 2 and the reviewed future repository-scope union before dispatching WO-002 through WO-015.
- [ ] Dispatch eligible work through the factory and monitor every attempt to a terminal state.
- [ ] Turn factory or product defects into bounded corrective work orders and run them through the factory.
- [ ] Review the shipped project in the browser and create bounded UI and UX enhancement work orders with screenshots and acceptance criteria.
- [ ] Maintain the living Relay factory findings register and disposition every item as fixed, governed follow-up, accepted tradeoff, or deferred.
- [ ] Verify the final application, factory evidence chain, approval queues, worker health, and accepted WorkOrder count.

## Exit condition

WO-001 and every work order in the Relay mission are accepted or completed with current verification evidence. No approval, decision, failed-attempt, or blocked dependency remains. The application passes its required checks and browser review. The factory worker and Mission Control UI are healthy after reconciliation.
