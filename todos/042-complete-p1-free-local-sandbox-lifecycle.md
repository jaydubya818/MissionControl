---
status: complete
priority: p1
issue_id: "042"
tags: [software-factory, local-sandbox, docker, security, operations]
dependencies: []
---

# Free Local Sandbox Lifecycle

## Problem Statement

The Product Owner declined paid exe.dev capacity but authorized all work that
does not incur an external charge. Mission Control needs a truthful local
execution substitute that can exercise lifecycle, isolation policy, artifact
collection, timeout, and cleanup without presenting a container as equivalent
to a remote VM.

## Findings

- Docker Desktop 4.60 is already installed and running with Linux seccomp and
  cgroup namespaces.
- The local cache contains Alpine Linux by immutable repository digest, so the
  canary needs no image pull or paid API.
- A Docker container can enforce a read-only root filesystem, no network,
  non-root execution, dropped capabilities, no-new-privileges, PID/memory/CPU
  limits, and isolated writable tmpfs mounts.
- A local container still shares the operator's physical machine, Docker
  daemon, kernel/virtualization boundary, power, disk, and network uplink. It
  proves isolation mechanics but not independent-machine autonomy.
- The remote exe.dev doctor remains blocked by `max_vms: 0` and must not be
  retried after the Product Owner's no-spend decision.

## Proposed Solutions

### Option 1: Continue only with mocked provider tests

**Pros:** No runtime dependency and minimal code.

**Cons:** Does not prove process isolation, actual limits, artifact extraction,
or cleanup against a real runtime.

**Effort:** Low.

**Risk:** Low, but weak evidence.

### Option 2: Hardened local Docker lifecycle canary

**Pros:** Uses an installed zero-cost runtime and proves real container
creation, policy inspection, execution, artifact extraction, timeout, and
exact cleanup.

**Cons:** Not a remote computer and not suitable evidence for remote-provider
promotion gates.

**Effort:** Medium.

**Risk:** Low when limited to an immutable cached image and exact names.

### Option 3: Build a local VM manager

**Pros:** Stronger host boundary than a container.

**Cons:** Significant platform work, local resource cost, and a distraction
from the N=1 product golden path.

**Effort:** High.

**Risk:** Medium.

## Recommended Action

Implement Option 2 as a development-only transport. Use the cached Alpine image
by immutable digest and prohibit pulls, network, host bind mounts, environment
secrets, privileged execution, and lingering containers. Run three successful
canaries and retain structured local evidence. Do not integrate it into the
Factory worker or mark remote-provider gates complete in this slice.

## Technical Details

**Affected files:**

- `scripts/local-sandbox-doctor.mjs`
- `scripts/lib/local-docker-sandbox.mjs`
- `scripts/lib/local-docker-sandbox.test.mjs`
- `docs/architecture/remote-sandbox-execution.md`
- `docs/security/remote-sandbox-threat-model.md`
- `docs/validation/2026-08-12-free-local-sandbox-lifecycle.md`

**Runtime policy:**

- image: cached immutable Alpine repository digest;
- network: none;
- root filesystem: read-only;
- user: UID/GID 65534;
- Linux capabilities: all dropped;
- security: no-new-privileges plus Docker default seccomp;
- limits: 0.5 CPU, 128 MiB memory/swap, 32 PIDs;
- writable storage: `/tmp` and `/output` tmpfs only; and
- result transfer: trusted outer-process `docker exec ... cat` from the live
  tmpfs before acknowledgement and exact removal.

## Acceptance Criteria

- [x] Readiness fails closed if Docker is unavailable or the pinned image is
  absent; it never pulls an image automatically.
- [x] Container creation uses no network, environment secret, host bind mount,
  privileged mode, or mutable image tag.
- [x] Runtime inspection independently verifies every required isolation field
  before execution.
- [x] The in-container canary proves non-root UID, read-only root filesystem,
  blocked network, and writable artifact tmpfs.
- [x] The outer process extracts and validates a structured receipt.
- [x] Timeout or workload failure still removes only the exact generated
  container and verifies absence.
- [x] Unit tests cover naming, create arguments, inspection, receipt validation,
  readiness, timeout/failure cleanup, and redaction.
- [x] Three real local lifecycle runs finish with zero lingering doctor
  containers.
- [x] Documentation states which remote claims are and are not proven.
- [x] Focused tests and `git diff --check` pass.

## Work Log

### 2026-08-12 - Free Runtime Inventory and Decision

**By:** Codex

**Actions:**

- Confirmed exe.dev remains blocked at zero VM capacity and the no-spend
  decision remains in force.
- Confirmed Docker Desktop is installed, running, and advertises seccomp and
  cgroup namespaces.
- Found a cached Alpine image with immutable repository digest
  `sha256:a2d49ea686c2adfe3c992e47dc3b5e7fa6e6b5055609400dc2acaeb241c829f4`.
- Selected a hardened Docker canary as the strongest useful zero-cost slice.

**Learnings:**

- Local Docker can prove deterministic lifecycle controls without pretending
  to provide remote-machine autonomy.
- A cached digest plus `--pull=never` prevents an implicit network or supply
  chain change during the canary.

### 2026-08-12 - Implementation and Verification

**By:** Codex

**Actions:**

- Added a fail-closed readiness check and hardened Docker lifecycle canary.
- Enforced the exact local-canary name namespace, cached immutable image,
  offline non-root policy, read-only root, dropped capabilities,
  no-new-privileges, bounded resources, and tmpfs-only writable storage.
- Added independent inspection and receipt validation before exact-name
  teardown and absence verification.
- Added 10 focused tests, including timeout and isolation-failure cleanup.
- Completed three consecutive real lifecycle runs with zero lingering labeled
  containers.
- Recorded the architecture, threat boundary, and structured validation
  evidence in the repository.

**Learnings:**

- Docker copy/archive cannot reliably extract a tmpfs artifact after the
  container stops. Reading the receipt from the live container, then sending
  an unprivileged acknowledgement, preserves tmpfs-only storage and clean exit
  semantics.
- A local container is useful evidence for deterministic control code, but it
  cannot satisfy remote-machine autonomy, host-failure isolation, provider
  credential/spend, or N-host scale gates.

### 2026-08-15 - Main Reconciliation and Publish Validation

**By:** Codex

**Actions:**

- Recovered the completed Phase 0 files from a mixed local stash without
  including unrelated Factory Memory or observability work.
- Compared every Phase 0 file against current `origin/main`; all seven remained
  unique and relevant.
- Hardened environment, port, capability, tmpfs, read-only-root, and exact
  container-ownership validation.
- Passed 23 focused local/exe.dev tests and three additional real offline
  canaries with zero lingering containers.

**Boundary:**

- Local Docker remains a validation substrate only. Remote execution remains
  gated at exe.dev `max_vms: 0`, and no production provider integration was
  introduced.

## Notes

- Do not edit the approved remote-sandbox plan while executing this todo.
- Do not create a commit unless the Product Owner explicitly asks.
- Do not pull images or invoke paid external APIs in this slice.
