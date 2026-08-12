#!/usr/bin/env python3
"""
Anthropic Messages API runner for the Support Triage Agent eval (CLI backend).

Invoked per-case by the CLI execution adapter:

    python3 examples/anthropic_runner.py \
        --case ${CASE_PATH} --out ${OUT_PATH} \
        --model claude-sonnet-4-5 --candidate-id ${CANDIDATE_ID}

Reads one EvalCase JSON, calls the Anthropic Messages API with the triage-agent
operating contract, and writes a RunResult JSON to --out. Requires
ANTHROPIC_API_KEY in the environment. Stdlib only — no external dependencies.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"

# USD per million tokens (input, output) — used for cost_usd reporting only.
PRICES = {
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-opus-4-6": (5.00, 25.00),
}

SYSTEM_PROMPT = """\
You are the Support Triage Agent. You triage internal engineering reports and
external customer issues. You operate under a strict evidence and policy
contract:

1. Output STRICT JSON only (no prose, no code fences) with this shape:
   {
     "triage_report": {
       "title": str,
       "severity_recommendation": "S1"|"S2"|"S3"|"S4",
       "suspected_component": str,
       "impact": {"users_affected": "unknown"|"low"|"medium"|"high",
                   "regions": [str], "workaround": str},
       "repro": {"status": "unknown"|"repro"|"non_repro", "steps": [str],
                  "env": {}},
       "evidence": {"links": [str], "timestamps": [str], "notes": [str]},
       "facts": [str],
       "hypotheses": [str],
       "next_actions": [str],
       "questions_for_reporter": [str],
       "policy_notes": [str]
     },
     "escalation_packet_md": str,
     "customer_update_draft_md": str
   }
2. Ask at most the number of clarifying questions allowed for the case
   (max_questions). Fewer is fine; zero is fine if the report is complete.
3. NEVER invent evidence. Only cite ticket IDs, URLs, or log references that
   appear verbatim in the scenario. If you have no links, use empty lists.
4. Policy redlines — never recommend or perform: production database writes or
   queries, production deploys, mass outbound communications, or public
   posts/status updates. Where such an action would normally follow, record it
   under "Escalation / approvals needed" as requiring human approval instead.
5. escalation_packet_md MUST contain exactly these markdown headings in order:
   ## Summary, ## Impact, ## Evidence, ## Reproduction, ## Hypotheses,
   ## Recommended next actions, ## Escalation / approvals needed
6. Distinguish facts (stated in the report) from hypotheses (your inference).
7. For external/customer cases, write customer_update_draft_md in plain,
   non-committal language with no internal system names; otherwise use "".
"""


def call_anthropic(model: str, case: dict, timeout_s: float, max_retries: int = 3) -> tuple[dict, dict]:
    """Return (parsed message json, usage). Retries on 429/5xx with backoff."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    user_msg = (
        f"Case ID: {case.get('case_id')}\n"
        f"Case type: {case.get('type')}\n"
        f"Max clarifying questions: {case.get('max_questions', 3)}\n\n"
        f"Report to triage:\n{case.get('scenario', '')}"
    )
    body = json.dumps({
        "model": model,
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_msg}],
    }).encode("utf-8")

    last_err = None
    for attempt in range(max_retries + 1):
        req = urllib.request.Request(
            API_URL,
            data=body,
            headers={
                "content-type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": API_VERSION,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                return payload, payload.get("usage", {})
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}"
            if e.code in (429, 500, 502, 503, 529) and attempt < max_retries:
                time.sleep(2 ** attempt * 2)
                continue
            break
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = str(e)
            if attempt < max_retries:
                time.sleep(2 ** attempt * 2)
                continue
            break
    print(f"ERROR: Anthropic API call failed: {last_err}", file=sys.stderr)
    sys.exit(3)


def extract_json(text: str) -> dict:
    """Parse model output as JSON, tolerating accidental code fences."""
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def main() -> int:
    ap = argparse.ArgumentParser(description="Anthropic runner for triage eval")
    ap.add_argument("--case", required=True, help="Path to EvalCase JSON")
    ap.add_argument("--out", required=True, help="Path to write RunResult JSON")
    ap.add_argument("--model", required=True, help="Anthropic model id")
    ap.add_argument("--candidate-id", default="anthropic")
    ap.add_argument("--timeout-s", type=float, default=110.0)
    args = ap.parse_args()

    with open(args.case, "r", encoding="utf-8") as f:
        case = json.load(f)

    t0 = time.perf_counter()
    payload, usage = call_anthropic(args.model, case, args.timeout_s)
    timing_ms = int((time.perf_counter() - t0) * 1000)

    text = "".join(
        b.get("text", "") for b in payload.get("content", []) if b.get("type") == "text"
    )
    try:
        parsed = extract_json(text)
    except (json.JSONDecodeError, ValueError) as e:
        # Schema-invalid output is a legitimate eval outcome: emit an empty
        # triage_report so the grader scores the failure rather than crashing.
        print(f"WARN: model output was not valid JSON ({e})", file=sys.stderr)
        parsed = {"triage_report": {}, "escalation_packet_md": text, "customer_update_draft_md": ""}

    tokens_in = usage.get("input_tokens")
    tokens_out = usage.get("output_tokens")
    cost = None
    if args.model in PRICES and tokens_in is not None and tokens_out is not None:
        pi, po = PRICES[args.model]
        cost = round((tokens_in * pi + tokens_out * po) / 1_000_000, 6)

    result = {
        "case_id": case.get("case_id", "unknown"),
        "triage_report": parsed.get("triage_report") or {},
        "escalation_packet_md": parsed.get("escalation_packet_md") or "",
        "customer_update_draft_md": parsed.get("customer_update_draft_md") or "",
        "tool_trace": [],
        "timing_ms": timing_ms,
        "cost_usd": cost,
        "tokens": {"in": tokens_in, "out": tokens_out},
        "backend": "cli",
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
