# Skillz catalog

Mission Control vendors the complete 61-skill catalog from
[`jaydubya818/skillz`](https://github.com/jaydubya818/skillz) at commit
`08b88b09d41703e6ce864bed8a351bb089462110`.

The imported directories live under `skills/`, alongside Mission Control's
native API integration skills. This is the authoritative location for local
`mc-context scan` discovery and governed repository import.

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

The source repository is a mixed-license collection. Per-skill license files
and notices are preserved inside the imported directories. Review the source
repository's
[`LICENSES.md`](https://github.com/jaydubya818/skillz/blob/08b88b09d41703e6ce864bed8a351bb089462110/LICENSES.md)
before redistributing an individual skill outside this collection.

## Verification

Run the focused compatibility checks after updating the catalog:

```bash
pnpm --filter @mission-control/context-tools test
pnpm --filter @mission-control/context-tools build
node scripts/skill-lint.mjs
```

The expected repository inventory is 70 skill directories, comprising 61
vendored skills and 9 native Mission Control integration skills, plus the root
`SKILL.md` document.
