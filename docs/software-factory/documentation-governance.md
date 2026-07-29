---
title: Mission Control Documentation Governance
date: 2026-07-28
status: PUBLISHED
owner: Mission Control Platform
reviewer: Product Owner
mission_control_docs_id: SFE-DOC-009
mission_control_docs_title: Documentation Governance
related_mission_id: gs7jkmzhhhfhp2gj4pc1gggych8bd0x9
related_work_order_ids: []
last_synchronized_date: 2026-07-28
---

# Mission Control Documentation Governance

## Policy

Every meaningful discovery, decision, plan, implementation update, test result,
defect, risk, and recommendation must be documented in Mission Control Docs.
When version-controlled engineering detail is material, it must also be stored
under repository `docs/`.

No major conclusion may exist only in a Codex final response. Chat summarizes
and links the durable records.

## Sources of truth

### Mission Control Docs

Operator-facing source for current status, summaries, decisions, risks, open
questions, next actions, evidence, and related records.

### Repository documentation

Engineering source for implementation detail, diagrams, migrations,
architecture decisions, test artifacts, and Git review.

Neither source may silently contradict the other.

## Required metadata

Mission Control pages include:

- document ID/title/version/status;
- owner/reviewer/workspace/repository;
- related Mission, Work Orders, Tasks, Runs, decisions, and evidence;
- created, updated, reviewed, and next-review dates;
- source commit;
- summary and detailed content;
- decisions, risks, questions, and actions;
- repository mappings.

Repository documents include, where applicable:

- Mission Control Docs ID/title;
- related Mission and Work Order IDs;
- last synchronization date.

## Synchronization workflow

1. Update and review detailed repository Markdown.
2. Update the corresponding operator page in the same bounded change.
3. Reconcile title, status, decisions, risks, and completed/proposed language.
4. Record the source commit/version and synchronization date.
5. Verify the operator page through the browser.
6. Search/open it, refresh it, and capture failure evidence.
7. Mark replaced documents SUPERSEDED and link their replacement.

Current static Docs pages are a compatibility mechanism. They do not enforce
approval or history. Future automatic bidirectional synchronization requires an
approved design with diff and conflict handling.

## Status model

`DRAFT → IN_REVIEW → APPROVED → PUBLISHED → SUPERSEDED → ARCHIVED`

Status must not be treated as enforced until the dynamic Docs workflow exists.

## Decision records

Material decisions require ID, title, date, status, context, alternatives,
selection, reason, tradeoffs, evidence, risk, revisit trigger, owner, approver,
related records, and commit.

## Defect records

Every meaningful failed UI workflow requires a distinct defect record with
severity, workspace/page/URL, browser/commit/date, reproduction, expected and
actual results, screenshot/trace, console/network evidence, related records,
owner, status, resolution, and verification.

## Research source register

External material requires title, publisher, author, URL, dates, retrieval,
type/category/freshness, authority, supporting and conflicting claims,
vendor-claim indicator, confidence, recommendation, related Mission, and notes.
Unsupported claims are not settled facts.

## Quality gates

- readable without source code;
- no placeholder pages;
- completed versus proposed is explicit;
- verified fact versus assumption is explicit;
- acronyms explained;
- evidence linked;
- diagrams readable when rendering is unavailable;
- correct workspace verified;
- no secret in Docs, logs, screenshots, or repository.

## Current limitation

Mission Control Docs is currently a static repository reader. Collections,
authoring, enforced status, approval, version history, relationships, and sync
are missing. See `docs/plans/mission-control-docs-assessment.md`.
