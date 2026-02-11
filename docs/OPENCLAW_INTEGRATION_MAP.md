# OpenClaw Integration Map

Last updated: 2026-02-09

This document maps every OpenClaw concept to its Mission Control implementation, showing how the two systems connect.

## Template Mapping

| OpenClaw Concept | OpenClaw Location | Mission Control Implementation | Status |
|---|---|---|---|
| IDENTITY.md | Workspace root | `templates/IDENTITY.md` (template) + `agentIdentities` table (stored data) + `convex/identity.ts` (validator/CRUD) | Implemented |
| SOUL.md | Workspace root | `templates/SOUL.md` (template) + `agentIdentities.soulContent` + `agents.soulVersionHash` | Implemented |
| TOOLS.md | Workspace root | `templates/TOOLS.md` (template) + `agentIdentities.toolsNotes` | Implemented |
| AGENTS.md | Workspace root | `convex/sessionBootstrap.ts` (session start logic) + safety defaults in policy-engine | Implemented |
| USER.md | Workspace root | Project config + operator preferences stored in `projects` table | Implemented |
| BOOTSTRAP.md | Workspace root | First-run agent onboarding via `agents.register` mutation | Existing |
| HEARTBEAT.md | Workspace root | `agents.heartbeat` mutation + cron-based stale detection | Existing |

## Session Bootstrap Flow

OpenClaw AGENTS template requires reading files on every session start. Mission Control implements this as:

```
OpenClaw Session Start          Mission Control Equivalent
─────────────────────          ─────────────────────────
1. Read SOUL.md           →    session.bootstrap reads agentIdentities.soulContent
2. Read USER.md           →    session.bootstrap reads project config + operator prefs
3. Read memory/today.md   →    session.bootstrap reads from memory package (daily notes)
4. Read memory/yesterday  →    session.bootstrap reads from memory package (previous day)
5. Read MEMORY.md         →    session.bootstrap reads long-term memory (main session only)
```

Implementation: `convex/sessionBootstrap.ts` -> `session.bootstrap` action

## Safety Defaults Mapping

| OpenClaw Default | Mission Control Enforcement |
|---|---|
| Don't dump directories or secrets | `policy-engine` rule: `BLOCK_DIRECTORY_DUMP` + `BLOCK_SECRET_PATTERNS` |
| Don't run destructive commands without asking | `policy-engine` risk classification: destructive commands -> RED -> NEEDS_APPROVAL |
| Don't send partial/streaming to external surfaces | `telegraph.sendMessage` validates completeness for TELEGRAM channel |
| Treat inbound DMs as untrusted | `policy-engine` adds `inputTrustLevel: UNTRUSTED` for DM-sourced inputs |
| If you change SOUL.md, tell the user | `identity.upsert` mutation logs audit event + creates notification on soul change |
| Not the user's voice in group chats | Safety note in SOUL.md template; no auto-posting to public channels without approval |
| Don't share private data | `policy-engine` rule: `BLOCK_PRIVATE_DATA_SHARING` checks for PII patterns |

## Memory System Mapping

| OpenClaw Concept | Mission Control Implementation |
|---|---|
| `memory/YYYY-MM-DD.md` (daily notes) | `packages/memory` SessionMemory tier; stored per agent per day |
| `MEMORY.md` (long-term) | `packages/memory` GlobalMemory tier; curated durable facts |
| `memory/heartbeat-state.json` | `agents.lastHeartbeatAt` + heartbeat cron state in Convex |
| Capture decisions, preferences | Memory package `captureDecision()`, `capturePreference()` methods |
| Avoid secrets in memory | `SECRET_PATTERNS` from `packages/shared` filtered before memory writes |

## Identity File Specification

### IDENTITY.md Fields (from OpenClaw template)

| Field | Required | Validation Rule | Storage |
|---|---|---|---|
| Name | Yes | Non-empty string | `agentIdentities.name` |
| Creature | Yes | Non-empty string | `agentIdentities.creature` |
| Vibe | Yes | Non-empty string | `agentIdentities.vibe` |
| Emoji | Yes | Single emoji character | `agentIdentities.emoji` + `agents.emoji` |
| Avatar | Recommended | Workspace-relative path, http(s) URL, or data URI | `agentIdentities.avatarPath` |

### SOUL.md Sections (from OpenClaw template)

| Section | Purpose | MC Enforcement |
|---|---|---|
| Core Truths | Behavioral principles | Included in session bootstrap context |
| Boundaries | Safety limits | Validated against policy-engine rules |
| Vibe | Personality/tone | Informational; surfaced in Identity Directory UI |
| Continuity | Memory rules | Drives session bootstrap flow |
| MC Constraints | Budget/state machine/risk | Validated at runtime by policy-engine + state-machine |

## Agent Role Mapping

| OpenClaw Concept | Mission Control Implementation |
|---|---|
| Agent identity | `agents` table (name, emoji, role, status) + `agentIdentities` table (full identity) |
| Agent persona | `agents/*.yaml` persona files + `agentIdentities.soulContent` |
| Agent workspace | `agents.workspacePath` field |
| Agent soul version | `agents.soulVersionHash` (hash of current SOUL.md content) |
| CEO agent (per project) | `orgAssignments` table with `orgPosition: CEO` + `projectId` |
| Lead agent (per repo/squad) | `orgAssignments` table with `orgPosition: LEAD` + scope |
| Specialist agent | `orgAssignments` table with `orgPosition: SPECIALIST` |

## Communication Mapping

| OpenClaw Concept | Mission Control Implementation |
|---|---|
| WhatsApp/Discord/Telegram channels | `packages/telegram-bot` (Telegram) + `packages/telegraph` (internal) |
| Direct messages | `telegraphMessages` with sender/receiver |
| Group chats | `telegraphThreads` with participants array |
| Heartbeat polling | `agents.heartbeat` mutation + cron job |
| Proactive outreach | Telegraph threads + notifications system |

## Tool/Skill Mapping

| OpenClaw Concept | Mission Control Implementation |
|---|---|
| Skills (SKILL.md) | `agents.allowedTools` + tool call risk classification |
| TOOLS.md (env notes) | `agentIdentities.toolsNotes` (per-agent environment config) |
| Tool policy | `packages/policy-engine` allowlists/blocklists |
| Exec approvals | `convex/approvals.ts` for RED-risk tool calls |
| Sandboxing | Future: executor isolation via orchestration server |

## Security Audit Mapping

| OpenClaw `security audit` Check | Mission Control Equivalent |
|---|---|
| Inbound access (DM policies) | Policy engine `inputTrustLevel` evaluation |
| Tool blast radius | Risk classification (GREEN/YELLOW/RED) + allowlists |
| Network exposure | Convex handles; no direct network exposure from MC |
| Credential storage | `.env` files (not committed); Convex env vars for API keys |
| Model hygiene | Model router validates provider + model selection |
| Plugin/extension safety | Tool allowlists in policy-engine; no plugin system (yet) |

## File Location Cross-Reference

| Purpose | OpenClaw Default | Mission Control Location |
|---|---|---|
| Agent workspace | `~/.openclaw/workspace` | `agents.workspacePath` field per agent |
| Identity template | `docs/reference/templates/IDENTITY` | `templates/IDENTITY.md` |
| Soul template | `docs/reference/templates/SOUL` | `templates/SOUL.md` |
| Tools template | `docs/reference/templates/TOOLS` | `templates/TOOLS.md` |
| Session rules | `AGENTS.md` / `AGENTS.default` | `convex/sessionBootstrap.ts` |
| Memory daily | `memory/YYYY-MM-DD.md` | `packages/memory` SessionMemory |
| Memory long-term | `MEMORY.md` | `packages/memory` GlobalMemory |
| Agent personas | N/A (OpenClaw uses SOUL.md) | `agents/*.yaml` + `agentIdentities` table |
| Security audit | `openclaw security audit` | `docs/SECURITY_AUDIT.md` checklist |
