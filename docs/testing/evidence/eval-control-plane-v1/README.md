# Eval Control Plane V1 browser evidence

Captured 2026-09-02 from the V2 operator shell against an isolated local Convex
deployment seeded with `seedMissionControlDemo:run { force: true }`.

The shared `http://localhost:5199` process belonged to the main repository and
was intentionally left untouched. This worktree was verified at
`http://localhost:5201/v2/trace-inspector` with the same V2 flags and a
disposable backend. The URL is an execution detail; screenshots show the
production route and component behavior.

## Evidence

- [1440 dark](./1440-dark.png)
- [1440 light](./1440-light.png)
- [390 light](./390-light.png)
- [Verification summary](./browser-verification.json)

## Verified behavior

- Eval Health appears above the existing evaluator library.
- Latest receipt is `WARN`, publishable, and reports 6/6 blocking plus 0/1
  advisory cases.
- Missing token attribution remains an explicit `SYSTEM_UNDER_TEST` advisory
  failure; no value is fabricated.
- Baseline comparison reports zero regressions.
- One historical `INVALID` harness run remains visible in receipt history.
- Suite, revision, adapter, dataset, resolved configuration, seed, receipt, and
  baseline identities are visible.
- The page states that eval records have no execution or acceptance authority.
- Refresh reloads both runs from persisted Convex records.
- The receipt-history disclosure opens with keyboard focus and Enter.
- Axe WCAG 2 A/AA: zero violations and zero incomplete checks at 1440 dark and
  390 light.
- Browser console: Vite/React development notices only; zero page errors.

## Fixture counts

Demo seed reported one eval suite and two eval control runs. The suite contains
seven cases and one immutable active baseline.

## Qualification notes

- Full repository tests, typecheck/lint, production build, authorization
  ratchet, runtime-contract v34 guard, and documentation checks passed.
- The composed Factory scenario passed 74/74 tests; its resulting evidence
  produced a publishable `WARN` receipt with 6/6 blocking cases, 7/7 negative
  controls, zero regressions, and zero accounting/schema errors.
- The top-level release qualification currently stops before product tests on
  newly reported upstream advisories in `fast-uri`, `browserslist`, and `qs`.
  No risk acceptance or bypass was added by this work.
