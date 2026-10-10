# Capability admission containment

Base: `04770b83844b036080e59c9e6ea8ebb565383534`. The canonical registry is unchanged.

This checkpoint closes new Mission and delegated WorkOrder admission in an
explicitly enrolled qualification installation. It does not implement a positive
cross-database admission path. Configure enrollment with
`MC_CAPABILITY_CONTROL_ENABLED=true`, `MC_CAPABILITY_ENVIRONMENT=qualification`,
and an isolated `MC_CAPABILITY_INSTALLATION_ID`. No installation was configured.

Both `missions.start` and the shared WorkOrder dispatcher check enrollment.
Enrolled calls resolve the accountable member to an active operator and require
the authenticated subject, tenant, and workspace to match. A company admin cannot
substitute for this exact owner. Delegated WorkOrders use their parent Mission's
owner and must match its tenant and workspace. Authorized observational replays
preserve admitted Work. The independent native engine remains unchanged outside
enrollment.

No signed snapshot can open this path. It returns
`CAPABILITY_POLICY_REVALIDATION_UNAVAILABLE` until a receiving-transaction fence
and canonical policy revalidation adapter are qualified. The accepted semantics
do not treat an upstream reservation as Mission admission.

Qualification uses the real Mission and shared dispatch handlers with synthetic
records, plus existing dispatch tests and Convex TypeScript checks. These are
local handler tests, not a live Convex deployment or a cross-database race proof.

Native cancellation, writer fencing, qualified cleanup, and their acknowledgments
remain integration gates. No production, deployment, paid execution, dependency
merge, or external-alpha installation is authorized by this checkpoint.

The capability branch is explicitly excluded in `vercel.json`. Hosted CI builds
packages and runs tests; it does not deploy Convex or Vercel.
