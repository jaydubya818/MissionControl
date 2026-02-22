#!/usr/bin/env bash
#
# mc-seed-missioncontrolhq-features.sh — Add Mission Control HQ-inspired features
# Creates tasks for agent squad management, coordination, integrations, dashboard
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

# Generate unique run ID
TIMESTAMP=$(date +%s)
SHORTID=$(openssl rand -hex 3 2>/dev/null || echo "$(date +%N | cut -c1-6)")
RUN_ID="MC_HQ_FEATURES_${TIMESTAMP}_${SHORTID}"

echo "🚀 Mission Control HQ Features Seeder"
echo "======================================"
echo "Run ID: $RUN_ID"
echo "Started: $(date -Iseconds)"
echo ""

# Source env if exists
if [[ -f "$MC_DIR/.env.local" ]]; then
    set -a
    source "$MC_DIR/.env.local" 2>/dev/null || true
    set +a
fi

# Check Convex URL
if [[ -z "${CONVEX_URL:-}" || "$CONVEX_URL" == *"your-deployment"* ]]; then
    echo "❌ CONVEX_URL not configured"
    echo "Run: npx convex dev"
    exit 1
fi

echo "📡 Convex URL: ${CONVEX_URL:0:40}..."
echo ""

# Project ID for Mission Control project
PROJECT_ID="ks7998y3ve5g4hqh7g1pd5d78h80c07z"

# Function to create a task
create_task() {
    local title="$1"
    local description="$2"
    local acceptance="$3"
    local complexity="$4"
    local tags="$5"
    
    npx convex run api.tasks.create "{
        \"projectId\": \"$PROJECT_ID\",
        \"title\": \"$title\",
        \"description\": \"$description\",
        \"type\": \"ENGINEERING\",
        \"priority\": 2,
        \"metadata\": {
            \"e2eRunId\": \"$RUN_ID\",
            \"backlogItem\": true,
            \"acceptanceCriteria\": \"$acceptance\",
            \"complexity\": \"$complexity\",
            \"tags\": $tags,
            \"source\": \"missioncontrolhq-analysis\"
        },
        \"source\": \"AGENT\",
        \"createdBy\": \"AGENT\"
    }" 2>/dev/null | jq -r '._id'
}

echo "🌱 Seeding Mission Control HQ feature tasks..."
echo ""

# Array to store created task IDs
declare -a TASK_IDS=()

# ============================================
# F) Agent Squad Management
# ============================================

echo "👥 Creating Agent Squad Management tasks..."

TASK_IDS+=($(create_task \
    "F1: Agent Personality Profiles" \
    "Enable custom agent personalities and skills via YAML configuration. Each agent should have configurable traits, expertise areas, and communication style. Reference: missioncontrolhq.ai agent customization." \
    "Agents have editable personality YAML; traits affect output tone; expertise areas filter task assignments; UI shows personality badges" \
    "M" \
    '["features", "agent-management", "ux"]'))

TASK_IDS+=($(create_task \
    "F2: Domain-Specific Agent Skills" \
    "Define skill trees for agents (coding, research, writing, analysis). Skills determine which tasks agents can claim and how they approach work." \
    "Skill system exists; agents have skill ratings; tasks require specific skills; matching algorithm assigns tasks" \
    "M" \
    '["features", "agent-management", "workflow"]'))

TASK_IDS+=($(create_task \
    "F3: Multi-Model Support Per Agent" \
    "Allow each agent to connect to different AI providers (OpenAI, Anthropic, Google, Groq). Model selection based on task type and cost optimization." \
    "Agents have model preference setting; routing selects provider; cost tracking per model; fallback on failure" \
    "L" \
    '["features", "agent-management", "integrations", "cost-optimization"]'))

TASK_IDS+=($(create_task \
    "F4: Agent Squad Templates" \
    "Create pre-configured agent squads (e.g., 'Dev Team': lead, coder, reviewer, tester). One-click squad creation with complementary skills." \
    "Squad templates exist; one-click creation; 3+ templates available; agents auto-coordinate" \
    "M" \
    '["features", "agent-management", "ux", "onboarding"]'))

# ============================================
# G) Multi-Agent Coordination
# ============================================

echo "🤝 Creating Multi-Agent Coordination tasks..."

TASK_IDS+=($(create_task \
    "G1: Agent Discussion Threads" \
    "Add comment/discussion threads on tasks where agents can debate approaches, ask clarifying questions, and reach consensus before acting." \
    "Discussion UI exists; agents can post comments; @mentions work; threads visible in task view" \
    "M" \
    '["features", "collaboration", "ux"]'))

TASK_IDS+=($(create_task \
    "G2: Peer Review System" \
    "Agents can review each other's work before submission. Reviewer agent checks output quality, suggests improvements, approves or requests changes." \
    "Review step in workflow; reviewer assigned automatically; review comments tracked; approval gates work" \
    "M" \
    '["features", "collaboration", "quality"]'))

TASK_IDS+=($(create_task \
    "G3: Lead Coordinator Escalation" \
    "When agents disagree or get stuck, escalate to a 'Lead' agent for decision. Lead reviews context and makes binding call." \
    "Escalation trigger exists; lead agent notified; decision recorded; downstream agents follow lead decision" \
    "S" \
    '["features", "collaboration", "workflow"]'))

TASK_IDS+=($(create_task \
    "G4: Conflict Resolution Protocol" \
    "Standardized process for resolving agent conflicts: debate period → vote → lead decision. All conflicts logged for review." \
    "Conflict detected automatically; debate window enforced; voting mechanism works; resolution logged" \
    "M" \
    '["features", "collaboration", "reliability"]'))

# ============================================
# H) Workflow Automation
# ============================================

echo "⚙️  Creating Workflow Automation tasks..."

TASK_IDS+=($(create_task \
    "H1: Chained Agent Workflows" \
    "Workflows can chain agents: Agent A output → Agent B input. Dynamic routing based on output content and agent skills." \
    "Workflows support chaining; output passed as input; routing logic works; 3+ step chains execute successfully" \
    "L" \
    '["features", "workflow", "automation"]'))

TASK_IDS+=($(create_task \
    "H2: Helper Agent Pattern" \
    "Auto-assign helper agents for initial steps (research, summarize, gather) before primary agent takes over. Helper outputs prep context." \
    "Helper assignment automatic; research agents prep work; context passed to primary; primary starts with full context" \
    "M" \
    '["features", "workflow", "efficiency"]'))

TASK_IDS+=($(create_task \
    "H3: Recurring Task Scheduling" \
    "Cron-like scheduling for recurring tasks: daily reports, weekly audits, hourly health checks. Schedule via UI or YAML." \
    "Scheduling UI exists; cron expressions supported; recurring tasks spawn on schedule; missed runs queued" \
    "M" \
    '["features", "workflow", "scheduling", "automation"]'))

TASK_IDS+=($(create_task \
    "H4: Dynamic Workflow Branching" \
    "Workflows branch based on conditions: if analysis finds X, go to path A; if Y, go to path B. Conditional logic in YAML." \
    "Branch conditions work; YAML supports if/else; runtime evaluates conditions; correct branch executes" \
    "L" \
    '["features", "workflow", "automation"]'))

TASK_IDS+=($(create_task \
    "H5: Workflow Templates Library" \
    "Pre-built workflow templates: Content Creation, Code Review, Bug Investigation, Security Audit. Import and customize." \
    "Template library exists; 5+ templates available; import creates copy; customizable after import" \
    "S" \
    '["features", "workflow", "ux", "onboarding"]'))

# ============================================
# I) Integration-First
# ============================================

echo "🔗 Creating Integration-First tasks..."

TASK_IDS+=($(create_task \
    "I1: Native Slack App" \
    "Build native Slack app (not just webhooks). Agents live in channels, respond to @mentions, post results as threaded replies." \
    "Slack app installed in workspace; agents respond to @mentions; results posted to threads; slash commands work" \
    "L" \
    '["features", "integrations", "slack", "ux"]'))

TASK_IDS+=($(create_task \
    "I2: Telegram Bot Enhancements" \
    "Improve Telegram bot: rich message formatting, inline buttons for quick actions, photo/document uploads, conversation threads." \
    "Rich formatting works; inline buttons functional; file upload supported; conversation threads maintained" \
    "M" \
    '["features", "integrations", "telegram", "ux"]'))

TASK_IDS+=($(create_task \
    "I3: Email Integration" \
    "Send task results and summaries via email. Configurable email templates, recipient lists, and delivery schedules." \
    "Email provider configured; templates exist; scheduled delivery works; delivery status tracked" \
    "M" \
    '["features", "integrations", "email", "notifications"]'))

TASK_IDS+=($(create_task \
    "I4: GitHub Native Integration" \
    "Deep GitHub integration: PR comments trigger agents, agents open PRs, review requests assign agents, issue labels spawn tasks." \
    "GitHub App installed; PR webhooks processed; agents can open PRs; review requests route to agents" \
    "L" \
    '["features", "integrations", "github", "developer-tools"]'))

TASK_IDS+=($(create_task \
    "I5: Webhook Integration Framework" \
    "Generic webhook framework for external integrations. Configurable endpoints, payload parsing, authentication, retry logic." \
    "Webhook endpoints configurable; payload parsing flexible; auth supported; retry with backoff" \
    "M" \
    '["features", "integrations", "api", "extensibility"]'))

# ============================================
# J) Centralized Dashboard
# ============================================

echo "📊 Creating Centralized Dashboard tasks..."

TASK_IDS+=($(create_task \
    "J1: Real-Time Activity Feed" \
    "Live activity feed showing what agents are doing right now: current task, step progress, estimated completion." \
    "Activity feed updates every 5s; shows agent name + task + progress; no page refresh needed; scrollable history" \
    "M" \
    '["features", "dashboard", "real-time", "ux"]'))

TASK_IDS+=($(create_task \
    "J2: Agent Status Overview" \
    "Dashboard widget showing all agents: online/offline, current task, success rate, recent performance. Quick actions per agent." \
    "Agent grid shows status; online indicator accurate; success rate calculated; pause/resume buttons work" \
    "M" \
    '["features", "dashboard", "monitoring", "ux"]'))

TASK_IDS+=($(create_task \
    "J3: Workflow Intervention Controls" \
    "Pause, resume, restart, and kill buttons for running workflows. Interventions logged with reason and user." \
    "Pause button works; resume continues; restart resets; kill stops; all actions logged; confirmation dialogs" \
    "M" \
    '["features", "dashboard", "control", "ux"]'))

TASK_IDS+=($(create_task \
    "J4: Cost & Usage Dashboard" \
    "Track spending per agent, workflow, project. Daily/weekly/monthly views. Budget alerts and projections." \
    "Cost tracking accurate; charts for time periods; budget alerts trigger; projections reasonable" \
    "M" \
    '["features", "dashboard", "cost-tracking", "monitoring"]'))

TASK_IDS+=($(create_task \
    "J5: Mobile-Responsive Dashboard" \
    "Dashboard works on mobile devices: touch-friendly, collapsible sidebar, optimized for phone/tablet viewing." \
    "Mobile layout functional; touch targets 44px+; sidebar collapses; no horizontal scroll" \
    "S" \
    '["features", "dashboard", "mobile", "ux"]'))

# ============================================
# K) System Improvements
# ============================================

echo "🔧 Creating System Improvement tasks..."

TASK_IDS+=($(create_task \
    "K1: Agent Performance Analytics" \
    "Track agent metrics: tasks completed, success rate, average time, cost per task. Leaderboard and trend analysis." \
    "Metrics calculated; trends visible; leaderboard exists; insights actionable" \
    "M" \
    '["features", "analytics", "monitoring"]'))

TASK_IDS+=($(create_task \
    "K2: Smart Task Routing" \
    "AI-powered task assignment: analyze task requirements, match to agent skills/history/availability, optimal routing." \
    "Routing algorithm analyzes tasks; skill matching works; load balancing fair; reassignment on failure" \
    "L" \
    '["features", "ai", "routing", "efficiency"]'))

TASK_IDS+=($(create_task \
    "K3: Context-Aware Agents" \
    "Agents maintain context across conversations and tasks. Long-term memory of preferences, past decisions, project history." \
    "Context persists; agents remember preferences; past decisions referenced; project history accessible" \
    "L" \
    '["features", "ai", "memory", "context"]'))

TASK_IDS+=($(create_task \
    "K4: Workflow Visual Editor" \
    "Drag-and-drop workflow builder: nodes for steps, edges for flow, visual editing instead of YAML." \
    "Visual editor works; drag-drop functional; generates valid YAML; import YAML shows visually" \
    "L" \
    '["features", "workflow", "ux", "visual"]'))

TASK_IDS+=($(create_task \
    "K5: Sandbox Testing Environment" \
    "Test workflows and agents in isolated sandbox before production. Dry-run mode, mock data, safe experimentation." \
    "Sandbox isolated; dry-run works; mock data available; no production side effects" \
    "M" \
    '["features", "testing", "reliability", "ux"]'))

echo ""
echo "✅ Feature backlog seeding complete!"
echo ""
echo "📊 Summary:"
echo "  Run ID: $RUN_ID"
echo "  Tasks created: ${#TASK_IDS[@]}"
echo ""
echo "📝 Created Task IDs:"
for id in "${TASK_IDS[@]}"; do
    if [[ "$id" != "null" ]]; then
        echo "  - $id"
    fi
done
echo ""
echo "🔗 View in Mission Control UI:"
echo "   http://localhost:5173 (INBOX column)"
echo ""
echo "🏷️  Tags breakdown:"
echo "   Agent Squad Management: 4 tasks"
echo "   Multi-Agent Coordination: 4 tasks"
echo "   Workflow Automation: 5 tasks"
echo "   Integrations: 5 tasks"
echo "   Dashboard: 5 tasks"
echo "   System Improvements: 5 tasks"
echo ""
echo "💾 Run ID saved for reference: $RUN_ID"
