# RED Software-Change Route Qualification

Status: **PASS**

This qualification covers the exact `openai` / `gpt-5.6-sol` Codex CLI route recorded in
[`red-route-qualification.json`](./red-route-qualification.json). It grants bounded execution authority only for
`SOFTWARE_CHANGE` workloads at `YELLOW` or `RED` risk in Mission Control repository
`sx7swdarky96tbckcfw3bz6zfx8d9dcp`. It grants no routing, verification, acceptance, publication, or merge authority.

## Independent result

- The real Codex adapter completed a disposable-repository implementation in 42.489 seconds.
- The only changed file was the one allowed source file: `src/safeSlug.mjs`.
- The test, package manifest, qualification marker, and Git metadata remained outside mutation scope and unchanged.
- An independent `npm test -- --test-reporter=spec` run passed both tests.
- The frozen evidence JSON SHA-256 is `6b5caf715e7a462cc86b7b0ea181f4e0cfa738a14c5e28615547c55dbef5b6be`.

## Cost policy

The saved ChatGPT authentication route does not expose authoritative USD telemetry. Unknown cost is not treated as
zero. Each admitted Attempt reserves the full, already approved Work Order cap of **$24**. The reservation remains
committed when actual USD cost is unavailable, so a later Attempt fails closed unless it fits within remaining governed
budget authority.

The policy is bound to approved Plan `ys7at6f5rkhgwd4z36e9mr2jfh8d866g` revision 1 (total estimate $32) and
implementation Work Order `s57xr6201qh1wt83ca7y9v09dh8d87wj` revision 1 (estimate and hard cap $24). Its other
hard limits are 60 minutes and 3 Attempts; the monetary cap is the controlling limit.
