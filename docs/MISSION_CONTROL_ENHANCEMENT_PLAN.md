# Mission Control Enhancement Plan

## What Problem This Solves

Mission Control already has a lot of breadth. The risk is not missing panels. The risk is operator sprawl, inconsistent UI decisions, and losing confidence in the shell.

This plan focuses on making Mission Control better by:

- tightening the operator experience
- improving real-time confidence signals
- making UI implementation repeatable
- avoiding a generic "AI dashboard with 30 tabs" trap

## External Review Summary

The external `builderz-labs/mission-control` repo is strong on:

- packaging and onboarding
- explicit auth and production hardening
- skills management as a first-class operator surface
- session/status visibility
- real-time activity instrumentation

The pasted tab prompts are useful as panel checklists, but they should not be treated as a build spec. Many of those ideas already exist here in partial form.

## What We Should Adopt Now

### 1. Operator Home Tightening

Ship a cleaner top-level operator cockpit:

- active sessions
- agent health
- gateway status
- task queue pressure
- approvals requiring human action
- cost + token burn summary

Reason:
The home surface should answer "what needs attention right now?" in under 10 seconds.

### 2. AI Status Presence

Add a live AI status indicator in the shell:

- active
- thinking
- idle
- current work context when available

Reason:
This is cheap leverage. It turns the product from a static dashboard into a live control surface.

### 3. Skills Browser

Add a first-class skills panel that can:

- list installed skills
- show file trees
- view and edit `SKILL.md`
- distinguish system vs local skills

Reason:
Mission Control should treat agent capability management as an operational object, not tribal knowledge.

### 4. Intentional Design System Workflow

Keep `shadcn/ui` as the primitive layer for future surfaces and stop adding ad hoc component variants without a shared path.

Reason:
This reduces UI drift and makes future work faster.

## What We Should Delay

### 1. Full Multi-Gateway Ambition

Only prioritize multi-gateway abstraction if we are actively operating more than one runtime.

### 2. Deep Security/Eval Expansion

The external repo's trust scoring, eval layers, and hardening posture are solid, but they are not the next bottleneck for SellerFi's internal Mission Control.

### 3. More Panel Count

Do not add panels just because the prompt list names them. Add surfaces only when they improve one of these:

- operator confidence
- task throughput
- review quality
- agent control

## Proposed Phases

### Phase 1

- consolidate the shell visual language
- wire `shadcn/ui` correctly
- add the repo-local Codex plugin/skill workflow
- improve the overview surface

### Phase 2

- add live AI status in the shell
- add a proper skills browser
- tighten recent activity and quick actions

### Phase 3

- unify chat/session handling
- improve scheduler visibility
- formalize gateway health and reconnect diagnostics

## Product Guardrails

- Favor fewer, clearer surfaces over more tabs
- Every new panel needs a real operator job to serve
- Loading, empty, error, and success states are mandatory
- The UI should feel calm and decisive, not flashy

## Immediate Next Step

Build the skills browser and AI status widget next. Those two additions would materially improve operator confidence without adding a lot of product sprawl.
