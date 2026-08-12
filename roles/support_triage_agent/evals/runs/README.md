# Eval runs

Committed artifacts from real baseline-vs-candidate model runs of the Support
Triage Agent eval (16 cases, `eval_cases.jsonl`), executed 2026-08-12 via the
CLI backend and `examples/anthropic_runner.py` against the Anthropic Messages
API.

| Artifact | Contents |
|---|---|
| `claude-haiku-4-5.jsonl` | Baseline run — Claude Haiku 4.5, 16/16 cases |
| `claude-sonnet-4-5.jsonl` | Candidate run — Claude Sonnet 4.5, 16/16 cases |
| `claude-haiku-4-5.graded.json` | Deterministic grading (`grade_eval.py`, `rubric.yaml`) |
| `claude-sonnet-4-5.graded.json` | Deterministic grading |
| `comparison.json` | Ranked comparison with cost and p95 latency (`compare.py`) |

## Headline results

| Metric | Haiku 4.5 (baseline) | Sonnet 4.5 (candidate) |
|---|---|---|
| Weighted score | 3.92 | 4.06 |
| Schema compliance | 16/16 | 16/16 |
| Question-count discipline | 16/16 | 16/16 |
| Required escalation headings | 16/16 | 16/16 |
| Total run cost | ~$0.10 | ~$0.30 |
| Mean latency per case | ~11s | ~23s |

## Known grader precision issues (surfaced by these runs)

Both runs show `pass: false` driven almost entirely by two false-positive
classes in the deterministic checks — the models' outputs are compliant on
manual review:

1. **Redline substring matching flags compliant language.** The redline
   patterns match anywhere in the combined output, so policy-*compliant* text
   such as `"No production database queries required at this stage"`
   (candidate output, `internal-2`, `policy_notes`) is flagged as
   `prod_db_write` and auto-fails the case. The check needs negation/context
   awareness or scoping to `next_actions`.
2. **Evidence allowlist excludes scenario-quoted identifiers.** `external-2`'s
   scenario itself contains `Invoice #INV-10022`; candidates that correctly
   cite it are flagged `disallowed_ticket_id:INV-10022` because the default
   allowlist only admits `TICKET-\d+` / `INC-\d+`. Scenario-verbatim
   identifiers should be auto-allowed.

Tracked in `todos/043-ready-p2-triage-eval-grader-precision.md`. The gates are
intentionally left strict (fail-closed) until the checks are fixed; do not
loosen the rubric to make these runs "pass".

## Reproducing

See "Real-model runs (Anthropic)" in `../README.md`. Runs require
`ANTHROPIC_API_KEY`; grading and comparison are deterministic and offline.

Historical note: earlier files in this directory were produced by the built-in
stub backend (clearly marked `[stub]` in their content) and were removed when
these real runs landed.
