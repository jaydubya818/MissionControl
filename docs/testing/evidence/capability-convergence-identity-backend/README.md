# Persisted inference identity qualification

Scope: exact production gateway and shared source on a disposable real Convex
backend, exact inference schemas/indexes, synthetic related records and a fixture
authorization shim. No external provider, real billing, full-app authorization,
real human acceptance or Production qualification is claimed.

The final report passes 13 scenarios: exact intent replay, eight concurrent
claims yielding one claim, failure/fallback/receipt identities, synthetic
reconciliation replay, synthetic accepted projection with NO_GO comparison,
immutable source snapshots, row-drift and pricing-context replay denial, cohort
isolation, missing receipt snapshots, missing/corrupt intent snapshots and late
receipts after lease expiry. Both local ports are closed; original databases
and credentials were not used.

The initial real-backend failure revealed that explicit undefined fields were
hashed but omitted in storage. The round-trip regression failed 11 of 15 tests
before v2 snapshots were introduced. All 42 focused tests now pass, including
hash-valid v1 rejection. The private test helper uses a `.fixture.ts` filename so
Convex excludes it from deployable modules.

Root code generation passed using the separate empty loopback backend recorded
in `codegen-run-with-fixture-deploy-conflict.json`; generated files were unchanged.
A subsequent fixture deployment on that same backend encountered an OCC conflict.
The final 13-scenario run used a fresh fixture-only backend and passed. This keeps
the full-app code-generation proof separate from synthetic schema deployment.

The report's branch HEAD predates the uncommitted storage correction. Its exact
gateway, shared-source and schema SHA-256 values identify the exercised bytes;
final committed-source qualification must bind those hashes before merge.
The independent reviewers reviewed architecture/security/data integrity and
simplicity/documentation/agent parity. The primary task finished and ran the
backend harness after its preparatory reviewer became unavailable.

Raw local runs are retained under `/private/tmp/fdlc-identity-backend-*`. The
checked-in harness uses the same loopback guard and disposable configuration.
The fixed clock in the separate Phase 5 JSON is fixture time, not execution time.
Actual backend execution times appear in `report.json`.
