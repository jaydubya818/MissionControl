---
status: complete
priority: p2
issue_id: "065"
tags: [skills, context-registry, agent-skills]
dependencies: []
---

# Import the Skillz catalog

## Problem Statement

Mission Control needs the 61 skills from `jaydubya818/skillz` in its local
catalog. The upstream files use portable Agent Skills metadata that the current
Mission Control parser rejects, so copying them without boundary support would
leave the integration unusable.

## Findings

- `scripts/mc-context.mjs` discovers repository-level `skills/` directories.
- The 61 source directories do not conflict with the nine existing native
  Mission Control skills.
- `packages/context-tools/src/skillFrontmatter.ts` rejects nested `metadata`,
  `license`, and `allowed-tools` fields.
- The source catalog intentionally keeps portable frontmatter and should remain
  unchanged for reproducible updates.
- No relevant prior solution exists under `docs/solutions/`.

## Proposed Solutions

### Option 1: Normalize at the parser boundary

Accept the portable metadata subset and normalize it into Mission Control's
existing internal shape.

**Pros:** Keeps upstream files intact, supports both formats, and makes future
updates mechanical.

**Cons:** Expands the parser and its test matrix.

**Effort:** Small.

**Risk:** Low.

### Option 2: Rewrite every imported frontmatter block

Convert the 61 files to Mission Control's legacy flat format.

**Pros:** Avoids parser changes.

**Cons:** Forks upstream content, complicates updates, and weakens portable
Agent Skills compatibility.

**Effort:** Medium.

**Risk:** Medium.

## Recommended Action

Use Option 1. Vendor the pinned source catalog, extend only the deterministic
frontmatter boundary, retain legacy compatibility, and verify every repository
skill through Mission Control's linter.

## Technical Details

**Affected files:**

- `skills/<imported-skill>/`
- `packages/context-tools/src/skillFrontmatter.ts`
- `packages/context-tools/src/__tests__/skillFrontmatter.test.ts`
- `scripts/import-repo-skills.mjs`
- `AGENTS.md`
- `docs/skills/skillz-catalog.md`

No database changes are required.

## Resources

- [Implementation plan](../../docs/plans/2026-09-12-feat-import-skillz-catalog-plan.md)
- [Skillz repository](https://github.com/jaydubya818/skillz)

## Acceptance Criteria

- [x] Vendor 61 source skill directories from a pinned commit.
- [x] Parse both legacy flat and portable nested metadata.
- [x] Preserve existing serialization behavior.
- [x] Add focused parser tests.
- [x] Pass context-tools tests and repository skill lint.
- [x] Verify the complete catalog is locally discoverable.
- [x] Document provenance, licensing, and routing policy.

## Work Log

### 2026-09-12 - Import and compatibility discovery

**By:** Codex

**Actions:**

- Inspected the source repository, its installer guidance, and licensing map.
- Vendored all 61 skill directories from commit
  `08b88b09d41703e6ce864bed8a351bb089462110`.
- Built context-tools and ran Mission Control's skill linter.

**Learnings:**

- All 61 imported files fail only at the legacy frontmatter parser boundary.
- Keeping upstream files unchanged is materially safer than maintaining a
  Mission Control-specific fork of every skill.

### 2026-09-12 - Compatibility and verification complete

**By:** Codex

**Actions:**

- Added deterministic support for scalar portable metadata, `license`,
  `allowed-tools`, and `user-invocable` while retaining the legacy flat shape.
- Added parser and linter regressions for portable fields, precedence, malformed
  metadata, and `Apply when` activation wording.
- Added the repository import owner fallback, source documentation, and lazy
  routing policy.
- Verified 70 unique locally discoverable skills with no collisions.
- Ran context-tools tests, repository-wide typechecking, skill linting, and the
  repository test suite.

**Learnings:**

- Context-tools passed all 200 focused tests. Repository-wide typechecking
  passed. Skill lint covered 71 documents with zero errors and zero warnings.
- The full repository suite passed all relevant packages. Two unrelated
  orchestration worker tests still require the absent
  `MISSION_CONTROL_SERVICE_COMMAND_SECRET` and did not complete their worker
  lifecycle assertions.
