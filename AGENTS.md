## Learned User Preferences

- Be proactive: when the goal is clear (e.g., local testing, something not loading), diagnose and fix without waiting to be asked again.
- Always verify UI changes in the browser before calling work done.
- Use `docs/design.md` and `.claude/skills/design/` as the design reference for UI improvements.
- Follow documentation-first / spec-driven development (SDD): plan and reference docs before implementing, not chat-only coding.
- When implementing attached plans: do not edit the plan file; use existing todos, mark them in_progress, and complete all of them.
- For v2 demo and UI review, use `http://localhost:5199` via `pnpm run dev:demo`; use `http://localhost:5180` for latest main-repo UI during active development (EOS flags on).
- Prefer waku-agent-inspired schematic operator UI (KPI strip, dispatch gate, clickable architecture diagram) for factory overview surfaces.
- Product UI focus: exceptions and evidence first, not agent-activity wallpaper.
- When fixing layout on one v2 shell page, apply the same pattern consistently across all v2 shell pages.

## Learned Workspace Facts

- Local repo path: `/Users/jaywest/MissionControl`; GitHub: `jaydubya818/MissionControl`.
- Backend is Convex only (queries/mutations/actions); there is no Express REST API.
- Frontend stack: React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui.
- Product vision: enterprise-grade agentic mission control where one operator runs 20+ parallel epics with full visibility into tasks, agents, branches, reviews, and blockers.
- Software Factory demo runs from **main repo** with `pnpm run dev:demo` (port 5199, EOS Command Center). Legacy worktrees: UI `~/worktrees/sf-19-ui-migration`, Convex `~/worktrees/sf-90-demo`.
- V2 operator shell lives at `/v2/*` with flags `VITE_FLAG_UI_SHELL_V2` and `VITE_FLAG_CONTEXT_REGISTRY`.
- EOS v2 nav splits Delivery into Work Orders (`control-work-orders`) and Tasks (`/v2/tasks`); experimental views live in a collapsed Labs group; Control Portfolio/Fleet stubs hidden unless `ui.control.stubs=true`.
- Memory page includes an Agentic-KB knowledge graph overlay (Graph tab), imported from `~/Agentic-KB/graphify-out/graph.json`.
- Demo seed data is ~374–380 rows under project slug `sf-demo` (Atlas Checkout narrative).
- Optional orchestration server runs on port 4100.
