# Mission Statement System - Implementation Summary

## Overview

The Mission Statement System transforms Mission Control from a task orchestrator into a goal-oriented autonomous organization. Your agents now have a north star that guides every decision, and the system can autonomously generate tasks that advance your mission.

## What Was Built

### 1. Database Schema (`convex/schema.ts`)

- Added `missionStatement` field to the `tenants` table
- Added `MISSION_PROMPT` to task source enum for traceability

### 2. Backend API (`convex/mission.ts`)

**Three core functions:**

- `getMission` (query) - Retrieves the mission statement for the active tenant
- `setMission` (mutation) - Updates the mission statement and logs to activities
- `reversePrompt` (action) - AI-powered task generation based on mission alignment

**Reverse Prompt Logic:**
- Analyzes current tasks, agents, and recent activities
- Generates 1-3 mission-aligned task suggestions with reasoning
- Optional `autoCreate` flag for scheduled automation
- Returns structured suggestions: title, description, type, priority, assignee, reasoning

### 3. Agent Context Injection (`convex/runs.ts`)

Every agent run now includes the mission statement in its metadata:

```typescript
metadata: {
  ...args.metadata,
  missionStatement,
}
```

This ensures agents always have the mission in their context when making decisions.

### 4. Scheduled Jobs (`convex/scheduledJobs.ts`)

- Added `mission_prompt` job type
- Cron executor automatically calls `reversePrompt` with `autoCreate: true`
- Tasks are created in INBOX with `source: "MISSION_PROMPT"`

### 5. UI Components

#### MissionBanner (`apps/mission-control-ui/src/components/MissionBanner.tsx`)
- Displays at the top of the Dashboard
- Gradient border with violet/purple aesthetic
- Edit button (pencil icon) to open mission modal
- "Reverse Prompt" button (sparkles icon) to generate tasks
- Empty state CTA if no mission is set

#### MissionModal (`apps/mission-control-ui/src/MissionModal.tsx`)
- Full-screen modal for editing mission statement
- Textarea with placeholder and tips
- Keyboard shortcuts: Esc to cancel, Cmd+Enter to save
- Saves to tenant via `setMission` mutation

#### MissionSuggestionsDrawer (`apps/mission-control-ui/src/MissionSuggestionsDrawer.tsx`)
- Slide-in drawer from the right
- Auto-generates suggestions on open
- Shows each suggestion as a card with:
  - Title, description, type, priority
  - Suggested assignee
  - Mission alignment reasoning
- Individual "Create Task" buttons per suggestion
- "Create All" bulk action
- "Regenerate" to get fresh suggestions

### 6. Integration Points

#### AppTopBar
- Displays mission statement in center (truncated with tooltip)
- Sparkles icon button for quick reverse prompt access
- Only visible on larger screens (lg+)

#### CommandPanel
- "Reverse Prompt" added as first quick action
- Opens suggestions drawer on click

#### ScheduleView
- `mission_prompt` added to job type dropdown
- Helper text explains the feature
- Hides target ID field for mission_prompt jobs
- Suggests `0 3 * * *` (3 AM daily) as default schedule

#### Kanban Board
- Mission-generated tasks show sparkles icon badge
- Gradient styling (violet/purple) for MISSION_PROMPT source
- Visual distinction from other task sources

#### OrgView (Team Page)
- Displays live mission statement below "Organization" title
- Replaces hardcoded tagline with database-driven content

#### Keyboard Shortcuts
- `Cmd+M` opens mission modal
- Added to shortcuts help panel

## How to Use

### Setting Your Mission

1. Press `Cmd+M` or click the edit icon on the Dashboard mission banner
2. Enter your mission statement (e.g., "Build an autonomous organization of AI agents that does work for me and produces value 24/7")
3. Save

### Manual Reverse Prompting

1. Click the "Reverse Prompt" button in:
   - Mission banner on Dashboard
   - Command Panel quick actions
   - AppTopBar (sparkles icon)
2. Review AI-generated suggestions
3. Create individual tasks or "Create All"

### Scheduled Reverse Prompting

1. Go to Code → Schedule
2. Create new scheduled job:
   - Name: "Nightly Mission Prompt"
   - Type: `mission_prompt`
   - Cron: `0 3 * * *` (3 AM daily)
3. Enable the job

Every night at 3 AM, the system will:
- Analyze your mission, current tasks, and agent roster
- Generate 3 mission-aligned tasks
- Add them to INBOX with source `MISSION_PROMPT`
- You'll see them in the morning with sparkles badges

### Agent Context

Every time an agent starts a run, the mission statement is automatically injected into their context. This means:
- Agents can reference the mission when making decisions
- Task execution is naturally aligned with organizational goals
- Agent prompts can explicitly check mission alignment

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
├─────────────────────────────────────────────────────────────┤
│  Dashboard Banner  │  AppTopBar  │  CommandPanel  │  Kanban │
│  [Edit] [Prompt]   │  Mission    │  Quick Actions │  ✨ Badge│
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Convex Backend                          │
├─────────────────────────────────────────────────────────────┤
│  mission.ts                                                  │
│  ├─ getMission (query)                                       │
│  ├─ setMission (mutation)                                    │
│  └─ reversePrompt (action) ──► AI Analysis ──► Suggestions  │
│                                                               │
│  runs.ts                                                     │
│  └─ start() ──► Inject mission into run metadata            │
│                                                               │
│  scheduledJobs.ts                                            │
│  └─ executeDue() ──► mission_prompt ──► reversePrompt()     │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                         Database                             │
├─────────────────────────────────────────────────────────────┤
│  tenants                                                     │
│  └─ missionStatement: string                                 │
│                                                               │
│  tasks                                                       │
│  └─ source: "MISSION_PROMPT"                                 │
│                                                               │
│  scheduledJobs                                               │
│  └─ jobType: "mission_prompt"                                │
└─────────────────────────────────────────────────────────────┘
```

## Example Workflow

### Morning Routine
1. Wake up and open Mission Control
2. See 3 new tasks in INBOX with sparkles badges
3. Review AI reasoning for each task
4. Assign to appropriate agents
5. Watch autonomous execution throughout the day

### Continuous Improvement
1. Agent completes tasks → updates activities
2. Nightly cron runs at 3 AM
3. AI analyzes: "What did we accomplish? What's next?"
4. Generates strategic tasks, not just maintenance
5. Cycle repeats → organization evolves toward mission

### Ad-Hoc Strategy Sessions
1. Press `Cmd+M` to review/update mission
2. Click "Reverse Prompt" to get fresh ideas
3. AI suggests tasks you haven't thought of
4. Create immediately or save for later

## Technical Details

### AI Integration (Current: Mock)

The `reversePrompt` action currently returns mock suggestions. To enable real AI:

1. Add API key to `.env`:
   ```
   OPENAI_API_KEY=sk-...
   # or
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Update `convex/mission.ts` line 120+ to call the LLM API:
   ```typescript
   const response = await fetch("https://api.openai.com/v1/chat/completions", {
     method: "POST",
     headers: {
       "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({
       model: "gpt-4",
       messages: [{ role: "user", content: prompt }],
       response_format: { type: "json_object" },
     }),
   });
   ```

### Task Source Traceability

All mission-generated tasks have:
- `source: "MISSION_PROMPT"`
- Sparkles icon badge in Kanban
- Gradient styling (violet/purple)
- Mission alignment reasoning in description

### Keyboard Shortcuts

- `Cmd+M` - Open mission modal
- `Cmd+N` - New task
- `Cmd+K` - Command palette
- `Shift+Cmd+A` - Approvals
- `Cmd+E` - Agents

## Files Modified

### Backend (5 files)
- `convex/schema.ts` - Schema changes
- `convex/mission.ts` - New file, mission CRUD + reverse prompt
- `convex/runs.ts` - Mission injection
- `convex/scheduledJobs.ts` - mission_prompt job type
- `convex/tasks.ts` - TaskSource type update

### Frontend (11 files)
- `apps/mission-control-ui/src/components/MissionBanner.tsx` - New component
- `apps/mission-control-ui/src/MissionModal.tsx` - New component
- `apps/mission-control-ui/src/MissionSuggestionsDrawer.tsx` - New component
- `apps/mission-control-ui/src/DashboardOverview.tsx` - Added banner
- `apps/mission-control-ui/src/components/AppTopBar.tsx` - Mission display + button
- `apps/mission-control-ui/src/CommandPanel.tsx` - Reverse prompt action
- `apps/mission-control-ui/src/ScheduleView.tsx` - mission_prompt job type
- `apps/mission-control-ui/src/Kanban.tsx` - Mission source badge
- `apps/mission-control-ui/src/OrgView.tsx` - Live mission display
- `apps/mission-control-ui/src/KeyboardShortcuts.tsx` - Cmd+M shortcut
- `apps/mission-control-ui/src/App.tsx` - State management + wiring

## Next Steps

1. **Deploy** - Push changes and run Convex schema migration
2. **Set Mission** - Press `Cmd+M` and enter your mission statement
3. **Test Manual** - Click "Reverse Prompt" to verify suggestions
4. **Schedule** - Create a nightly mission_prompt job
5. **Connect AI** - Replace mock suggestions with real LLM calls
6. **Monitor** - Watch mission-generated tasks flow through the Kanban

## Impact

Before: Task orchestrator with manual task creation
After: Goal-oriented autonomous organization that self-generates work aligned with your mission

Your agents now work **for** your mission, not just **on** tasks.
