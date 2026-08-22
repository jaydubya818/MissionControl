# Authority audit

The admission lifecycle adds identity and eligibility records only.

| Action | Authority after this change |
| --- | --- |
| Register an exact model route | Human `MANAGE_AUTOMATION`; creates disabled/unqualified identity only |
| Promote an exact model route | Human `APPROVE`; execution-only eligibility |
| Create a certified Sandbox Profile | Human `MANAGE_AUTOMATION`; remains qualification-only |
| Promote a Sandbox Profile | Human `APPROVE`; execution-only production-pilot eligibility |
| Register a current production workflow | Human `MANAGE_AUTOMATION`; no execution grant |
| Create a Factory Version | Human `MANAGE_AUTOMATION`; no execution grant |
| Report a worker binding | Canonical scoped worker/service flow; server verifies exact Factory Version and repository |
| Select a canary | Human only |
| Verify a candidate | Independent Verification Factory only; model/sandbox promotion grants no verdict |
| Accept a WorkOrder | Existing human-controlled `workOrders.accept` only |
| Publish a PR | Existing post-verification GitHub App boundary only |
| Merge/deploy | Not granted |

No new function approves Plans, alters WorkOrder scope, selects routes
automatically, verifies its own output, accepts, merges, deploys, or alters a
worker lease outside canonical flows. Attempt claim still checks the current
lease/session/generation and now additionally checks the exact Factory Version
attestation.

Guarded Auto remains disabled. No flag, policy, routing decision, WorkOrder, or
Attempt was changed in production.
