# Mission Control - Projects Guide

**Date:** 2026-02-02

---

## 📁 Current Projects

You now have **3 projects** set up in Mission Control:

### 1. **OpenClaw** 
- **Slug:** `openclaw`
- **ID:** `ks78rbcyr6begzb9qzaa612pg580dkyw`
- **Description:** Original OpenClaw project
- **Use for:** OpenClaw development and agents

### 2. **SellerFi** ✨ NEW
- **Slug:** `sellerfi`
- **ID:** `ks70tcsz3a9g2xhqztpsff71qd80ddmh`
- **Description:** SellerFi work and repository
- **Use for:** All SellerFi-related tasks, agents, and work

### 3. **Mission Control** ✨ NEW
- **Slug:** `mission-control`
- **ID:** `ks7998y3ve5g4hqh7g1pd5d78h80c07z`
- **Description:** Mission Control development and maintenance
- **Use for:** Mission Control development, features, and improvements

---

## 🎯 How to Use Projects

### In the UI

1. **Switch Projects:**
   - Click the project dropdown in the header
   - Select "SellerFi", "Mission Control", or "OpenClaw"
   - All tasks, agents, and data will filter to that project

2. **Create Tasks:**
   - Select the project first
   - Click "New Task"
   - Task will be created in the selected project

3. **View by Project:**
   - Kanban board shows tasks for selected project
   - Agents sidebar shows agents for selected project
   - All dashboards filter by selected project

### For Agents

When registering an agent, specify the project:

```bash
# For SellerFi work
export PROJECT_SLUG=sellerfi
export AGENT_NAME=SellerFiAgent

# For Mission Control work
export PROJECT_SLUG=mission-control
export AGENT_NAME=MCAgent

# For OpenClaw work
export PROJECT_SLUG=openclaw
export AGENT_NAME=Scout
```

### Using the SDK

```typescript
import { MissionControlClient } from '@mission-control/openclaw-sdk';

// SellerFi agent
const sellerfiAgent = new MissionControlClient({
  convexUrl: 'https://different-gopher-55.convex.cloud',
  projectSlug: 'sellerfi',  // ← Project slug
  agent: {
    name: 'SellerFiBot',
    role: 'SPECIALIST',
    allowedTaskTypes: ['CODE_CHANGE', 'ENGINEERING'],
  },
});

// Mission Control agent
const mcAgent = new MissionControlClient({
  convexUrl: 'https://different-gopher-55.convex.cloud',
  projectSlug: 'mission-control',  // ← Project slug
  agent: {
    name: 'MCBot',
    role: 'SPECIALIST',
    allowedTaskTypes: ['CODE_CHANGE', 'DOCS'],
  },
});
```

---

## ➕ Adding More Projects

### Option 1: Via Convex Dashboard

1. Go to https://different-gopher-55.convex.cloud
2. Open the "Functions" tab
3. Run `projects:create` with:
   ```json
   {
     "name": "New Project Name",
     "slug": "new-project-slug",
     "description": "Project description",
     "policyDefaults": {
       "budgetDefaults": {
         "INTERN": { "daily": 2, "perRun": 0.25 },
         "SPECIALIST": { "daily": 5, "perRun": 0.75 },
         "LEAD": { "daily": 12, "perRun": 1.5 }
       }
     }
   }
   ```

### Option 2: Via CLI

```bash
cd /Users/jaywest/MissionControl

# Edit convex/setupProjects.ts to add your new project
# Then run:
npx convex run setupProjects:createInitialProjects
```

### Option 3: Programmatically

```typescript
// In your code
await ctx.db.insert("projects", {
  name: "New Project",
  slug: "new-project",
  description: "Description here",
  policyDefaults: {
    budgetDefaults: {
      INTERN: { daily: 2, perRun: 0.25 },
      SPECIALIST: { daily: 5, perRun: 0.75 },
      LEAD: { daily: 12, perRun: 1.5 },
    },
  },
});
```

---

## 📊 Project Isolation

Each project has its own:
- ✅ **Tasks** - Completely separate task lists
- ✅ **Agents** - Agents are scoped to one project
- ✅ **Approvals** - Approval queues per project
- ✅ **Activities** - Activity logs per project
- ✅ **Runs** - Cost tracking per project
- ✅ **Notifications** - Notifications per project
- ✅ **Budgets** - Budget limits per project
- ✅ **Policies** - Policy defaults per project

**Projects are completely isolated** - agents in one project cannot see or interact with tasks in another project.

---

## 🔄 Switching Between Projects

### In UI
Just use the dropdown! Everything updates automatically.

### For Development
```bash
# Working on SellerFi
export PROJECT_SLUG=sellerfi
pnpm example:simple

# Working on Mission Control
export PROJECT_SLUG=mission-control
pnpm example:simple

# Working on OpenClaw
export PROJECT_SLUG=openclaw
pnpm example:simple
```

---

## 💡 Best Practices

### 1. **One Project Per Repo/Company**
- ✅ SellerFi → sellerfi project
- ✅ Mission Control → mission-control project
- ✅ Client Work → client-name project

### 2. **Consistent Naming**
- Use lowercase slugs with hyphens
- Keep names descriptive
- Example: `acme-corp`, `personal-projects`, `client-xyz`

### 3. **Budget Defaults**
Set appropriate budgets per project:
- **Production projects** (SellerFi): Higher budgets
- **Development projects** (Mission Control): Moderate budgets
- **Experimental projects**: Lower budgets

### 4. **Agent Assignment**
- Assign agents to the project they work on
- Don't share agents across projects (create separate agents)
- Use project-specific agent names (e.g., `SellerFi-Scout`, `MC-Scout`)

---

## 📋 Quick Reference

**List all projects:**
```bash
npx convex run projects:list
```

**Get project stats:**
```bash
npx convex run projects:getStats --projectId "ks70tcsz3a9g2xhqztpsff71qd80ddmh"
```

**Create new project:**
```bash
npx convex run projects:create \
  --name "New Project" \
  --slug "new-project" \
  --description "Project description"
```

---

## ✅ Summary

You now have:
- ✅ **3 projects** set up (OpenClaw, SellerFi, Mission Control)
- ✅ **Complete isolation** between projects
- ✅ **Easy switching** via dropdown
- ✅ **Ability to add more** projects anytime

**Next steps:**
1. Refresh the UI at http://localhost:5173/
2. Click the project dropdown
3. You'll see all 3 projects!
4. Select "SellerFi" or "Mission Control" to start working

🎉 **Projects are ready to use!**
