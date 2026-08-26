---
name: mission-control-task-lifecycle
description: >-
  Use this skill when an agent needs to create or transition a Task. Direct
  agent calls to human Task actions are retired; use the canonical Factory
  worker.
version: 2.0.0
owner: software-factory
risk: high
---

# Task lifecycle — retired direct-agent path

## V1 contract

Do not call `tasks.create`, `tasks.assign`, or `tasks.transition` directly from
an agent, bot, shell script, or legacy worker. Those public actions are for an
authenticated human operator and derive the actor server-side.

V1 agent execution must be dispatched from an approved WorkOrder and claimed,
renewed, and reported by `mission-control-orchestration` through the signed,
scoped, replay-protected `serviceCommands` boundary. If that runtime is not
configured, stop and ask the operator to use the Mission Control UI; never
self-assert `actorType`, an Agent ID, or a username as authority.
