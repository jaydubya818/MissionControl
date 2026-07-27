# Protecting against insecure skills

Treat skills like dependencies — scan before install, gate before publish.

## Skill lint

`packages/context-tools` skill linter checks:

- Frontmatter completeness
- Activation trigger clarity
- Dangerous instruction patterns
- Structural review axes (validation / implementation / activation)

Run in CI and locally via `pnpm skill:lint`.

## Security status

Published versions carry `securityStatus`: PASS, UNSCANNED, QUARANTINED. Quarantined packages cannot install to production repos.

## Install policies

`contextInstallations` state tracks:

- **INSTALLED** — matches lock file hash
- **STALE** — newer published version available
- **MISSING** — locked but absent on disk
- **INCOMPATIBLE** — fails compatibility matrix

## Governance hooks

- ARM policy on `TOOL_CALL` for shell/deploy/external message
- QC rulesets for repo-wide scans
- Approval required for RED-tier tool calls during skill-driven runs

## Audit trail

Registry mutations log to `activities` as `CONTEXT_PACKAGE_IMPORTED`, publish events, and deprecations.

See [Discover and install](../registry/discover-and-install.md).
