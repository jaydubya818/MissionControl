# Accounting recovery exact-head qualification

This directory records an isolated local-backend qualification of commit
`4def894fe1555cfe3e4fcc3faba87268f1f08d12`.

The proof passed 74 scenarios: 57 retained inference observation and accounting
scenarios, 15 signed settlement and recovery scenarios, and two real process
kill/restart scenarios. The signed cases execute the production
`createAccountingSubmit` client and settlement action against a disposable
loopback Convex backend. The client bundle uses one Convex package identity, so
the strict typed `PENDING`, `SUSPENDED`, and `BLOCKED_REVIEW` classifications are
exercised through the real transport boundary.

All data and signing values were synthetic. No provider or Production endpoint
was contacted. Both backend ports closed, the disposable database and storage
were removed, retained artifacts contain no generated secret, and bound source
files remained unchanged.

This is recovery and accounting evidence. It does not establish live provider
qualification, real billing, or human acceptance.

The composed system qualification is retained in the canonical
[`system-factory-e2e-v2`](../system-factory-e2e-v2/automated-checks.json)
artifacts. It binds revision `4def894fe1555cfe3e4fcc3faba87268f1f08d12`
to main `ccacc5a9284e4141379c3a9b24304053749fd9f7` and passes every
release-blocking stage: security and documentation checks, release hardening,
historical evidence integrity, composed system and failure behavior, full
repository tests, typecheck and skill lint, runtime-contract guard, production
build, orchestration startup smoke, and whitespace integrity. The golden eval
is publishable with all six blocking cases passed; its one synthetic economics
case remains advisory WARN because the zero-call fixture has no token count.

The v52 Phase 5 reproducibility check passes after updating its frozen runtime
binding. Its expected decision remains `NO_GO` for live route comparison. The
critical browser suite passes 15 of 15 checks.
