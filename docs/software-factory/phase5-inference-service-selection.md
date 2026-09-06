# Phase 5 Inference Service Selection

Date: 2026-09-05
Baseline: `6d7146d5205aef729aee2960aed2a4ed8e8ab95c`, runtime contract v42
Decision status: APPROVED FOR OFFLINE IMPLEMENTATION; LIVE QUALIFICATION NOT AUTHORIZED

## Selected path

The bounded Phase 5 implementation wraps the existing orchestration-server
`POST /classify` LLM fallback path. When the governed-inference flag is enabled,
the shared gateway becomes the only transport-owning boundary used by that
path. Other coding harnesses can use the same gateway contract without owning
provider credentials, pricing, retries, fallback, or receipt persistence.

The first selected external route is exact and intentionally narrow:

| Dimension | Selected value |
| --- | --- |
| Provider | `openai` |
| Provider route | `openai-chat-completions` |
| Model snapshot | `gpt-4o-mini-2024-07-18` |
| Endpoint | `POST https://api.openai.com/v1/chat/completions` |
| Provider adapter | `mission-control-openai-chat-completions` `1.0.0` |
| Gateway contract | `governed-inference-gateway/v1` |
| Credential class | isolated server-side `OPENAI_API_KEY`; never accepted from or returned to a harness |
| SDK retry policy | none; the adapter uses one raw `fetch` per claimed physical intent |
| Fallback | disabled for the qualification route |

The offline provider fixture uses the same request/response contract and exact
route identity, but performs no network call and receives no credential.

## Existing evidence and admission decision

The adapter and route exist in the repository, but there is no evidence that
`openai` / `openai-chat-completions` / `gpt-4o` is an independently qualified
Mission Control exact route. Existing live evidence instead covers Codex CLI
routes whose harness-owned ChatGPT transport does not expose the request and
billing identities required by this gateway.

Therefore:

- contract, schema, lifecycle, concurrency, recovery, fixture, accounting, and
  projection qualification may proceed offline;
- the selected external route remains disabled and unqualified by default;
- no live provider call, credential use, model spend, or gateway cutover is
  authorized by this record;
- the two-route comparison must record `NO_GO` unless two exact gateway routes
  later have independent qualification evidence;
- a later live call requires the Product Owner's exact provider, account,
  environment, model, call-cap, money-cap, and synthetic-input authorization.

## Harness-agnostic boundary

The gateway request binds a canonical Attempt and an exact inference route. It
does not include a Codex, Deep Agents, Claude Code, or other harness identity.
Harness/runtime/backend compatibility remains governed by the Execution Profile
and Factory Version. This lets builders replace either the coding harness or the
model provider without collapsing the two identities.

## Rollback

Before a live cutover, the Phase 5 flag can disable gateway admission while the
existing route remains unchanged. After any future route is qualified and cut
over, rollback may disable new gateway admission or select another qualified
gateway adapter; it must not restore a credential-owning direct provider bypass.
Reservations, intents, receipts, reconciliations, and outcomes remain retained.
