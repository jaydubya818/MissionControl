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

## Design Tokens

All colors should be referenced via the design tokens module (`src/styles/colors.js`) rather than hardcoded hex values. This ensures consistency and makes theme updates easier.

```javascript
// src/styles/colors.js
export const colors = {
  // Backgrounds
  bgPage: '#0f172a',
  bgCard: '#1e293b',
  bgHover: '#25334d',
  bgBorder: '#334155',
  bgMuted: '#475569',
  
  // Text
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  // Accents
  accentBlue: '#3b82f6',
  accentBlueDark: '#2563eb',
  accentGreen: '#10b981',
  accentGreenBright: '#22c55e',
  accentOrange: '#f59e0b',
  accentOrangeBright: '#f97316',
  accentPurple: '#8b5cf6',
  accentPurpleDark: '#7c3aed',
  accentRed: '#ef4444',
  accentRedDark: '#dc2626',
  accentYellow: '#fbbf24',
};
```

Import and use tokens in components:

```javascript
import { colors } from '../styles/colors';

<div style={{ background: colors.bgCard, color: colors.textPrimary }}>
```

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
| Font sizes | `0.875rem` (14px) to `1.1rem` (18px) |
| Body text | `1rem` (16px) — meets WCAG legibility baseline |
| Small text | `0.875rem` (14px) — minimum for accessibility |
| Headings | `0.85rem` - `1.1rem` (14px-18px) |
| Font weights | 500 (medium), 600 (semibold), 700 (bold) |
| Letter spacing | `0.03em` - `0.05em` for uppercase labels |
| Text transform | `uppercase` for section headers and status labels |

**WCAG Compliance Note:** Body text is set to 16px (1rem) and small text to 14px (0.875rem) to meet WCAG AA legibility requirements. For text smaller than 14px, ensure sufficient color contrast (4.5:1 for normal text, 3:1 for large text ≥18px or bold ≥14px). All interactive elements must have focus indicators (see Focus Styles section below).

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
import { colors } from '../styles/colors';

// Primary action
style={{
  padding: '8px 16px',
  background: colors.accentBlue,
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '1rem',
  fontWeight: 600,
}}

// Danger action
style={{
  padding: '8px 16px',
  background: colors.accentRedDark,
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
}}

// Ghost/subtle button
style={{
  padding: '6px 10px',
  background: 'transparent',
  color: colors.textSecondary,
  border: `1px solid ${colors.bgBorder}`,
  borderRadius: '6px',
  cursor: 'pointer',
}}
```

### Cards

```javascript
import { colors } from '../styles/colors';

style={{
  background: colors.bgCard,
  border: `1px solid ${colors.bgBorder}`,
  borderRadius: '8px',
  padding: '14px',
}}
```

### Badges

```javascript
import { colors } from '../styles/colors';

style={{
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '0.875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}}
```

### Inputs

```javascript
import { colors } from '../styles/colors';

style={{
  width: '100%',
  padding: '8px 12px',
  background: colors.bgPage,
  border: `1px solid ${colors.bgMuted}`,
  borderRadius: '6px',
  color: colors.textPrimary,
  fontSize: '1rem',
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

## Focus Styles

All interactive elements must have visible focus indicators to meet WCAG 2.1 Level A (Success Criterion 2.4.7: Focus Visible).

**Standard Focus Pattern:**

```javascript
import { colors } from '../styles/colors';

// Global utility class (add to index.css)
.focus-outline:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

// React pattern using state
const [focused, setFocused] = useState(false);

<button
  style={{
    ...baseStyles,
    outline: focused ? `2px solid ${colors.accentBlue}` : 'none',
    outlineOffset: focused ? '2px' : '0',
  }}
  onFocus={() => setFocused(true)}
  onBlur={() => setFocused(false)}
>
  Click me
</button>

// Prefer :focus-visible where available to avoid visual noise on mouse clicks
```

**Implementation Checklist:**
- ✅ Apply focus styles to all `<button>` elements
- ✅ Apply focus styles to all `<a>` links
- ✅ Apply focus styles to all form inputs (`<input>`, `<textarea>`, `<select>`)
- ✅ Apply focus styles to custom interactive elements (cards, list items with onClick)
- ✅ Use `:focus-visible` pseudo-class where supported to show focus only for keyboard navigation
- ✅ Ensure focus indicator has 3:1 contrast ratio against background (WCAG 2.1 SC 1.4.11 Non-text Contrast)

## Accessibility Notes

### Touch Targets
- Minimum 44x44px on mobile for all interactive elements
- Ensure adequate spacing between adjacent clickable elements

### Color Contrast
- All text/background combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Body text (16px) on `bgCard` (#1e293b) with `textPrimary` (#e2e8f0) = 12.6:1 ✅
- Small text (14px) on `bgCard` with `textSecondary` (#94a3b8) = 7.1:1 ✅

### Screen Reader Support

**Required ARIA Patterns:**

1. **Modals and Drawers:**
   - Use `role="dialog"` or `role="alertdialog"` on modal containers
   - Add `aria-modal="true"` to indicate modal behavior
   - Set `aria-labelledby` to reference the modal title
   - Set `aria-describedby` to reference the modal description (if present)
   - Trap focus within modal while open
   - Return focus to trigger element on close

2. **Live Regions (Activity Stream, Status Updates):**
   - Use `aria-live="polite"` for non-urgent updates (activity stream)
   - Use `aria-live="assertive"` for urgent alerts (error notifications)
   - Include `aria-atomic="true"` if the entire region should be announced
   - Example: `<div aria-live="polite" aria-atomic="false">New task created</div>`

3. **Component-Specific Labels:**
   - **NavBar:** Add `aria-label="Main navigation"` to `<nav>` element
   - **ActivityStream:** Add `aria-label="Activity feed"` to container, `aria-live="polite"` for updates
   - **StatusUpdateCard:** Add `aria-label="Task status: ${status}"` to status badges
   - **Buttons (icon-only):** Always include `aria-label` (e.g., `aria-label="Close modal"`)
   - **Form inputs:** Always pair with `<label>` or use `aria-label` if label is visual only

4. **Semantic HTML:**
   - Use `<button>` for clickable controls (not `<div onClick>`)
   - Use `<a>` for navigation (not `<span onClick>`)
   - Only use `role="button"` on non-button elements if necessary, and add keyboard handlers (`onKeyDown` for Enter/Space)
   - Use `<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>` for landmark regions

**Screen Reader Testing Checklist:**
- ✅ All interactive elements are keyboard-accessible (Tab, Enter, Space, Arrow keys)
- ✅ Focus order follows visual order
- ✅ All images have `alt` text (or `alt=""` for decorative images)
- ✅ All form inputs have associated labels
- ✅ Modal dialogs trap focus and announce title on open
- ✅ Live regions announce updates without stealing focus
- ✅ Status messages are announced (e.g., "Task moved to In Progress")
