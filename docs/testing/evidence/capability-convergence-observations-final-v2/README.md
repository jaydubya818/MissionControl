# Observation retention — corrected local qualification

Implementation `ba130ce5f0f1de7b3ed1fe6ef3bcf76d54859de9` on main base
`8bf19fcb7e46f4b80a862054d22fbd7ca7ed436f` passes all 19 composed gates,
2958 repository tests (11 inherited skips), Phase 5 and 15 critical browser
checks. Economics remains WARN. Raw logs remain under
`/private/tmp/fdlc-observations-qualification/` with the `-v2` suffix.

The first PR run exposed an existing cancellation defect. The repair checks
cancellation before artifact materialization and dispatch, then finishes
termination of the owned process group even after its leader exits. Original
time bounds and all eleven original tests remain unchanged. Two new regressions
failed before the repair; all thirteen pass afterward. Independent review is GO:
all cancellation regressions passed, while two unrelated socket-listening tests
were blocked by that reviewer's sandbox. The full permitted-environment suite
passes. The original CI failure and development proof remain historical in
[CI repair evidence](../capability-convergence-observations-ci-repair/development-proof.json).

All 87 bundled backend source hashes still match the
[57-scenario real local backend proof](../capability-convergence-observations-backend/README.md).
Code generation passed unchanged; thirteen inspector component tests, ten
component browser checks and eight persisted-record browser checks pass. The
cancellation edit does not change those ledger or inspector source files.
Independent architecture, security, data, simplicity and documentation reviews
remain GO, with the cancellation follow-up recorded in `local-gates.json`.

This qualifies source using synthetic inputs and the stated permission shim.
It does not establish full application authorization, actual billing, provider
execution, real human acceptance or Production activation. All four Production
targets, aliases and guards remain unchanged. Durable accounting delivery and
todo 063 remain in progress. Exact PR-head CI, guarded merge and clean-main
qualification are separate gates.
