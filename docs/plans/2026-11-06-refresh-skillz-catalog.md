---
title: Refresh the Mission Control Skillz catalog
type: chore
status: complete
date: 2026-11-06
---

# Refresh the Skillz catalog

The repository contains 73 Skillz skills and nine native Mission Control
skills. Its catalog documentation still records the original 61-skill import.
Skillz commit `44df27bc06f11d76d9f490c76578f222e254be6f` contains 109 skills.

## Outcome

Make all 109 upstream skills discoverable in the repository, including the 36
missing skills. Preserve the nine native skills, supporting files, licenses,
and the current governance and publication boundaries. Update the FDLC Mission
Control page to explain the catalog and link to the complete download.

## Execution

1. Inspect catalog discovery, frontmatter parsing, lint, and source provenance.
2. Record the before state and exact upstream revision.
3. Refresh the vendored directories and record source hashes.
4. Resolve compatibility with the latest upstream metadata and descriptions.
5. Verify inventory, source integrity, parser round-trips, lint, and discovery.
6. Update the catalog docs and FDLC page, then verify the page in a browser.
7. Publish only within the user-authorized release scope and repository rules.

The initial compatibility check rejected 39 latest-source entries. The user
approved preserving upstream files and updating compatibility on November 6,
and explicitly authorized production deployment. The parser now preserves
`disable-model-invocation` independently of `user-invocable`. The linter accepts
task-led descriptions as well as activation conditions. The minimum score of
80 and dangerous-instruction checks are unchanged.

## Work boundaries

- Blocking first steps. Inventory and compatibility evidence precede imports.
- Independent workstreams. The catalog and FDLC page are separate checkouts.
- Shared mutable state. No live Convex registry, installation, activation,
  Factory Version, runtime contract, or policy is changed.
- Smallest safe decomposition. One agent performs the work sequentially, per
  the user's tool mapping. Parallel agent exploration is skipped.
- Architecture exploration is skipped. This follows the existing vendored
  catalog and context-tools parsing boundary.

## Acceptance

- All 109 upstream skills are present with recorded provenance.
- The 36 missing names are included and all nine native skill trees survive.
- Supporting references and license notices remain with their skills.
- The parser and structural quality gate accept the chosen import format.
- The minimum score remains 80 and dangerous-instruction checks still apply.
- The FDLC page distinguishes catalog availability from qualification and
  execution authority.
- No external registry import or production control-plane mutation occurs.

## Verification

- Context-tools: 223 tests pass across seven files, including the complete
  catalog inventory, source hashes, parser round-trips, and quality checks.
- Context-tools build and typecheck pass.
- Repository skill lint: 119 documents, zero errors, 85 advisory warnings,
  average score 92. Every document meets the minimum score of 80.
- Factory documentation consistency passes. The nine native skill directories
  have no changes.
- The FDLC page passes typecheck, lint, 66 unit tests, 29 rendered tests,
  both builds, and browser checks for both runtimes. Browser review also
  confirms the Skills navigation anchor clears the sticky header.

Implementation and local qualification are complete. Publication follows the
approved PR and production release process. No live registry import is part of
this release.
