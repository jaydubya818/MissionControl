# Current-main contract drift under the no-merge hold

Observed 2026-09-05, during offline Bedrock qualification. The ongoing uncommitted
integration is still bound to `0d1a0908cce380d815069ce0a59e1604d2f26ece` (v41).
`origin/main` has advanced to `aa8c12b1d4907589b71cef3cb421ef2a2c380676`
(v42, governed Context7 reads and local candidate recovery).

The default runtime contract check now fails. Compared with current main, the
worktree lacks `factory/attempts:recoverLocalCandidate` and
`factory/governedMcp:registerContext7QueryDocs`, while introducing the seven
previously planned public additions. Both lines consumed v42. A version bump alone
would hide missing upstream behavior and is not a correct fix.

The explicit preserved-baseline check passes v41 → v42. This is valid evidence for
that baseline only. It is not current-main or post-merge qualification. Do not
change the guard default or omit this failure from the report.

Current prohibition: do not merge or publish. No upstream integration was performed.
Required later integration: preserve current-main implementation and dependencies
for both public operations, reconcile the seven additions atomically, record the
next version against the then-current main before editing, generate authoritative
Convex types, and rerun default guard plus full System Qualification on the exact
result. Changes span execution worker, governed MCP, candidate verification,
backend schema and contracts; copying two API declarations is insufficient.

This is an additional integration gate before readiness or merge. It does not
prevent preparing or, when authorized, performing read-only AWS identity/profile
inspection. AWS identity is not claimed to be the sole full-qualification blocker.
