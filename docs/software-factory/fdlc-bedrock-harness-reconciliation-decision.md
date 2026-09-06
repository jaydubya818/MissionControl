# Bedrock harness compatibility decision

Status: APPROVED for offline implementation and qualification by Product Owner attachment f55036a1 (2026-09-05). No AWS, model call, readiness, WO1, push or publication authority. Historical proposal follows; implementation is tracked separately.

Current main ed77c46 retains immutable `codex/v1`: providerSelection UNSUPPORTED,
only OpenAI model identities, and an effective remote provider configuration bound
to OpenRouter's Responses API. `harnessSupportsModel` rejects aws-bedrock +
anthropic.claude-sonnet-4-6. `executionProfileIssues` therefore rejects that exact
Bedrock route as model-route-unsupported. A generic price or route digest does not
remove this gate. The offline Bedrock provider adapter alone is not a compatible
Codex execution adapter. Earlier fixture success did not prove this composition.

Proposed decision: authorize a separately versioned `codex/bedrock-v1` harness and
broker composition for offline qualification. Preserve codex/v1 and all historic
image/profile/manifest digests. Preserve FactoryAttemptWorker → RemoteSandboxRuntime
→ DockerSandboxProvider → Codex 0.146.0. Build a bounded Responses-to-Bedrock bridge
using the existing Converse/InvokeModel provider adapter and canonical liability
service commands, zero retries, exact US profile policy, no default credentials,
no terminal publication authority and no real model invocation. Freeze a distinct
effective configuration and capability manifest for this new composition. Any
runtime-image change must receive its own explicit identity review; do not silently
replace the approved image. Qualify the whole bridge with deterministic tool-loop,
unknown-outcome, cancellation, timeout and no-bypass fixtures before AWS use.

This changes the approved harness/execution binding and needs owner choice under
the instruction to preserve the exact route and not weaken governance. The
alternative is to retain the current rejection and defer this binding. Switching
provider/model or advertising Bedrock support on the old manifest is not an option.

Independent reconciliation work continues. No claim that AWS identity is the sole
remaining prerequisite will be made until this compatibility boundary is resolved.
