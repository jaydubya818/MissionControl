---
name: mission-control-task-lifecycle
description: >-
  Retired V1 compatibility skill. Direct agent calls to human Task actions are
  not an authenticated service boundary; use the canonical Factory worker.
version: 2.0.0
owner: software-factory
risk: high
capabilities: []
requires_tools: []
---

# Task lifecycle — retired direct-agent path

Do not call `tasks.create`, `tasks.assign`, or `tasks.transition` directly from
an agent, bot, shell script, or legacy worker. Those public actions are for an
authenticated human operator and derive the actor server-side.

V1 agent execution must be dispatched from an approved WorkOrder and claimed,
renewed, and reported by `mission-control-orchestration` through the signed,
scoped, replay-protected `serviceCommands` boundary. If that runtime is not
configured, stop and ask the operator to use the Mission Control UI; never
self-assert `actorType`, an Agent ID, or a username as authority.
