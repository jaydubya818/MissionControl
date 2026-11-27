---
name: create-readonly-db-role
description: "Prepare least-privilege PostgreSQL agent access when requested."
license: MIT
metadata:
  author: David Ondrej and Skillz contributors
  source: davidondrej/skills
  source-commit: 8aa01cf45110ae378bdf5c319cd41ac8fdbdf448
  adaptation: curated-rewrite
  owner: software-factory
  risk: high
  capabilities: davidondrej,readonly-database-access
---

# Prepare read-only database access

Use when the user requests PostgreSQL access for an agent. Prepare a scoped
access plan, reviewable SQL, and verification evidence. This skill does not
grant permission to alter production roles or retrieve customer data.

## Establish the access boundary

Identify the database version, environment, provider, role, required queries,
and approved tables, columns, and tenant scope. Inspect existing roles, grants,
ownership, memberships, row-level security policies, and object-creation
defaults. If the role exists, compare its effective access with the desired
access before changing it. Do not recreate it or replace its password without
authorization.

Prefer sanitized fixtures or a separately controlled reporting database when
the task does not require production data. Read-only access can still disclose
private data and consume database resources.

## Prepare the least-privilege plan

- Grant access to explicitly approved objects and columns. Grant only required
  schema usage and query privileges. Do not grant SELECT on all current or
  future tables and then rely on a sensitive-table denylist. Review new tables
  and columns before exposing them. Table-level SELECT includes future columns,
  so use reviewed column grants or explicit-column reporting views when the
  column boundary matters.
- Keep the agent role non-superuser, without `BYPASSRLS`, role creation,
  database creation, replication, object ownership, or privileged memberships.
  Check both inherited access and roles reachable through `SET ROLE`.
  A `NOINHERIT` attribute alone is not proof of isolation.
- Preserve row-level security. Empty results can be correct. Inspect the
  applicable policy and session identity, then verify known permitted and
  denied fixture rows. Do not bypass RLS to make a query return data. Review
  view ownership and security behavior too; a view is not automatically a
  tenant boundary.
- Inspect effective privileges from `PUBLIC` and memberships, including
  functions and procedures. Revoking a direct grant does not cancel an
  inherited grant. Review callable `SECURITY DEFINER` routines and other
  write-capable paths; SELECT-only table grants do not prevent invoking them.
  If shared grants break isolation, propose a scoped owner-reviewed correction
  or a separate access mechanism. Do not revoke shared application privileges
  blindly.
- Use a read-only transaction default, statement timeout, and suitable
  connection limits as additional guardrails. A client can change its
  transaction default; ACLs and policies must enforce the actual boundary.

Save project-specific SQL with no passwords in the established database-change
location. Include the target environment, privilege diff, preconditions,
application procedure, verification, and scoped rollback. Provision credentials
through the approved secret mechanism; do not put them in Git, query-history
examples, command arguments, or reports. Use the provider's current documented
connection and TLS settings rather than guessing pooler URLs.

Apply only within explicit authority for that environment and change. Otherwise
deliver the prepared SQL and checks for the authorized operator. Do not treat a
request to prepare access as approval to change production.

## Verify the effective role

Connect as the actual agent login, not an administrator using assumed context.
Use isolated fixtures for mutation probes; a rolled-back statement may still
invoke triggers or external side effects. Verify:

1. The intended login, effective role, database, settings, and membership scope.
2. Approved queries return the expected fixture rows and columns, including a
   known permitted row when one exists. A real empty result is not a failure.
3. Sensitive objects, excluded columns, and other tenants' rows remain
   inaccessible. Distinguish permission errors from intentional RLS filtering.
4. With the read-only transaction setting disabled in an isolated test,
   persistent writes, DDL, privilege escalation, and unapproved callable
   routines still fail. Check applicable INSERT, UPDATE, DELETE, TRUNCATE,
   sequence mutation, and function paths rather than one DELETE alone.
5. New fixture objects created by each relevant migration owner remain
   inaccessible until explicitly approved. Check default privileges as well
   as existing objects.

Capture results without row contents or secrets. Report the environment tested
and any unverified paths. Do not claim the role is production-ready from static
SQL review alone. Roll back only grants and configuration introduced by this
change; avoid broad ownership cleanup such as `DROP OWNED`.

Authoritative references, checked against the target server version:
[privileges](https://www.postgresql.org/docs/current/ddl-priv.html),
[REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html),
[row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html),
and [function security](https://www.postgresql.org/docs/current/sql-createfunction.html).
