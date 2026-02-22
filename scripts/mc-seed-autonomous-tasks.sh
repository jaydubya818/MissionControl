#!/usr/bin/env bash
#
# mc-seed-autonomous-tasks.sh — Add autonomous agent feature tasks
# Based on Bhanu Teja's Mission Control setup and missioncontrolhq.ai analysis
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

# Generate unique run ID
TIMESTAMP=$(date +%s)
SHORTID=$(openssl rand -hex 3 2>/dev/null || echo "$(date +%N | cut -c1-6)")
RUN_ID="MC_AUTONOMOUS_${TIMESTAMP}_${SHORTID}"

echo "🤖 Autonomous Agent Features Seeder"
echo "===================================="
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
        \"priority\": 1,
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

echo "🌱 Seeding autonomous agent feature tasks..."
echo ""

# Array to store created task IDs
declare -a TASK_IDS=()

# ============================================
# AUTONOMOUS TASKS (from X thread analysis)
# ============================================

echo "🎯 Creating Autonomous Task Creation features..."

TASK_IDS+=($(create_task \
    "AUTO-1: Self-Directed Task Discovery" \
    "Enable agents to analyze codebase/project state and create their own tasks. Agent scans for: TODO comments, failing tests, outdated dependencies, security vulnerabilities, documentation gaps. Creates tasks automatically with appropriate priority and tags." \
    "Agent can scan repo and create tasks; tasks have proper metadata (source: auto-discovery); human review queue for auto-created tasks; configurable scan intervals" \
    "L" \
    '["autonomous", "high-priority", "discovery", "agent-intelligence"]'))

TASK_IDS+=($(create_task \
    "AUTO-2: Autonomous Task Claiming" \
    "Agents automatically claim tasks from INBOX based on their skills, current workload, and task priority. No manual assignment needed. Agent evaluates: skill match, estimated time, current queue depth, task priority." \
    "Auto-claim algorithm implemented; agents claim within 30s of task creation; workload balancing prevents overload; skill matching accuracy >80%; fallback to manual if no match" \
    "M" \
    '["autonomous", "high-priority", "routing", "agent-ergonomics"]'))

TASK_IDS+=($(create_task \
    "AUTO-3: Agent-to-Agent Communication Protocol" \
    "Implement threaded discussions between agents on tasks. Agents can: ask clarifying questions, suggest alternatives, debate approaches, request reviews, provide feedback. All communication logged and visible in UI." \
    "Discussion threads on tasks; @mentions work between agents; notifications sent; tone filtering (professional); conversation history preserved; human can observe/join" \
    "L" \
    '["autonomous", "collaboration", "communication", "high-priority"]'))

TASK_IDS+=($(create_task \
    "AUTO-4: Lead Agent Coordination Pattern" \
    "Designate a 'Lead' agent (like Jarvis) that coordinates squad activities. Lead: assigns tasks to specialists, resolves conflicts, approves work from junior agents, escalates to human when stuck." \
    "Lead agent role exists; coordination algorithm implemented; conflict resolution works; escalation triggers properly; human override always available" \
    "L" \
    '["autonomous", "coordination", "lead-agent", "high-priority"]'))

TASK_IDS+=($(create_task \
    "AUTO-5: Peer Review Automation" \
    "Completed work automatically routed to peer agent for review before human approval. Reviewer checks: code quality, test coverage, documentation, security issues. Reviewer can approve, request changes, or escalate." \
    "Auto-assigned peer review; review checklist enforced; reviewer claims review tasks; approval gates work; quality metrics tracked" \
    "M" \
    '["autonomous", "quality", "review", "workflow"]'))

TASK_IDS+=($(create_task \
    "AUTO-6: Agent Praise/Recognition System" \
    "Agents can acknowledge good work from peers. +1 system for: helpful reviews, clever solutions, thorough documentation. Builds agent reputation scores." \
    "+1/recognition system works; reputation scores calculated; leaderboard optional; positive reinforcement messaging; no gamification abuse" \
    "S" \
    '["autonomous", "culture", "recognition", "agent-morale"]'))

TASK_IDS+=($(create_task \
    "AUTO-7: Refute/Challenge Protocol" \
    "Agents can challenge approaches they disagree with. Structured debate: agent presents concern → original agent responds → discussion continues → lead agent decides. All captured in task thread." \
    "Challenge button exists; structured debate enforced; decision logged; no infinite loops; respectful tone enforced" \
    "M" \
    '["autonomous", "conflict-resolution", "debate", "quality"]'))

TASK_IDS+=($(create_task \
    "AUTO-8: Self-Healing Task Recovery" \
    "When agent fails, system automatically: detects failure via heartbeat timeout, reassigns task to another agent, preserves context from previous attempt, learns from failure pattern." \
    "Failure detection < 60s; auto-reassignment works; context preserved; retry count tracked; escalation after max retries" \
    "M" \
    '["autonomous", "reliability", "self-healing", "resilience"]'))

TASK_IDS+=($(create_task \
    "AUTO-9: Dynamic Squad Formation" \
    "Agents self-organize into squads based on project needs. Squad formation: analyzes project requirements, assembles team with complementary skills, assigns lead, dissolves when project complete." \
    "Squad formation algorithm; skill complementarity check; lead election; lifecycle management (create/complete/dissolve); squad history preserved" \
    "L" \
    '["autonomous", "organization", "squads", "scaling"]'))

TASK_IDS+=($(create_task \
    "AUTO-10: Continuous Learning Loop" \
    "Agents learn from each execution: track success/failure patterns, update skill ratings, improve estimation accuracy, share learnings with squad. Knowledge persists across sessions." \
    "Learning metrics tracked; skill ratings updated; estimation improves over time; knowledge sharing works; feedback loop < 24h" \
    "L" \
    '["autonomous", "learning", "improvement", "ai-training"]'))

echo ""
echo "✅ Autonomous feature backlog seeding complete!"
echo ""
echo "📊 Summary:"
echo "  Run ID: $RUN_ID"
echo "  Tasks created: ${#TASK_IDS[@]}"
echo ""
echo "📝 Created Task IDs:"
for id in "${TASK_IDS[@]}"; do
    if [[ "$id" != "null" && -n "$id" ]]; then
        echo "  - $id"
    fi
done
echo ""
echo "🔗 View in Mission Control UI:"
echo "   http://localhost:5173 (INBOX column - filter by 'autonomous' tag)"
echo ""
echo "🏷️  Priority: All tagged as P1 (Critical)"
echo "💾 Run ID saved for reference: $RUN_ID"
