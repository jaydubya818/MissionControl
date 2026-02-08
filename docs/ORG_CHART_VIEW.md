# Organization Chart View

The Organization Chart view provides a visual hierarchy of your team structure, combining both human team members and AI agents in a unified org chart.

## Features

### Unified Hierarchy
- **Human Members**: Display with purple borders, showing their role and responsibilities
- **AI Agents**: Display with colored borders based on role (LEAD=blue, SPECIALIST=green, INTERN=teal)
- **Nested Structure**: Sub-agents appear as children of their parent agents

### Agent Information Display
Each agent card shows:
- **Model Information**: The AI model being used (e.g., "Claude Opus 4.5")
- **Pricing**: Budget per run and cost per 1M tokens
- **Capabilities**: Task types the agent can handle
- **Budget Tracking**: Visual progress bar showing daily spend vs. budget

### Metrics Dashboard
Top-level metrics show:
- 👤 **Human**: Count of human team members
- 🤖 **API Agents**: Count of cloud-based AI agents (LEAD/SPECIALIST)
- 💻 **Local Models**: Count of locally-run models (INTERN role)
- 💰 **Daily Budget**: Total daily budget allocation across all agents

## Data Model

### Human Org Members (`orgMembers` table)
```typescript
{
  name: string;
  role: string;
  avatar?: string;
  level: number;
  parentMemberId?: Id<"orgMembers">;
  responsibilities?: string[];
  active: boolean;
}
```

### AI Agents (`agents` table)
```typescript
{
  name: string;
  emoji?: string;
  role: "INTERN" | "SPECIALIST" | "LEAD";
  status: "ACTIVE" | "PAUSED" | "OFFLINE" | "DRAINED" | "QUARANTINED";
  parentAgentId?: Id<"agents">;
  allowedTaskTypes: string[];
  budgetDaily: number;
  budgetPerRun: number;
  spendToday: number;
  metadata?: {
    model: string;
    capabilities: string[];
  };
}
```

## Seeding Sample Data

To populate the org chart with sample data:

```bash
npx convex run seedOrgChart:run
```

This creates:
- Alex Finn (CEO) - Human
  - Henry (CSO) - LEAD Agent
    - Codex - SPECIALIST Agent (Lead Engineer)
    - GLM-4.7 - SPECIALIST Agent (Senior Researcher)
    - GLM-4.7 Flash - INTERN Agent (Research Associate)

To clear all org data:

```bash
npx convex run seedOrgChart:clear
```

## Convex Query

The org chart uses the `getUnifiedHierarchy` query from `convex/orgMembers.ts`:

```typescript
const hierarchy = useQuery(api.orgMembers.getUnifiedHierarchy, {
  projectId: projectId ?? undefined,
});
```

This query:
1. Fetches all active human org members
2. Fetches all agents for the project
3. Builds a tree structure combining both
4. Attaches agents to their parent agents or to the first human root

## Styling

The org chart follows Mission Control's design system:
- **Dark theme**: `#0f172a` background, `#1e293b` cards
- **Border colors**:
  - Purple (`#8b5cf6`): Human members
  - Blue (`#3b82f6`): LEAD agents
  - Green (`#10b981`): SPECIALIST agents
  - Teal (`#14b8a6`): INTERN agents
- **Card dimensions**: 320px wide, 12px border radius
- **Spacing**: 40px gap between sibling nodes

## Future Enhancements

- [ ] Drag-and-drop to reorganize hierarchy
- [ ] Click to expand/collapse subtrees
- [ ] Filter by agent status or role
- [ ] Export org chart as image
- [ ] Show agent performance metrics on hover
- [ ] Add/edit members directly from the UI
- [ ] Link agents to specific human managers
- [ ] Show real-time agent activity indicators
