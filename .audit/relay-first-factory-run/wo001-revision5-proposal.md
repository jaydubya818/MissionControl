# WO-001 revision 5 proposal

> **Status: NOT CREATED / NOT APPROVED / NOT DISPATCHABLE**

This is a documentation-only proposal. It does not change Mission Control backend state, the Relay repository, the approved Mission Plan, or WO-001 revision 4.

## Target

- WorkOrder: `yh7e14257qs9wnyk5061aeha4n8e9x37` — WO-001 Repository + Technical Foundation
- Base revision: 4 (`y973kbk2hjft8hmf82pe3tgakx8ebgp5`)
- Base verification-contract digest: `sha256:5be4cd9eb19aee003d658e40bf3ed77056ca13e66ee1ee0da7ebaabb62ba1bf1`
- Failed subject: candidate `394414750427c9ea12fe51e46a0b17007691209f`
- Independent verifier: Attempt `12n3z309` (`ys73k2wzc6ba04ed0ygyfm5pzh8earqz`), verification run `nh7zbq5z48n4r28ey75ektsscn8eb73y`

## Proposed revision delta

Change only `verificationContract.checks[id="spec:health"].command`. Preserve every other revision-4 requirement, acceptance criterion, risk, constraint, check, timeout, change budget, authority policy, dependency, workflow, repository scope, and execution setting byte-for-byte.

Replace the child invocation:

```js
spawn("pnpm", ["start", "--", "-H", "127.0.0.1", "-p", "3401"], options)
```

with the exact argument vector:

```js
spawn("pnpm", ["start", "-H", "127.0.0.1", "-p", "3401"], options)
```

Within that same health command, consume bounded child stdout and stderr, redact them through the existing evidence boundary, and include the bounded diagnostic plus child exit code or signal when startup exits or health polling times out. Preserve the existing 20-second health deadline, polling of `http://127.0.0.1:3401/api/health`, the requirement for HTTP 200 with `ok === true`, and bounded child shutdown.

Human-readable command: `pnpm start -H 127.0.0.1 -p 3401`.

## Why revision 5 is required

Revision 4 froze an invalid launcher boundary and the verifier correctly executed that frozen definition. The candidate already passed package-manager policy, typecheck, production build, no-runtime-coupling, negative constraints, verification authority, and change budget. A new approved revision is required to change the health evidence definition; the failed immutable evidence must not be rewritten.

FAC-026 and FAC-027 are separate factory defects. Revision 5 must preserve `corepack pnpm install --frozen-lockfile --offline`; the factory must make that exact approved command admissible and avoid the empty-store offline delay before another retry.

## Creation and approval gate

Before dispatch:

- prove the revision diff changes only `spec:health.command`;
- run focused tests for the corrected launcher and captured failure diagnostics;
- verify FAC-026 and FAC-027 factory fixes independently;
- create revision 5 through the canonical WorkOrder revision mutation;
- obtain a new explicit Product Owner `HUMAN_REVIEW` approval for revision 5; and
- dispatch a fresh current-revision Task/Attempt. Do not retry under revision 4.

Until those steps occur, this file is only a proposal and grants no execution authority.
