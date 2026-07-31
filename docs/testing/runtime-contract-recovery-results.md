# Runtime contract recovery results

Date: 2026-07-31

Browser: agent-browser Chromium

Runtime: local Convex at `http://127.0.0.1:3210`

UI: `http://localhost:5199`

Branch: `codex/runtime-contract-gate-pr6`

## Result

PASS for the bounded client/backend compatibility contract.

Mission Control now confirms runtime compatibility before mounting ordinary
application query consumers. An exact client/backend contract match opens the
console normally. A mismatch fails closed with an accessible, theme-aware Reload
state that confirms persisted work is safe and shows both contract versions.

## Reproduction and classification

- **Status:** Confirmed environmental runtime bug, high operator impact.
- **Actual before:** old hot-reloaded tabs continued sending fields and IDs from
  another client contract. Strict Convex validation rejected those requests and
  the root boundary rendered a generic unexpected-error screen.
- **Examples:** `modelRoutingPolicies:simulate` received unknown field
  `complexity`; `modelRoutingPolicies:getActive` and `workflowRuns:list` received
  a task-table ID as `projectId`.
- **Expected:** incompatible clients stop before mounting normal consumers and
  explain the recovery action without weakening server validation.
- **Root cause:** client and backend deployments had no stable compatibility
  handshake, while multiple long-lived local tabs survived backend/schema changes.

## Implementation

- Added stable public query `runtimeCompatibility:get`.
- Added shared integer contract version `1`; exact equality is required.
- Added a startup gate inside `ConvexProvider` and above `App`.
- The gate uses a non-throwing probe with startup retries and ten-second polling,
  allowing it to tolerate deploy startup and detect later backend upgrades.
- Added a development-only simulated mismatch for deterministic browser evidence.
- Added a root error-boundary classifier for Convex argument validation and
  missing-function failures, covering tabs that predate the handshake.
- Preserved strict Convex validators.
- Bootstrapped the saved dark/light theme before the gate renders.

## Rollout finding

The first hook-based prototype reproduced an additional deployment edge case:
Vite became available several seconds before Convex published the new function,
and `runtimeCompatibility:get` temporarily returned `Could not find public
function`. The design was corrected before commit. The final probe catches this
condition, retries twice at one-second intervals, then shows a backend-waiting
recovery state while continuing automatic five-second retries. A successful
probe clears the temporary state without requiring an application restart.

The final Docs browser check also exposed two pre-existing duplicate page
registrations in the operator navigation. React reported duplicate keys for the
Task-to-Work-Order implementation and browser-results pages. The redundant
registrations were removed from the broad enhancement section, leaving the pages
in their dedicated Task and Work Order Delivery section. Configuration tests now
enforce unique page IDs and paths so this regression cannot silently return.

## Automated and browser evidence

- Runtime compatibility and error classification: PASS, 10 focused tests.
- Mission Control Docs configuration and uniqueness: PASS, 7 focused tests.
- Total focused assertions: 17 passed.
- Workspace TypeScript gate: PASS.
- Mission Control UI production build: PASS.
- Skill lint: PASS, 10 skills with zero errors and warnings.
- Compatible SFRL Tasks startup: PASS.
- Simulated client v0 / backend v1 mismatch: PASS; `App` did not mount.
- Reload recovery accessible name: PASS.
- Saved light theme applied before recovery render: PASS.
- Fresh browser page errors: 0.
- Fresh browser console: Vite and React development notices only.
- Runtime Contract Recovery page and deduplicated Docs navigation: PASS.
- Convex log after final browser journeys: no new runtime errors.
- Full repository suite: intentionally not run under the bounded-cost policy.

Evidence files are under `docs/testing/evidence/runtime-contract-recovery/`:

- `compatible-tasks.png`
- `reload-required.png`
- `reload-required-light.png`
- `docs-result-page.png`

## Follow-up recommendation

Add a CI contract-change detector that requires incrementing
`RUNTIME_CONTRACT_VERSION` when public Convex arguments or return contracts change.
This should be a separate bounded cycle; automatic semantic compatibility and
multi-version negotiation are not needed for the current product.

## Publication evidence

- Implementation commit: pending
- Pull request: pending
- CI run: pending
- Merge target: canonical `main`
