# Accounting recovery exact-head qualification

This directory records an isolated local-backend qualification of commit
`b019d4467b6cf2015b4767cc328af16ae554e043`.

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

The composed system qualification is retained in the scoped
[`capability-convergence-accounting-recovery-system-v52`](../capability-convergence-accounting-recovery-system-v52/automated-checks.json)
artifacts. It binds revision `92e81e9023a69b79f709456f5b6d7936d02e51b2`
to main `13ce5f0ef961e4e5f07dc78b43109231aa097270` and passes every
release-blocking stage: security and documentation checks, release hardening,
historical evidence integrity, composed system and failure behavior, full
repository tests, typecheck and skill lint, runtime-contract guard, production
build, orchestration startup smoke, and whitespace integrity. The golden eval
is publishable with all six blocking cases passed; its one synthetic economics
case remains advisory WARN because the zero-call fixture has no token count.

The v52 Phase 5 reproducibility check passes after updating its frozen runtime
binding. Its expected decision remains `NO_GO` for live route comparison. The
critical browser suite passes 15 of 15 checks.
