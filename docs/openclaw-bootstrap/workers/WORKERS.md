# 4. Worker/Daemon Behaviors

## Overview

Workers run as background processes, handling async operations that shouldn't block the API.

**Tech Stack:**
- Node.js + BullMQ for job queues
- Redis for queue storage
- Each worker can scale horizontally

---

## 1. Notification Delivery Worker

Handles delivery of notifications to agents/users via configured channels.

### Pseudocode

```typescript
// workers/notification-worker.ts

const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30000; // 30s, 1m, 2m, 4m, 8m

interface DeliveryResult {
  success: boolean;
  externalId?: string;
  error?: string;
  retryable?: boolean;
}

async function notificationWorkerLoop() {
  while (true) {
    try {
      // 1. Fetch pending notifications ready for delivery
      const notifications = await storage.getPendingNotifications(BATCH_SIZE);
      
      if (notifications.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 2. Process each notification
      for (const notif of notifications) {
        // Skip if not yet due
        if (notif.nextAttemptAt && notif.nextAttemptAt > Date.now()) {
          continue;
        }

        // Skip if expired
        if (notif.expiresAt && notif.expiresAt < Date.now()) {
          await storage.updateNotificationStatus(notif.id, 'EXPIRED');
          continue;
        }

        // 3. Attempt delivery
        const result = await deliverNotification(notif);

        if (result.success) {
          await storage.updateNotificationStatus(
            notif.id, 
            'DELIVERED', 
            result.externalId
          );
          
          log.info('Notification delivered', { 
            id: notif.id, 
            channel: notif.channel,
            externalId: result.externalId 
          });
        } else {
          // 4. Handle failure
          const newAttempts = notif.attempts + 1;
          
          if (newAttempts >= MAX_ATTEMPTS || !result.retryable) {
            await storage.updateNotificationStatus(notif.id, 'FAILED');
            
            log.error('Notification permanently failed', {
              id: notif.id,
              error: result.error,
              attempts: newAttempts
            });
            
            // Create alert for critical notifications
            if (notif.type === 'APPROVAL_REQUEST' || notif.type === 'ALERT') {
              await createAlert({
                severity: 'WARNING',
                type: 'NOTIFICATION_FAILED',
                title: `Failed to deliver ${notif.type} notification`,
                description: result.error || 'Unknown error',
                agentId: notif.targetAgentId,
                metadata: { notificationId: notif.id }
              });
            }
          } else {
            // Schedule retry with exponential backoff
            const backoffMs = BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1);
            const nextAttempt = new Date(Date.now() + backoffMs);
            
            await storage.updateNotification(notif.id, {
              attempts: newAttempts,
              nextAttemptAt: nextAttempt,
              lastError: result.error
            });
            
            log.warn('Notification delivery failed, will retry', {
              id: notif.id,
              attempt: newAttempts,
              nextAttempt
            });
          }
        }
      }
    } catch (error) {
      log.error('Notification worker error', { error });
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function deliverNotification(notif: Notification): Promise<DeliveryResult> {
  switch (notif.channel) {
    case 'TELEGRAM':
      return deliverViaTelegram(notif);
    case 'SLACK':
      return deliverViaSlack(notif);
    case 'EMAIL':
      return deliverViaEmail(notif);
    case 'WEBHOOK':
      return deliverViaWebhook(notif);
    default:
      return { success: false, error: `Unknown channel: ${notif.channel}`, retryable: false };
  }
}

async function deliverViaTelegram(notif: Notification): Promise<DeliveryResult> {
  try {
    // Get Telegram chat ID for target agent/user
    const chatId = await getChatIdForTarget(notif.targetAgentId || notif.targetUserId);
    if (!chatId) {
      return { success: false, error: 'No Telegram chat ID configured', retryable: false };
    }

    // Format message
    const text = formatTelegramMessage(notif);
    
    // Send via Telegram API
    const response = await telegramApi.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_notification: notif.type === 'DIGEST' // Silent for digests
    });

    return { 
      success: true, 
      externalId: String(response.message_id) 
    };
  } catch (error) {
    const isRetryable = error.response?.status >= 500 || error.code === 'ETIMEDOUT';
    return { 
      success: false, 
      error: error.message, 
      retryable: isRetryable 
    };
  }
}

function formatTelegramMessage(notif: Notification): string {
  const emoji = {
    MENTION: '💬',
    ASSIGNMENT: '📋',
    APPROVAL_REQUEST: '🔐',
    ALERT: '🚨',
    DIGEST: '📊'
  }[notif.type] || '📢';

  return `${emoji} <b>${notif.title}</b>\n\n${notif.body}`;
}
```

---

## 2. Budget Monitor Worker

Monitors agent spending, enforces limits, triggers containment.

### Pseudocode

```typescript
// workers/budget-monitor.ts

const CHECK_INTERVAL_MS = 60000; // 1 minute
const WARNING_THRESHOLD = 0.8;   // 80% of budget
const CRITICAL_THRESHOLD = 0.95; // 95% of budget

async function budgetMonitorLoop() {
  while (true) {
    try {
      // 1. Get all active agents
      const agents = await storage.listAgents({ status: 'ACTIVE' });

      for (const agent of agents) {
        // 2. Calculate current spend
        const spendToday = await storage.getAgentSpendToday(agent.id);
        const budgetRemaining = agent.budgetDaily - spendToday;
        const usageRatio = spendToday / agent.budgetDaily;

        // 3. Check thresholds
        if (usageRatio >= 1.0) {
          // EXCEEDED - Block agent
          await handleBudgetExceeded(agent, spendToday);
        } else if (usageRatio >= CRITICAL_THRESHOLD) {
          // CRITICAL - Warn + prepare for block
          await handleBudgetCritical(agent, spendToday, budgetRemaining);
        } else if (usageRatio >= WARNING_THRESHOLD) {
          // WARNING - Notify
          await handleBudgetWarning(agent, spendToday, budgetRemaining);
        }

        // 4. Check per-task budgets
        if (agent.currentTaskId) {
          await checkTaskBudget(agent, agent.currentTaskId);
        }

        // 5. Reset daily spend at midnight
        if (shouldResetDailySpend(agent.spendResetAt)) {
          await storage.updateAgent(agent.id, {
            spendToday: 0,
            spendResetAt: getNextMidnight()
          });
          log.info('Reset daily spend', { agentId: agent.id });
        }
      }

      await sleep(CHECK_INTERVAL_MS);
    } catch (error) {
      log.error('Budget monitor error', { error });
      await sleep(CHECK_INTERVAL_MS);
    }
  }
}

async function handleBudgetExceeded(agent: Agent, spend: number) {
  log.warn('Agent budget exceeded', { agentId: agent.id, spend, budget: agent.budgetDaily });

  // 1. Move current task to NEEDS_APPROVAL
  if (agent.currentTaskId) {
    const task = await storage.getTask(agent.currentTaskId);
    if (task && !['NEEDS_APPROVAL', 'BLOCKED', 'DONE', 'CANCELED'].includes(task.status)) {
      await storage.createTransition({
        taskId: task.id,
        fromStatus: task.status,
        toStatus: 'NEEDS_APPROVAL',
        actorAgentId: 'SYSTEM',
        reason: `Agent ${agent.id} exceeded daily budget ($${spend.toFixed(2)} / $${agent.budgetDaily})`
      });
      
      await storage.updateTask(task.id, { status: 'NEEDS_APPROVAL' });
    }
  }

  // 2. Pause the agent
  await storage.updateAgentStatus(agent.id, 'PAUSED', 'Budget exceeded');

  // 3. Create alert
  await storage.createAlert({
    severity: 'ERROR',
    type: 'BUDGET_EXCEEDED',
    title: `Agent ${agent.name} exceeded daily budget`,
    description: `Spent $${spend.toFixed(2)} of $${agent.budgetDaily} budget. Agent paused until budget reset or manual override.`,
    agentId: agent.id,
    metadata: { spend, budget: agent.budgetDaily }
  });

  // 4. Create approval request for override
  await storage.createApproval({
    requestorAgentId: agent.id,
    actionType: 'BUDGET_OVERRIDE',
    actionSummary: `Override daily budget for agent ${agent.name}`,
    riskLevel: 'YELLOW',
    estimatedCost: agent.budgetDaily * 0.5, // Request 50% more
    justification: `Agent ${agent.name} exceeded $${agent.budgetDaily} daily budget. Requesting override to continue work.`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
  });

  // 5. Notify
  await queueNotification({
    targetAgentId: null, // Notify operator
    targetUserId: 'operator',
    channel: 'TELEGRAM',
    type: 'ALERT',
    title: `🚨 Budget Exceeded: ${agent.name}`,
    body: `Agent paused. Spent $${spend.toFixed(2)}/$${agent.budgetDaily}. Approve override or wait for reset.`,
    agentId: agent.id
  });
}

async function handleBudgetCritical(agent: Agent, spend: number, remaining: number) {
  // Only alert once per day
  const alertKey = `budget_critical_${agent.id}_${new Date().toISOString().slice(0,10)}`;
  if (await hasAlertedToday(alertKey)) return;

  await storage.createAlert({
    severity: 'WARNING',
    type: 'BUDGET_CRITICAL',
    title: `Agent ${agent.name} approaching budget limit`,
    description: `Spent $${spend.toFixed(2)} of $${agent.budgetDaily} (${(spend/agent.budgetDaily*100).toFixed(0)}%). Only $${remaining.toFixed(2)} remaining.`,
    agentId: agent.id
  });

  await markAlerted(alertKey);
}

async function handleBudgetWarning(agent: Agent, spend: number, remaining: number) {
  // Only warn once per day
  const warnKey = `budget_warn_${agent.id}_${new Date().toISOString().slice(0,10)}`;
  if (await hasAlertedToday(warnKey)) return;

  log.info('Agent approaching budget limit', { 
    agentId: agent.id, 
    spend, 
    remaining,
    percentage: (spend/agent.budgetDaily*100).toFixed(0)
  });

  await markAlerted(warnKey);
}

async function checkTaskBudget(agent: Agent, taskId: string) {
  const task = await storage.getTask(taskId);
  if (!task || !task.estimatedCost) return;

  const taskCost = await storage.getTaskCost(taskId);
  
  if (taskCost > task.estimatedCost) {
    log.warn('Task exceeded estimated cost', { 
      taskId, 
      actual: taskCost, 
      estimated: task.estimatedCost 
    });

    // Create a note but don't block - task budgets are advisory
    await storage.createMessage({
      taskId,
      authorAgentId: 'SYSTEM',
      type: 'COMMENT',
      content: `⚠️ Task cost ($${taskCost.toFixed(2)}) has exceeded estimate ($${task.estimatedCost.toFixed(2)}).`
    });
  }
}
```

---

## 3. Loop Detector Worker

Detects runaway loops and generates "Loop Summary" artifacts.

### Pseudocode

```typescript
// workers/loop-detector.ts

const CHECK_INTERVAL_MS = 30000; // 30 seconds

interface LoopThresholds {
  comments30Min: number;       // Max comments on a task in 30 min
  reviewCycles: number;        // Max review cycles
  agentPingPong: number;       // Max back-and-forth between two agents
  toolRetries: number;         // Max tool retries with same error
}

const DEFAULT_THRESHOLDS: LoopThresholds = {
  comments30Min: 20,
  reviewCycles: 3,
  agentPingPong: 8,
  toolRetries: 3
};

async function loopDetectorLoop() {
  while (true) {
    try {
      // 1. Check for comment floods
      await detectCommentFlood();

      // 2. Check for review cycles
      await detectReviewCycles();

      // 3. Check for agent ping-pong
      await detectAgentPingPong();

      // 4. Check for tool retry loops
      await detectToolRetryLoops();

      await sleep(CHECK_INTERVAL_MS);
    } catch (error) {
      log.error('Loop detector error', { error });
      await sleep(CHECK_INTERVAL_MS);
    }
  }
}

async function detectCommentFlood() {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  // Query for tasks with high comment volume
  const hotTasks = await storage.query(`
    SELECT task_id, COUNT(*) as count
    FROM messages
    WHERE created_at > $1
    GROUP BY task_id
    HAVING COUNT(*) > $2
  `, [thirtyMinAgo, DEFAULT_THRESHOLDS.comments30Min]);

  for (const { task_id, count } of hotTasks) {
    // Check if already handled
    if (await isLoopHandled(task_id, 'COMMENT_FLOOD')) continue;

    await handleLoopDetected(task_id, 'COMMENT_FLOOD', {
      messageCount: count,
      window: '30 minutes',
      threshold: DEFAULT_THRESHOLDS.comments30Min
    });
  }
}

async function detectReviewCycles() {
  // Find tasks with excessive review cycles
  const tasks = await storage.listTasks({ 
    status: ['IN_PROGRESS', 'REVIEW'],
    reviewCyclesGte: DEFAULT_THRESHOLDS.reviewCycles
  });

  for (const task of tasks) {
    if (await isLoopHandled(task.id, 'REVIEW_CYCLES')) continue;

    await handleLoopDetected(task.id, 'REVIEW_CYCLES', {
      cycles: task.reviewCycles,
      threshold: DEFAULT_THRESHOLDS.reviewCycles
    });
  }
}

async function detectAgentPingPong() {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Find tasks with rapid back-and-forth between two agents
  const pingPongTasks = await storage.query(`
    WITH agent_pairs AS (
      SELECT 
        task_id,
        author_agent_id,
        LAG(author_agent_id) OVER (PARTITION BY task_id ORDER BY created_at) as prev_agent
      FROM messages
      WHERE created_at > $1
    ),
    alternations AS (
      SELECT 
        task_id,
        author_agent_id,
        prev_agent,
        COUNT(*) as switches
      FROM agent_pairs
      WHERE author_agent_id != prev_agent
        AND prev_agent IS NOT NULL
      GROUP BY task_id, author_agent_id, prev_agent
    )
    SELECT task_id, author_agent_id, prev_agent, switches
    FROM alternations
    WHERE switches > $2
  `, [tenMinAgo, DEFAULT_THRESHOLDS.agentPingPong / 2]);

  for (const row of pingPongTasks) {
    if (await isLoopHandled(row.task_id, 'AGENT_PING_PONG')) continue;

    await handleLoopDetected(row.task_id, 'AGENT_PING_PONG', {
      agent1: row.author_agent_id,
      agent2: row.prev_agent,
      exchanges: row.switches * 2,
      window: '10 minutes'
    });
  }
}

async function detectToolRetryLoops() {
  // Find runs with repeated tool failures
  const failingRuns = await storage.query(`
    SELECT 
      run_id,
      agent_id,
      task_id,
      tool_name,
      error,
      COUNT(*) as failure_count
    FROM tool_calls
    WHERE status = 'FAILED'
      AND created_at > NOW() - INTERVAL '10 minutes'
    GROUP BY run_id, agent_id, task_id, tool_name, error
    HAVING COUNT(*) >= $1
  `, [DEFAULT_THRESHOLDS.toolRetries]);

  for (const row of failingRuns) {
    // Quarantine the agent
    await storage.updateAgentStatus(row.agent_id, 'QUARANTINED', 
      `Tool retry loop detected: ${row.tool_name} failed ${row.failure_count} times`
    );

    await handleLoopDetected(row.task_id, 'TOOL_RETRY_LOOP', {
      agentId: row.agent_id,
      tool: row.tool_name,
      error: row.error,
      failures: row.failure_count
    });
  }
}

async function handleLoopDetected(
  taskId: string, 
  loopType: string, 
  details: Record<string, any>
) {
  log.warn('Loop detected', { taskId, loopType, details });

  // 1. Mark loop as handled
  await markLoopHandled(taskId, loopType);

  // 2. Generate Loop Summary artifact
  const summary = await generateLoopSummary(taskId, loopType, details);

  // 3. Post summary as message
  await storage.createMessage({
    taskId,
    authorAgentId: 'SYSTEM',
    type: 'ARTIFACT',
    content: summary,
    artifacts: [{
      name: `loop-summary-${loopType.toLowerCase()}.md`,
      type: 'REPORT',
      content: summary
    }]
  });

  // 4. Transition task to BLOCKED
  const task = await storage.getTask(taskId);
  if (task && !['BLOCKED', 'DONE', 'CANCELED'].includes(task.status)) {
    await storage.createTransition({
      taskId,
      fromStatus: task.status,
      toStatus: 'BLOCKED',
      actorAgentId: 'SYSTEM',
      reason: `Loop detected: ${loopType}`
    });
    
    await storage.updateTask(taskId, { status: 'BLOCKED' });
  }

  // 5. Create alert
  await storage.createAlert({
    severity: 'WARNING',
    type: 'LOOP_DETECTED',
    title: `Loop detected on task: ${task?.title || taskId}`,
    description: summary.slice(0, 500),
    taskId,
    metadata: { loopType, details }
  });

  // 6. Notify operator
  await queueNotification({
    targetUserId: 'operator',
    channel: 'TELEGRAM',
    type: 'ALERT',
    title: `🔄 Loop Detected: ${loopType}`,
    body: `Task "${task?.title}" blocked due to ${loopType}. Review Loop Summary and unblock manually.`,
    taskId
  });
}

async function generateLoopSummary(
  taskId: string, 
  loopType: string, 
  details: Record<string, any>
): Promise<string> {
  const task = await storage.getTask(taskId);
  const recentMessages = await storage.getTaskMessages(taskId, { limit: 20 });
  const transitions = await storage.getTaskTransitions(taskId);

  let summary = `# Loop Summary: ${loopType}\n\n`;
  summary += `**Task:** ${task?.title}\n`;
  summary += `**Detected:** ${new Date().toISOString()}\n\n`;

  summary += `## Loop Details\n`;
  for (const [key, value] of Object.entries(details)) {
    summary += `- **${key}:** ${JSON.stringify(value)}\n`;
  }
  summary += '\n';

  summary += `## Disagreement Points\n`;
  // Analyze recent messages for contradictions
  const agentPositions = analyzeAgentPositions(recentMessages);
  for (const [agent, positions] of Object.entries(agentPositions)) {
    summary += `### ${agent}\n`;
    positions.forEach(p => summary += `- ${p}\n`);
  }
  summary += '\n';

  summary += `## Recent State Transitions\n`;
  transitions.slice(-5).forEach(t => {
    summary += `- ${t.fromStatus} → ${t.toStatus} (${t.reason || 'no reason'})\n`;
  });
  summary += '\n';

  summary += `## Proposed Resolution\n`;
  summary += getResolutionSuggestion(loopType, details);
  summary += '\n';

  summary += `## Recommended Next Action\n`;
  summary += `1. Review the disagreement points above\n`;
  summary += `2. Determine if task scope needs clarification\n`;
  summary += `3. Consider reassigning to a Lead agent for arbitration\n`;
  summary += `4. Unblock task when resolution path is clear\n`;

  return summary;
}

function getResolutionSuggestion(loopType: string, details: any): string {
  switch (loopType) {
    case 'COMMENT_FLOOD':
      return 'Too much discussion without progress. Consider splitting task or escalating to human.';
    case 'REVIEW_CYCLES':
      return 'Multiple review rejections suggest unclear requirements. Clarify acceptance criteria.';
    case 'AGENT_PING_PONG':
      return `Agents ${details.agent1} and ${details.agent2} are in disagreement. Escalate to Lead or human arbitrator.`;
    case 'TOOL_RETRY_LOOP':
      return `Tool ${details.tool} is consistently failing. Check tool configuration or external service status.`;
    default:
      return 'Review task definition and agent assignments.';
  }
}
```

---

## 4. Daily Standup Generator

Generates daily standup reports for the team.

### Pseudocode

```typescript
// workers/standup-generator.ts

const STANDUP_HOUR = 9; // 9 AM local time
const STANDUP_TIMEZONE = 'America/Los_Angeles';

async function standupGeneratorLoop() {
  while (true) {
    try {
      // Check if it's standup time
      const now = new Date();
      const localHour = getHourInTimezone(now, STANDUP_TIMEZONE);
      
      if (localHour === STANDUP_HOUR && !await hasGeneratedTodayStandup()) {
        await generateDailyStandup();
        await markStandupGenerated();
      }

      // Check every 10 minutes
      await sleep(10 * 60 * 1000);
    } catch (error) {
      log.error('Standup generator error', { error });
      await sleep(60 * 1000);
    }
  }
}

async function generateDailyStandup() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date();

  // Gather data
  const agents = await storage.listAgents({ status: ['ACTIVE', 'PAUSED'] });
  const completedTasks = await storage.listTasks({ 
    status: 'DONE',
    completedAfter: yesterday
  });
  const inProgressTasks = await storage.listTasks({ status: 'IN_PROGRESS' });
  const blockedTasks = await storage.listTasks({ status: 'BLOCKED' });
  const pendingApprovals = await storage.getPendingApprovals();
  const openAlerts = await storage.getOpenAlerts();
  const costYesterday = await storage.getTotalCost(yesterday, today);

  // Generate report
  let report = `# Daily Standup - ${today.toISOString().slice(0,10)}\n\n`;

  // Summary stats
  report += `## Summary\n`;
  report += `- ✅ **Completed:** ${completedTasks.length} tasks\n`;
  report += `- 🔄 **In Progress:** ${inProgressTasks.length} tasks\n`;
  report += `- 🚫 **Blocked:** ${blockedTasks.length} tasks\n`;
  report += `- 🔐 **Pending Approvals:** ${pendingApprovals.length}\n`;
  report += `- 🚨 **Open Alerts:** ${openAlerts.length}\n`;
  report += `- 💰 **Cost (24h):** $${costYesterday.toFixed(2)}\n\n`;

  // Per-agent summary
  report += `## Agent Status\n`;
  for (const agent of agents) {
    const agentCompleted = completedTasks.filter(t => t.assigneeIds?.includes(agent.id));
    const agentInProgress = inProgressTasks.filter(t => t.assigneeIds?.includes(agent.id));
    const agentSpend = await storage.getAgentSpendYesterday(agent.id);
    
    report += `### ${agent.emoji || '🤖'} ${agent.name}\n`;
    report += `- Status: ${agent.status}\n`;
    report += `- Completed: ${agentCompleted.length}\n`;
    report += `- Working on: ${agentInProgress.length}\n`;
    report += `- Spend: $${agentSpend.toFixed(2)}\n\n`;
  }

  // Completed tasks
  if (completedTasks.length > 0) {
    report += `## Completed Tasks\n`;
    for (const task of completedTasks.slice(0, 10)) {
      report += `- [${task.type}] ${task.title}\n`;
    }
    if (completedTasks.length > 10) {
      report += `- ... and ${completedTasks.length - 10} more\n`;
    }
    report += '\n';
  }

  // Blockers
  if (blockedTasks.length > 0 || pendingApprovals.length > 0 || openAlerts.length > 0) {
    report += `## ⚠️ Needs Attention\n`;
    
    if (blockedTasks.length > 0) {
      report += `### Blocked Tasks\n`;
      for (const task of blockedTasks) {
        report += `- ${task.title} (${task.assigneeIds?.join(', ') || 'unassigned'})\n`;
      }
    }
    
    if (pendingApprovals.length > 0) {
      report += `### Pending Approvals\n`;
      for (const approval of pendingApprovals) {
        report += `- ${approval.actionSummary} (${approval.riskLevel})\n`;
      }
    }

    if (openAlerts.length > 0) {
      report += `### Open Alerts\n`;
      for (const alert of openAlerts.slice(0, 5)) {
        report += `- [${alert.severity}] ${alert.title}\n`;
      }
    }
    report += '\n';
  }

  // Save as document
  await storage.createDocument({
    name: `standup-${today.toISOString().slice(0,10)}.md`,
    type: 'REPORT',
    content: report
  });

  // Notify
  await queueNotification({
    targetUserId: 'operator',
    channel: 'TELEGRAM',
    type: 'DIGEST',
    title: `📊 Daily Standup - ${today.toISOString().slice(0,10)}`,
    body: `✅ ${completedTasks.length} completed | 🔄 ${inProgressTasks.length} in progress | 🚫 ${blockedTasks.length} blocked | 💰 $${costYesterday.toFixed(2)}`,
  });

  log.info('Daily standup generated', { 
    completed: completedTasks.length,
    inProgress: inProgressTasks.length,
    blocked: blockedTasks.length
  });
}
```

---

## 5. Approval Expirer Worker

Expires stale approval requests.

### Pseudocode

```typescript
// workers/approval-expirer.ts

const CHECK_INTERVAL_MS = 60000; // 1 minute

async function approvalExpirerLoop() {
  while (true) {
    try {
      const now = new Date();
      
      // Find expired pending approvals
      const expiredApprovals = await storage.query(`
        SELECT * FROM approvals
        WHERE status = 'PENDING'
          AND expires_at < $1
      `, [now]);

      for (const approval of expiredApprovals) {
        // 1. Update approval status
        await storage.updateApprovalStatus(approval.id, 'EXPIRED', 'SYSTEM', 'Auto-expired');

        // 2. If task was in NEEDS_APPROVAL, move to BLOCKED
        if (approval.task_id) {
          const task = await storage.getTask(approval.task_id);
          if (task?.status === 'NEEDS_APPROVAL') {
            await storage.createTransition({
              taskId: task.id,
              fromStatus: 'NEEDS_APPROVAL',
              toStatus: 'BLOCKED',
              actorAgentId: 'SYSTEM',
              reason: 'Approval request expired without decision'
            });
            
            await storage.updateTask(task.id, { status: 'BLOCKED' });
          }
        }

        // 3. Log activity
        await storage.logActivity({
          actorType: 'SYSTEM',
          action: 'APPROVAL_EXPIRED',
          description: `Approval request expired: ${approval.action_summary}`,
          targetType: 'APPROVAL',
          targetId: approval.id,
          taskId: approval.task_id
        });

        log.info('Approval expired', { approvalId: approval.id });
      }

      await sleep(CHECK_INTERVAL_MS);
    } catch (error) {
      log.error('Approval expirer error', { error });
      await sleep(CHECK_INTERVAL_MS);
    }
  }
}
```

---

## Worker Deployment

### Docker Compose Configuration

```yaml
# docker-compose.workers.yml
version: '3.8'

services:
  notification-worker:
    build:
      context: .
      dockerfile: Dockerfile.workers
    command: node dist/notification-worker.js
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    restart: unless-stopped
    deploy:
      replicas: 2

  budget-monitor:
    build:
      context: .
      dockerfile: Dockerfile.workers
    command: node dist/budget-monitor.js
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    restart: unless-stopped

  loop-detector:
    build:
      context: .
      dockerfile: Dockerfile.workers
    command: node dist/loop-detector.js
    environment:
      - DATABASE_URL=${DATABASE_URL}
    restart: unless-stopped

  standup-generator:
    build:
      context: .
      dockerfile: Dockerfile.workers
    command: node dist/standup-generator.js
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - STANDUP_TIMEZONE=America/Los_Angeles
    restart: unless-stopped

  approval-expirer:
    build:
      context: .
      dockerfile: Dockerfile.workers
    command: node dist/approval-expirer.js
    environment:
      - DATABASE_URL=${DATABASE_URL}
    restart: unless-stopped
```
