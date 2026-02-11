# Changelog Report: Mission Control v0.9.0 → v0.10.0

**Date:** 2026-02-09
**Branch:** `codex/enterprise-ui-readiness-plan`
**Upgrade Theme:** Multi-repo agent org operating system (OpenClaw-aligned)

---

## New Features

### Agent Identity + Soul Governance
- **OpenClaw Templates:** Added `templates/IDENTITY.md`, `templates/SOUL.md`, `templates/TOOLS.md` derived from OpenClaw reference templates
- **Identity Store:** New `agentIdentities` table in Convex schema with full CRUD via `convex/identity.ts`
- **Validation Engine:** Required field checks (name, creature, vibe, emoji), avatar path rules, soul content hashing
- **Repo Scanner:** `identity.scan` action discovers agents and verifies identity/soul/tools compliance
- **Compliance Dashboard:** UI view showing valid/partial/invalid/missing identity status across all agents
- **CI Enforcement:** GitHub Actions step validates template existence and required sections on every push/PR

### Voice + Avatar Communications
- **Package:** `@mission-control/voice` with clean provider interfaces
- **ElevenLabs Provider:** Full TTS synthesis via ElevenLabs REST API (multilingual v2 model default)
- **Default Avatar Provider:** SVG-based emoji avatar with speaking animation state
- **Convex Module:** `convex/voice.ts` handles synthesis actions, file storage, and artifact tracking
- **Voice Artifacts Table:** `voiceArtifacts` table stores transcript + audio reference + metadata
- **UI:** "Talk as Agent" panel with agent selector, text input, TTS trigger, avatar animation, transcript log

### Telegraph Communications
- **Package:** `@mission-control/telegraph` with swappable provider interface
- **Internal Provider:** Convex-native messaging -- no external dependencies
- **Telegram Bridge Provider:** Bridges to Telegram with safety enforcement (final replies only)
- **Convex Module:** `convex/telegraph.ts` with thread management, message sending, entity linking
- **Thread Linking:** Connect threads to tasks, approvals, and incidents
- **Safety:** Streaming/partial content blocked on TELEGRAM channel at both provider and Convex layers
- **Tables:** `telegraphMessages` + `telegraphThreads` with proper indexing
- **UI:** TelegraphInbox with project-grouped threads, message view, compose, and new thread creation

### Meeting Orchestration
- **Package:** `@mission-control/meetings` with MeetingProvider interface
- **Manual Provider:** Generates markdown agendas, notes templates, action items, and iCal-compatible calendar payloads -- no external API required
- **Action Item Extraction:** Parses markdown meeting notes to extract structured action items with owner and due date
- **Task Conversion:** `meetings.convertActionItems` mutation creates tasks from meeting action items
- **Convex Module:** `convex/meetings.ts` with full lifecycle: schedule → start → complete → cancel
- **Table:** `meetings` with participant tracking, agenda, notes, and action items
- **UI:** MeetingsView with scheduling form, upcoming meetings, meeting detail with action item conversion

### Organizational Hierarchy
- **CEO Role:** Extended `agentRole` union and `AutonomyLevel` type to include CEO
- **Org Assignments Table:** `orgAssignments` maps agents to projects with positions (CEO, LEAD, SPECIALIST, INTERN) and scopes (PROJECT, SQUAD, REPO)
- **Convex Module:** `convex/orgAssignments.ts` with assignment/query functions and CEO uniqueness enforcement
- **Agent Enrichment:** `agents.listAll` optionally includes org positions from `orgAssignments`

### Session Bootstrap (OpenClaw AGENTS Alignment)
- **Module:** `convex/sessionBootstrap.ts` implementing the OpenClaw AGENTS template session start protocol
- **Context Gathering:** Loads agent identity, project config, org position, and memory on session start
- **Safety Reminders:** Injects safety reminders (no dumps, no secrets, final replies, untrusted DM) into bootstrap context

### Safety Defaults (OpenClaw-Aligned)
- **Secret Detection:** `SECRET_PATTERNS` array catches API keys, tokens, private keys, AWS keys, GitHub tokens, Slack tokens
- **Directory Dump Prevention:** `DIRECTORY_DUMP_PATTERNS` blocks `tree`, recursive `ls`, recursive `find`
- **Streaming Block:** `FINAL_REPLIES_ONLY` rule prevents partial/streaming content to external surfaces
- **DM Flagging:** `UNTRUSTED_DM_INPUT` flags inbound DMs for downstream guardrails
- **Safety Evaluator:** `checkSafetyDefaults()` function returns structured violations and rule IDs
- **CEO Budget:** $25/day and $3.00/run budget caps for CEO autonomy level

---

## Schema Changes

### New Tables
| Table | Fields | Indexes |
|---|---|---|
| `orgAssignments` | agentId, projectId, orgPosition, scope, scopeRef, assignedBy, assignedAt, metadata | by_agent, by_project, by_position, by_project_position |
| `agentIdentities` | agentId, name, creature, vibe, emoji, avatarPath, soulContent, soulHash, toolsNotes, validationStatus, validationErrors, lastScannedAt, metadata | by_agent, by_status, by_project |
| `telegraphMessages` | projectId, threadId, senderId, senderType, content, replyToId, channel, externalRef, status, readAt, metadata | by_thread, by_sender, by_project, by_channel |
| `telegraphThreads` | projectId, title, participants, channel, externalThreadRef, linkedTaskId, linkedApprovalId, linkedIncidentId, lastMessageAt, messageCount, metadata | by_project, by_channel, by_linked_task |
| `meetings` | projectId, title, scheduledAt, duration, status, hostAgentId, participants, provider, externalMeetingRef, agenda, notes, actionItems, calendarPayload, metadata | by_project, by_status, by_scheduled |
| `voiceArtifacts` | projectId, agentId, text, audioStorageId, contentType, voiceId, modelId, characterCount, durationMs, channel, metadata | by_agent, by_project |

### Modified Tables
| Table | Change |
|---|---|
| `agents` | `role` field extended: added `v.literal("CEO")` |

---

## Type Changes

### New Types (`packages/shared`)
- `identity.ts`: `ValidationStatus`, `AgentIdentity`, `IdentityValidationResult`, `IdentityRequiredFields`, `isValidAvatarPath()`, `isValidEmoji()`
- `org.ts`: `OrgPosition`, `OrgScope`, `OrgAssignment`, `ProjectOrgChart`
- `telegraph.ts`: `TelegraphChannel`, `MessageStatus`, `SenderType`, `TelegraphThread`, `TelegraphMessage`, `TelegraphProvider`, `TelegraphSendOptions`, `TelegraphGetOptions`, `TelegraphCreateThreadOptions`, `TelegraphMessageResult`
- `voice.ts`: `VoiceProvider`, `VoiceArtifact`, `TTSProvider`, `TTSOptions`, `TTSResult`, `Voice`, `AvatarProvider`, `AvatarAnimationState`
- `meeting.ts`: `MeetingStatus`, `MeetingProviderType`, `MeetingParticipant`, `MeetingActionItem`, `Meeting`, `MeetingProvider`, `ScheduleMeetingOptions`, `MeetingResult`

### Modified Types
- `agent.ts`: `AutonomyLevel` extended to include `"CEO"`

---

## Bug Fixes

- Fixed `DefaultAvatarProvider.getAvatarUrl()`: replaced `btoa()` with `Buffer.from().toString("base64")` for Node.js emoji compatibility
- Fixed `ManualMeetingProvider.extractActionItems()`: owner regex now uses `[\w-]+` instead of `\S+` to avoid capturing trailing punctuation

---

## Tests Added

| Test File | Package | Count | Coverage |
|---|---|---|---|
| `identity.test.ts` | `@mission-control/shared` | 10 | Avatar path validation, emoji validation |
| `elevenlabs.test.ts` | `@mission-control/voice` | 9 | TTS synthesis, voice listing, error handling, avatar animation |
| `internal.test.ts` | `@mission-control/telegraph` | 7 | Internal message send/receive, thread creation |
| `telegram.test.ts` | `@mission-control/telegraph` | 10 | Telegram bridge, safety enforcement (5 safety tests), error resilience |
| `manual.test.ts` | `@mission-control/meetings` | 7 | Meeting scheduling, agenda gen, notes, action item extraction, calendar payload |
| `safety.test.ts` | `@mission-control/policy-engine` | 21 | Secret patterns, directory dumps, streaming block, DM flagging, CEO rules |

**Total new tests:** 64
**Total CI tests:** 333 (all passing)

---

## CI/CD Updates

- Added Identity/Soul Compliance Check step to `.github/workflows/ci.yml`
- Updated `ci:prepare` to build voice, telegraph, meetings packages
- Updated `ci:test` to run shared, voice, telegraph, meetings package tests
- Enhanced compliance check with safety defaults verification and agent YAML scanning

---

## Documentation

| Document | Status |
|---|---|
| `docs/ARCHITECTURE.md` | Updated with new subsystems + Mermaid diagrams |
| `docs/OPENCLAW_INTEGRATION_MAP.md` | New -- maps OpenClaw concepts to MissionControl |
| `docs/PLAN_VS_REALITY.md` | New -- gap analysis vs. planning docs |
| `docs/INTELLIGENCE_LAYER_PLAN.md` | Updated with identity, voice, telegraph, meetings, org model |
| `docs/ROADMAP.md` | Restructured into Now/Next/Later |
| `docs/SECURITY_AUDIT.md` | New -- OpenClaw-aligned security checklist |
| `docs/PR_NOTES.md` | New -- this PR's summary |
| `docs/CHANGELOG_REPORT.md` | New -- this file |
| `README.md` | Complete rewrite with architecture, quickstart, safety |
