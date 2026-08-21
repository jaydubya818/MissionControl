# Historical versus current evidence

## Historical context retained

The prior hardened Remote Sandbox qualification remains evidence for this immutable image and profile:

- 0 Critical / 0 High vulnerabilities;
- live canary PASS and strict 3/3 first-pass with zero retries;
- UID/GID 10001, `no_new_privs`, and empty capabilities;
- guest nftables enforcement with no provider-enforced egress claim;
- Attempt-scoped inference credentials and bounded revocation;
- exact VM teardown and final inventory zero.

The qualification packet also explicitly states `qualificationOnly: true`, Guarded Auto disabled, and no global promotion.

Historical local Factory pilots identify `openai/gpt-5.6-terra` as the qualified local Codex model and preserve execution/verification results, but they predate current Factory-Version binding.

## Current production evidence

Current production has no Factory Definitions, Factory Versions, readiness assessments, model-catalog entries, Sandbox Profiles, worker bindings, routing policies, routing decisions, or Factory Attempts. Therefore none of the historical runs count toward the fixed routing thresholds.

No historical record was copied, re-keyed, or presented as a current Attempt.
