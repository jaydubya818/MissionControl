# Mission Control UI Style Guide (v2)

Binding rules for every view, component, and element. Derived from the approved
visual reference (Tessl-class operational control plane) + `SLOP-AUDIT.md`.
Tokens live in `apps/mission-control-ui/src/index.css`; primitives in
`src/components/factory/` and `src/shellV2/`.

## Feel
Calm, technical, precise, dense but readable. Near-black neutral layers,
hairline borders, restrained color. Nothing glows, nothing floats, nothing is
glass. If a element can't justify its decoration, it loses it.

## Layout
- Every page starts with `PageHeader` (26px/semibold title, 14px `text-ink-secondary` subtitle) or `DetailLayout` for detail pages.
- Content container: `mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-6`. Full-bleed only for boards (kanban/DAG/calendar) — still `px-6`.
- Section gap 24px (`gap-6`); intra-card gap 12–16px. Never a single uniform gap for everything on the page.

## Surfaces
- Page: `bg-app`. Card: `bg-surface-1 border border-line rounded-xl`. Nested surface: `bg-surface-2`. Popover/menus: `bg-surface-3 border-line shadow-elevation-2`.
- Hover: `hover:border-line-strong` and/or `hover:bg-surface-2`. Transition `duration-150`.
- FORBIDDEN: gradients, `backdrop-blur`, `GlassPanel`, `neon-app-bg`, glow shadows, `Neon*` components, decorative borders thicker than 1px.

## Typography
- Colors: `text-ink` (primary), `text-ink-secondary`, `text-ink-muted` only.
- Scale: 26 page title · 19 section title · 15 card title (semibold) · 13.5 body · 12.5 meta · 11.5 micro-labels.
- Uppercase + tracking only for: table headers, rail section labels (11–11.5px, `text-ink-muted`). Nowhere else.
- Exception: overview/landing surfaces may use a mono green category eyebrow (`font-mono text-[11px] uppercase tracking-[0.14em] text-ok`) above a section title when it adds information (e.g. FLEET, GOVERNANCE) — never restating the heading.
- `font-mono` only for: code, hashes, ids, keys, scores, terminal output.
- No kickers, no emoji in UI chrome/copy, no full-sentence display headlines.

## Status & badges
- Use `StatusBadge` / `RiskBadge` / `ScoreBadge` / `TrendBadge` from `components/factory/badges`. Do not use `StatusChip`/`PriorityChip`/`RiskChip`/`NeonBadge`/badge `neon-*` variants.
- Task states map: DONE→success, IN_PROGRESS/REVIEW→info, NEEDS_APPROVAL/BLOCKED→warning, FAILED→error, INBOX/ASSIGNED/CANCELED→neutral.
- Status dots: flat 6–8px circle in a status color + a text label. Never pulse/halo/glow.
- Badges only for real state — no decorative pills.

## Tables & lists
- Use `DataTable` where possible; otherwise match it exactly: header `text-[11.5px] uppercase tracking-[0.06em] text-ink-muted px-4 py-2.5`; rows `px-4 py-3.5 border-b border-line last:border-b-0 hover:bg-surface-2`; primary cell = name (ink, medium) + one-line muted description.
- Empty: `EmptyState` primitive. Loading: `animate-pulse` bars on `bg-surface-2` (no shimmer gradients).

## Controls
- Primary button: `bg-act text-act-ink rounded-lg h-9 px-3 text-[13px] font-medium hover:opacity-90`.
- Secondary: `border border-line text-ink-secondary hover:text-ink hover:border-line-strong rounded-lg h-9 px-3`.
- Destructive: `bg-err-soft text-err border border-transparent`.
- Inputs: `h-9 rounded-lg border border-line bg-surface-1 px-3 text-[13.5px] placeholder:text-ink-muted`; focus via the global focus ring (no custom glows).
- Segmented controls: bordered container `rounded-lg border-line p-0.5`, active segment `bg-surface-2 text-ink`.

## Charts (recharts)
- Grid/axis lines `#272A2F`; tick labels 11px `#717680`.
- Series palette in order: `#32E875`, `#5E8BFF`, `#F3C744`, `#A7ABB4`. Max 4 series.
- Strokes 1.5px, no area glow, no drop-shadow filters, dots only on hover.
- Tooltip: `bg-surface-3 border border-line rounded-lg px-3 py-2 text-[12.5px]`.

## Icons
- lucide-react, 14–16px, `strokeWidth` 1.6–1.75, inherit text color.
- Never inside tinted rounded tiles; never colored in a tint of themselves.

## Motion
- Transitions only on properties that change (color, border, background), 120–200ms ease. No springs, no scale-on-hover, no page-transition choreography in v2 (remove `PageTransition`/framer-motion from migrated views; keep framer only where functional, e.g. drag).

## Accessibility
- Visible focus (global ring), `aria-current` on active nav, `role="tablist"/"tab"` on tab sets, labels on icon-only buttons, `aria-label` on search inputs.

## Migration checklist (per view)
1. Replace page-title markup with `PageHeader` (or `DetailLayout`).
2. Swap `NeonCard/NeonStat/NeonTable/NeonDialog/GlassPanel` → surface classes / `DataTable` / `MetricBlock` / ui `dialog`.
3. Swap chips → factory badges; kill glow/pulse dots.
4. Remove gradients, glass, glow classes, `neon-*` badge variants, emoji.
5. Tables/lists → DataTable density rules; empty/loading states normalized.
6. Buttons/inputs → control rules above.
7. Charts → chart rules above (`NeonChartTheme` is replaced by `chartTheme.ts`).
8. Typecheck + existing tests green; no new colors introduced.
