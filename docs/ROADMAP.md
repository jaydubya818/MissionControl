# Mission Control Roadmap

Last updated: 2026-02-09

## Now (0-2 weeks)

### Platform Upgrade: Agent Org OS
- Identity/Soul governance system (OpenClaw-aligned templates, validator, scanner, compliance UI)
- Voice + Avatar pipeline (ElevenLabs TTS, avatar animation, Voice Panel UI)
- Telegraph communications (internal messaging, Telegram bridge, thread-to-task linking)
- Meeting orchestration (Manual provider, agenda/notes generation, action-item-to-task conversion)
- Org model expansion (CEO role, orgAssignments table, per-project hierarchy)
- Session bootstrap (OpenClaw AGENTS template alignment)
- Safety defaults enforcement (directory dump block, streaming block, DM trust levels)

### Control Plane Hardening
- Land and harden control-plane upgrades (approval escalation, operator mode controls)
- Canonical `taskEvents` timeline backfill coverage
- Saved view/watch workflow adoption
- Operator runbook snippets (PAUSED vs DRAINING vs QUARANTINED)

### Documentation
- Rewrite README with OpenClaw alignment, quickstart, Mermaid diagrams
- Produce ARCHITECTURE.md, OPENCLAW_INTEGRATION_MAP.md, PLAN_VS_REALITY.md
- Update INTELLIGENCE_LAYER_PLAN.md with new subsystems
- Security audit checklist (aligned with OpenClaw security guidance)

## Next (2-6 weeks)

### Security + Tenancy Hardening
- Mandatory project scoping for all list/search surfaces
- Role-based authz checks on sensitive mutations
- Per-project org-position-based access controls

### Performance Hardening
- Replace `.collect()` + in-memory filtering with index-driven queries in hot paths
- Reduce timeline/report N+1 joins with pre-joined view helpers

### Communications Expansion
- Zoom meeting provider (real Zoom API integration)
- Additional TTS voices and providers
- Telegraph notification fanout (digest emails, webhook push)
- Meeting recording/transcript integration

### Event Contract Unification
- Move remaining producers to `taskEvents` (messages, policy decisions, tool calls)
- Add stable event IDs and rule IDs for policy causality
- Migrate exports/reports to canonical event stream only

## Later (6+ weeks)

### Executor Maturity
- Complete multi-executor routing with rollout flags and safe defaults
- Remove partial/stub execution paths
- Agent hot-reload (watch YAML/SOUL files, update runtime)

### Multi-Model Intelligence
- Tier 2 LLM classifier in context-router
- OpenAI/Gemini providers in model-router
- Multi-model consensus for RED-risk tasks

### Evaluation Harness
- Offline policy/routing benchmark suite with regression baselines
- Decision-quality scoring for assignment and approvals
- Identity/soul compliance scoring and trend tracking

### Reporting + Compliance
- Export-grade incident reports and audit bundles
- Retention and archival policy for high-volume telemetry
- SOC 2 / compliance-friendly audit exports

### Multi-Repo Orchestration
- Cross-repo task dependencies and coordination
- Multi-project CEO agent dashboards
- Organization-wide analytics and cost rollups
