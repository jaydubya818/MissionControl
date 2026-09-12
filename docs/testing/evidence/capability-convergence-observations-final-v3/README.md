# Observation retention — integrated-main qualification

Implementation `8cfe354b31d2a36d5adfc9b4f71517c7cfd819f5` integrates main
`d0e3ba889df1956bb6bae96d588ee76bb1bfcdca` (documentation-only PR #191).
The program-record conflict preserves both qualification histories and pins the
inherited runtime v49 record to its original main. No application source changed.

All 19 composed gates, 2958 repository tests (11 inherited skips), Phase 5 and
15 critical browser checks pass on this integrated commit. All 87 backend source
hashes still match the retained 57-scenario real local backend proof. The prior
independent source reviews and cancellation follow-up remain GO. Economics
remains WARN, and all four Production targets, aliases and guards are unchanged.

The first integration attempt stopped at the authorization ratchet because its
base SHA was abbreviated. `initial-invalid-base.json` preserves that setup
failure. Repeating with the full verified main SHA passes every gate. Raw logs
remain under `/private/tmp/fdlc-observations-qualification/` (`-v3` and
`composed-v3-corrected.log`). Earlier source and CI records remain historical.

See [corrected source proof](../capability-convergence-observations-final-v2/README.md)
for cancellation regressions and the scope of the backend/browser evidence.
This is source qualification only. Provider execution, complete actual costs,
real human acceptance and Production activation remain unproven. Durable
accounting delivery and todo 063 remain in progress. Final PR-head CI, merge
and clean-main qualification are separate gates.
