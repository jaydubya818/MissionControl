# Capability control component

This package defines versioned product capabilities and resolves their eligibility from trusted server facts. It has no database, identity provider, network client, execution credentials, or side effects. It is not yet integrated into MyEve, Relay, or execution admission.

`capabilityRegistry` includes all requested capabilities and all seven settings categories. `createRegistry` validates stable identities, dependencies, alternatives, cycles, and metadata, then freezes a copy. Registry evolution requires a new version.

`resolveCapabilities` keeps owner preference, deployment availability, operational readiness, lifecycle, and exact Work authority separate. A platform-owner policy affects preference defaults only in the exact development or qualification installation. Real administration, membership, installation, and audit records must be resolved by a server adapter before constructing this policy. Nonempty record references alone do not authenticate a person.

Qualification and setup requirement names are contract identifiers. Adapters must map them to real current provider evidence. They must not mark them satisfied merely because configuration exists. DeepAgents requires one explicitly selected qualified local or cloud harness.

## Enforce the boundary in a server adapter

1. Authenticate using the existing system's identity and revocation checks.
2. Read current scoped preference, organization policy, deployment facts, and exact Work authority from authoritative records.
3. Construct a snapshot with the exact registry version, revision, scope, observation time, and expiry.
4. Resolve capabilities and disclose all reasons in the UI or conversational response.
5. At admission, atomically validate the current policy revision with canonical Work generation, permissions, budget, and runtime qualification. A resolver result cannot be used as a bearer grant or cached authorization.

Disable applies to new admissions. This function must not be used to cancel existing authorized Work. Pause and revoke require canonical runtime controls, durable fencing, resource cleanup, and evidence of completion. Unknown accounting exposure must remain unknown until reconciled. This component performs none of those mutations.

Subagent checks support a child with one root parent. Nested delegation fails closed pending a complete current ancestor chain. Budget comparisons are eligibility checks; canonical reservation remains responsible for concurrent siblings and writers.

## Test the component

From the repository root after a frozen dependency install:

```sh
pnpm --filter @mission-control/capability-control typecheck
pnpm --filter @mission-control/capability-control test
```

On Node 24 the dependency-free test path is also available:

```sh
node --test packages/capability-control/test/*.test.mjs
```

These tests use synthetic owners and trusted in-memory facts. Passing them does not qualify database concurrency, UI behavior, real platform-owner identity, service compatibility, revocation effects, or production integration.
