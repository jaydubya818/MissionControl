---
title: "feat: Import the Skillz catalog"
type: feat
status: completed
date: 2026-09-12
---

# Import the Skillz catalog

## Problem

Mission Control currently bundles nine repository skills. The requested
`jaydubya818/skillz` catalog adds 61 delivery, architecture, evidence, review,
and engineering-principle skills, but its portable Agent Skills frontmatter
uses a nested `metadata` map. Mission Control's local parser only accepts the
legacy flat shape, so copying the catalog alone leaves every imported skill
invalid and prevents governed Registry import.

## Proposed solution

- Vendor all 61 skill directories from commit
  `08b88b09d41703e6ce864bed8a351bb089462110` into the repository-level
  `skills/` directory, which is an authoritative `mc-context scan` root.
- Preserve upstream skill content and bundled licenses unchanged.
- Extend the context-tools frontmatter boundary to accept one portable
  `metadata` mapping, top-level `license`, and scalar `allowed-tools`.
- Resolve Mission Control governance fields from either the legacy top level
  or `metadata`, with legacy fields taking precedence.
- Treat Agent Skills' `name` and `description` as the portable required fields.
  Keep `version` and `owner` when supplied; let the repository import boundary
  supply its existing `software-factory` owner when a portable skill omits it.
- Record the source repository and pinned commit, and add the recommended
  routing policy to `AGENTS.md` without preloading all skills.

## Data shape

`SkillFrontmatter` remains the normalized internal representation. It gains
optional portable fields (`license`, `allowedTools`, `metadata`) and makes
governance fields (`version`, `owner`) optional at the parsing boundary.
Comma-separated metadata capabilities normalize to the existing string array.

## Acceptance criteria

- [x] Exactly 61 new skill directories are present under `skills/`.
- [x] Existing flat Mission Control skill frontmatter still parses and
  serializes without behavior changes.
- [x] Portable nested metadata parses without rewriting upstream files.
- [x] All 70 repository skill directories plus the root skill pass structural
  lint with no frontmatter errors.
- [x] Context-tools tests cover metadata parsing, precedence, malformed nested
  metadata, and portable fields.
- [x] Repository discovery reports the complete local catalog without syncing
  external state during verification.
- [x] Source provenance and the recommended routing policy are documented.

## Risks

- A permissive YAML parser would enlarge the attack and maintenance surface.
  The implementation will continue to support only a deterministic subset and
  one scalar metadata mapping.
- Rewriting vendored frontmatter would make updates drift from upstream. The
  parser changes instead, and tests use representative untouched source shapes.
- Loading all 61 skills into every prompt would waste context and create
  conflicting instructions. Discovery remains description-driven and lazy.

## References

- `packages/context-tools/src/skillFrontmatter.ts`
- `packages/context-tools/src/__tests__/skillFrontmatter.test.ts`
- `scripts/mc-context.mjs`
- `scripts/import-repo-skills.mjs`
- `docs/architecture/agent-configuration-registry.md`
- [Skillz repository](https://github.com/jaydubya818/skillz)
