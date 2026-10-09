# Authenticated delegated settlement checkpoint

This checkpoint extends reservation source `0e611bc06eb06da91d5e5d2a7a7d2b515d8b458f` with actual deterministic delegated settlement. The prior checkpoint passed hosted CI: https://github.com/jaydubya818/MissionControl/actions/runs/38000444369.

The owner-approved engineering tariff commits the complete original delegation identity into a tariff digest, then the execution manifest, then the final delegation digest covered by MyFactory's existing V3 signature. Admission freezes that tariff on the canonical Attempt. Settlement verifies the original binding and admission time, requires authenticated terminal cleanup, and writes an immutable receipt on the same Attempt. It records zero billable charge under DETERMINISTIC_ENGINEERING_ZERO_CHARGE; resource cost remains UNMEASURED. Neither zero paid calls nor later Plan edits establish the tariff.

Actual local execution qualified six signed terminal journeys: normal completion, cancellation, startup failure, late completion after revocation/revision changes, expired authority, and a completed execution without an approved tariff. The last case retains its full 80 microusd exposure even after a tariff is added to the Plan. Duplicate settlement is idempotent; changed or missing tariff proof rejects. No Result was substituted for execution.

Validation: 214 shared tests, 10 focused accounting tests, 26 adapter tests, Convex and orchestration TypeScript; 13 reservation database groups and 14 composed settlement groups against disposable Convex/PostgreSQL and real Docker producer/verifier execution. Exact Bedrock baseline remains 47 passed/42 failed of 89, with no introduced, resolved or changed-cause failures. Public authorization ratchet has no new unauthorized function. Independent security and architecture review are retained in the workspace evidence directory.

MyFactory remains unchanged at `e498c31db8b749fa91b0544ecd1d1a661b971c2c`; local FactoryVersion remains `4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95`. Native coverage still qualifies its canonical shared budget helper and unused settlement, not a full native execution journey. The enterprise gate remains SHADOW. Autonomous recovery remains unqualified. These remaining stages must not be reported as complete.

Production integration NOT_RUN; paid operations 0; external-alpha changes 0; executable production grants 0; publication DISABLED; deployment NOT_AUTHORIZED. No dependency PR or frozen external-alpha release changed.
