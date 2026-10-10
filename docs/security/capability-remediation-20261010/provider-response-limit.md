# Taskmaster provider response limit

The October 10 full audit found one remaining low-severity advisory, GHSA-866g-f22w-33x8. Taskmaster 1.1.4 resolves six AI SDK paths to `@ai-sdk/provider-utils` 3.0.21. These response handlers could read unbounded remote response bodies. Taskmaster is engineering tooling; this change does not alter native execution, capability, pricing, or accounting contracts.

The narrow pnpm override selects 3.0.28 only for vulnerable versions below 3.0.28. The upstream patch adds a shared response-body size limit, and its provider dependency advances from 2.0.1 to 2.0.3. Other Taskmaster and provider adapter versions remain unchanged. The [upstream release](https://github.com/vercel/ai/releases/tag/%40ai-sdk/provider-utils%403.0.28) identifies the response-limit fix; the [advisory](https://github.com/advisories/GHSA-866g-f22w-33x8) specifies the affected range.

Validation: frozen installation without lifecycle scripts; production and full dependency audits both report zero advisories, without risk acceptances; Taskmaster's read-only version command passes. Three adversarial response-handler tests resolve the actual Taskmaster dependency path and verify oversized declared bodies are rejected before stream reads. No provider request is made.
