---
title: "fix: Recover Clerk-backed Convex sessions without auth churn"
type: fix
status: complete
date: 2026-08-30
owner: Platform
risk: yellow
---

# Clerk and Convex Session Recovery Plan

## Problem

An already signed-in browser can remain on the authentication-setup screen after
Clerk begins issuing a valid Convex audience token. The current retry action only
re-runs a token diagnostic; it does not reconnect the Convex client. The custom
Clerk adapter also ties the Convex token-fetch callback to Clerk's `getToken`
function identity, allowing unrelated Clerk context updates to restart Convex
authentication.

## Production Evidence

- A newly established browser session remains authenticated across route changes,
  reload, and the one-minute token refresh boundary.
- The operator's active Chrome session now mints an `aud: convex` token.
- Production Convex accepts that exact session and returns an authenticated,
  ready company context.
- Therefore the remaining failure is stale client authentication state and an
  ineffective recovery control, not Clerk credentials or the deployed Convex
  issuer/audience configuration.

## Approach

1. Keep the Convex token-fetch callback stable while reading the latest Clerk
   `getToken` implementation through a ref.
2. Make a successful token diagnostic offer a real Mission Control reconnect by
   reloading the application and rebuilding the Convex authentication manager.
3. Preserve fail-closed behavior when Convex has not authenticated the browser.
4. Verify unit tests, typecheck, build, production sign-in, repeated navigation,
   reload persistence, token refresh, and recovery from a deliberately stale
   browser session.

## Acceptance Criteria

- [x] Unrelated Clerk rerenders do not replace the Convex token-fetch callback.
- [x] A stable callback still uses the latest Clerk `getToken` function.
- [x] A successfully issued token changes the recovery control to reconnect the
      actual application rather than merely repeating the probe.
- [x] Convex remains the authority for authenticated application access.
- [x] Production navigation and token refresh do not show the setup gate.
- [x] A stale session can recover without browser-storage surgery.

## Rollback

Revert the UI release. No schema or data changes are involved. Clerk's required
`aud: convex` session claim and the matching production Convex auth provider stay
in place.
