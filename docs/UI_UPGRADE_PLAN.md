# UI Upgrade Plan — Enterprise Control Plane

## Overview

Upgrade Mission Control's frontend from a dense "ops console" aesthetic to a modern, corporation-ready enterprise control plane. The goal is to be friendly, polished, accessible, and scalable for enterprise teams without losing power-user density.

## Stack Changes

| Before | After |
|--------|-------|
| Inline React `style` props | Tailwind CSS v4 utility classes |
| No component library | shadcn/ui (Radix UI primitives) |
| Emoji-based icons | Lucide React (tree-shakeable SVG icons) |
| Hardcoded hex colors | CSS variables + oklch color tokens |
| No theming | Enterprise Dark (default) + Light mode |
| `system-ui` font | Inter + IBM Plex Sans fallback |

## Design System

### Typography
- Font: `Inter`, `IBM Plex Sans`, `system-ui`, `-apple-system`, `sans-serif`
- Base size: 14px, line-height: 1.5
- Scale: text-xs (12px), text-sm (14px), text-base (16px), text-lg (18px)

### Spacing
- 8px grid system via Tailwind's default spacing scale
- Consistent padding: p-2 (8px), p-3 (12px), p-4 (16px), p-6 (24px)

### Color Tokens (CSS Variables)
Defined in `apps/mission-control-ui/src/index.css` using oklch color space:
- `--background`, `--foreground` — page canvas
- `--card`, `--card-foreground` — elevated surfaces
- `--primary`, `--primary-foreground` — brand/action color
- `--muted`, `--muted-foreground` — deemphasized text
- `--destructive` — danger/error states
- `--border`, `--input`, `--ring` — interactive element borders

Status colors: `--color-status-*` for all 9 task states
Risk colors: `--color-risk-green/yellow/red`

### Border Radius
- Default: `--radius: 0.5rem` (8px)
- Variants: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`

### Component Library (shadcn/ui)
Installed components in `src/components/ui/`:
- Button, Card, Badge, Input, Label
- Sheet, Dialog, DropdownMenu, Select
- Tooltip, Separator, ScrollArea

Custom enterprise components:
- `StatusChip` — icon + label for all 9 task states
- `RiskChip` — GREEN/YELLOW/RED risk levels
- `PriorityChip` — Critical/High/Normal/Low
- `AppSideNav` — collapsible grouped navigation
- `AppTopBar` — global top bar with search/actions
- `PageHeader` — reusable title + actions bar

## Layout Architecture

```
┌─────────────────────────────────────────────┐
│ AppTopBar (project selector, search, actions)│
├──────┬──────────────────────────────────────┤
│      │                                      │
│ Side │  PageHeader (title, description,     │
│ Nav  │                 actions)             │
│      │──────────────────────────────────────│
│      │  Content Area (Kanban, Views, etc.)  │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

### AppSideNav
- 5 groups: Operations, Agents, Projects, Comms, Admin
- Collapsible with tooltips when collapsed
- Persists collapsed state in localStorage
- Quick action buttons: Alerts + Approvals (with badge)

### AppTopBar
- Project switcher (select)
- Global search bar
- Metrics (agents active, tasks count)
- Insights dropdown (shadcn DropdownMenu)
- Theme toggle (dark/light)
- User menu

## Board (Kanban) Redesign

### Lanes
- Per-status icon (Lucide) + dot color
- Subtle per-status background tint
- Badge count in lane header
- ScrollArea for card overflow
- Empty states with contextual emoji/text

### Task Cards
- `line-clamp-2` title
- Badge row: type (outline), priority (color-coded), source (outline + emoji)
- Label pills (muted, max 3 + overflow count)
- Blocked reason: destructive banner with AlertTriangle icon
- Cost footer with DollarSign icon
- Assignee avatars with overlap
- Hover actions: Move dropdown + Open button (opacity transition)
- Drag overlay with primary border + shadow

## Filters & Search

### KanbanFilters
- Filter icon with active count badge
- Saved views (shadcn Select + save/delete buttons)
- Priority pills (P1/P2/P3) with color-coded active states
- Agent emoji toggles
- Type toggles
- Clear button

### CommandPalette
- Search icon in input
- Grouped results: Commands, Tasks, Approvals, Agents
- Lucide icons for commands
- Hover accent on results
- ScrollArea for overflow

## Theming

- Enterprise Dark (default): oklch-based dark palette
- Enterprise Light: available via `[data-theme="light"]` or `.light` class
- Toggle in TopBar persists to localStorage
- Legacy CSS variables preserved for unmigrated components

## Accessibility

- `:focus-visible` rings on all interactive elements (ring color from CSS var)
- Keyboard shortcuts:
  - `/` — focus search
  - `g then b` — go to board
  - `?` — show shortcuts help
  - `⌘+N` — new task
  - `⌘+K` — command palette
  - `⇧⌘+A` — approvals
  - `⌘+E` — agents
- Shortcuts skip when user is typing in inputs
- `role="dialog"` + `aria-modal` on modals
- `aria-label="Main navigation"` on sidenav
- `aria-current="page"` on active nav items
- `prefers-reduced-motion` media query respected

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking existing views | All views kept intact; only layout wrapper changed |
| Style conflicts | Legacy CSS preserved in index.css with `LEGACY` comment block |
| Bundle size increase | Lucide is tree-shakeable; shadcn copies components locally |
| Stack convention change | `.cursorrules` updated; FRONTEND_GUIDELINES.md to be updated |

## Commit History

1. **Commit 0**: Tailwind CSS v4 + shadcn/ui + Lucide React + rules update
2. **Commit 1**: AppShell layout (SideNav, TopBar, PageHeader)
3. **Commit 2**: Board lane + card redesign
4. **Commit 3**: StatusChip, RiskChip, PriorityChip components
5. **Commit 4**: KanbanFilters + CommandPalette redesign
6. **Commit 5**: Keyboard shortcuts + help modal + a11y
7. **Commit 6**: Documentation (this file + QA checklist)
