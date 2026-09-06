# Execution qualification observations — no pilot execution

Read-only observations from the original configured Convex instance, plus
local installed-runtime metadata. See docs/software-factory/fdlc-workorder-01-preflight.md
for per-gate interpretation and the explicit NO_GO recommendation.

Backend startup restored the original instance at 127.0.0.1:3214; no alternate
instance, seed, code deployment or execution worker. Initial offline condition
was absent listener; previous shutdown cause remains UNKNOWN. Runtime contract
40 is an API compatibility observation, not a deployed source-SHA attestation.

factory.json: actual retained definition, versions=[] and assessments=[].
composition-options.json: no exact admissible routes, code scopes or execution
profiles. Approved agent records are not a qualified Factory or verifier.
host-query.json and verifiers.json: empty scoped lists. structure.json is
filtered to the proposed repository; no other repository data needed.
runtime-attestation.json: observed native executable does not match the
proposed frozen artifact. Only codex --version and local file hashing used;
no model call or sandbox execution was performed against this different runtime.

Earlier rehearsals and failure records are untouched. The four-class overall
pilot requirement is preserved; documentation WO1 is permitted by Product Owner
decision, subject to independent execution qualification and human approval.
No real WorkOrder ID/current Plan/Factory tuple exists, so no authoritative
WorkOrder-specific readiness snapshot is issued or fabricated.

Control-plane health passes; execution, Factory, route, host, verifier, budget
and containment remain separately BLOCKED. Unrelated credentials were not read
or injected. Unknown cost is not zero. No qualification bypass, pilot dispatch,
publication, merge, release, infrastructure code change or Phase 2 work.
