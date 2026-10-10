# Full repository Docker qualification

Status: FAILED AT INPUT ADMISSION. The existing candidate cannot accept the
full repository. No provider calls, new canonical Attempts, paid inference, or
deployments occurred. The allocated test container was removed; a subsequent
image-filtered Docker listing returned no containers.

## Exact scope

Source commit `5308727463ec737589bf8072ee9f5de0af1bba7a`, tracked Git tree
`d863864bfd8838e4b5ea3c837ef3a0958422613c`. A disposable snapshot commit
`15005efe2370f052996515fd84dbb73ce1d2a394` has the identical tree. No working
copy secrets, untracked files, or installed dependencies were copied. This
checks the full tracked source tree, without its historical Git commits.
The Docker image and test-only identity setup are unchanged from the
[executor selection evidence](../executor-selection-2026-10-08/README.md).
Test implementation baseline is local commit `9d952a4`.

## Results

- The tree contains 4,155 files and 218,747,055 bytes (208.61 MiB).
- The first Git bundle is 210,612,519 bytes. The host Git setting disables
  compression. Actual `DockerSandboxProvider.start` rejects it with
  `Docker invocation exceeds bounded input.` Provider calls remain zero.
- A second bundle using command-local compression level 6 is 140,585,582 bytes.
  Its base64 payload alone is 187,447,444 bytes (178.76 MiB), exceeding the
  32 MiB invocation limit before JSON overhead. Global Git settings are unchanged.
- The tracked tree alone exceeds the candidate's 128 MiB writable workspace.
  This is a size comparison, not an observed container out-of-space failure.
- Historical files in `docs/testing/evidence/` occupy 186,074,523 bytes, about
  85 percent of the tracked tree. `size-analysis.json` lists the largest files.
- The adapter diagnostics were captured before cleanup. The diagnostic field
  `supervisorProcessRunning` is not proof that the supervisor launched: input
  rejection occurs before Docker attach/start. Container cleanup was checked
  separately after the test.

The retained test intentionally fails at admission. Its tool response is
synthetic and it cannot invoke AWS. It is archived as text, not added to the
default test suite. Restore the earlier candidate setup and this test under
`apps/orchestration-server/src/__tests__/` to reproduce. Its packaging inputs
are a Git archive of the pinned source, extracted into a disposable Git repo,
with `git write-tree` equality asserted before committing and bundling HEAD.

## Next decision

Do not activate this candidate or raise its existing limits implicitly.
Recommend a separately qualified local large-repository profile that preserves
the complete tree and source lineage. Initial offline test bounds would be a
256 MiB invocation envelope, 1 GiB writable workspace, and 2 GiB container RAM,
with the same no-network/no-host-mount containment. These are proposed test
bounds, not measured sufficient capacity or approved production limits.

An alternative is a source-only packaging contract that excludes historical
evidence. That needs explicit provenance and scope semantics; silently removing
tracked files would invalidate the full-tree qualification. Do not delete
repository evidence to fit this candidate.

Either change needs review before implementation. Price refresh and a paid-run
budget remain later gates. The original $4.49 reservation stays retained, the
pilot worker remains stopped, and full qualification remains incomplete.
