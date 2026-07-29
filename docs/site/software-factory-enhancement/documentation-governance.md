# Documentation Governance

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-009 |
| Status | PUBLISHED |
| Owner | Mission Control Platform |
| Reviewer | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | Continuous Software-Factory Research and Improvement (`gs7jkmzhhhfhp2gj4pc1gggych8bd0x9`) |
| Created / updated | 2026-07-28 |
| Source commit | Operator policy and mirror `78d7219` |
| Document version | 1.0 |

## Summary

Every material finding, decision, plan, implementation update, test result,
risk, and recommendation must exist in Mission Control Docs and, when
engineering detail requires version control, under repository `docs/`. Final
chat responses summarize and link; they are not the source of truth.

## Synchronization contract

1. Commit detailed engineering content under `docs/`.
2. Create or update the operator-facing Docs page.
3. Include summary, status, decisions, risks, questions, actions, and evidence.
4. Record the Docs ID/title in the repository document.
5. Record source commit, version, and synchronization date.
6. Update both sides for every material change.
7. Mark superseded documents; do not leave contradictory current copies.

## Required metadata

Title, status, owner, reviewer, workspace, repository, related records,
created/updated/review dates, source commit, version, summary, decisions, risks,
open questions, next actions, evidence, and repository mapping.

## Status model

```text
DRAFT → IN_REVIEW → APPROVED → PUBLISHED
                       └──────→ SUPERSEDED → ARCHIVED
```

The current static Docs browser displays status but does not enforce it.
Approval enforcement is future work and must not be implied.

## Decision records

Each material decision records context, options, selection, reason, tradeoffs,
evidence, risk, revisit trigger, owner, approver, related records, and commit.

## Failed workflow records

Every meaningful failed UI workflow gets an individual defect with severity,
workspace/page/URL, browser/commit/date, reproduction, expected/actual result,
screenshot/trace, console/network information, owner, status, resolution, and
verification.

## Research records

External sources require publisher/author/URL/dates/type/category/freshness,
authority, claims/conflicts, vendor indicator, confidence, recommendations, and
related Mission. Unsupported claims are not settled facts.

## Decisions

- operator Docs and Git documentation are both required;
- no important conclusion may exist only in chat;
- no direct Convex insertion substitutes for a UI journey;
- static repository pages are the current compatibility path, not the final
  dynamic authoring product.

## Risks

- drift between copies;
- unsupported status interpreted as approval;
- missing source commit;
- unsearchable new pages;
- placeholder documents mistaken for research.

## Open questions

- dynamic document record schema;
- Git import/export conflict policy;
- publication approval authority;
- review cadence by document type.

## Next actions

Apply this contract to each Loop Engineering cycle and implement automated drift
reporting only after the synchronization design is approved.

## Supporting evidence and repository mapping

- Repository policy: `docs/software-factory/documentation-governance.md`
- Docs assessment: `docs/plans/mission-control-docs-assessment.md`
- Last synchronized: 2026-07-28
