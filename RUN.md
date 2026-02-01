# Run Commands

Exact commands to run Mission Control locally.

## Prerequisites

- Node 18+
- pnpm 9+ (or set `packageManager` and use corepack)

## First-time setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure Convex** (required before UI can connect)

   ```bash
   npx convex dev
   ```

   - Sign in or create a Convex account when prompted.
   - Create a new project (e.g. "mission-control").
   - Convex will create `.env.local` with `CONVEX_DEPLOYMENT` and `CONVEX_URL`.
   - For the UI, add to `.env.local` (or set in app):

   ```bash
   # In apps/mission-control-ui or root .env.local
   VITE_CONVEX_URL=<paste CONVEX_URL from Convex dashboard or .env.local>
   ```

   - Stop the Convex dev process (Ctrl+C) after it’s configured, or leave it running and use a second terminal for the next steps.

3. **Seed sample data** (10 agents + 5 tasks)

   ```bash
   pnpm run convex:seed
   ```

   Or:

   ```bash
   npx convex run seed:run
   ```

## Start dev (UI + Convex)

From repo root:

```bash
pnpm dev
```

This runs:

- `npx convex dev` – Convex backend (syncs schema/functions, provides backend)
- `turbo run dev --filter=mission-control-ui` – Vite dev server for the UI

## Expected URLs

- **UI:** http://localhost:5173  
- **Convex:** Backend URL is in `.env.local` as `CONVEX_URL`; the UI uses `VITE_CONVEX_URL` (set to the same value in `.env.local` at repo root).

## What you should see

**URL:** http://localhost:5173

1. **Kanban**  
   - Seven columns: **Inbox** | **Assigned** | **In Progress** | **Review** | **Needs Approval** | **Blocked** | **Done**.  
   - After `pnpm run convex:seed`, sample tasks appear as follows:  
     - **Inbox (1):** “Draft blog post on TypeScript”  
     - **Assigned (1):** “SEO research for product page”  
     - **In Progress (1):** “Fix login timeout bug”  
     - **Needs Approval (1):** “Social post approval needed”  
     - **Blocked (1):** “Blocked: API rate limit”  
   - Each card shows title, type, and spend/budget.

2. **Task detail drawer**  
   - Click any task card.  
   - A drawer opens on the right with two tabs:  
     - **Overview:** title, description, status, type, budget/spend, blocked reason (if any).  
     - **Timeline:** events from `taskTransitions` (fromStatus → toStatus, actor, time). New tasks show “No transitions yet”; after you move a task (e.g. via API or future UI), transitions appear here.

## Optional: run Convex and UI separately

**Terminal 1 – Convex:**

```bash
npx convex dev
```

**Terminal 2 – UI:**

```bash
pnpm --filter mission-control-ui dev
```

Then open http://localhost:5173 .

## Seed again (reset data)

To re-run the seed (e.g. after clearing data):

```bash
pnpm run convex:seed
```

Note: The seed mutation skips if agents already exist. To fully reset, clear tables in the Convex dashboard and run the seed again.
