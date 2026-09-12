# Isolated observation accounting proof

This harness deploys the current `inferenceGateway.ts` and
`factory/providerLiability.ts` modules, their real admission dependencies, and
canonical shared constructors to a fresh local Convex backend. It preserves all
23 prior identity/dispatch scenarios and adds observation, correction, fencing,
concurrency, and historical settlement scenarios.

The database uses the exact production inference and provider table validators
and indexes. Related project, WorkOrder, Attempt, profile, sandbox, model and
decision tables use synthetic schemas. Their fixture records use real canonical
constructors where admission requires them. The only substituted production
dependency is the explicitly recorded fixture-project permission shim. No
admission predicate is mocked.

The Bedrock fixture adapts the existing offline profile shape. Its qualifications,
Docker evidence, provider observations and prices are synthetic. Passing proves
handler behavior, persistence and transaction contention under those inputs. It
does not prove full application authorization, deployment of the full application
schema, external provider execution, account or geography enrollment, billing,
human acceptance, or release readiness. Provider routes are never contacted.

Run only after the coordinating task confirms the production source is frozen:

```sh
node --import ./loopback-only.mjs ./run.mjs /private/tmp/fdlc-program-observations
```

Add `--persisted-browser` to invoke the fixed optional callback at
`/private/tmp/fdlc-observations-persisted-browser.mjs` after the database scenarios
and before backend cleanup. The callback receives only a JSON file path containing
the loopback backend URL, selected workflow-run IDs and expected boolean states;
it receives no administrative credentials. Its environment retains the loopback
Node network guard. The callback owns its browser network restrictions and writes
screenshots/report beside that input under `persisted-browser/`. A missing callback,
nonzero exit, timeout or changed callback source fails the overall proof.

Each run creates a disposable database, source/bundle/hash records, redacted logs
and a JSON report below `/private/tmp/fdlc-observation-backend-*`. It uses only
fresh ephemeral local credentials, stops the backend on completion or failure,
and fails the result if either port remains reachable or bundled source changed.
The original databases are never used. Historical fixture snapshots are seeded
only in this disposable database; production history is never rewritten.

`codegen.mjs` is a copied separate utility and is not invoked by `run.mjs`. It has
not been qualified for this observation slice. Do not run it without coordinating
its repository-generated-file writes with the parent task.
