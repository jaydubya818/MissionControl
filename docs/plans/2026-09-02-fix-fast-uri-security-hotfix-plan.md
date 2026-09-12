# fast-uri security hotfix

Status: approved for implementation

## Objective

Restore the release security gates by replacing the vulnerable `fast-uri` 3.1.5 override with the patched 3.1.7 release, without changing application behavior or broadening the dependency update.

## Scope

1. Update the root `pnpm.overrides` entry for `fast-uri` from 3.1.5 to 3.1.7.
2. Regenerate only the affected `pnpm-lock.yaml` entries.
3. Run the dependency audit, release security gate, typecheck, lint, unit tests, build, smoke test, and System Qualification V2.
4. Create a Vercel preview deployment after the branch is pushed.

## Acceptance criteria

- Advisories 1158521, 1158524, 1158527, and 1158530 no longer appear in `pnpm audit`.
- The production and full dependency audits satisfy the repository policy.
- All required CI-equivalent checks pass locally and on the pull request.
- The Vercel preview deployment completes successfully.
