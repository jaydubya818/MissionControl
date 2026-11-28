# Qualification receipts must describe the whole run

The unattended factory review found that `system-factory-e2e-qualification.mjs`
reported `PASS` after each successful check. If the process stopped before the
remaining checks, its last receipt still had `PASS` and a completion timestamp.

The receipt represents one ordered qualification run. Its result is `RUNNING`
until execution finishes, `FAIL` after a failed metadata lookup or command, and
`PASS` only after every planned command completes successfully in order.
`completedAt` is null while the run is incomplete. The receipt includes the
expected and completed check counts so partial execution is visible.
The updated schema identifier is `system-factory-e2e-automated-checks/v3`.
Historical v2 evidence remains unchanged.

Write the initial receipt before Git metadata lookup or any qualification
command, including when replacing a previous passing run. Source identifiers
and the expected check count remain null until setup resolves them. Replace the
receipt atomically so interruption during a
write leaves the previous complete JSON document. An uncatchable interruption
may leave `RUNNING`; readers must never interpret that result as qualification.
Receipt persistence failures exit unsuccessfully and may leave the last
readable incomplete receipt.

The regression suite launches the actual runner in disposable directories. A
test preload substitutes command outcomes and injects process interruption,
command failure, and receipt-write failure. It checks the retained JSON files.
These tests qualify receipt reporting only. They do not run factory workloads,
invoke a model, or establish live unattended application delivery.

Run the focused suite with `pnpm exec vitest run scripts/system-factory-e2e-qualification.test.mjs`.
The existing `test:integration` script discovers the same suite.

## Acceptance criteria

- Every pre-command observation has a valid `RUNNING` receipt and null completion.
- Interrupting a partially successful run cannot leave a passing receipt.
- A new run clears the previous result before its first qualification command.
- Setup failure records `FAIL` without claiming unresolved source identity.
- An ordinary failure, spawn error, signal termination, or thrown command error fails the run.
- Only a complete ordered set of successful commands produces `PASS`.
- If receipt replacement fails, the runner exits unsuccessfully and the previous JSON stays readable.

## Design choice

Keep the run state and receipt writer inside the existing single-caller script.
An extracted reporting service would add an interface without changing ownership.
The receipt uses an explicit terminal state and validates successful completion
against the existing `steps` array. No authority or runtime admission policy changes.

## Verification on November 26, 2026

The test against unchanged base `b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`
killed the runner with `SIGKILL` during its second qualification command.
The retained receipt contained `PASS` after only its first command completed.
The decisive assertion was `PASS !== RUNNING`.

Independent review then found that failed Git metadata lookup could leave the
previous run's `PASS`. The new setup regression reproduced `PASS !== FAIL`.
Initialization now invalidates the earlier receipt before looking up metadata.

After the change, the focused suite passes 13 tests. It covers interrupted
execution, previous-run replacement, full completion, the optional historical
gate, four command failure modes, and failures during intermediate and final
atomic replacement. Three cases exercise failed or interrupted metadata lookup.
`git diff --check` also passes.

The full factory qualification and live provider execution were not run by this
reporting regression suite. No commit, deployment, or release was performed.
