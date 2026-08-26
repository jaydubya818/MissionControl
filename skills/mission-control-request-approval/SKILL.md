---
name: mission-control-request-approval
description: >-
  Use this skill when an agent needs human approval. The V1 direct-agent path is
  retired; approval is requested through governed WorkOrder execution.
version: 2.0.0
owner: software-factory
risk: high
---

# Approval requests — retired direct-agent path

## V1 contract

Do not call `approvals.request`, `approvals.approve`, or `approvals.deny` from an
agent, Telegram account, shell script, or legacy worker. These are authenticated
human actions and derive the operator identity server-side; a caller-provided
Agent ID, username, or chat ID is not authority.

V1 agents surface review needs through the approved WorkOrder/Attempt evidence
flow. The operator reviews and decides in Mission Control. RED dual control
remains an operator-only decision requiring two distinct authenticated members.
