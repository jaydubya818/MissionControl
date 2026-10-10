# Composed qualification contract

This branch composes MissionControl dependency `c0ba5a97087a50feb36bb1a788f9cf065890e328` with exact-owner isolation baseline `6761c0c1c38be24907536f118e214fc962eea231`. The original commits remain ancestors, without rewriting either. MyEve remains `9f1c83b0989abaedc168b740ddcf57582cf15a92`; MyFactory remains `e498c31db8b749fa91b0544ecd1d1a661b971c2c`.

## Canonical authority

The signed Sofie action can invoke only its exact internal command transaction. That transaction revalidates signature, expiry, connection, active owner/member/team, current role scope, proposal digest/authorization and the frozen Mission owner. Mission transfer denies inspection, repeated submission and readback. It cannot approve a Plan, dispatch work, accept results, settle accounting, grant collaborators or schedule follow-up authority.

The canonical database boundary filters application reads through the same Mission lineage as human reads. Application writes are limited to the exact command receipt, same-connection proposals, and one zero-budget DRAFT plus its creation event for an authorized proposal. Human connect/decision handlers use the ordinary scoped boundary. Pre-Mission connections and proposals require their exact owner; organization membership does not authorize them.

Authorization decisions and parsed references are cached only inside one transaction. Only complete root READ traversals are cached; recursive partial traversals are never reused. Every scoped write invalidates row and authorization decisions before and after database I/O. Reads capture their generation before fetching rows and discard results after any intervening write. Scoped writes are serialized so existing Promise.all batches revalidate each sibling without reusing stale authority. A permanent real-database probe warms a descendant, transfers its Mission in the same transaction and proves the descendant becomes inaccessible. Cycles containing a foreign Mission remain inaccessible regardless of read order.

## Running the composed fixture

Use `node scripts/enterprise-golden-journey/run-composed.mjs <fresh-output-directory>` with these explicit inputs:

- `MC_COMPOSED_MYEVE_ROOT`: clean exact MyEve dependency checkout, installed locked root and app dependencies.
- `MC_LOCAL_MYFACTORY_ROOT`: clean exact MyFactory dependency checkout, installed locked dependencies.
- `MYFACTORY_FIXTURE_GIT`: repository containing the locked complete synthetic fixture ancestry.
- `MC_GOLDEN_RUNTIME_BUILD`: exact retained native runtime build from the source lock.
- `MC_GOLDEN_DOCKER`: absolute Docker executable.
- `MC_COMPATIBILITY_CONVEX_BINARY`: retained local Convex backend.
- `MC_COMPATIBILITY_PORT`: an unused owned port, with the following port also free.

The browser fixture owns loopback port 3077; its disposable PostgreSQL fixture owns 55529. Run these fixtures sequentially. Docker must be on PATH for the existing MyEve Result fixture. No provider credentials are loaded into the browser server. The model fixture is deterministic and local transport rejects external network requests.

The wrapper verifies source identities, creates an isolated MyEve copy and records exact overlay digests. Overlays replace only the test model, adapt the local PostgreSQL transport, and update the dependency's owner-transfer fault injection to `ownerOperatorId`. Original dependency checkouts remain unchanged. The real Eve compiler, session authentication, primary agent tool, ActionGateway, PostgreSQL, React client and signed MissionControl Result projection run.

## Honest qualification boundaries

The existing frontends have no control wired to `sofieEnterprise:decide` / `AUTHORIZE_DRAFT`. MissionControl UI authentication uses Clerk, which this local fixture does not replace with a claimed production login. Therefore the current sources cannot establish the entire requested owner-created Mission in a single browser conversation. Browser login/readback, API proposal authorization, canonical execution and owner acceptance must be reported separately.

MyFactory executes its protected slug utility; native execution produces deterministic documents. Neither proves Recruiting UI behavior. The original qualified Result fixture constructs a direct synthetic tool session; the added browser check separately exercises the login form and actual Eve transport. Browser screenshots, accessibility violations, faults, retries and the absence of a complete UI flow remain evidence, never a full-product PASS.

Release gate remains ADVISORY. No dependency PR merges, deployments, paid model operations, external-alpha changes or publication are authorized by this qualification.

## Independent review scope

Independent Codex security review reproduced and closed two stale-authority timing windows (recursive traversal and initial root fetch) and a concurrent batch-write regression. Seven permanent cache tests pass, including denial after owner transfer; the reviewer independently checked a collection interrupted by owner transfer. This is a bounded code review, not the required independent Claude release review. Full composed qualification still requires real database, browser, fresh-clone and hosted evidence.

The browser check runs in the Result fixture's cleanup path even when a negative Result assertion fails. Its outcome remains separately recorded; it cannot turn the failed Result suite into PASS. The local fixture reports canonical error diagnostics without changing the Result protocol or native proof expiry.
