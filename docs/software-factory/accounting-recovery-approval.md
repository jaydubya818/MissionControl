# Durable accounting recovery — approved source checkpoint

The Product Owner specifically approved the three reviewed source changes below
on 2026-09-06. They complete the recovery path for usage that was already
observed, including when execution has ended or an accounting reply was lost.
All three are applied. This checkpoint did not make provider calls, start a
listening service, or change Production.

| Applied source change | Result | Review artifact |
| --- | --- | --- |
| Settlement error responses and decoder | Existing authoritative conflicts become `BLOCKED_REVIEW`; recognized authentication/scope configuration failures become `SUSPENDED`; unknown failures remain pending. Original accounting calculations, successful returns, authority checks and record writes are preserved. | [Exact patch](../testing/evidence/capability-convergence-accounting-recovery-development/settlement-errors-review-v2.patch) |
| Independent recovery startup | An explicitly configured journal can drain independently of execution flags. Invalid optional adapter, registry or registration configuration disables Factory execution and retains a safe diagnostic. Existing server status and shutdown include recovery. | [Corrected diff](../testing/evidence/capability-convergence-accounting-recovery-development/startup-review-v2.diff) |
| Acknowledgment diagnostics | A durably acknowledged observation is labeled `ACKNOWLEDGED` in the local diagnostic reference. Duplicate or incident acknowledgments still refuse execution output. | [Four-line patch](../testing/evidence/capability-convergence-accounting-recovery-development/acknowledgment-diagnostic-review.patch) |

The startup change is larger because it encloses the existing Factory bootstrap in
one failure boundary. This covers registry construction and registration parsing,
which could otherwise throw before accounting starts. Its disabled fallback has
no executor and cannot start work. The server's existing start path remains the
only start path; the patch does not start a service during application.

Applied-source evidence: 186 focused orchestration tests pass, with two existing
conditional daemon checks skipped; 196 backend and authority tests pass with no
skips; orchestration typecheck and `git diff --check` pass. Both formerly blocked
regressions now run without filters and pass. An actual startup import/status
regression reproduced three failures for missing provider path, blank provider
path, and missing call authorization, then passed all five startup cases after
the correction. The four filesystem/lifecycle review findings remain
independently reproduced as fixed. These checks use local synthetic process and
daemon adapters and make no provider call.

The final startup implementation also fails closed when explicit provider
enablement is incomplete: it records a bounded configuration diagnostic,
disables the complete Factory execution bootstrap, and leaves accounting
recovery independently available. Its reviewed source hashes and the three
approved patch hashes are retained in the final recovery evidence. Earlier red
proof remains historical evidence of the corrected defects.

The applied source preserves runtime contract v50: the runtime-contract guard
detects no public Convex validator change across 970 functions. Actual signed
delivery and restart behavior, parent-main integration, full qualification, CI,
guarded merge, clean-main proof, and release remain required after this source
checkpoint.

The preceding observation slice is already merged in
[PR #190](https://github.com/jaydubya818/MissionControl/pull/190) at `44f240c`.
[Clean-main proof](../testing/evidence/capability-convergence-observations-postmerge/README.md)
passes 19 gates, 2958 tests and 15 browser checks; all four Production targets and
deployment guards are unchanged.

The Product Owner's explicit approval superseded the earlier automated approval
boundary for these exact accounting error semantics, recovery startup, and
acknowledgment-state changes.
