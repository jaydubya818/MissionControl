# React Router 7 security migration

Status: approved follow-up; not part of Release & Dependency Hardening V1

Owner: Mission Control repository owner

Review date: 2026-09-15
Risk acceptance expiry: 2026-11-15

## Objective

Move the Mission Control UI from React Router 6.30.6 to a patched React Router 7 release without changing product navigation semantics or introducing Framework/Data Router SSR behavior.

## Why this is separate

React Router 7 is a major-version migration. The current advisories' required preconditions are absent from Mission Control: navigation targets are internally constructed, the product has no router-driven external redirect flow, and the Vite UI is client-only declarative routing without SSR hydration. Mixing a routing major upgrade into release hardening would broaden the qualification surface and weaken evidence attribution.

## Implementation sequence

1. Inventory every `BrowserRouter`, `Routes`, `Route`, `Navigate`, `useNavigate`, and location consumer and classify route targets as static, parameterized, or externally sourced.
2. Upgrade `react-router-dom` and `react-router` together to the current patched 7.x release and adopt only required compatibility changes.
3. Preserve `/v2/*` deep-link, refresh, back/forward, feature-flag, and unknown-route behavior.
4. Run the runtime-contract guard, UI typecheck/build, the complete route smoke suite, critical accessibility suite, and the System Qualification browser matrix.
5. Remove advisory acceptances 1124268 and 1124272 only after `pnpm audit --prod` proves they are absent.

## Acceptance criteria

- No attacker-controlled value can become a React Router navigation target.
- No SSR or router error hydration path is introduced.
- All v2 routes work at 1440 px, 1024 px, and 390 px in light and dark themes.
- Deep links, refresh, back/forward, keyboard navigation, and focus behavior remain deterministic.
- Production audit has zero unaccepted moderate, high, or critical advisories.
