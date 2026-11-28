# Intake and replay operator previews

External work intake is reachable from the existing Missions page. Expanding its
Preview panel reads at most 50 authorized delivery records. It shows receipt and
processing state, retained reasons and attempts, linked Missions, and whether
restoration evidence has been recorded. Retry schedules only intake processing;
the separate planning action calls the canonical Mission planning gate.

The backend filters linked records by Mission visibility. Unlinked source
snapshots require scoped automation-management authority. The panel creates no
policy or source installation implicitly. Configuration and the clean GitHub App
opt-in/reverification sequence are documented in `docs/factory/external-intake.md`.

Frozen replay controls are reachable in existing Factory Improvement experiment
cards and Observability's Datasets & experiments tab. They support freezing the
declared limits for an eligible two-version experiment, preparing fresh cases,
checking a batch of at most ten slots for canonical dispatch, and reconciling
current evidence. Incomplete matched pairs, unknown cost/intervention counts and
blocked reasons stay visible. A blocked batch can be rechecked; failed Attempts
still need an explicit bounded retry through the canonical API. Manual aggregate
editing is hidden for frozen replay experiments and rejected server-side.

Queries are loaded only when a Preview is opened. Local recoverable read-error
boundaries keep the surrounding Mission or experiment page available if the
operator is unauthenticated, lacks scope, or a read fails. Reopening the panel,
changing workspace/experiment, or its Retry button can retry the read. No query
or render starts processing, dispatches work, approves a plan, or promotes a
Factory Version.

Component tests exercise missing evidence, action refusals, retained blocked
reasons, retry bounds, closed experiments, denied reads and local recovery.
The hermetic browser fixture uses the real components with controlled data and
records attempted actions locally. The Playwright suite covers themes, mobile
overflow, keyboard operation, accessibility, recipe overrides and the intake/
replay views. Its fixtures grant no authority and do not demonstrate hosted
factory behavior.

This session built the fixture but did not run browser acceptance: the connected
browser has no active originating context, the supported Chromium download
returned HTTP 403, and there is no installed executable. The features remain
Preview. Component and build results do not substitute for visible verification.
