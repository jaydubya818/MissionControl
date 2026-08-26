---
title: Real Product-Repository Pilot Operations
status: ACTIVE
last_verified: 2026-08-26
---

# Real Product-Repository Pilot Operations

This runbook governs the first production-evidence pilot. It does not certify
Remote Sandbox for general production use and does not grant merge, deployment,
Guarded Auto, or learning-promotion authority.

## Entry gate

Before the first dispatch:

1. Copy `production-pilot-manifest.example.json` to the retained pilot evidence
   directory and replace every placeholder with the exact repository, team,
   champion, forward-deployed engineer, incident commander, and evidence paths.
2. Classify the repository as `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or
   `RESTRICTED`. Missing legacy classifications are treated as sensitive and
   block new Factory versions.
3. Use an approved local host for `INTERNAL`, `CONFIDENTIAL`, or `RESTRICTED`
   repositories. A remote profile is eligible only when immutable readiness,
   qualification, and security evidence all prove provider-enforced egress.
4. Complete and retain the preflight incident drill across `Clarify → Contain →
   Observe → Isolate → Restore → Correct → Prevent → Measure`.
5. Run the deterministic gate:

   ```bash
   pnpm run pilot:preflight -- /absolute/path/to/production-pilot.json
   ```

A failing gate is a no-go decision. Do not repair it through direct database
writes or by weakening repository classification.

## Pilot portfolio

Run at least ten accepted WorkOrders spanning bug fix, feature, refactor, and
security/policy work. Use the complete browser path:

`Mission → Spec → Plan → approval → WorkOrder → Task → Attempt → independent verification → Review Package → human acceptance → pull request`

Preserve failed Attempts, corrective iterations, reviewer corrections, and
rejected outcomes. Human acceptance and human merge remain separate decisions.

## Required measures

For every WorkOrder, retain:

- intent, Plan, WorkOrder revision, Attempt, immutable candidate, evidence,
  Review Package, pull request, and human decision identifiers;
- time to review-ready pull request, review latency, human-attention minutes,
  retry count, correction count, recovery time, and first-pass verification;
- actual model, compute, sandbox, and review cost when attributable;
- `null`, with an explicit reason and coverage impact, when a cost cannot be
  attributed; and
- outcome status after acceptance, including rollback or incident linkage.

Unknown cost is never zero and cannot support an efficiency claim.

Record accepted results in the same retained manifest. Each result must include
the exact lineage identifiers through human acceptance and merge decisions,
delivery and review timing, first-pass status,
correction and recovery evidence, six cost components (`model`, `compute`,
`sandbox`, `humanAttention`, `retry`, and `review`), and an observed outcome.
Represent an unavailable cost as `{"usd": null, "unknownReason": "...",
"coverageImpact": "..."}`. A measured cost requires an exact billing or
calculation evidence reference.

## Failure drills

Exercise process restart, provider outage or rate limit, late event,
cancellation, stale evidence, pull-request head drift, credential revocation,
and cleanup failure. Each drill must fail closed, preserve evidence, and either
recover within policy or produce an actionable human decision packet.

## Exit decision

Record go or no-go with sample counts and coverage for accepted WorkOrders,
first-pass verification, correction, recovery, cost, time to review-ready pull
request, and human attention. Zero authority-boundary, company-scope, secret,
or repository-scope escapes are permitted.

After the outcome observation window closes, run the deterministic exit gate:

```bash
pnpm run pilot:assess -- /absolute/path/to/production-pilot.json
```

The assessor calculates cost coverage and accepted outcome counts. It rejects
missing lineage, unowned failure evidence, safety escapes, and any efficiency
claim made while accepted cost values remain unknown. A fully evidenced
`NO_GO` decision is a valid pilot result; do not rewrite it into a pass.

Phase 2 may begin only after this evidence and decision exist. Remote Sandbox
remains Preview until provider egress and sustained real-work evidence meet the
separate promotion gate.
