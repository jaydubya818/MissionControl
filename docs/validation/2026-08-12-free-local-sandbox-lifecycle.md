---
title: Free Local Sandbox Lifecycle Evidence
date: 2026-08-12
status: passed
runtime: Docker Desktop
todo: "042"
---

# Free Local Sandbox Lifecycle Evidence

## Scope

This evidence covers the strongest useful sandbox work available without
purchasing remote compute: one hardened, local Docker lifecycle canary run
three times. It does not authorize repository execution, model use, remote VM
allocation, or production Factory integration.

## Runtime

| Property | Observed value |
| --- | --- |
| Docker Desktop | 4.60 |
| Docker Engine | 29.2.0 |
| Engine OS/architecture | Linux/arm64 |
| Security options | built-in seccomp and cgroup namespaces |
| Image | `alpine@sha256:a2d49ea686c2adfe3c992e47dc3b5e7fa6e6b5055609400dc2acaeb241c829f4` |
| Image acquisition | already cached; `--pull=never` |

No image pull, external provider mutation, model request, repository clone,
secret mount, payment change, or public-port operation occurred.

## Commands

```bash
node --check scripts/lib/local-docker-sandbox.mjs
node --check scripts/local-sandbox-doctor.mjs
node --check scripts/lib/local-docker-sandbox.test.mjs
pnpm exec vitest run scripts/lib/local-docker-sandbox.test.mjs
node scripts/local-sandbox-doctor.mjs --canary --repeat=3 --json
docker ps -a --filter 'label=mission-control.sandbox-doctor=true'
git diff --check
```

## Controls proved

The outer process independently inspected each created container before start
and required:

- immutable image digest and no pull;
- no network or published ports;
- read-only root filesystem;
- UID/GID 65534;
- all Linux capabilities dropped and no-new-privileges;
- no privileged mode, environment secret, or host bind mount;
- limits of 0.5 CPU, 128 MiB memory/swap, and 32 PIDs; and
- writable tmpfs only at `/tmp` and `/output`.

The in-container workload then proved non-root UID/GID, a non-writable root
filesystem, blocked external network access, and writable artifact tmpfs. The
outer process extracted and schema-validated the receipt while the container
was alive, acknowledged it, waited for a clean exit, removed the returned
container identity, and independently verified the exact name was absent.

## Repeated lifecycle result

All three required runs completed this exact state sequence:

```text
REQUESTED -> PROVISIONING -> HEALTH_CHECKING -> READY -> RUNNING
-> RESULT_READY -> TEARING_DOWN -> TERMINATED
```

| Run | Exact container | Result |
| --- | --- | --- |
| 1 | `mc-sbx-local-20260812t182246z-4a8b3ffc` | passed; cleanup verified |
| 2 | `mc-sbx-local-20260812t182253z-8dc65a6d` | passed; cleanup verified |
| 3 | `mc-sbx-local-20260812t182259z-5a54bfbe` | passed; cleanup verified |

The focused suite passed 10/10 tests covering exact namespace enforcement,
hardened create arguments, independent inspection, receipt validation,
lifecycle order, readiness, normal cleanup, timeout cleanup, isolation-failure
cleanup, and credential-shaped output redaction.

During development, two preliminary extraction approaches failed because
Docker's copy/archive path cannot retrieve tmpfs content after stop or through
the archive API. Both attempts ran their exact cleanup path and left no labeled
container. The final design extracts through `docker exec ... cat` while the
container is alive, then sends an unprivileged acknowledgement so the workload
can exit.

## Reconciliation on current main

On 2026-08-15 the recovered Phase 0 work was compared file-by-file with
`origin/main` at `a8fb878`. All seven Phase 0 files remained unique and valid;
no production provider integration was added. The security pass additionally:

- requires the container environment to match the immutable image's single
  allowlisted `PATH` value and rejects exposed ports;
- rejects non-local Docker endpoints and any `DOCKER_HOST` override;
- requires an explicitly unprivileged container with no added capabilities;
- verifies that only the two hardened tmpfs mounts are present;
- checks the root mount's read-only flag inside the container; and
- removes only the Docker identity returned by a successful create, preventing
  a failed name collision from deleting a pre-existing container.

The current focused suite passed 23/23 tests: 11 local Docker contract tests
and 12 exe.dev fail-closed provider tests. Three additional real canaries passed
with verified teardown:

| Run | Exact container | Result |
| --- | --- | --- |
| 1 | `mc-sbx-local-20260815t144845z-9fe63265` | passed; cleanup verified |
| 2 | `mc-sbx-local-20260815t144852z-260e378b` | passed; cleanup verified |
| 3 | `mc-sbx-local-20260815t144858z-c0a9036e` | passed; cleanup verified |

A final post-hardening smoke canary,
`mc-sbx-local-20260815t145234z-cec9f193`, also passed after local-Docker-context
enforcement was added. The labeled-container inventory was empty afterward.

## Exit assessment

| Claim | State |
| --- | --- |
| Deterministic local create/run/result/teardown | passed |
| Fail-closed policy inspection | passed |
| Timeout and isolation-failure cleanup contract | passed by focused tests |
| Three real runs with zero lingering canaries | passed |
| Independent remote machine | not proved |
| Host-failure isolation or restart recovery | not proved |
| Remote private previews or observability URLs | not proved |
| Disposable model credentials and hard spend cap | not exercised |
| Best-of-N across independent machines | not proved |

The zero-cost Phase 0 local diagnostic is complete. The remote exe.dev proof
remains blocked by the account's zero-VM capacity and the Product Owner's
no-spend decision.
