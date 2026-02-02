#!/bin/bash
# Work on the next SellerFi task
# This script is meant to be called by an OpenClaw agent

MC_DIR="/Users/jaywest/MissionControl"
SELLERFI_PROJECT="ks70tcsz3a9g2xhqztpsff71qd80ddmh"

cd "$MC_DIR"

# Get first inbox task
TASK_JSON=$(npx convex run tasks:listByStatus "{\"projectId\":\"$SELLERFI_PROJECT\",\"status\":\"INBOX\",\"limit\":1}" 2>/dev/null | jq '.[0]')

if [ "$TASK_JSON" == "null" ] || [ -z "$TASK_JSON" ]; then
  echo "No tasks in inbox"
  exit 0
fi

TASK_ID=$(echo "$TASK_JSON" | jq -r '._id')
TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title')
TASK_DESC=$(echo "$TASK_JSON" | jq -r '.description')

echo "=== Next Task ==="
echo "ID: $TASK_ID"
echo "Title: $TASK_TITLE"
echo ""
echo "Description:"
echo "$TASK_DESC"
echo ""
echo "=== Ready to claim ==="
echo "Run: mc claim $TASK_ID"
