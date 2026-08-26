---
status: ready
priority: p1
issue_id: "061"
tags: [software-factory, mcp, tools, security, supply-chain]
dependencies: ["060"]
---

# Prove One Governed Read-Only MCP Integration

## Problem Statement

Native tool allowlists exist, but admitted harness manifests report MCP as
unsupported. Tool discovery, authorization, identity, credentials, and receipts
do not yet share one production boundary.

## Findings

- Both Codex and DeepSeek manifests declare `tools.mcp: UNSUPPORTED`.
- Tool metadata and output are untrusted and can carry prompt injection.
- Connector breadth before authority proof would multiply risk and operations.

## Proposed Solutions

### Option 1: One internal read-only tool through a host-owned broker

**Pros:** Proves the boundary with minimal authority and blast radius.

**Cons:** Does not demonstrate write integrations or broad connector coverage.

**Effort:** High

**Risk:** Medium

### Option 2: Add a connector catalog

**Pros:** Broader demo surface.

**Cons:** Premature, expensive, and unsafe without the broker proof.

**Effort:** Very high

**Risk:** High

## Recommended Action

Implement Option 1 with exact version identity, operation allowlists, short-lived
Attempt credentials, strict schemas, redaction, revocation, and call receipts.

## Acceptance Criteria

- [ ] A versioned registry records exact tool/server identity and lifecycle.
- [ ] Factory Versions and Attempts bind exact permitted read-only operations.
- [ ] Unregistered, stale, substituted, or over-scoped tools fail closed.
- [ ] Tool metadata/output cannot widen intent, policy, criteria, or tool scope.
- [ ] Credentials are Attempt-scoped, non-reusable, revocable, and never persisted as secrets.
- [ ] Poisoning, exfiltration, confused-deputy, replay, timeout, and partial-response tests pass.
- [ ] MCP stays unsupported for every harness except the exactly qualified proof path.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Constrained scope to one internal read-only proof.

**Learnings:**
- Discovery is not authorization and a server name is not an immutable identity.
