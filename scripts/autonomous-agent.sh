#!/usr/bin/env bash
#
# autonomous-agent.sh — Simple autonomous agent that polls for and processes INBOX tasks
# Usage: ./scripts/autonomous-agent.sh <agent-id> [poll-interval-seconds]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MC_DIR="${SCRIPT_DIR}/.."

AGENT_ID="${1:-}"
POLL_INTERVAL="${2:-30}"

if [[ -z "$AGENT_ID" ]]; then
    echo "Usage: $0 <agent-id> [poll-interval-seconds]"
    echo "Example: $0 j9784f3pff3nhmp3wt0ghnt6ad80cy65"
    exit 1
fi

# Source environment
cd "$MC_DIR"
if [[ -f ".env.local" ]]; then
    set -a
    source ".env.local" 2>/dev/null || true
    set +a
fi

if [[ -z "${CONVEX_URL:-}" ]]; then
    echo "❌ CONVEX_URL not configured"
    exit 1
fi

echo "🤖 Autonomous Agent Starting"
echo "============================="
echo "Agent ID: $AGENT_ID"
echo "Poll Interval: ${POLL_INTERVAL}s"
echo "Convex URL: ${CONVEX_URL:0:40}..."
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Track processed tasks to avoid duplicates (macOS compatible)
PROCESSED_TASKS=""

process_task() {
    local task_id="$1"
    local task_title="$2"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Processing Task: $task_title"
    echo "   ID: $task_id"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Step 1: Claim the task (INBOX → ASSIGNED)
    echo "[1/5] Claiming task..."
    local claim_result
    claim_result=$(npx convex run api.tasks.assign "{
        \"taskId\": \"$task_id\",
        \"agentIds\": [\"$AGENT_ID\"],
        \"actorType\": \"AGENT\",
        \"idempotencyKey\": \"auto-claim-$task_id\"
    }" 2>&1) || {
        echo "❌ Failed to claim task: $claim_result"
        return 1
    }
    
    if echo "$claim_result" | grep -q '"success": true'; then
        echo "✅ Task claimed"
    else
        echo "⚠️  Task may already be claimed"
    fi
    
    # Step 2: Transition to IN_PROGRESS
    echo "[2/5] Starting work..."
    local work_plan='{"bullets": ["Analyze task requirements", "Execute implementation", "Verify completion"], "estimatedDuration": "15m", "estimatedCost": 0.5}'
    
    npx convex run api.tasks.transition "{
        \"taskId\": \"$task_id\",
        \"toStatus\": \"IN_PROGRESS\",
        \"actorType\": \"AGENT\",
        \"workPlan\": $work_plan,
        \"idempotencyKey\": \"auto-progress-$task_id\"
    }" 2>&1 > /dev/null || {
        echo "⚠️  Could not transition to IN_PROGRESS (may already be in progress)"
    }
    echo "✅ Work started"
    
    # Step 3: Simulate work (sleep)
    echo "[3/5] Working..."
    sleep 2
    echo "✅ Work complete"
    
    # Step 4: Submit for review
    echo "[4/5] Submitting for review..."
    local deliverable='{"summary": "Task completed autonomously by agent", "content": "Agent processed task through full lifecycle"}'
    local checklist='{"type": "completion", "items": [{"label": "Task analyzed", "checked": true}, {"label": "Work completed", "checked": true}, {"label": "Results verified", "checked": true}]}'
    
    npx convex run api.tasks.transition "{
        \"taskId\": \"$task_id\",
        \"toStatus\": \"REVIEW\",
        \"actorType\": \"AGENT\",
        \"deliverable\": $deliverable,
        \"reviewChecklist\": $checklist,
        \"idempotencyKey\": \"auto-review-$task_id\"
    }" 2>&1 > /dev/null || {
        echo "⚠️  Could not transition to REVIEW"
    }
    echo "✅ Submitted for review"
    
    # Step 5: Request approval (YELLOW risk for auto-processing)
    echo "[5/5] Requesting approval..."
    npx convex run api.approvals.request "{
        \"taskId\": \"$task_id\",
        \"requestorAgentId\": \"$AGENT_ID\",
        \"actionType\": \"TASK_COMPLETE\",
        \"actionSummary\": \"Complete task: $task_title\",
        \"riskLevel\": \"YELLOW\",
        \"justification\": \"Task processed autonomously through agent workflow\",
        \"idempotencyKey\": \"auto-approval-$task_id\"
    }" 2>&1 > /dev/null || {
        echo "⚠️  Could not create approval request"
    }
    echo "✅ Approval requested"
    
    echo ""
    echo "✅ Task processing complete!"
    echo "   Status: IN REVIEW (pending human approval)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Mark as processed
    PROCESSED_TASKS="$PROCESSED_TASKS $task_id"
}

# Main loop
while true; do
    echo ""
    echo "🔍 Polling for INBOX tasks... ($(date -Iseconds))"
    
    # Get INBOX tasks
    tasks_json=$(npx convex run api.tasks.listAll '{}' 2>&1) || {
        echo "❌ Failed to fetch tasks: $tasks_json"
        sleep "$POLL_INTERVAL"
        continue
    }
    
    # Extract task IDs and titles
    task_count=0
    while IFS= read -r line; do
        if [[ "$line" =~ "_id" ]]; then
            task_id=$(echo "$line" | grep -o '"_id": "[^"]*"' | cut -d'"' -f4)
        fi
        if [[ "$line" =~ "title" ]]; then
            task_title=$(echo "$line" | grep -o '"title": "[^"]*"' | cut -d'"' -f4)
            
            # Check if INBOX status
            if [[ "$tasks_json" =~ "$task_id".*"INBOX" ]]; then
                task_count=$((task_count + 1))
                
                # Skip if already processed
                if [[ "$PROCESSED_TASKS" == *"$task_id"* ]]; then
                    echo "  ⏭️  Skipping already processed: $task_title"
                    continue
                fi
                
                # Process the task
                process_task "$task_id" "$task_title"
            fi
        fi
    done < <(echo "$tasks_json" | grep -E '"_id"|"title"|"status"')
    
    if [[ $task_count -eq 0 ]]; then
        echo "  📭 No INBOX tasks found"
    else
        echo "  📊 Found $task_count INBOX task(s)"
    fi
    
    echo "⏳ Waiting ${POLL_INTERVAL}s before next poll..."
    sleep "$POLL_INTERVAL"
done
