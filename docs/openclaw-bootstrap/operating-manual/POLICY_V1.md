# POLICY_V1.md - Policy Pack

## Autonomy Levels

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Intern** | Read/comment/research only | GREEN tools only; YELLOW/RED require approval; cannot spawn |
| **Specialist** | Standard worker | GREEN always; YELLOW within allowlists + budgets; RED requires approval |
| **Lead** | Senior agent | GREEN always; YELLOW allowed; RED still requires approval (default) |

---

## Risk Levels

### 🟢 GREEN — Safe / Internal / Reversible
Always allowed for all roles.

**Examples:**
- Read files within workspace
- Post comments to threads
- Create internal documents
- Web search
- Generate drafts
- Read-only API calls

### 🟡 YELLOW — Potentially Harmful / Guardrails Apply
Allowed for Specialist/Lead within allowlists and budgets.
Requires approval for Intern.

**Examples:**
- Execute shell commands (within allowlist)
- Git commit/push (to approved repos/branches)
- Network calls (to allowlisted domains)
- File writes (to approved paths)
- Cron modifications
- Install dependencies

### 🔴 RED — External Impact / Secrets / Irreversible
Always requires approval, regardless of role.

**Examples:**
- Send emails
- Post to public social media
- Production deployments
- Config changes in production
- Access secrets
- Destructive shell operations
- Non-allowlisted network egress
- Wide file deletions
- Spending money / purchasing

---

## Approval Required If

- [ ] Action is RED risk
- [ ] Action is YELLOW risk AND agent is Intern
- [ ] Action exceeds per-run budget cap
- [ ] Action would exceed daily budget
- [ ] Action touches secrets
- [ ] Action affects production/external audiences
- [ ] Network egress is not allowlisted

---

## Tool Risk Map

| Tool | Risk | Notes |
|------|------|-------|
| `read` | GREEN | Within workspace |
| `write` | YELLOW/RED | YELLOW if in allowed paths, RED otherwise |
| `edit` | YELLOW/RED | Same as write |
| `exec` | YELLOW/RED | Depends on command (see shell rules) |
| `web_search` | GREEN | |
| `web_fetch` | GREEN/YELLOW | GREEN if allowlisted domain |
| `browser` | YELLOW | Automation risk |
| `message` | RED | External communication |
| `tts` | GREEN | |
| `cron` | YELLOW | Schedule modifications |
| `gateway` | YELLOW/RED | Config changes = RED |
| `sessions_spawn` | YELLOW | Within spawn limits |

---

## Shell Allowlist

### Allowed Commands (GREEN/YELLOW)
```
ls, pwd, cat, head, tail, grep, find (scoped to workspace)
git status, git diff, git log, git branch
git checkout -b, git add, git commit
npm run test, npm run lint, npm run build
node scripts/*, python scripts/*
echo, date, wc, sort, uniq, cut, tr
jq (read-only)
curl (allowlisted domains only)
```

### Blocked Commands (RED or DENY)
```
rm -rf, sudo, chmod 777, chown
dd, mkfs, fdisk
curl | bash, wget | sh
Any unbounded path traversal (../, /etc/, /var/, etc.)
kill, pkill, killall (except own processes)
Any command with shell expansion on user input
```

### Shell Evaluation Rules
1. Parse command for blocked patterns FIRST
2. If blocked → DENY (not even approval can override some)
3. If not blocked → check if allowlisted
4. If allowlisted → YELLOW (allowed for Specialist+)
5. If not allowlisted → RED (requires approval)

---

## Filesystem Allowlist

### Read Allowed
```
$WORKSPACE/**
$WORKSPACE/../shared/**
~/.openclaw/workspace/**
```

### Write Allowed (YELLOW)
```
$WORKSPACE/output/**
$WORKSPACE/docs/**
$WORKSPACE/memory/**
$WORKSPACE/artifacts/**
/tmp/mc-*/**
```

### Write Blocked (RED or DENY)
```
$WORKSPACE/config/**     (except approved workflows)
$WORKSPACE/.env*
~/.ssh/**
~/.aws/**
/etc/**
/var/**
Any path outside workspace without explicit approval
```

---

## Network Allowlist

### Allowed Domains (YELLOW)
```
github.com, api.github.com
*.githubusercontent.com
google.com, googleapis.com
api.anthropic.com
api.openai.com
*.slack.com (if Slack enabled)
api.telegram.org (if Telegram enabled)
localhost:*, 127.0.0.1:*
$CUSTOM_ALLOWLIST
```

### Blocked (RED)
All other domains require approval.

---

## Budget Defaults

### Per Role Daily Budget
| Role | Daily Budget |
|------|--------------|
| Intern | $2.00 |
| Specialist | $5.00 |
| Lead | $12.00 |

### Per Task Type Budget
| Task Type | Budget |
|-----------|--------|
| CONTENT | $6.00 |
| SOCIAL | $2.00 |
| EMAIL_MARKETING | $4.00 |
| CUSTOMER_RESEARCH | $5.00 |
| SEO_RESEARCH | $4.00 |
| ENGINEERING | $8.00 |
| DOCS | $3.00 |
| OPS | $3.00 |

### Per Run Cap
| Role | Per Run Cap |
|------|-------------|
| Intern | $0.25 |
| Specialist | $0.75 |
| Lead | $1.50 |

### On Budget Exceed
1. Do NOT proceed with action
2. Move task to NEEDS_APPROVAL
3. Create budget override approval request
4. Alert operator with:
   - Last 3 runs cost
   - Current task context
   - Recommended next step

---

## Spawn Limits

| Limit | Value |
|-------|-------|
| Max active agents | 30 |
| Max sub-agents per parent task | 3 |
| Max spawn depth | 2 |
| Sub-agent TTL | 6 hours |

### Spawn Rules
- Intern cannot spawn
- Specialist/Lead can spawn within quotas
- Must include `parentTaskId` and `purpose`
- Parent task inherits cost of sub-agents
- Cleanup sub-agents when parent task DONE/CANCELED

---

## Loop Detection Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Comments on task in 30 min | >20 | BLOCKED + Loop Summary |
| Review cycles | >3 | BLOCKED + Loop Summary |
| Same 2 agents back-and-forth in 10 min | >8 exchanges | BLOCKED + Loop Summary |
| Tool retries with same error | ≥3 | Quarantine agent + BLOCKED |

### On Loop Detection
1. STOP engaging in the loop
2. Post "Loop Summary" artifact:
   - Disagreement points
   - What was tried
   - Proposed resolution
   - Next best action
3. Move task to BLOCKED
4. Request human intervention

---

## Containment Responses

| Trigger | Response |
|---------|----------|
| Budget exceeded | Pause agent, task → NEEDS_APPROVAL |
| Loop detected | Block task, generate summary, alert operator |
| Tool failures ≥3 | Quarantine agent, task → BLOCKED |
| Error streak ≥5 | Quarantine agent, alert operator |
| RED action without approval | DENY action, log violation |

---

## Notification Policy

- @mentions delivered on heartbeat
- Queued on delivery failure
- Retries with exponential backoff (30s, 1m, 2m, 4m, 8m)
- Avoid duplicate notifications (idempotency)
- Expire notifications after 24 hours

---

## Audit & Redaction

### Never Log/Paste
- API keys, tokens, secrets
- Passwords
- Personal identifying information (unless task-relevant)
- Full file contents of sensitive files

### Always Redact
- Tool inputs/outputs in logs (show preview only)
- File paths outside workspace (show relative)
- Network responses (summarize, don't dump)

### Audit Trail
Every action creates a record:
- Who (agent/user ID)
- What (action type)
- When (timestamp)
- Where (task/thread context)
- Why (reason/justification)
- Result (success/failure)
