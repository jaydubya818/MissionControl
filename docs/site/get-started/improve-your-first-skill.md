# Improve your first skill

Walk through the registry lifecycle for a single SKILL package — the same loop Tessl documents, implemented in Mission Control.

## 1. Author the skill

Create `SKILL.md` with frontmatter and sections for validation, implementation, and activation triggers.

## 2. Lint locally

```bash
pnpm skill:lint path/to/SKILL.md
```

The linter scores three axes (validation, implementation, activation) 0–100. Fix warnings before import.

## 3. Import to registry

```bash
node scripts/import-repo-skills.mjs
# or Convex mutation: context/importSkills.importSkillMarkdown
```

Requires `context.registry` flag. Creates package + DRAFT version `0.1.0` (or next patch).

## 4. Add eval scenarios

In **Evaluate Skill** or via `contextEvalScenarios`, define:

- Task prompt representative of real usage
- Weighted criteria (structure, outcome, safety)

## 5. Run eval

Trigger **Eval Runs** — compare baseline vs candidate scores. Failed runs feed **meta-loop suggestions** (new verifiers, scenario gaps).

## 6. Publish

When `eval.framework` gate passes:

- Publish version with content hash
- Update `mc-context.lock` for target repo
- Sync **Installations** state

## 7. Observe activation

Use **Factory Health** and trace inspector to confirm the skill appears in run context snapshots — not just installed on disk.

See also: [Improving a skill](../tutorials/improving-a-skill.md), [Context CDL](../registry/context-cdl.md).
