# Observation retention — real local backend proof

The isolated Convex backend passes **57 scenarios**, preserving all 23 earlier
identity/dispatch checks and adding 34 observation/accounting checks. Actual
inference and provider handlers, admission dependencies and canonical shared
constructors execute against exact inference/provider table schemas and indexes.
Related table schemas, qualifications, prices and observations are synthetic.
The only permission substitution is the recorded fixture-project shim; admission
is not mocked. This does not prove full application authorization.

The proof covers retained v3 token/cost overruns, drift and arithmetic overflow;
cumulative observations and corrections; historical v2 replay; monotonic spending
fences; and composed Bedrock admission followed by late first settlement after
seven authority changes. Concurrent identical settlement is idempotent. Incorrect
historical scope, price, request ownership and stale corrections are rejected.
Corrected wrong-model money stays UNKNOWN while original receipt and allocation
history remain intact. New formula v2 comparisons exclude historical v1 results.
Projection and cohort overflow persist UNKNOWN aggregate money without losing
receipts or sample counts. Canonical correction tampering is rejected before
projection. Eight browser checks exercise the actual persisted query, including
UNKNOWN totals and a spending fence beside an older complete projection.

All 87 bundled source hashes stayed unchanged; the retained report's gateway,
shared and schema hashes match the candidate source. Both backend ports closed,
ephemeral keys were redacted, and original databases were unused. No provider
route was contacted. The earlier executable fixture run passed 35 scenarios
before a reused fixture claim ID was correctly rejected; only that fixture ID
changed before the passing run. The initial sandbox bind failure is also a
development limitation, not a qualification pass. The initial 52-scenario pass
predates the final review fixes. A later 57-scenario pass failed overall when the
new browser callback used a trailing slash in its backend URL. Correcting only
that harness URL produced the final passing combined proof; both initial
reports remain retained.

Separate root code generation passed at
`/private/tmp/fdlc-observation-codegen-BoyBl6`, with generated API files unchanged
and both ports closed. The harness scope document predates that separate root
run; its codegen caution records ownership, not the final qualification result.
Raw backend logs and database are retained under
`/private/tmp/fdlc-observation-backend-by6CH8`; selected reproducibility sources,
reports and normalized test logs are retained here.

Focused development proof passes 206 Convex tests, 19 shared tests and typecheck.
Root authority/data review corrected late correction fencing, wrong-route
correction pricing, UNKNOWN fallback, usage-only correction resurrection,
aggregate overflow and canonical correction validation before projection.
Independent review is GO for the bounded source scope, bound to exact hashes
in `independent-review.json`.
Bridge-call recovery passes 40 targeted tests but its Docker consumer still
discards the bounded payload; durable integrated delivery remains pending.
This evidence grants no live execution, actual billing, human acceptance or
Production release. Full committed-head and clean-main gates remain separate.
