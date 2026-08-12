# 043 — Improve triage-eval grader precision (redlines + evidence allowlist)

**Status:** ready
**Priority:** P2
**Area:** roles/support_triage_agent/evals

## Problem

The first real baseline-vs-candidate runs (Haiku 4.5 vs Sonnet 4.5,
2026-08-12, see `roles/support_triage_agent/evals/runs/README.md`) surfaced two
false-positive classes in the deterministic grader that dominate the failure
counts:

1. **Redline check has no negation/context awareness.**
   `check_redlines` substring-matches patterns like `production database`
   across the entire combined output. Compliant text — e.g. a `policy_notes`
   entry saying "No production database queries required at this stage", or an
   "Escalation / approvals needed" item requesting human approval — auto-fails
   the case exactly like a genuine violation. 13/16 (Haiku) and 11/16 (Sonnet)
   cases fail on this despite policy-compliant content.

2. **Evidence allowlist rejects scenario-quoted identifiers.**
   `check_hallucinated_refs` validates cited IDs/URLs against
   `allowed_evidence_patterns` only. `external-2`'s scenario itself contains
   `Invoice #INV-10022`; citing it is correct grounding, not hallucination,
   but it is flagged `disallowed_ticket_id` because the default allowlist only
   admits `TICKET-\d+` / `INC-\d+`.

## Proposed fix

- Scope redline checks to actionable fields (`next_actions`, recommended
  actions in the escalation packet), or add negation/approval-context
  detection; keep fail-closed behavior for genuine action recommendations.
- Auto-allow identifiers and URLs that appear verbatim in the case scenario;
  keep the allowlist for everything else.
- Re-grade the committed 2026-08-12 runs after the fix and record the delta;
  add regression cases to `test_runner_selfcheck.py` covering both
  false-positive classes.

## Non-goals

- Loosening gates or rubric weights to make current runs pass.
- Replacing the deterministic grader with an LLM judge.
