# Persona access profile rollout and rollback

This runbook operates the Executive, Architect, Builder, and Admin access
profiles without widening human or service authority.

## Preconditions

- Clerk/company authorization is healthy and anonymous company context is off
  outside the local demo.
- The authorization ratchet passes.
- An authenticated company owner or Admin can reach **Settings → Access
  Profiles**.
- Every configured area required for enforcement is `ENFORCED` or
  `BROWSER_PROVEN` in the coverage panel.
- At least two active Admins are recommended before changing assignments or
  enabling enforcement. The server requires at least one and prevents removal
  of the final active Admin.

## Initialize

1. Open **Settings → Access Profiles**.
2. Initialize the four canonical profiles. The operation is idempotent and
   creates version 1 plus an immutable revision for each profile.
3. Review the defaults. Admin retains every registered capability. Executive
   remains read-oriented; Architect cannot approve delivery; Builder cannot
   govern or administer access.
4. Open **Settings → Workspaces & Repositories → Company access** and assign
   one primary persona and valid scope to each active member.

## Migrate existing members

Run the exact-only preview before applying any mapping:

```bash
pnpm exec convex run migrations/backfillAccessProfiles:dryRun \
  '{"tenantId":"<tenant-id>"}'
```

The migration maps only these exact legacy names:

- Company Owner, Owner, Company Admin, Admin → Admin
- Developer, Software Engineer → Builder
- Read-only Auditor, Observer → Executive
- Architect, Platform Architect → Architect

Custom names, multiple exact matches, multiple existing personas, and invalid
scope combinations remain in `manualReview`. Resolve them in the Company
Access UI. Builder tenant-wide assignments are deliberately not inferred.

After reviewing the current candidate count:

```bash
pnpm exec convex run migrations/backfillAccessProfiles:applyExactMatches \
  '{"tenantId":"<tenant-id>","expectedReadyCount":<count>,"reason":"<change-ticket and rationale>"}'
```

The expected count is an optimistic concurrency guard. Existing legacy roles
remain as supplemental grants during parity testing.

## Shadow qualification

1. Change the tenant from `LEGACY` to `SHADOW` with a change-ticket reason.
2. Exercise one authenticated account for each persona across its default
   landing page, navigation, deep links, command palette, writes, failures,
   recovery, and sign-in refresh.
3. Compare legacy and shadow authorization decisions. Resolve missing persona,
   multiple persona, invalid landing, and cross-scope denials.
4. Verify service workflows—scheduler, agent, webhook, Pi bridge, and signed
   commands—continue through their non-human authority boundaries.
5. Advance every configured route only after its public functions, alternate
   navigation, denial tests, and browser evidence are complete.

## Enforcement

The server blocks `SHADOW → ENFORCED` when any configured area lacks coverage
or no active Admin exists. Do not bypass this by patching tenant data.

When the gate is clear:

1. Record the release/change ticket in the mode-change reason.
2. Enable enforcement during an observed internal window.
3. Confirm each persona lands in an allowed view and forbidden direct URLs show
   the neutral access-boundary state.
4. Confirm forbidden direct Convex mutations are denied server-side.
5. Watch membership failures, persona conflicts, denial volume, current-route
   revocations, and service execution health.

## Rollback

If legitimate human work is blocked, change `ENFORCED → SHADOW`. Use `LEGACY`
only when shadow evaluation itself is contributing to an incident. Rollback is
configuration-only and retains all assignments, revisions, and audit records.

Do not enable anonymous company context, broaden Admin bypasses, delete profile
history, or assign human personas to service identities as a rollback.

## Evidence checklist

- Shared, Convex, UI, authorization-ratchet, build, and critical browser tests
  pass.
- Executive, Architect, Builder, and Admin navigation screenshots exist in
  dark and light themes and at a compact width.
- Keyboard focus and screen-reader names are verified for persona tabs,
  capability controls, previews, dialogs, and denied states.
- Cross-company, cross-workspace, invalid-scope, stale-version, final-Admin,
  and unguarded-route negative tests pass.
