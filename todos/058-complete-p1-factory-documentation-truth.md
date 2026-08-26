---
status: complete
priority: p1
issue_id: "058"
tags: [software-factory, documentation, maturity, governance]
dependencies: []
---

# Establish Software Factory Documentation Truth

## Problem Statement

Mission Control's current implementation, historical plans, runbooks, and the
AI Software Factory Mastery case study make inconsistent maturity claims. That
can cause operators to treat qualification evidence as broader production proof.

## Findings

- Runtime source is v32 while the prior README claimed v28.
- Production Pilot V3 proved a bounded 3/3 live remote cohort, while current
  prose still described fake-provider-only proof.
- The July capability map, August system assessment, legacy REST runbook, and
  Observability/Evals plan were presented with stale status.
- `/Users/jaywest/ai-software-factory-mastery` exists as a separate repository
  and requires its own clean baseline and documentation changes.

## Proposed Solutions

### Option 1: One canonical maturity ledger

Keep mutable implementation status in Mission Control, link durable principles
from the Mastery repository, and label historical material explicitly.

**Pros:** One source of truth, preserves history, limits drift.

**Cons:** Requires a consistency check and cross-repository maintenance.

**Effort:** Medium

**Risk:** Low

### Option 2: Duplicate the full status table everywhere

**Pros:** Every document appears self-contained.

**Cons:** Drift is guaranteed and authority becomes ambiguous.

**Effort:** Medium

**Risk:** High

## Recommended Action

Implement Option 1. Finish the local ledger and README reconciliation, add a
documentation consistency check, then update the Mastery repository to link to
the exact Mission Control baseline without becoming a second live status source.

## Technical Details

- `README.md`
- `docs/product/software-factory-capability-maturity.md`
- `docs/software-factory/README.md`
- historical plan, assessment, and runbook status notices
- `/Users/jaywest/ai-software-factory-mastery/README.md`
- `/Users/jaywest/ai-software-factory-mastery/guide/README.md`

## Acceptance Criteria

- [x] Every major capability has an owner, status, evidence, limitation, and promotion gate.
- [x] README runtime and Remote Sandbox claims match current source and retained evidence.
- [x] Historical assessments and runbooks are visibly non-authoritative.
- [x] A deterministic consistency check catches contradictory current maturity claims.
- [x] The Mastery repository uses the same factory language and a current pinned case study.
- [x] Relative links and documentation validation pass in both repositories.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Preserved the existing documentation draft and created the canonical maturity ledger.
- Corrected runtime v32 and bounded live-remote evidence claims.
- Labeled stale capability, assessment, Observability/Evals, and REST-runbook material.

**Learnings:**
- Production-pilot eligibility and general production certification must remain distinct.
- The Mastery repository should teach durable principles and link to Mission Control for mutable status.

### 2026-08-25 - Documentation gate and cross-repository closure

**By:** Codex

**Actions:**
- Added `scripts/check-factory-docs.mjs`, focused regression tests, and the release qualification hook.
- Updated the Mastery root/curriculum, current maturity case study, reference architecture, MCP chapter, and Factory SRE incident framework at pinned Mission Control baseline `b3dfcee`.
- Verified relative links and `git diff --check` in both repositories.

**Learnings:**
- Chapter-specific historical commit pins remain useful when the current maturity map is explicitly authoritative for the latest assessment.
