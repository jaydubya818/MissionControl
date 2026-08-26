---
name: mission-control-record-memory
description: >-
  Use this skill when an agent is asked to write or enumerate Agent Documents.
  The V1 direct-agent path is retired until a scoped signed agent-memory command
  is approved and implemented.
version: 2.0.0
owner: software-factory
risk: high
---

# Agent Documents — retired direct-agent path

## V1 contract

Do not write or enumerate Agent Documents directly from an agent or legacy
runtime. The active `agentDocuments` actions are authenticated operator
surfaces, workspace-scoped, audited, and actor-derived on the server.

For V1, use the Memory view in Mission Control. A future agent-memory writer
requires a separately approved, signed service capability with exact Agent and
workspace scope; do not recreate the removed convenience APIs.
