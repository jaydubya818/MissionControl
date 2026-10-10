# Approved local capacity experiment

User approved testing a separate local-only profile with a 256 MiB input
envelope, 1 GiB workspace and 2 GiB RAM. No paid inference, network access,
production promotion, or release of the previous reservation is authorized.

Use isolated test copies of the provider and profile factory and a separately
built image. Preserve the original provider and image pins. Match the full
tracked source tree at 5308727463ec737589bf8072ee9f5de0af1bba7a. Record
packaging, actual containment inspection, tool result and cleanup.

## Result

CAPACITY CHECK PASSED. The full-tree tool-cycle test passed in 19.90 seconds
(20.47 seconds including test startup). Another 67 containment, bridge and
liability tests passed; two existing opt-in tests were skipped. This is an
offline capacity experiment, not a new canonical Attempt or live approval.

The pinned candidate image is
`mission-control/local-large-repository@sha256:7a36977d9b1449d2dae436e4b184326f0ef48b5873019c583911f6d95d9afda8`.
Actual inspection recorded 2,147,483,648 bytes RAM, 1,073,741,824 bytes workspace,
network none, user 10001, read-only root, all capabilities dropped, no new
privileges, no host mounts and no privileged mode. CPU, process count, deadline,
provider spend enforcement and reply limits were unchanged.

Two synthetic provider exchanges produced only
`docs/operations/offline-container-probe.txt` and a patch containing `+after`.
The structured result is COMPLETED. Both synthetic request liabilities remain
reserved at their maximum despite settled fixture usage. Synthetic ACTUAL
classifications in the retained fixture are not real billing evidence. Paid
provider calls are zero. Cleanup receipt confirms the container was removed.

The provider diagnostics nevertheless label the terminal state WORKLOAD_FAILURE
with exit code 0 and no failure. The source provider unconditionally assigns
WORKLOAD_FAILURE on a captured result. That pre-existing reporting discrepancy
was not corrected in this capacity experiment and must be resolved before live
qualification. Independent verification, paid execution and full Mission
completion remain unproven.

## Reproduction and scope

Base source for the experiment is commit `6ab41e8`. Restore the archived Vitest
config, setup, full-repository and policy tests at their original relative
locations. Apply the recorded capacity patches to separate provider/profile
copies named by the setup file. The original source files are unchanged.
Build the retained Dockerfile with the `infra/docker-factory` and
`infra/docker-bedrock` directories and the bridge-capacity patch, linux/amd64,
build network none, and the pinned parent digest. Use the resulting immutable
image identity explicitly in the test setup.

Prepare `/private/tmp/mc-large-profile-20261009/repo.bundle` from a Git archive
of the pinned source, in a disposable fixture repository. Assert `git write-tree`
equals `d863864bfd8838e4b5ea3c837ef3a0958422613c` before committing. Bundle
HEAD with command-local core.compression=6 and pack.compression=6. Record its
fixture commit and byte size in packaging.json. No historical evidence files
are excluded. Neither global Git settings nor real checkouts are modified.

Run from the orchestration-server package:

```sh
MC_DOCKER_QUALIFICATION=1 pnpm exec vitest run --config .executor-selection.config.ts src/__tests__/.full-repository.test.ts
pnpm exec vitest run --config .executor-selection.config.ts src/__tests__/.large-policy.test.ts src/__tests__/bedrockInferenceBridge.test.ts src/__tests__/bedrockLiabilityBound.test.ts
```

Experimental executable copies were removed after evidence capture. The image
remains local and unregistered. This does not promote the enlarged limits to
any factory. The previous $4.49 reservation remains retained.

Next work is to correct terminal-status reporting, then turn this experiment
into a reviewed, explicitly selected profile with complete lifecycle evidence.
Current price evidence, an approved live-run budget bound to the current
WorkOrder revision, and fresh activation approval remain required.
