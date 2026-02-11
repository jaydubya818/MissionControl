# UI QA Checklist — Enterprise Upgrade

Use this checklist to verify the UI upgrade is working correctly.

## How to Run

```bash
cd apps/mission-control-ui
pnpm dev
# Open http://localhost:5173
```

## Board (Kanban View)

- [ ] All 9 status lanes render with correct icons and colors
- [ ] Task cards show title (max 2 lines), type badge, priority badge
- [ ] Task cards show source badge when source is set
- [ ] Labels display (max 3 + overflow count)
- [ ] Blocked tasks show destructive banner with reason
- [ ] Cost and assignee avatars display in card footer
- [ ] Hover over card: "Move" dropdown and "Open" button appear
- [ ] Click "Move" dropdown: shows allowed transitions with status dots
- [ ] Moving a task via dropdown updates the board
- [ ] Drag and drop: card moves between allowed lanes
- [ ] Drag and drop: disallowed transitions show error toast
- [ ] Undo button appears after move, reverting works
- [ ] Empty lanes show contextual empty state message
- [ ] Lane scroll works for many tasks (ScrollArea)

## Navigation (SideNav)

- [ ] SideNav shows 5 groups: Operations, Agents, Projects, Comms, Admin
- [ ] Clicking a nav item switches the view
- [ ] Active item is highlighted with accent background
- [ ] Collapse button toggles sidebar width
- [ ] Collapsed mode shows icons only with tooltips on hover
- [ ] Collapsed state persists across page reload (localStorage)
- [ ] Alerts and Approvals quick-action buttons work
- [ ] Approval badge shows pending count

## TopBar

- [ ] Project selector dropdown works
- [ ] Search bar is visible on desktop, icon on mobile
- [ ] Metrics show agents active + task count
- [ ] Insights dropdown opens with all analytics links
- [ ] Each analytics link opens the correct modal
- [ ] "Controls" button opens operator controls
- [ ] "New Task" button opens create task modal
- [ ] Time and Online status display
- [ ] Theme toggle switches between dark and light mode
- [ ] Theme persists across page reload
- [ ] User menu shows Settings and Shortcuts

## Filters

- [ ] Filter bar shows below PageHeader on tasks view
- [ ] Priority buttons (P1/P2/P3) toggle with color change
- [ ] Agent emoji buttons toggle with primary color
- [ ] Type buttons toggle with teal color
- [ ] Active filter count badge updates
- [ ] "Clear" button resets all filters
- [ ] Saved views dropdown lists views
- [ ] "Save View" creates a new saved view
- [ ] "Delete" removes the selected saved view

## Command Palette

- [ ] `⌘+K` opens the command palette
- [ ] `/` (when not in input) opens the command palette
- [ ] Search input auto-focuses
- [ ] Quick actions display without search text
- [ ] Typing filters commands
- [ ] Typing 2+ characters shows task/approval/agent search results
- [ ] Clicking a task result opens the task drawer
- [ ] Clicking a command runs the action
- [ ] `Esc` closes the palette
- [ ] Clicking backdrop closes the palette

## Keyboard Shortcuts

- [ ] `/` — opens search (not when typing in inputs)
- [ ] `g` then `b` — navigates to board
- [ ] `?` — opens shortcuts help modal
- [ ] `⌘+N` — opens create task modal
- [ ] `⌘+K` — opens command palette
- [ ] `⇧⌘+A` — opens approvals
- [ ] `⌘+E` — opens agents view
- [ ] Help modal shows all shortcuts grouped
- [ ] Help modal auto-focuses "Got it" button
- [ ] `Esc` closes help modal

## Status/Risk/Priority Chips

- [ ] StatusChip renders correct icon + label for each of 9 states
- [ ] RiskChip renders GREEN/YELLOW/RED with shield icons
- [ ] PriorityChip renders Critical/High/Normal/Low with arrow icons
- [ ] Chips in task drawer header show status + priority
- [ ] Chips support sm and md sizes

## Accessibility

- [ ] Tab through sidenav items: focus ring visible
- [ ] Tab through topbar buttons: focus ring visible
- [ ] Tab through kanban cards: focus ring visible
- [ ] Screen reader reads nav labels (aria-label on nav)
- [ ] Screen reader reads active page (aria-current)
- [ ] All modals have role="dialog" and aria-modal
- [ ] `prefers-reduced-motion: reduce` disables animations

## Theming

- [ ] Dark mode: background is dark, text is light, borders visible
- [ ] Light mode: background is white, text is dark, borders visible
- [ ] All shadcn components adapt to theme (buttons, cards, badges, inputs)
- [ ] Legacy components still render correctly in both themes

## Responsiveness

- [ ] At 1366px width: full layout visible, sidebar + content + live feed
- [ ] At 1024px width: live feed may collapse, main content still usable
- [ ] At 768px width: mobile-friendly layout activates
- [ ] Kanban lanes scroll horizontally on narrow screens

## Performance

- [ ] No visible rerender storms (check React DevTools Profiler)
- [ ] Drag and drop is smooth (no lag during drag)
- [ ] Switching views is instant
- [ ] Build completes without errors
- [ ] Bundle size is reasonable (< 1MB gzip for JS)

## Screenshots to Capture

For README and documentation:
1. Board view (dark mode) — full page with populated lanes
2. Board view (light mode) — same view
3. SideNav collapsed vs expanded
4. Command palette with search results
5. Task drawer with status/priority chips
6. Keyboard shortcuts help modal
7. Filters active with badge count
