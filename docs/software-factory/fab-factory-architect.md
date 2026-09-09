# Fab Factory Architect

Fab is the persistent conversational architect for Mission Control's Software Factory. Operators use Fab from the **Fab** tab in the right-hand Chat dock.

## Scope

Fab receives a current, workspace-authorized projection of:

- connected repositories and governed component scopes
- active Factory definitions, versions, execution backends, model bindings, and budgets
- agents, tasks, WorkOrders, Attempts, releases, approvals, and blocking states
- alerts, incidents, traces, failures, token usage, and recorded costs
- open, evidence-linked Factory improvement proposals
- recent messages from the selected Fab conversation

The provider context is bounded and redacted. Private repository names and paths, operator email addresses, credentials, bearer tokens, user home-directory names, raw logs, and unrestricted record bodies are excluded. The exact redacted context has a canonical digest stored with the inference receipt.

## Dual OpenRouter route

| Work | Exact model | Maximum output | Liability reserved before dispatch |
| --- | --- | ---: | ---: |
| Routine status, inventory, and summaries | `openai/gpt-4.1-mini` | 512 tokens | $0.02 |
| Architecture, requirements, diagnosis, and fix proposals | `openai/gpt-5.6-sol` | 1,200 tokens | $0.10 |

Both models use `https://openrouter.ai/api/v1/chat/completions`. Each request disables provider fallback and performs one dispatch. Mission Control verifies the returned model identity and requires provider-reported usage and cost before recording success.

The dedicated production key has a $1.94 provider limit. Mission Control also enforces one deployment-wide $1.94 liability ledger. Ambiguous dispatched failures consume their full reservation so retries cannot evade the ceiling.

## Proactive behavior

The Fab tab reacts to current alerts, incidents, failed traces, cost receipts, and open improvement proposals. Existing deterministic Factory scanners create evidence-linked meta-loop proposals. Fab explains those signals and suggests concrete fixes when the operator opens or asks from the chat.

## Authority boundary

Fab may inspect, explain, compare, plan, and suggest. Its answer is advisory evidence. Repository mutation, WorkOrder dispatch, publication, merge, release, deployment, production acceptance, credential changes, and budget expansion continue through Mission Control's existing governed actions and independent verification.

Bedrock remains supported and optional with status `EXTERNAL_WAIT / AWS_QUOTA`. It is not a Fab readiness dependency while an OpenRouter route is qualified and active.
