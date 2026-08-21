# Authorization

Mission Control is a governed control plane. Its Convex deployment is the single
source of truth, and that deployment is reachable from the public internet by
anyone who has the URL — the URL ships to every browser as `VITE_CONVEX_URL`.
A Convex `query` / `mutation` / `action` export is therefore *internet-facing*,
not "internal to the app". `internalQuery` / `internalMutation` /
`internalAction` are not; they are callable only from other Convex functions and
from `npx convex run`, which authenticates with deployment admin credentials.

This document describes how authorization is structured, how it is enforced,
and how the remaining legacy surface is being retired without breaking existing
deployments.

## 1. The boundary wrappers

`convex/lib/authedFunctions.ts` provides the wrappers that make the secure shape
the easy one.

| Wrapper | Requires | Actor identity |
| --- | --- | --- |
| `authedQuery` / `authedMutation` | a signed-in identity with at least one company membership | `ctx.access.actorId` |
| `workspaceQuery` / `workspaceMutation` | a required `projectId` argument, plus (optionally) a company permission on that workspace | `ctx.access.actorId` |
| `companyQuery` / `companyMutation` | a required `tenantId` argument, plus a company permission | `ctx.access.actorId` |
| `adminQuery` / `adminMutation` | company administrator | `ctx.access.actorId` |
| `publicQuery` / `publicMutation` | nothing — but a non-empty `reason` string is required and recorded | none |

Four rules follow from this:

1. **Actor identity is never an argument.** Every wrapper resolves the actor
   server-side and puts it on the context. Audit attribution the caller can
   choose is not attribution. A handler that records who did something reads
   `ctx.access.actorId` — never `args.actorId` / `requestedBy` / `decidedBy` /
   `authorUserId`.
2. **Scope is a required argument, not an optional one.** An optional
   `projectId` that falls back to "every workspace" is a cross-tenant read. The
   workspace and company wrappers inject the scope argument into the validator
   so it cannot be omitted.
3. **`publicQuery` / `publicMutation` must state why.** The `reason` string is
   the durable record of a deliberate decision, and the authorization ratchet
   treats these as reviewed rather than as debt.
4. **Anything with no legitimate external caller is `internal*`**, not wrapped.
   Seeders, migrations, fixtures, and canaries are all in this category.

Actions cannot read the database, so there is no `workspaceAction`. An action
authorizes by `ctx.runQuery`-ing an authorized internal query first — see
`convex/authorization.ts` and the pattern in
`openclawDiscovery.discoverAgents`.

## 2. Enforcement is driven by provisioning, not only by a flag

`control-plane.team-authorization` and `company.context` both ship
`defaultEnabled: false`, and the gates they guarded returned `null` / `false`
when off. An unconfigured deployment therefore authorized everything,
indefinitely. Flipping the flags outright would have locked out every deployment
that had not yet provisioned operators, roles, and memberships.

`convex/lib/authorizationRollout.ts` resolves this: **provisioning is the
migration signal.** A deployment is provisioned once at least one active
`operators` row exists.

| Deployment state | Flag off | Flag on |
| --- | --- | --- |
| No active operators (fresh / unmigrated) | legacy access, reported as `UNPROVISIONED` | enforced |
| One or more active operators | **enforced** | enforced |

The only unenforced state is the one in which enforcing would refuse everyone,
and it resolves itself the moment an owner is created. `authorizationModeSummary`
renders this state to operators rather than leaving it silent.

`MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` remains a separate, louder override that
grants every company permission over every tenant to unauthenticated callers.
It is reported as `ANONYMOUS_DEMO` with an `UNSAFE:` headline and must never be
set on a shared or production deployment.

## 3. Record-level scope

`canAccessDeliveryRecord` runs *after* the workspace permission check and only
narrows further, by ownership. A record that declares an `owningTeamId` is
restricted to that team; one that declares an `ownerMemberId` is restricted to
that member. A record that declares neither has nothing to narrow by, so the
workspace permission check is the whole check.

This is a deliberate semantic: delivery records are created unowned by default,
and refusing them would make every unowned WorkOrder unreachable by every
operator who is not a company administrator. See
`convex/__tests__/deliveryRecordScope.test.ts`.

## 4. The ratchet

`scripts/check-convex-authorization.mjs` scans every Convex module, resolves
each public function's authorization posture, and compares it against
`scripts/convex-authorization-baseline.json`.

- A **new** public function with no server-side authorization fails CI.
- A function **leaving** the unauthorized set is reported as a gain, and
  `--update` locks the smaller baseline in so it cannot regress.
- The baseline may only shrink.

Run it locally with:

```bash
pnpm run security:authorization        # check
node scripts/check-convex-authorization.mjs --update   # lock in a reduction
```

The scanner is per-function and brace-matched, so an authorized function cannot
launder an unauthorized neighbour (`scripts/lib/convex-authorization-scan.test.mjs`).

## 5. The runtime contract

`scripts/check-runtime-contract.mjs` compares the public Convex surface against
the merge base and requires `RUNTIME_CONTRACT_VERSION` to be incremented when it
changes. Its `PUBLIC_BUILDERS` set includes the authorization wrappers, because
a function declared with `workspaceQuery` is exactly as public — and exactly as
contract-breaking to change — as one declared with `query`.

Converting a function to a wrapper *is* a breaking contract change for existing
clients, because the wrapper injects a required scope argument. That is
correctly reported as an args change.
