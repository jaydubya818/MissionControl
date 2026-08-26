---
name: mission-control-record-memory
description: >-
  Retired V1 compatibility skill. Agent Documents are operator-managed until a
  scoped signed agent-memory command is approved and implemented.
version: 2.0.0
owner: software-factory
risk: high
capabilities: []
requires_tools: []
---

# Agent Documents — retired direct-agent path

Do not write or enumerate Agent Documents directly from an agent or legacy
runtime. The active `agentDocuments` actions are authenticated operator
surfaces, workspace-scoped, audited, and actor-derived on the server.

For V1, use the Memory view in Mission Control. A future agent-memory writer
requires a separately approved, signed service capability with exact Agent and
workspace scope; do not recreate the removed convenience APIs.
