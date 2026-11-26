# Skillz catalog

Mission Control vendors the complete 109-skill catalog from the
[`jaydubya818/skillz` 2.7.0 source snapshot](https://github.com/jaydubya818/skillz/tree/44df27bc06f11d76d9f490c76578f222e254be6f)
at commit `44df27bc06f11d76d9f490c76578f222e254be6f`.

The imported directories live under `skills/`, alongside Mission Control's
native API integration skills. This is the authoritative location for local
`mc-context scan` discovery and governed repository import.

The November 6 refresh adds 36 missing skills to the 73 already present and
updates the existing imported skills to the same source revision. The nine
native Mission Control skill directories are preserved.

## Added skills

- Production engineering: `api-and-interface-design`, `ci-cd-and-automation`,
  `deprecation-and-migration`, `frontend-ui-engineering`,
  `observability-and-instrumentation`, `performance-optimization`, and
  `security-and-hardening`.
- Continuity and decisions: `adr-verbatim`, `create-readonly-db-role`, `handoff`,
  `prompt-for-others`, and `risky-changes`.
- Agent-Native workflows: `an`, `rewind`, `turn-into-app`, `visual-edit`,
  `visual-plan`, `visual-recap`, and `webmcp`.
- Bounded orchestration: `efficient-fable`, `efficient-frontier`,
  `efficient-orchestrator`, `plow-ahead`, `quick-recap`, and `stay-within-limits`.
- Planning and verification: `benchmark-checklist`, `correct`,
  `create-formal-verification-skill`, `in-your-own-words`, `ketchup`,
  `maintain-formal-verification-skill`, `poteto-help`,
  `principle-explain-the-number`, `sharpen`, `thermo-nuclear-review`, and
  `thermos`.

Optional connectors and host capabilities remain prerequisites for the skills
that use them. Catalog inclusion does not install those capabilities or prove
that a skill is qualified for a Mission Control execution profile.

## Runtime policy

Do not preload the entire catalog. For non-trivial work, start with
`mission-control-delivery`, then use `poteto-mode` to choose the smallest
applicable workflow and load only the relevant specialist skills. System, user,
Mission Control, and repository instructions remain authoritative. Installing
a skill does not grant permission to publish, merge, deploy, delete, message an
external party, or spend money.

## Source integrity

The vendored skill directories are copied unchanged from the pinned source
commit. Mission Control accepts their portable Agent Skills frontmatter at the
context-tools parsing boundary instead of rewriting each source file into the
legacy flat format.

The parser preserves `disable-model-invocation` as a boolean independent of
`user-invocable`. These are [Claude Code invocation controls](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill),
not grants of Mission Control execution authority. Mission Control's deterministic
YAML subset accepts the literal values `true` and `false` for both fields.

The description linter accepts activation conditions, task-led descriptions
such as "Review API contracts", read-only summaries with a named scope, and
slash-command routing. This follows the [Agent Skills description guidance](https://agentskills.io/specification#description-field)
without requiring one fixed English trigger phrase. Empty or unscoped
descriptions still fail. Length warnings, malformed-field errors,
dangerous-instruction checks, and the minimum score of 80 remain in force.

[`skillz-source.json`](skillz-source.json) records the source revision and a
SHA-256 content digest for each imported skill tree. The catalog regression
checks detect missing skills, changed supporting files, and source drift.
These digests do not grant trust, qualification, activation, or execution
authority.

The source repository is a mixed-license collection. Per-skill license files
and notices are preserved inside the imported directories. Review the source
repository's
[`LICENSES.md`](https://github.com/jaydubya818/skillz/blob/44df27bc06f11d76d9f490c76578f222e254be6f/LICENSES.md)
before redistributing an individual skill outside this collection.

## Verification

Run the focused compatibility checks after updating the catalog:

```bash
pnpm --filter @mission-control/context-tools test
pnpm --filter @mission-control/context-tools build
node scripts/skill-lint.mjs --min-score 80
```

The expected repository inventory is 118 skill directories, comprising 109
vendored skills and 9 native Mission Control integration skills, plus the root
`SKILL.md` document.

The focused tests run offline. `mc-context scan` and
`scripts/import-repo-skills.mjs` write to the configured Convex deployment.
Run them only for an explicitly authorized registry import. Updating repository
files does not update a live registry or activate a Factory Version.

Download the full source collection and read runtime installation instructions
on the [Factory Skills page](https://fdlc.ai/factory-skills).
