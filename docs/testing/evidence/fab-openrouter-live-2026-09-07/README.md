# Fab OpenRouter live qualification

Status: **PASS**

- Recorded: `2026-09-08T01:03:22.937Z`
- Mode: approved non-production local qualification with synthetic data
- Provider route: `openrouter`
- Model: `openai/gpt-4.1-mini`
- Upstream provider returned by OpenRouter: `OpenAI`
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Protocol: `openrouter-chat-completions/non-streaming`
- Route digest: `sha256:7298d9ef168f087e078859f97cab4f50f7f234ed5368b80fdab553fad0cba856`
- Retries/fallbacks: `0` / disabled
- Per-Attempt key ceiling: `$0.50`
- Hard aggregate liability ceiling: `$5.00`
- Maximum conservative aggregate liability after this run: `$3.054822`
- Actual successful-run cost: `$0.0028808`
- Producer usage: 5,818 input tokens, 346 output tokens, 0 cache-read tokens
- Producer latency: 26,776 ms
- Producer Attempt: `attempt-producer-045c65f1-64ec-473a-aed3-aabaf7ac630e`
- Candidate revision: `4113185220ca76d5af5ca0d2a08cec0c1c0ac6d1`
- Independent verifier Attempt: `attempt-verifier-d08baa28-12cd-4ac9-9210-dd471d201422`
- Verifier result: `PASS`, exact candidate subject observed, 57 ms
- Evidence digest: `edfb93ad1dc3a2c013f1631eacc8c35aff95e8a2a8a02f202bf5f1a95b69b024`

The successful WorkOrder required eight sequential model requests for the bounded plan/build/check tool loop. Every request returned HTTP 200, exact model `openai/gpt-4.1-mini`, provider `OpenAI`, actual usage/cost, and a provider response ID. No retry or fallback occurred. The attempt-scoped credential was revoked and revocation was confirmed after execution.

Five preceding qualification dispatches failed with HTTP 400 before usable inference evidence while the OpenRouter tool schema was being corrected. Each had a separate `$0.50` maximum key, zero retries, no reported usage or cost, and confirmed revocation. They remain in this directory as failure evidence and are included conservatively in the aggregate liability calculation.

Readiness is `READY` under `AT_LEAST_ONE_QUALIFIED_PROVIDER_ROUTE`: OpenRouter is `ACTIVE_QUALIFIED`; Bedrock is optional and remains `EXTERNAL_WAIT` with reason `AWS_QUOTA`.
