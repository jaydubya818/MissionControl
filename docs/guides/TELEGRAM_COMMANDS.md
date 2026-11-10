# Telegram Commands Reference

**Version:** 1.0  
**Last Updated:** 2026-02-01

---

## Overview

The Mission Control Telegram bot serves as the **command bus** for operators and the **notification channel** for agents. All commands are project-scoped after you select a project with `/switch`.

---

## Setup

1. **Create Bot:**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow prompts
   - Save your bot token

2. **Configure Environment:**
   ```bash
   # Add to .env
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id_or_group_id
   ```

3. **Start Bot:**
   ```bash
   cd packages/telegram-bot
   pnpm install
   pnpm dev
   ```

---

## Commands

### 📁 Project Management

#### `/projects`
List all available projects with task and agent counts.

**Example:**
```
/projects
```

**Response:**
```
📁 Projects:

✓ = Currently active project

✓ OpenClaw (openclaw)
  └ 15 tasks, 8 agents active

  SiteGPT (sitegpt)
  └ 23 tasks, 5 agents active

Use /switch <slug> to change project
```

#### `/switch <slug>`
Switch your active project context. All subsequent commands will use this project.

**Example:**
```
/switch openclaw
```

**Response:**
```
✅ Switched to project: OpenClaw
```

---

### 📋 Task Management

#### `/inbox`
Show all tasks in INBOX status for the current project.

**Example:**
```
/inbox
```

**Response:**
```
📥 Inbox (3 tasks):

🔴 #a1b2 Research competitor pricing
  └ CUSTOMER_RESEARCH · $2.00

🔵 #c3d4 Write blog post
  └ CONTENT · $5.00

🟠 #e5f6 Update API docs
  └ DOCS
```

#### `/status`
Show current project status with task counts, agent counts, and pending approvals.

**Example:**
```
/status
```

**Response:**
```
📊 Status: OpenClaw

👥 Agents:
  └ 8 active, 0 paused (11 total)

📋 Tasks:
  └ 3 inbox
  └ 2 assigned
  └ 5 in progress
  └ 2 review
  └ 1 needs approval
  └ 0 blocked
  └ 12 done

✅ Approvals:
  └ 1 pending
```

---

### ✅ Approvals

#### `/my_approvals`
Show all pending approval requests for the current project.

**Example:**
```
/my_approvals
```

**Response:**
```
⏳ Pending Approvals (2):

🔴 #abc123 Deploy to production
  └ Requested by: Cipher
  └ Risk: RED
  └ Cost: $0.50
  └ /approve abc123 or /deny abc123 <reason>

🟡 #def456 Send email campaign
  └ Requested by: Hermes
  └ Risk: YELLOW
  └ /approve def456 or /deny def456 <reason>
```

#### `/approve <id>`
Approve a pending approval request.

**Example:**
```
/approve abc123
```

**Response:**
```
✅ Approved: Deploy to production
```

#### `/deny <id> <reason>`
Deny a pending approval request with a reason.

**Example:**
```
/deny abc123 Not ready for production yet
```

**Response:**
```
🚫 Denied: Deploy to production
Reason: Not ready for production yet
```

---

### 👥 Squad Management

#### `/pause_squad`
Pause all ACTIVE agents in the current project. They will stop processing tasks until resumed.

**Example:**
```
/pause_squad
```

**Response:**
```
⏸️ Paused 8 agent(s)
```

**Use Cases:**
- Emergency stop
- Maintenance window
- Budget containment
- Incident response

#### `/resume_squad`
Resume all PAUSED agents in the current project.

**Example:**
```
/resume_squad
```

**Response:**
```
▶️ Resumed 8 agent(s)
```

#### `/quarantine <agent-name>`
Quarantine a specific agent. Quarantined agents cannot process tasks and require manual intervention to resume.

**Example:**
```
/quarantine Scout
```

**Response:**
```
🚨 Quarantined agent: Scout
```

**Use Cases:**
- Agent misbehaving (error streak)
- Policy violations
- Security incidents
- Manual intervention needed

---

### 💰 Cost Tracking

#### `/burnrate`
Show current burn rate for the project (today's spend by agent).

**Example:**
```
/burnrate
```

**Response:**
```
💰 Burn Rate: OpenClaw

Today: $12.50

By Agent:
  └ Sofie: $3.20 / $25.00
  └ Nova: $2.80 / $12.00
  └ Cipher: $2.50 / $5.00
  └ Pixel: $2.00 / $5.00
  └ Scout: $1.50 / $2.00
  └ Scribe: $0.50 / $2.00
```

---

## Notifications

The bot automatically sends notifications for key events:

### ⏳ Approval Required
Sent when an agent requests approval for a RED or YELLOW action.

**Example:**
```
⏳ Approval Required

Deploy to production environment
Requested by: Cipher
Risk: RED
ID: abc123

/approve abc123 or /deny abc123 <reason>
```

### 💰 Budget Exceeded
Sent when an agent exceeds their daily budget.

**Example:**
```
💰 Budget Exceeded

Agent: Scout
Spend: $2.50 / $2.00
Task: Research competitor pricing

Agent has been paused. Use /resume_squad to resume.
```

### 🔄 Loop Detected
Sent when a task enters a loop (comment storm, review ping-pong, repeated failures).

**Example:**
```
🔄 Loop Detected

Task: Update API documentation
Type: Comment storm
Count: 25 (threshold: 20)

Task has been blocked. Review and unblock manually.
```

### 📊 Daily CEO Brief
Sent every day at 09:00 UTC with a summary of all projects.

**Example:**
```
📊 Daily CEO Brief — Monday, February 1

OpenClaw
✅ Completed: 5
🔄 In Progress: 8
🚫 Blocked: 2
👀 Review: 3
⏳ Needs Approval: 1
📋 Approvals Pending: 2
💰 Burn Rate: $12.50

🎯 Top 3 Next Actions:
1. 🔴 Review social media campaign (REVIEW)
2. 🟠 Approve payment integration (NEEDS_APPROVAL)
3. 🔵 Unblock API documentation (BLOCKED)

---

SiteGPT
✅ Completed: 12
🔄 In Progress: 15
...
```

---

## Thread-per-Task (Future)

When implemented, each task will have its own Telegram thread:

- Task creation → Create Telegram thread
- Store `threadRef` (chat:message_id) on task
- Agent messages → Post to task thread
- Human replies in thread → Post to Mission Control

---

## Architecture

### Command Flow

```
User → Telegram → Bot → Convex Mutation/Query → Response → Telegram
```

### Notification Flow

```
Convex Mutation → Store Notification → Bot Polls → Format → Send to Telegram
```

### User State

User's active project is stored in-memory (for MVP) or in a `userSessions` table:

```typescript
userSessions: {
  telegramUserId: number;
  activeProjectId: Id<"projects">;
  lastCommandAt: number;
}
```

---

## Security

- **Bot Token:** Keep secret, never commit to git
- **Chat ID:** Only authorized chat/group can receive notifications
- **User Auth:** Commands should verify user is authorized (future)
- **Rate Limiting:** Implement rate limiting for commands (future)

---

## Troubleshooting

### Bot Not Responding

1. Check bot is running: `pnpm dev` in `packages/telegram-bot`
2. Verify `TELEGRAM_BOT_TOKEN` is set
3. Check logs for errors
4. Test with `/start` command

### Commands Not Working

1. Ensure project is selected: `/switch <slug>`
2. Check Convex URL is correct
3. Verify Convex is running: `pnpm dev` in root
4. Check bot logs for errors

### Notifications Not Sending

1. Verify `TELEGRAM_CHAT_ID` is set
2. Check bot has permission to send to chat/group
3. Review notification logs in Convex activities

---

## Related Documentation

- [RUNBOOK.md](../runbook/RUNBOOK.md) - Operational procedures
- [MULTI_PROJECT_MODEL.md](../architecture/MULTI_PROJECT_MODEL.md) - Multi-project architecture
- [packages/telegram-bot/README.md](../packages/telegram-bot/README.md) - Bot setup

---

**Questions?** Check the logs or create an issue.
