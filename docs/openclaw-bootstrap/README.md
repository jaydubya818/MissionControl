# Mission Control Bootstrap Kit

**Generated:** 2026-02-01  
**Purpose:** Bootstrap kit for Cursor to implement openclaw-mission-control  
**Status:** Ready for implementation

## Deliverables

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | Repo Bootstrap Plan | `docs/REPO_STRUCTURE.md` |
| 2 | DB Schema | `schema/` |
| 3 | API Surface | `api/` |
| 4 | Worker Behaviors | `workers/` |
| 5 | Agent Integration Contract | `agent-integration/` |
| 6 | Operating Manual Files | `operating-manual/` |

## Quick Start for Cursor

```bash
# 1. Create the repo
mkdir openclaw-mission-control && cd openclaw-mission-control

# 2. Copy structure from docs/REPO_STRUCTURE.md

# 3. Implement schema from schema/SCHEMA.md (Convex or Postgres)

# 4. Build API from api/API_SURFACE.md

# 5. Add workers from workers/

# 6. Drop operating-manual/* into each agent workspace
```

## Design Decisions (see DEFAULTS.md)

All assumptions and defaults are documented in `docs/DEFAULTS.md`.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MISSION CONTROL                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Web UI    │  │   CLI/API   │  │  Telegram   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    API GATEWAY                            │  │
│  │  • Task CRUD + Transitions  • Approvals Queue            │  │
│  │  • Policy Evaluation        • Agent Registry             │  │
│  │  • Events Ingestion         • Notifications              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Storage   │  │   Workers   │  │   Policy    │             │
│  │ (Convex/PG) │  │  (Daemons)  │  │   Engine    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  Agent   │    │  Agent   │    │  Agent   │
    │  (Lead)  │    │(Speclist)│    │ (Intern) │
    └──────────┘    └──────────┘    └──────────┘
```
