# Phase 4 MCP SDK 1.32.2 requalification (nonproduction fixture)

Date: 2026-11-03

Status: COMPLETE_IN_FIXTURE. Live isolated Convex requalification and any
enterprise/production write remain blocked pending owner action.

## Scope

PR #244 merged `@modelcontextprotocol/sdk` 1.32.2 into `main` at
`e8cb7d4279517d5a0536369fff374f22f700dd25`. This follow-up requalifies the
Phase 4 Context7 Tool Version, Tool Grant, and Execution Profile against that
pinned identity using the existing qualification path:

1. `factory/governedMcp:registerContext7QueryDocs` with
   `phase4-context7-v4.0.5-sdk-1.32.2:<repositoryId>`
2. `factory/governedMcp:qualifyVersion`
3. `factory/governedMcp:createGrant` with
   `phase4-context7-grant-sdk-1.32.2:<repositoryId>`
4. `factory/executionProfiles:registerVersion` for `phase4-context7-codex` with
   `phase4-context7-profile-sdk-1.32.2:<repositoryId>`
5. `factory/executionProfiles:qualify` with
   `phase4-context7-profile-qualification-sdk-1.32.2:<repositoryId>`

The run is an in-memory Convex handler fixture
(`convex/__tests__/phase4SdkRequalification.test.ts`). It does not write a
production database, does not start enterprise execution, and does not touch
Relay/MissionControl factory work orders WO-001..014.

## Observed fixture identity

- Pinned SDK: `@modelcontextprotocol/sdk` 1.32.2
- Context7 server: `4.0.5`
- Tool Version snapshot SDK field: `1.32.2`
- Previous 1.31.0 registration key `phase4-context7-v4.0.5:<repositoryId>` is
  a different identity and is rejected as an idempotency collision when reused
  against the 1.32.2 snapshot
- Profile remains `UNQUALIFIED`/`DISABLED` until the evidence-qualified
  mutation; admission after qualification is `PRODUCTION_PILOT_ELIGIBLE` on
  the isolated fixture profile only, never a production Factory

## What this does not authorize

- Live Context7 `query-docs` transport
- Isolated Phase 4 Convex at `http://127.0.0.1:3224`
- Production Convex mutations
- GitHub App installation binding
- Factory work orders WO-001..014
- Unqualified enterprise execution

## Owner action required for a live isolated re-run

The existing script `scripts/prepare-phase4-mcp-qualification.mjs` already
uses the SDK-versioned keys and refuses any Convex URL other than
`http://127.0.0.1:3224`. A live isolated re-run still needs:

1. Owner approval to start `pnpm run dev:phase4-mcp-qualification` (local
   disposable SQLite backend only)
2. GitHub App installation `152563527` bound on that isolated workspace
3. An operator with `factory.approve` on the isolated qualification project
4. Explicit confirmation that the target is not production Convex

Until those exist, the 1.32.2 identity is proven in fixture only.
