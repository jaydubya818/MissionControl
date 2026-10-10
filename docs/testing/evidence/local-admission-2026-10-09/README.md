# Local admission qualification — October 9, 2026

Implementation: `69fbe37`. Status: local code applied; full live qualification incomplete.

The backend was exported before application. The export confirmed the exact
Research Lab project and tenant. Only local backend `127.0.0.1:3214` was updated.
See `local-application.json`. No profile was registered or promoted, no new
Attempt or reservation was created, and no paid inference was made.

## Verification

- Convex: 1,501 tests passed.
- Orchestration: 813 passed, 15 skipped in the default suite.
- Focused canonical admission, profile selection and Docker admission: 35 passed.
- Both Convex and orchestration TypeScript checks passed.
- Four opt-in full-repository Docker cases passed separately: success, workload
  failure, cancellation and timeout. Each cleanup receipt confirms resource absence.

The archived lifecycle test used the full tracked producer tree at commit
`5308727463ec737589bf8072ee9f5de0af1bba7a`, tree
`d863864bfd8838e4b5ea3c837ef3a0958422613c`, with 4,155 files / 218,747,055 bytes.
The real Docker adapter and selected local profile ran synthetic provider
responses. Success and failure each used two synthetic exchanges; cancellation
and timeout used zero. These are offline fixtures, not successful live Attempts.
Request bodies were omitted from the sanitized receipts. The temporary test is
archived as text because it depends on the local prepared repository bundle.

## Admission boundaries

The server checks its cloud/site URLs, exact project and tenant, pinned image,
and evidence scope at registration, promotion and eligibility. Scope validity
is at most 24 hours, with production and publication explicitly denied. Standard
profile behavior remains unchanged. Existing operator permission and evidence
validation remain required. Fixture hashes must never become admission records.

## Remaining gates

The approved AWS SSO profile expired. `readonly-route-check.json` records the
failed identity preflight; no route or CountTokens claim was updated. Restore
it with `aws sso login --profile fdlc-qualification`, then run:

```sh
node scripts/research-lab-bedrock-readonly-check.mjs /private/tmp/mc-readonly-route-refreshed
```

The script verifies the approved account and exact inference profile before
CountTokens, without Converse or InvokeModel. A different endpoint is not an
authorized substitute if this route does not support counting.

The rendered AWS table confirms $3.30 input / $16.50 output per million tokens
for Sonnet 4.6 in the selected US regional section; see `pricing-observation.json`.
This observation does not activate a price record. The conservative four-call
producer proposal remains $13.48, zero retries, with a separate verifier gate.
The old $4.49 hold stays retained; cost reconciliation is incomplete. The prior
TURN_LIMIT failure remains a failure, its credential revoked and worker stopped.

Before paid activation: complete exact-route verification, obtain scope-bound
admission evidence and approval, refresh WorkOrder revision/price validity,
and obtain explicit budget authority. No shared or production deployment is
approved by these results.
