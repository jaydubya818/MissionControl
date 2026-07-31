---
title: Runtime contract recovery
status: active
date: 2026-07-31
owner: Codex
scope: bounded-runtime-correctness
---

# Runtime contract recovery plan

## Acceptance criteria

- A compatible client mounts Mission Control normally.
- A mismatched client is blocked before normal application queries mount.
- The recovery state names the problem, confirms persisted work is safe, exposes
  client/server contract versions, and provides one Reload action.
- Convex argument-validator crashes render the same reload-required guidance for
  clients that predate the startup handshake.
- Strict query and mutation validators are unchanged.
- The healthy path and mismatch path are covered by focused tests and browser
  evidence.
- The decision, implementation, evidence, and next recommendation are published
  in repository docs and Mission Control Docs.

## Execution checklist

- [x] Add a shared runtime-contract version and stable Convex compatibility query.
- [x] Gate `App` startup on an exact client/backend version match.
- [x] Add an accessible reload-required recovery state.
- [x] Classify Convex contract-validation errors in the root error boundary.
- [x] Add focused unit and component regression coverage.
- [x] Capture healthy and simulated-mismatch browser evidence with console checks.
- [x] Run bounded typecheck, build, and documentation checks.
- [ ] Publish result docs, commit, open a PR, monitor CI, and squash-merge to `main`.

## Bounded validation

The complete repository test suite remains excluded under the product owner's
cost-control direction. This cycle will run only the new compatibility tests,
the ErrorBoundary tests, Mission Control Docs tests, workspace typecheck, the UI
production build, and deterministic browser journeys.
