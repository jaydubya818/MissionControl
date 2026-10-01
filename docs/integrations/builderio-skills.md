# BuilderIO skills selection

## Installation plan

Add twelve reviewed skills from BuilderIO/skills at revision
`fd8f20a879b507cf09feba08663a1edf7a949353` to the repository's `skills/`
collection and the operator's Codex skill directory. Preserve upstream contents,
MIT license, and the factory guide and configuration reference. Verify installed
files against the pinned source and check local Markdown links.

## Selected skills

| Skills | Factory use |
| --- | --- |
| factory | Configure sources and independent action policies. |
| factory-collect | Triage feedback, telemetry, errors, and issues. |
| factory-lookback | Investigate recurring failures. |
| factory-human-digest | Present evidence and decisions requiring an operator. |
| factory-review-prs | Review a scoped PR queue. |
| factory-babysit-pr | Follow one authorized PR through checks and feedback. |
| factory-ship | Verify and publish explicitly authorized delivery work. |
| factory-watchdog | Identify stalled, authorized work. |
| factory-recover | Resume interrupted work after checking ownership and authority. |
| agent-watchdog | Independently audit another agent's work and evidence. |
| plan-arbiter | Compare competing plans and produce an execution handoff. |
| read-the-damn-docs | Ground implementation in authoritative documentation. |

## Integration boundaries

These are instruction packages, not running services or Mission Control API
integrations. The nine factory modules remain experimental. They require an
explicitly scoped `.agent-factory/config.yaml` before configured workflows run.
This installation does not configure sources, create jobs, grant external-write
permission, or import records into a live Convex registry.

Use `mission-control-delivery` first for governed work. Mission Control retains
its Mission → WorkOrder → Task → Attempt → evidence → PR → release lineage.
BuilderIO modules supplement the existing workflow selector and integration
skills; they do not replace them. Host, user, and repository authority rules
continue to apply. Skill installation alone never authorizes messaging,
publication, approval, merging, deployment, or automatic recovery.

The existing `scripts/import-repo-skills.mjs` discovers these repository skills
when an operator performs a registry import. Codex's separate installed copies
are available on the next turn.

## Deferred skills

- `an`, `webmcp`, `visual-plan`, `visual-recap`, `visual-edit`, `rewind`, and
  `turn-into-app` target additional Agent-Native apps, connectors, desktop
  software, or app scaffolding outside this factory integration.
- `efficient-fable` and `efficient-frontier` overlap existing model routing and
  delegation workflows.
- `plow-ahead` overlaps the existing autonomy contract and workflow selector.
- `stay-within-limits` adds a separate pause/resume policy; retain the factory's
  existing budget controls until that policy is explicitly selected.
- `quick-recap` installs a response-style convention rather than a factory
  capability.

## Provenance and updates

Source: https://github.com/BuilderIO/skills/tree/fd8f20a879b507cf09feba08663a1edf7a949353

Skill bodies preserve upstream instructions. Repository copies move the custom
`installer-group` field into `metadata` and clarify two activation descriptions
to satisfy Mission Control lint. Codex user copies retain the upstream form. Each installed skill includes the upstream
MIT `LICENSE`. `docs/factory/` contains the upstream companion documentation.
Review changes before updating the pinned revision; do not refresh from a moving
branch silently.

## Verification

Installation completed in this worktree and `/Users/jaywest/.codex/skills`.
All 24 installed skill copies passed name/description frontmatter checks.
All 38 copied upstream skill files matched the pinned source byte for byte.
MIT licenses, companion documentation, and local Markdown links in skill
folders were verified. The repository skill linter was not run because this
worktree lacks the built `packages/context-tools/dist/index.js` dependency.
No application code or UI changed; runtime behavior of the workflows remains
unqualified until each is exercised against configured sources.

On consolidation, the built repository linter detected unsupported upstream
frontmatter. After the compatibility adaptation, all repository skills passed
with zero errors. The initial byte-match result applies to the original import.
