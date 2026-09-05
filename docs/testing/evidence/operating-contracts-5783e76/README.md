# Operating-contract integration qualification

This package records local System Factory qualification for documentation commit
`5783e76779e201db5701c974e240a905362bf2ce`, based on
`0d1a0908cce380d815069ce0a59e1604d2f26ece`.

```sh
MC_QUALIFICATION_BASE_SHA=0d1a0908cce380d815069ce0a59e1604d2f26ece \
MC_IMPLEMENTATION_SHA=5783e76779e201db5701c974e240a905362bf2ce \
MC_QUALIFICATION_EVIDENCE_SLUG=operating-contracts-5783e76 \
pnpm run qualify:factory:v2
```

Result: **PASS, 19/19 gates**, completed 2026-09-05. The
[automated checks](./automated-checks.json) include full repository tests,
Convex, orchestration, workflow contracts, lint/typecheck, security,
runtime-contract consistency, build, startup smoke and historical evidence
immutability. The [scenario evidence](./scenario-evidence.json) feeds the
[evaluation receipt](./eval-receipt.json).

The evaluation receipt is publishable with all six blocking cases passing.
Its **WARN** retains the existing advisory economics failure; incomplete costs
remain visible and are not converted into a passing economics claim.

The local broker exchange is retained in
[its revision-specific run](../governed-mcp-phase3/runs/5783e76779e2-2026-09-05T20-20-04-791Z/broker-scenario.json).
It exercises the existing local read-only qualification fixture, with no real
model call, production service admission, write-tool authority or deployment.

A later documentation-only correction fixes the map's Factory Learning source
link to `convex/factory/learning.ts`; documentation consistency, local link
resolution and whitespace checks were rerun. No executable source changed
after this qualification. These results do not upgrade capability maturity or
replace historical qualification evidence.
