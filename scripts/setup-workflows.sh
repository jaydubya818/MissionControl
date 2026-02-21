#!/bin/bash

# Mission Control Workflow Setup Script
# 
# Sets up the complete workflow system:
# - Seeds built-in workflows
# - Builds executor and CLI
# - Configures PM2
# - Runs tests

set -e

echo "🤖 Mission Control Workflow Setup"
echo "=================================="
echo ""

# Check for required tools
command -v pnpm >/dev/null 2>&1 || { echo "❌ Error: pnpm is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Error: Node.js is required but not installed."; exit 1; }

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ is required (found: $(node -v))"
  exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# 1. Install dependencies
echo "📦 Installing dependencies..."
pnpm install
echo ""

# 2. Build packages
echo "🔨 Building packages..."
pnpm --filter @mission-control/workflow-engine build
pnpm --filter @mission-control/cli build
pnpm --filter @mission-control/workflow-executor build
echo ""

# 3. Run tests
echo "🧪 Running tests..."
pnpm --filter @mission-control/workflow-engine test
echo ""

# 4. Seed workflows
echo "🌱 Seeding workflows..."
pnpm workflows:seed
echo ""

# 5. Check for CONVEX_URL
if [ -z "$CONVEX_URL" ]; then
  echo "⚠️  Warning: CONVEX_URL not set"
  echo "   Set it in .env or export CONVEX_URL=https://..."
  echo ""
fi

# 6. Setup PM2 (optional)
read -p "Install PM2 for workflow executor? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "📦 Installing PM2..."
  npm install -g pm2
  
  echo "🚀 Starting workflow executor..."
  cd apps/workflow-executor
  pm2 start ecosystem.config.js
  pm2 save
  
  echo ""
  echo "✅ Workflow executor started"
  echo "   View logs: pm2 logs workflow-executor"
  echo "   Monitor: pm2 monit"
  echo ""
  
  cd ../..
fi

# 7. Setup CLI alias (optional)
read -p "Create 'mc' command alias? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd packages/cli
  npm link
  cd ../..
  
  echo "✅ CLI alias created"
  echo "   Try: mc workflow list"
  echo ""
fi

# Summary
echo "✅ Workflow setup complete!"
echo ""
echo "Next steps:"
echo "  1. Set CONVEX_URL in .env"
echo "  2. Start executor: cd apps/workflow-executor && pnpm dev"
echo "  3. List workflows: mc workflow list"
echo "  4. Run a workflow: mc workflow run feature-dev \"Add OAuth\""
echo ""
echo "Documentation:"
echo "  - Workflows: docs/WORKFLOWS.md"
echo "  - Creating workflows: docs/CREATING_WORKFLOWS.md"
echo "  - Executor: docs/WORKFLOW_EXECUTOR.md"
echo "  - CLI: docs/WORKFLOW_CLI.md"
echo ""
