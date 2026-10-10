# Checkpoint 2 — enterprise integration readiness

Status: PARTIAL. The synthetic application contract is qualified for proposal, owner-authorized canonical draft creation and scoped status reads. Durable registry distribution and composed MyEve adoption remain gated. Production integration is NOT_RUN.

## Preserved identities

- Accepted MissionControl execution checkpoint: `08daed6f5745dce00d18da4218a26fdc5b827666`.
- Native runtime source: `912e26ebd2b08c2c58f7cbfc1b903c1d52c4851e`.
- Native image: `sha256:bddbcca962226a60fe962ccd5812b04b480064004b97e04a97f7166bc3be233a`, runtime/harness 3/3, linux/amd64.
- Historical unavailable image: `sha256:4c0e7e776c25f393ba9eb2e29319dbc38dc4c1d0f8a91e307aeb1a31849269db`. It remains UNAVAILABLE.
- Qualified local MyFactory: `e498c31db8b749fa91b0544ecd1d1a661b971c2c`; FactoryVersion `4c6c3a7d752df18a865fc815bc52daa8b638f6344a607f86a692f24eab3f4f95`.

All 40 unique qualified native bundle input paths remain byte-identical. No runtime rebuild or native/delegated execution rerun was used to create this checkpoint. The retained OCI archive was copied to a separate temporary directory and passed the existing image/provenance inspector. This establishes local archive recovery only. Registry publication, retention enforcement and fresh-environment registry retrieval remain NOT_RUN; see [the exact publication request](RUNTIME_DISTRIBUTION_REQUEST.md).

## Implementation and qualification

The new application connection and immutable proposal records are intake state. Mission creation reuses the canonical DRAFT persistence and validation function. No additional Mission lifecycle, Result system, registry, execution fabric or accounting ledger was introduced. The shared contract, Convex intake, two schema tables, canonical draft helper extraction and qualification fixture are the required implementation surface; dependency repositories and released installations are untouched.

The deterministic fixture interprets “Build an Agentic HR platform” using explicit scope facts. A synthetic owner inspects and authorizes the exact proposal digest. Concurrent submissions create one canonical Mission. An owner creates an inspectable draft Plan through canonical governance, and the application reads actual status and milestones. The conversation explicitly reports zero released WorkOrders, no gate evaluation and no completed Result. No percentage or enterprise acceptance is fabricated.

The real transactional database suite passed 42 checks: application authentication; malformed/forged capability denial; owner, tenant, membership and project-role boundaries; proposal immutability; owner-only approval; concurrent proposal and Mission deduplication; changed-payload replay denial; lost-acknowledgment/controller restart; exact Mission and Plan binding; expiry, key rotation and revocation; and zero native/delegated reservations or execution authority. Disposable storage cleanup was verified.

Contract tests include all 232 shared tests, 55 affected Mission/draft/governance/delegation tests and nine authorization-scanner tests. Workspace and Convex typechecks are required. Hosted CI repeats the contract, real database, canonical accounting, compatibility and Bedrock checks against the pushed commit. Fresh-clone results and exact remote identity are recorded in the retained checkpoint report after the commit exists.

## Regression baseline

The accepted Bedrock baseline is source `23e0306e29e970efc31f614304f2abcdd071fbac`, suite `convex/__tests__/providerLiabilityHandlers.test.ts`: 89 tests, 47 passing and 42 failing. Failure-set SHA256 is `9127e6d1cfb66cd6bc74e1887249e7122405d429820652f57d3247d418b10350`. This checkpoint reproduced that exact set with zero introduced, resolved or changed-reason failures. The suite remains baseline-red; it is not reported green.

## Adoption limits

[The source-grounded manifest](DEPENDENCY_ADOPTION_MANIFEST.json) records full main and dependency PR identities, ancestry, contract content hashes and adoption decisions. Dependency PRs remain open and were not merged. MySkills' newer claim review is not execution compatibility. Relay transport availability is not receiver authority. MyEve's production route schema and frozen release were not changed.

MyEve owner-session/UI wiring and completed canonical Result consumption are not qualified here. App status reads use canonical gate eligibility and expose reference identities; their content digest is not a transferable signed Proof. Existing native/hybrid acceptance is preserved, not relabeled as MyEve evidence. Actual dependency adoption requires separate composed qualification at exact adopted source identities.

Paid operations: 0. External-alpha changes: 0. Executable production grants: 0. No deployment or publication occurred.
