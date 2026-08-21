## Learned User Preferences

- Be proactive: when the goal is clear (e.g., local testing, something not loading), diagnose and fix without waiting to be asked again.
- Always verify UI changes in the browser before calling work done.
- Use `docs/design.md` and `.claude/skills/design/` as the design reference for UI improvements.
- Follow documentation-first / spec-driven development (SDD): plan and reference docs before implementing, not chat-only coding.
- When implementing attached plans: do not edit the plan file; use existing todos, mark them in_progress, and complete all of them.
- For v2 demo and UI review, use `http://localhost:5199` via `pnpm run dev:demo`; use `http://localhost:5180` for latest main-repo UI during active development (EOS flags on).
- When the user asks to start `localhost:5199` without naming another workspace, use `pnpm run dev:research-lab`; `dev:demo` intentionally opens the separate Software Factory Demo database and makes the preserved Research Lab unavailable.
- Prefer waku-agent-inspired schematic operator UI (KPI strip, dispatch gate, clickable architecture diagram) for factory overview surfaces.
- Product UI focus: exceptions and evidence first, not agent-activity wallpaper.
- When fixing layout on one v2 shell page, apply the same pattern consistently across all v2 shell pages.
- Ensure every new feature and page is reachable from the left-hand navigation menu.
- Only create git commits when explicitly asked; use `gh` for pull requests.

## Git Authorship

- Preserve the repository operator's configured Git identity for all commits created while working in this repository.
- Do not change `git user.name` or `git user.email` unless the operator explicitly requests it.
- Do not author commits as Codex, OpenAI, Claude, or another AI agent.
- Do not add AI tools as commit co-authors.
- Do not add `Co-authored-by: Codex`, `Co-authored-by: OpenAI`, `Co-authored-by: Claude`, or equivalent AI attribution trailers to commit messages.
- Use the existing repository/local Git configuration for commit authorship.
- Record AI execution provenance in Mission Control's Attempt, execution, model, trace, evidence, and audit records rather than Git contributor identity.

## Learned Workspace Facts

- Local repo path: `/Users/jaywest/MissionControl`; GitHub: `jaydubya818/MissionControl`.
- Backend is Convex only (queries/mutations/actions); there is no Express REST API.
- Frontend stack: React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui.
- Product vision: enterprise-grade agentic mission control where one operator runs 20+ parallel epics with full visibility into tasks, agents, branches, reviews, and blockers.
- Software Factory demo runs from **main repo** with `pnpm run dev:demo` (port 5199, EOS Command Center); seed version `mc-demo-v2` via `pnpm convex:seed:demo:force` (project slug `sf-demo`, Atlas Checkout narrative).
- V2 operator shell lives at `/v2/*` and is the default. The `ui.shell.v2` and `context.registry` flags are registered but never read, so the `VITE_FLAG_UI_SHELL_V2` / `VITE_FLAG_CONTEXT_REGISTRY` overrides set by `dev:demo` and `playwright.config.ts` have no effect. The live gate is the opt-*out* `ui.shell.v1` read in `App.tsx`; the EOS navigation set is gated by the `eos.command-center-preview` project flag.
- EOS v2 nav splits Delivery into Work Orders (`control-work-orders`) and Tasks (`/v2/tasks`); experimental views live in a collapsed Labs group; Control Portfolio/Fleet stubs hidden unless `ui.control.stubs=true`.
- Memory page includes an Agentic-KB knowledge graph overlay (Graph tab), imported from `~/Agentic-KB/graphify-out/graph.json`.
- Tessl-style docs site at `docs/site/`; browsed in-app via Knowledge → Docs → Documentation tab.
- Harness engineering UI lives in `apps/mission-control-ui/src/harness/` (19 views under Control + Intelligence nav groups; only a subset has a declared route capability and is reachable when EOS enforcement is on).
- Orchestration server (port 4100) ingests Pi receipt packets at `POST /workorders/:id/receipt-packets` when `executor.pi-bridge` flag is enabled.
- `mc-context scan` (scripts/mc-context.mjs) discovers local SKILL.md files and syncs installations to Convex.

## Mission Control Product North Star

- Canonical doctrine: `docs/product/mission-control-north-star.md`.
- Prioritized V1 direction: `docs/product/mission-control-v1-product-strategy.md`.
- Mission Control is the operating system for human-directed, agent-executed software development. Humans own intent, judgment, governance, and approval; agents own bounded execution, iteration, validation, recovery, and evidence collection.
- Optimize the authoritative hierarchy `Mission → WorkOrder → Task → Attempt → evidence → pull request → release`.
- Default product surfaces must prioritize exceptions, required decisions, risk, and evidence. Agent activity, chat, and token counts are supporting detail, not the center of gravity.
- Do not promote a new primary feature or navigation domain unless it improves intent clarity, safe autonomy, validation, traceability, approved-plan-to-PR time, overnight continuity, or developer trust.
- A feature remains Preview or Labs until it uses real scoped data, enforces authorization, audits writes, survives refresh/restart, handles failure and recovery, and has deterministic browser evidence.
- Complete one browser-operable Mission golden path before expanding the product breadth.
