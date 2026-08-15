---
title: "fix: Isolate Clerk and Convex authentication failures"
type: fix
status: active
date: 2026-08-15
owner: Platform
risk: yellow
---

# Clerk and Convex Authentication Diagnostic Plan

## Problem

Clerk can establish a browser session while Convex still reports the client as
unauthenticated. The current closed-state message combines two different
failures: Clerk may not have issued the token Convex expects, or Convex may have
rejected a token that Clerk successfully issued. Repeating sign-in cannot
distinguish them and produces no useful release evidence.

## Approach

Add a bounded client diagnostic that runs only after Clerk is signed in and
Convex authentication has finished unsuccessfully. It must mirror
`ConvexProviderWithClerk` token selection:

- use the default session token when the session audience is exactly `convex`;
- otherwise request the legacy `convex` JWT template;
- record only token source, issued/missing status, and a sanitized Clerk error
  code;
- never render, log, persist, decode, or transmit the token itself.

The failure surface will explain which boundary failed, offer a retry, and
offer sign-out so an operator can recover without browser-storage surgery.

## Confirmed Root Cause

The staging trace showed that `ConvexProviderWithClerk` attempted its legacy
`convex` JWT-template fallback while Clerk's native-integration audience claim
was still hydrating. Clerk correctly has no legacy template, so both token
fetches returned `null`; Convex never received or rejected a JWT.

Mission Control requires the native Clerk/Convex integration. Replace the
ambiguous provider adapter with `ConvexProviderWithAuth` and a bounded Clerk
hook that always requests the default audience-qualified session token. Keep
Clerk as the identity provider and Convex as the token validator; only token
selection changes.

## Acceptance Criteria

- [ ] A matching session audience probes the default Clerk session-token path.
- [ ] A missing or non-matching audience probes the `convex` template path.
- [ ] A returned token is reduced to an `issued` boolean and never retained.
- [ ] Missing tokens and Clerk exceptions produce distinct operator guidance.
- [ ] Error codes are character- and length-limited before display.
- [ ] The existing fail-closed behavior remains in place until Convex reports
  `isAuthenticated: true`.
- [ ] The runtime never requests the legacy `convex` JWT template.
- [ ] Unit tests, UI typecheck, build, and authenticated staging browser
  validation pass before production is considered.

## Rollout and Rollback

Deploy to the existing governed staging path and inspect the token-free status
on the same signed-in staging origin. Use the result to correct the actual
provider boundary. Do not promote this slice to production unless it remains
useful as a safe operational failure state after the root cause is fixed.

Rollback is a normal application release to the prior exact commit. No schema,
data, Clerk configuration, or Convex environment changes are required.
