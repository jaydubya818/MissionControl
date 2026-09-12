# Profile and canonical Attempt closure checklist

Baseline main: 0d1a0908cce380d815069ce0a59e1604d2f26ece. Runtime contract: 41.
Prior bridge evidence: invocation-backend-admission-68770ed; no prior admission.

- [ ] Extend executionProfile.ts v1-only schema/backend predicates with an additive versioned offline execution composition, preserving Phase3 toolGrant semantics.
- [ ] Extend registerVersion/qualify/revoke through existing factoryExecutionProfiles records. Preserve exact immutable configuration, qualification expiry/currentness and revocation. Offline execution must have explicit no-inference/deny-egress/zero-provider-budget constraints; no fictitious model route.
- [ ] Extend harnessCapabilities, adapter manifests/registry and runtime/backend validation with exact identity, rather than falling through to either legacy backend.
- [ ] Bind the exact offline isolation profile and qualification via existing sandbox/profile records; reject material substitutions and stale receipts.
- [ ] Extend schema validators, canonical Factory Version/profile projections, WorkOrder readiness/freeze and WorkflowRun Attempt linkage atomically.
- [ ] Extend canonical claim/renew/report currentness across Plan, WorkOrder, Task, Factory Version, profile and components; retain rejected late evidence without making it authoritative.
- [ ] Add explicit worker dispatch before publication-checkpoint/host-worktree fallthrough, using the admitted bridge and canonical lease.
- [ ] Bind result to existing verifier-compatible subject and preserve independent acceptance/publication gates.
- [ ] Qualify canonical offline dispatch, duplicate dispatch/completion, cancellation, timeout, stale lease/profile/spine and material identity substitutions.
- [ ] Exercise actual local operator/browser persistence at desktop and 390px; surface exact readiness blockers and identities.
- [ ] Run authoritative local Convex codegen and increment public runtime contract once if required; default/current-main baseline guards.
- [ ] Run full tests/lint/build/typecheck/security/docs/System Qualification and focused independent security, data-integrity, architecture and simplicity reviews; fix findings.
- [ ] Commit/push dedicated PR, wait for CI and resolve comments. Preserve PR165 Draft/NO-GO for its broader experiment.
- [ ] Verify merge cannot trigger unauthorized production deployment, merge after required GO checks, then fresh-main post-merge full/affected qualification and canonical offline proof.
- [ ] Freeze completion evidence with baseline/implementation/merge/final identities and remaining independent external-execution gates.

No model/provider calls, production mutation/deployment, paid service, cloud credential creation or weaker trust gate is authorized. Engineering failures are implementation work to resolve, not stop conditions.
