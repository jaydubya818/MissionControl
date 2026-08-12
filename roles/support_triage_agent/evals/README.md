# Support Triage Agent — Eval Harness

Deterministic eval harness for internal and external support triage cases, with **pluggable execution backends** (CLI, HTTP, OpenClaw).

## Contents

- **eval_cases.jsonl** — 16 JSONL test cases (mix of internal + external)
- **grade_eval.py** — deterministic grader (schema, question count, hallucination, redlines, headings)
- **rubric.yaml** — weights, gates, required escalation headings, redline patterns
- **candidate_runner.py** — CLI entrypoint (single candidate or run_config)
- **runner/** — orchestration and adapters (cli, http, openclaw)
- **schemas/** — triage_report, packets, **candidate_manifest** (includes optional `execution`)
- **examples/** — baseline_candidate.json, opus46/codex53/kimi25_local/openclaw candidates, **run_config.yaml**
- **runs/** — run outputs (e.g. baseline.jsonl)

## Dependencies

- Python 3.10+
- Optional: `pip install pyyaml jsonschema` for full grading and run_config YAML (PyYAML for rubric/run_config; jsonschema for triage_report validation)

## Execution backends and precedence

Each candidate can run via:

| Backend   | Description |
|----------|--------------|
| **cli**  | Subprocess: `execution.cli.cmd` + `args`; substitutes `${CASE_PATH}`, `${OUT_PATH}`, `${CANDIDATE_ID}`, `${CASE_ID}` in args/env/cwd. Process must emit RunResult JSON to stdout or write to `OUT_PATH`. |
| **http** | POST `{ "candidate", "case" }` to `execution.http.url`; response must be RunResult. Configurable retries and timeout. |
| **openclaw** | PTY-supervised worker: workdir from `workdir_template`, `case.json` in workdir, entrypoint writes `run_result.json`. Convention-based; adjust entrypoint/args for your OpenClaw CLI. |

**Precedence** (which backend is used):

1. **Per-candidate run override** — In run_config, `candidates[].backend_override` (e.g. `http`).
2. **Candidate manifest** — `execution.backend` in the manifest.
3. **Run-level default** — `backend_default` in run_config or `--backend-default` on CLI.
4. **Fallback** — `cli`. If backend is `cli` but `execution.cli` is missing, the built-in stub runner is used.

## Run with run_config.yaml

From the **evals** directory (so that `suite_paths` and candidate paths resolve correctly):

```bash
cd roles/support_triage_agent/evals

# Run all candidates listed in run_config (writes runs/<candidate_id>.jsonl each)
python candidate_runner.py --config examples/run_config.yaml --out runs
```

Edit `examples/run_config.yaml` to set `suite_paths`, `backend_default`, and `candidates[]` (path + optional `backend_override`). Optional: `concurrency`, `timeout_ms`, `max_total_cost_usd`.

## Real-model runs (Anthropic)

`examples/anthropic_runner.py` is a stdlib-only CLI-backend runner that executes
cases against the Anthropic Messages API. Manifests
`examples/claude_haiku_candidate.json` (baseline) and
`examples/claude_sonnet_candidate.json` (candidate) wire it in via the `cli`
backend. Requires `ANTHROPIC_API_KEY` in the environment.

```bash
cd roles/support_triage_agent/evals
export ANTHROPIC_API_KEY=sk-ant-...

python candidate_runner.py --candidate examples/claude_haiku_candidate.json   --cases eval_cases.jsonl --out runs/claude-haiku-4-5.jsonl
python candidate_runner.py --candidate examples/claude_sonnet_candidate.json   --cases eval_cases.jsonl --out runs/claude-sonnet-4-5.jsonl

python grade_eval.py --run runs/claude-haiku-4-5.jsonl --cases eval_cases.jsonl --rubric rubric.yaml --out runs/claude-haiku-4-5.graded.json
python grade_eval.py --run runs/claude-sonnet-4-5.jsonl --cases eval_cases.jsonl --rubric rubric.yaml --out runs/claude-sonnet-4-5.graded.json
python compare.py runs/claude-haiku-4-5.graded.json runs/claude-sonnet-4-5.graded.json --run-dir runs
```

## Run single candidate (legacy)

```bash
cd roles/support_triage_agent/evals

# 1. Run one candidate
python candidate_runner.py \
  --candidate examples/baseline_candidate.json \
  --cases eval_cases.jsonl \
  --out runs/baseline.jsonl

# 2. Grade the run
python grade_eval.py \
  --cases eval_cases.jsonl \
  --run runs/baseline.jsonl \
  --rubric rubric.yaml
```

Exit code of `grade_eval.py` is 0 (pass) or 1 (fail). Output is JSON with `summary` and per-case `results`.

## Example candidates

| File | Backend | Use case |
|------|---------|----------|
| **baseline_candidate.json** | (none → stub) | No `execution`; uses built-in stub when `backend_default=cli`. |
| **opus46_candidate.json** | `http` | Opus 4.6 via HTTP: set `execution.http.url` to your eval endpoint. |
| **codex53_candidate.json** | `http` | Codex 5.3 via HTTP: same pattern. |
| **kimi25_local_candidate.json** | `cli` | Kimi K 2.5 local: set `execution.cli.cmd`/`args` to your local runner (e.g. script that reads `${CASE_PATH}`, writes RunResult to `${OUT_PATH}`). |
| **openclaw_candidate.json** | `openclaw` | OpenClaw worker: set `execution.openclaw.entrypoint` and optional `agent_path`; workdir convention: `case.json` in, `run_result.json` out. Entrypoint receives env `CASE_PATH`, `OUT_PATH`; if your OpenClaw CLI uses different flags, adjust `runner/adapters/openclaw_adapter.py`. |

No secrets in examples; set URLs and API keys via env or your own config.

## Grader checks

- **JSON Schema validation** — triage_report conforms to schemas/triage_report.schema.json
- **Question-count gate** — `questions_for_reporter` length ≤ max per case (default 3; override in case)
- **Hallucinated refs** — links and ticket IDs must match candidate’s `allowed_evidence_patterns`
- **Redline violations** — no prod DB write, prod deploy, mass comms, public posts in output
- **Required headings** — escalation packet markdown includes all headings in rubric

## Candidate manifest

See `schemas/candidate_manifest.schema.json`. The manifest can include an optional **execution** block:

- **execution.backend** — `"cli"` | `"http"` | `"openclaw"`
- **execution.cli** — `cmd`, `args`, optional `cwd`, `env`, `timeout_ms`
- **execution.http** — `url`, optional `headers`, `timeout_ms`, `retries`
- **execution.openclaw** — `entrypoint`, `agent_path`, `workdir_template`, `pty`, `timeout_ms`, `session_controls`

Manifests without `execution` remain valid; backend is chosen by run-level default or override (see precedence above).

## Self-test

From the evals directory:

```bash
python test_runner_selfcheck.py
```

Validates: manifest schema accepts legacy baseline manifest; precedence resolution; CLI adapter with `examples/echo_candidate.py` producing valid RunResult.
