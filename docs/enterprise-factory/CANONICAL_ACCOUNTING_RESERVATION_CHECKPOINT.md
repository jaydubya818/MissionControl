# Canonical accounting reservation checkpoint

This is the first partial checkpoint under the accepted isolated-accounting request. It does not qualify executed settlement, native end-to-end execution, the authoritative enterprise gate, or autonomous recovery.

## Canonical authority

Native offline producer/verifier admission and delegated admission share `reserveOfflineAttemptBudget`. Enterprise reservations live on `workflowRuns.executionCostAuthorization`; immutable settlement facts live on that same Attempt. No accounting table or execution lifecycle was added. The persistent project marker permits only isolated deterministic engineering; the environment switch cannot remove its paid-execution fence.

Integer microusd admission reads the shared project Attempt range transactionally and enforces WorkOrder, Mission, project-policy and daily limits. Unresolved exposure survives expired authority, cancellation, terminal counters, restart and midnight. Unsupported historical liabilities prevent isolated adoption. Existing provider/inference send boundaries reject paid authority for marked projects, including previously created requests.

Duplicate delegation returns the same record. Native and delegated providers cannot claim each other's reservations. A reservation may be released only with transactionally proven non-dispatch; a sent delegation or historically claimed native Attempt remains exposed. Executed settlement is deliberately unavailable until an owner-approved tariff is cryptographically committed to the authenticated Result chain. Hardware cost is not asserted to be measured.

The marker has no public activation API. Disposable qualification setup is copied from scripts into a temporary local backend; no credentials, production data or production grants are required.

## Verification

- Focused affected suites: 91 tests passed across six files.
- Real Convex: 13 groups passed, including native/native, delegated/delegated and mixed races across different WorkOrders, daily contention, duplicate reservation/settlement, lost acknowledgment/restart, claim-vs-release, UNKNOWN retention, cross-owner/tenant denial, legacy-liability denial, provider substitution denial and expiry.
- Native race tests invoke the shared canonical admission helper. Full native dispatch/execution remains NOT_RUN in this checkpoint.
- Convex TypeScript: passed.
- Bedrock: exact accepted baseline source `23e0306e29e970efc31f614304f2abcdd071fbac`, 89 tests, 47 passed, 42 failed. Failure-set SHA-256 `9127e6d1cfb66cd6bc74e1887249e7122405d429820652f57d3247d418b10350`; introduced/resolved/changed reasons all zero. Baseline unchanged, not green.
- Independent security and architecture reviews: no unresolved blocker in this partial scope. Review findings caused fixes for legacy undercounting, existing paid send paths, selected-Attempt conversion, native/delegated substitution, preallocated verifier identity, and delegated expiry bounds.
- Authorization ratchet: no new unauthorized public functions. Public secret scan: no findings; rerun against staged files before commit.
- Fresh clone and hosted CI: required after this commit; no success claimed here.

## Preserved sources and boundaries

MissionControl accepted base: `a6065c1dd50e0ca7bd99adb33e31d9e876e7c9e8`.
MyFactory unchanged: `e498c31db8b749fa91b0544ecd1d1a661b971c2c`.
Local proposed FactoryVersion: `4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95`.

Production integration NOT_RUN; paid operations 0; external-alpha changes 0; executable production grants 0; publication DISABLED; deployment NOT_AUTHORIZED. Dependency PRs remain untouched. Overall canonical accounting is PARTIAL until authenticated executed settlement and full native qualification are complete.
