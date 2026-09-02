# Persona access profiles

Status: Accepted for staged delivery

Date: 2026-09-02

## Decision

Mission Control owns human authorization after Clerk proves identity. Each
operator has one primary persona per company scope: Executive, Architect,
Builder, or Admin. The primary persona is stored as a system role with a stable
`systemKey`; its role assignment carries the authoritative tenant, workspace,
or team scope.

Supplemental scoped roles may add action permissions. They do not change the
default navigation, landing view, or scope lens. Explicit denial, inactive or
invalid scope, separation-of-duty rules, and record ownership continue to win
over the union of grants.

Profile changes create immutable `accessProfileRevisions`. The active `roles`
row remains the query-efficient projection used by authorization guards.

## Persona boundaries

| Persona | Default experience | Assignment ceiling | Safety boundary |
| --- | --- | --- | --- |
| Executive | Value, risk, governance, accountable autonomy | Company | Read-oriented; approval is not implied |
| Architect | Boundaries, contracts, policy, quality, routing | Workspace; explicit company-wide elevation | May configure but cannot self-approve delivery |
| Builder | Assigned work, failure, recovery, evidence, handoff | Workspace or team | Cannot approve delivery or administer access |
| Admin | Complete production control plane | Company | Retains every registered capability; maturity and separation rules still apply |

## Source-of-truth boundary

- Clerk supplies the validated human subject.
- `operators.authId` maps that subject to a Mission Control membership.
- `tenants`, `roles`, `roleAssignments`, profile revisions, policy, and record
  scope determine authorization.
- Clerk Organizations are not introduced because they would duplicate the
  existing tenant and scoped-role model.
- Agents, schedulers, webhooks, executors, and service commands keep their
  separate internal or signed authority. A human persona is never assigned to
  a service identity.

## Rollout gate

Tenant mode progresses `LEGACY → SHADOW → ENFORCED`. The server refuses first
enforcement until all configured routes are marked `ENFORCED` or
`BROWSER_PROVEN` in the code-reviewed authorization coverage registry and at
least one active Admin exists. This prevents navigation controls from creating
false confidence while a direct Convex path remains unguarded.

Rollback from `ENFORCED` returns to `SHADOW` or `LEGACY`; it does not delete
profiles, assignments, revisions, or audit evidence.

## Consequences

- Product experience and server permissions share one typed contract.
- Role-name inference remains only as a temporary legacy compatibility layer.
- Custom or ambiguous legacy roles require manual migration review.
- Adding a new configurable route requires permission registration, complete
  server-path inventory, negative tests, and browser evidence.
