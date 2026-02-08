# Mission Control -- Frontend Guidelines

**Last Updated:** February 8, 2026  
**App:** apps/mission-control-ui  
**Approach:** Dark theme, inline React styles, no component library

---

## Styling Approach

- **Primary:** Inline React `style` props on elements
- **Global CSS:** `apps/mission-control-ui/src/index.css` for layout, scrollbars, responsive breakpoints
- **No Tailwind.** No CSS modules. No styled-components.
- **No component library.** All components are custom-built.
- **Animations:** framer-motion (`motion.div`, `AnimatePresence`, layout animations)
- **Drag-and-drop:** @dnd-kit/core + @dnd-kit/sortable (Kanban board)

---

## Color Palette

### Backgrounds

| Token | Hex | Usage |
|---|---|---|
| bg-page | `#0f172a` | Page background, deepest layer |
| bg-card | `#1e293b` | Cards, sidebar, modals, panels |
| bg-hover | `#25334d` | Hover states on interactive elements |
| bg-border | `#334155` | Secondary backgrounds, borders |
| bg-muted | `#475569` | Lighter borders, dividers |

### Text

| Token | Hex | Usage |
|---|---|---|
| text-primary | `#e2e8f0` | Primary text, headings |
| text-secondary | `#94a3b8` | Secondary text, descriptions |
| text-muted | `#64748b` | Tertiary text, timestamps, labels |

### Accents

| Token | Hex | Usage |
|---|---|---|
| accent-blue | `#3b82f6` | Primary actions, links, ASSIGNED status |
| accent-blue-dark | `#2563eb` | Blue hover states |
| accent-green | `#10b981` | Success, ACTIVE status, DONE |
| accent-green-bright | `#22c55e` | Bright green accents |
| accent-orange | `#f59e0b` | Warnings, IN_PROGRESS status |
| accent-orange-bright | `#f97316` | Orange hover states |
| accent-purple | `#8b5cf6` | REVIEW status, analytics |
| accent-purple-dark | `#7c3aed` | Purple hover states |
| accent-red | `#ef4444` | Errors, BLOCKED, NEEDS_APPROVAL |
| accent-red-dark | `#dc2626` | Red hover states |
| accent-yellow | `#fbbf24` | Priority indicators |

### Task Status Colors

| Status | Color |
|---|---|
| INBOX | `#6b7280` |
| ASSIGNED | `#3b82f6` |
| IN_PROGRESS | `#f59e0b` |
| REVIEW | `#8b5cf6` |
| NEEDS_APPROVAL | `#ef4444` |
| BLOCKED | `#dc2626` |
| DONE | `#10b981` |
| CANCELED | `#64748b` |

### Priority Colors

| Priority | Background | Border | Text |
|---|---|---|---|
| 1 (Critical) | `#7c2d12` | `#ea580c` | `#fbbf24` |
| 2 (High) | `#7c2d12` | `#f97316` | `#fb923c` |
| 3 (Normal) | `#1e293b` | `#475569` | `#94a3b8` |
| 4 (Low) | `#0f172a` | `#334155` | `#64748b` |

### Risk Level Colors

| Risk | Color |
|---|---|
| GREEN | `#10b981` |
| YELLOW | `#f59e0b` |
| RED | `#ef4444` |

---

## Typography

| Property | Value |
|---|---|
| Font family | `system-ui, -apple-system, sans-serif` |
| Font sizes | `0.7rem` (11px) to `1.1rem` (18px) |
| Body text | `0.8rem` (13px) |
| Small text | `0.7rem` (11px) |
| Headings | `0.85rem` - `1.1rem` (14px-18px) |
| Font weights | 500 (medium), 600 (semibold), 700 (bold) |
| Letter spacing | `0.03em` - `0.05em` for uppercase labels |
| Text transform | `uppercase` for section headers and status labels |

---

## Spacing

| Scale | Value | Usage |
|---|---|---|
| xs | `4px` | Tight gaps, icon margins |
| sm | `6px` - `8px` | Small gaps, compact padding |
| md | `10px` - `12px` | Standard padding, gaps |
| lg | `14px` - `16px` | Card padding, section gaps |
| xl | `20px` - `24px` | Modal padding, large gaps |

---

## Borders & Radii

| Element | Border Radius |
|---|---|
| Buttons, badges | `4px` |
| Default elements | `6px` |
| Cards, inputs | `8px` |
| Modals, panels | `10px` - `12px` |

| Element | Border |
|---|---|
| Cards | `1px solid #334155` |
| Inputs | `1px solid #475569` |
| Dividers | `1px solid #334155` |

---

## Layout

### Three-Column Layout (Desktop)

```
+-------------------+---------------------+------------------+
| Sidebar (260px)   | Main Content (flex)  | Live Feed (320px)|
| - Agent list      | - Kanban board       | - Activity stream|
| - Action buttons  | - Filters            | - Agent filters  |
+-------------------+---------------------+------------------+
```

- Sidebar: `260px` width, collapsible to `48px`
- Main content: `flex: 1`, scrollable
- Live Feed: `320px` width, right panel

### Header

- Fixed height, flex row layout
- Contains: Title, Project Switcher, Search, Metrics, Action Buttons, Clock

### Modals

- Overlay: `rgba(0, 0, 0, 0.7)` with `backdrop-filter: blur(4px)`
- Modal body: `background: #1e293b`, `border: 1px solid #334155`
- Max-width varies by content (typically `800px` - `1200px`)
- Close button: top-right corner

### Task Drawer

- Slides in from right side
- Width: approximately `50%` of viewport
- Tabbed interface (Overview, Timeline, Artifacts, Approvals, Cost, Reviews)

---

## Responsive Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop | > 1024px | Full three-column layout |
| Tablet | <= 1024px | Live Feed: 280px, Sidebar: 240px |
| Mobile | <= 768px | Live Feed hidden, Sidebar becomes overlay, hamburger menu |
| Small Mobile | <= 640px | Header stacks vertically, smaller fonts |

### Mobile Patterns

- Sidebar: Fixed overlay, slides from left, triggered by hamburger
- Live Feed: Hidden on mobile
- Touch targets: Minimum 44x44px
- Kanban columns: `min-width: 280px` (horizontal scroll)

---

## Component Patterns

### Buttons

```javascript
// Primary action
style={{
  padding: '8px 16px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
}}

// Danger action
style={{
  padding: '8px 16px',
  background: '#dc2626',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
}}

// Ghost/subtle button
style={{
  padding: '6px 10px',
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #334155',
  borderRadius: '6px',
  cursor: 'pointer',
}}
```

### Cards

```javascript
style={{
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '14px',
}}
```

### Badges

```javascript
style={{
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}}
```

### Inputs

```javascript
style={{
  width: '100%',
  padding: '8px 12px',
  background: '#0f172a',
  border: '1px solid #475569',
  borderRadius: '6px',
  color: '#e2e8f0',
  fontSize: '0.85rem',
}}
```

---

## Animation Patterns

### Page Transitions (framer-motion)

```javascript
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2 }}
>
```

### List Items

```javascript
<motion.div
  layout
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
```

### Hover States

- Background color shift: `#1e293b` -> `#25334d`
- Use `onMouseEnter`/`onMouseLeave` state for hover effects (since inline styles)
- Transition duration: 0.15s - 0.2s

---

## Accessibility Notes

- Touch targets: Minimum 44x44px on mobile
- Focus styles: Should be added (currently missing in many components)
- Color contrast: All text/background combinations meet WCAG AA
- Screen reader support: Needs improvement
