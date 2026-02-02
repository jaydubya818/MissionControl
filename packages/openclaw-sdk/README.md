# Mission Control OpenClaw SDK

Easy integration for OpenClaw agents with Mission Control.

## Installation

```bash
npm install @mission-control/openclaw-sdk
# or
pnpm add @mission-control/openclaw-sdk
```

## Quick Start

```typescript
import { MissionControlClient } from '@mission-control/openclaw-sdk';

// Create client
const client = new MissionControlClient({
  convexUrl: 'https://your-deployment.convex.cloud',
  projectSlug: 'my-project',
  agent: {
    name: 'MyAgent',
    role: 'SPECIALIST',
    emoji: '🤖',
    allowedTaskTypes: ['CODE_CHANGE', 'RESEARCH'],
    budgetDaily: 10.0,
    budgetPerRun: 1.0,
  },
});

// Register task handler
client.onTask('CODE_CHANGE', async (context) => {
  // Post progress updates
  await context.postComment('Working on it...');
  await context.updateProgress('50% complete');
  
  // Do work...
  
  // Return deliverable
  return {
    summary: 'Completed the code change',
    artifactIds: ['file1.ts', 'file2.ts'],
    evidence: 'All tests passing',
  };
});

// Start the agent
await client.start();
```

## Features

- ✅ **Simple API** - 10 lines to get started
- ✅ **Type Safe** - Full TypeScript support
- ✅ **Auto Heartbeat** - Automatic registration and heartbeat loop
- ✅ **Task Handlers** - Register handlers for specific task types
- ✅ **Approval Workflow** - Built-in approval request/wait
- ✅ **Cost Tracking** - Automatic run cost calculation
- ✅ **Error Handling** - Automatic retries with exponential backoff
- ✅ **Graceful Shutdown** - Clean agent shutdown on SIGINT

## Configuration

### SDKConfig

```typescript
interface SDKConfig {
  // Required
  convexUrl: string;              // Mission Control Convex URL
  projectSlug: string;            // Project to join
  agent: AgentConfig;             // Agent configuration
  
  // Optional
  heartbeatIntervalMs?: number;   // Default: 900000 (15 min)
  autoRetry?: boolean;            // Default: true
  maxRetries?: number;            // Default: 3
  retryDelayMs?: number;          // Default: 1000
  
  // Callbacks
  onError?: (error: Error) => void;
  onHeartbeat?: (result: HeartbeatResult) => void;
  onTaskClaimed?: (task: Task) => void;
  onTaskCompleted?: (task: Task) => void;
  onApprovalNeeded?: (approval: Approval) => void;
}
```

### AgentConfig

```typescript
interface AgentConfig {
  name: string;                   // Agent name (unique)
  role?: AgentRole;               // Default: 'INTERN'
  emoji?: string;                 // Agent emoji
  allowedTaskTypes?: TaskType[];  // Task types to handle
  workspacePath?: string;         // Workspace directory
  budgetDaily?: number;           // Daily budget in USD
  budgetPerRun?: number;          // Per-run budget in USD
}
```

## Task Handlers

### Register for Specific Task Type

```typescript
client.onTask('CUSTOMER_RESEARCH', async (context) => {
  // Handle CUSTOMER_RESEARCH tasks
  return {
    summary: 'Research complete',
    artifactIds: ['report.md'],
  };
});
```

### Register for All Task Types

```typescript
client.onAnyTask(async (context) => {
  // Handle any task type
  return {
    summary: `Completed ${context.task.type} task`,
  };
});
```

### Task Execution Context

```typescript
interface TaskExecutionContext {
  task: Task;                     // Current task
  agent: Agent;                   // Your agent
  run: Run;                       // Current run
  
  // Helper methods
  requestApproval: (
    action: string,
    justification: string,
    estimatedCost?: number
  ) => Promise<Approval>;
  
  postComment: (content: string) => Promise<void>;
  updateProgress: (status: string) => Promise<void>;
}
```

## Approval Workflow

Request approval for high-risk actions:

```typescript
client.onTask('CODE_CHANGE', async (context) => {
  // Check if critical file access needed
  if (needsCriticalAccess) {
    // Request approval
    const approval = await context.requestApproval(
      'MODIFY_CRITICAL_FILE',
      'Need to modify auth module',
      0.50  // Estimated cost
    );
    
    // Approval is now pending
    // Operator will approve/deny via Telegram or UI
    // Task will wait in NEEDS_APPROVAL state
  }
  
  // Continue with work...
  return { summary: 'Done!' };
});
```

## Progress Updates

Keep operators informed:

```typescript
client.onTask('RESEARCH', async (context) => {
  await context.postComment('Starting research...');
  
  // Do some work
  await context.updateProgress('25% - Gathering data');
  
  // More work
  await context.updateProgress('50% - Analyzing');
  
  // Final work
  await context.updateProgress('75% - Preparing report');
  
  return {
    summary: 'Research complete',
    evidence: 'Analyzed 100+ sources',
  };
});
```

## Error Handling

The SDK automatically retries failed operations:

```typescript
const client = new MissionControlClient({
  // ...
  autoRetry: true,        // Enable auto-retry
  maxRetries: 3,          // Retry up to 3 times
  retryDelayMs: 1000,     // Start with 1s delay
  onError: (error) => {
    console.error('Error:', error);
    // Log to monitoring service
  },
});
```

## Lifecycle Management

### Start Agent

```typescript
// Start agent and begin heartbeat loop
const agent = await client.start();
console.log(`Agent ${agent.name} started`);
```

### Stop Agent

```typescript
// Stop heartbeat and mark agent offline
await client.stop();
```

### Graceful Shutdown

```typescript
process.on('SIGINT', async () => {
  await client.stop();
  process.exit(0);
});
```

## Examples

### Simple Agent

See `examples/simple-agent.ts` for a complete example:

```bash
export CONVEX_URL=https://your-deployment.convex.cloud
export PROJECT_SLUG=your-project
pnpm example:simple
```

### Approval Agent

See `examples/approval-agent.ts` for approval workflow:

```bash
export CONVEX_URL=https://your-deployment.convex.cloud
export PROJECT_SLUG=your-project
pnpm example:approval
```

## Task Types

Available task types:

- `CODE_CHANGE` - Code modifications
- `CUSTOMER_RESEARCH` - Customer research
- `SEO_RESEARCH` - SEO analysis
- `CONTENT` - Content creation
- `DOCS` - Documentation
- `EMAIL_MARKETING` - Email campaigns
- `SOCIAL` - Social media
- `ENGINEERING` - Engineering tasks
- `OPS` - Operations

## Agent Roles

Available roles:

- `LEAD` - Team lead (highest autonomy)
- `SPECIALIST` - Domain specialist
- `REVIEWER` - Code/content reviewer
- `CHALLENGER` - Challenge assumptions
- `INTERN` - Junior (requires approvals)

## Best Practices

### 1. Use Type-Specific Handlers

```typescript
// Good: Specific handlers
client.onTask('CODE_CHANGE', handleCodeChange);
client.onTask('RESEARCH', handleResearch);

// Avoid: One handler for everything
client.onAnyTask(handleEverything);
```

### 2. Provide Progress Updates

```typescript
// Good: Keep operators informed
await context.updateProgress('Analyzing...');
await context.updateProgress('Implementing...');

// Avoid: Silent execution
// (no updates)
```

### 3. Request Approvals Early

```typescript
// Good: Request approval before work
if (highRisk) {
  await context.requestApproval(...);
}
// Then do work

// Avoid: Request approval after work
// (wastes time if denied)
```

### 4. Include Evidence

```typescript
// Good: Provide evidence
return {
  summary: 'Research complete',
  evidence: 'Analyzed 100+ sources, found 3 key insights',
  artifactIds: ['report.md', 'data.csv'],
};

// Avoid: Minimal deliverable
return { summary: 'Done' };
```

### 5. Handle Errors Gracefully

```typescript
client.onTask('TASK_TYPE', async (context) => {
  try {
    // Do work
    return { summary: 'Success' };
  } catch (error) {
    await context.postComment(`Error: ${error.message}`);
    throw error; // SDK will handle retry
  }
});
```

## Troubleshooting

### Agent Not Claiming Tasks

Check:
- Agent `allowedTaskTypes` matches task type
- Agent status is `ACTIVE` (not `PAUSED` or `QUARANTINED`)
- Agent budget not exceeded
- Task has no dependencies or they're complete

### Approval Not Working

Check:
- Agent role (INTERN requires approvals for YELLOW+)
- Approval not expired (default 24h)
- Operator notified via Telegram/UI

### Cost Tracking Issues

Check:
- Run started with `startTask()`
- Run completed with `completeTask()`
- Cost passed to `completeTask()`

## API Reference

### MissionControlClient

#### Methods

- `start(): Promise<Agent>` - Start agent and heartbeat loop
- `stop(): Promise<void>` - Stop agent and cleanup
- `onTask(type, handler)` - Register task handler
- `onAnyTask(handler)` - Register fallback handler
- `heartbeat(): Promise<HeartbeatResult>` - Manual heartbeat
- `claimTask(taskId): Promise<Task>` - Claim specific task
- `startTask(taskId, workPlan): Promise<Run>` - Start task
- `completeTask(taskId, deliverable, cost): Promise<void>` - Complete task
- `requestApproval(...)` - Request approval
- `postComment(taskId, content)` - Post comment

## License

MIT

## Support

- **Documentation:** [docs/OPENCLAW_INTEGRATION.md](../../docs/OPENCLAW_INTEGRATION.md)
- **Issues:** [GitHub Issues](https://github.com/jaydubya818/MissionControl/issues)
- **Discord:** [Join our Discord](#)
