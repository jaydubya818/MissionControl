# Implementation Plan: v1.4 - Core Workflow Features

**Date:** 2026-02-02  
**Goal:** Drag & Drop Kanban + Smart Assignment + Webhooks + Mobile Responsive

---

## 🎯 Features to Implement

### 1. Drag & Drop Kanban (Option B)
**Impact:** 🔥🔥🔥 High - Natural workflow

**Technical Approach:**
- Library: `@dnd-kit/core` + `@dnd-kit/sortable`
- Drag tasks between columns (status changes)
- Reorder within column (priority)
- Optimistic updates
- Visual feedback
- Undo support

**Files:**
- `apps/mission-control-ui/package.json` - Add dependencies
- `apps/mission-control-ui/src/Kanban.tsx` - Enhance with DnD
- `apps/mission-control-ui/src/DragOverlay.tsx` - Custom overlay

### 2. Smart Task Assignment (Option C)
**Impact:** 🔥🔥 Medium-High - Automation

**Technical Approach:**
- Skill matching algorithm
- Load balancing (tasks per agent)
- Priority-based routing
- Workload consideration
- Manual override

**Files:**
- `convex/taskRouter.ts` - New routing engine
- `convex/tasks.ts` - Add auto-assign mutation
- `apps/mission-control-ui/src/CreateTaskModal.tsx` - Add auto-assign option

**Algorithm:**
```
Score = (skill_match * 0.4) + (availability * 0.3) + (workload * 0.2) + (priority * 0.1)
- skill_match: Agent has task type in allowedTaskTypes
- availability: Agent status is ACTIVE
- workload: Inverse of current task count
- priority: Agent role weight (LEAD > SPECIALIST > INTERN)
```

### 3. Webhook System (Option D)
**Impact:** 🔥🔥 Medium - Extensibility

**Technical Approach:**
- Event subscriptions
- HTTP POST delivery
- Retry with exponential backoff
- Signature verification (HMAC-SHA256)
- Event filtering

**Files:**
- `convex/webhooks.ts` - Webhook management
- `convex/webhookDelivery.ts` - Delivery engine
- `apps/mission-control-ui/src/WebhooksModal.tsx` - Management UI

**Events:**
- `task.created`
- `task.assigned`
- `task.completed`
- `task.blocked`
- `approval.requested`
- `approval.decided`
- `agent.registered`
- `agent.quarantined`
- `budget.exceeded`

### 4. Mobile Responsive UI (Option E)
**Impact:** 🔥 Medium - Accessibility

**Technical Approach:**
- CSS breakpoints (mobile: <768px, tablet: 768-1024px, desktop: >1024px)
- Mobile-optimized Kanban (single column scroll)
- Touch-friendly buttons (min 44px)
- Collapsible sidebar
- Bottom navigation on mobile

**Files:**
- `apps/mission-control-ui/src/index.css` - Add responsive styles
- `apps/mission-control-ui/src/App.tsx` - Responsive layout
- `apps/mission-control-ui/src/Kanban.tsx` - Mobile Kanban view
- `apps/mission-control-ui/src/MobileNav.tsx` - Bottom navigation

---

## 📋 Implementation Order

### Phase 1: Drag & Drop Kanban (2-3 hours)
1. Install @dnd-kit dependencies
2. Add DnD context to Kanban
3. Make KanbanColumn droppable
4. Make TaskCard draggable
5. Handle drop events (status change)
6. Add visual feedback
7. Implement undo

### Phase 2: Smart Task Assignment (2-3 hours)
1. Create taskRouter.ts with scoring algorithm
2. Add auto-assign mutation
3. Update CreateTaskModal with toggle
4. Test with various scenarios
5. Add manual override

### Phase 3: Webhook System (3-4 hours)
1. Create webhook schema
2. Implement webhook CRUD
3. Create delivery engine with retries
4. Add signature verification
5. Build management UI
6. Test with webhook.site

### Phase 4: Mobile Responsive (2-3 hours)
1. Add responsive breakpoints
2. Mobile Kanban layout
3. Collapsible sidebar
4. Touch-friendly buttons
5. Bottom navigation
6. Test on mobile devices

---

## 🎯 Success Criteria

### Drag & Drop Kanban ✅
- Can drag tasks between columns
- Status updates automatically
- Visual feedback during drag
- Optimistic updates work
- Undo functionality works

### Smart Task Assignment ✅
- Auto-assign finds best agent
- Considers skills, workload, priority
- Manual override works
- Load balancing effective

### Webhook System ✅
- Can create/edit/delete webhooks
- Events trigger deliveries
- Retries work (3 attempts)
- Signature verification works
- UI shows delivery status

### Mobile Responsive ✅
- Works on mobile (< 768px)
- Touch-friendly (44px+ buttons)
- Sidebar collapses
- Kanban scrolls horizontally
- Bottom nav on mobile

---

## 🚀 Let's Build!

Starting implementation now...
