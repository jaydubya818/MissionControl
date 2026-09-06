# Mission Control Orchestration Server
# Build and run coordinator loop + agent runtime + gateway proxy
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy workspace root and app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/orchestration-server ./apps/orchestration-server
COPY packages ./packages
COPY agents ./agents 2>/dev/null || true

# Install and build
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @mission-control/shared build \
  && pnpm --filter @mission-control/coordinator build \
  && pnpm --filter @mission-control/agent-runtime build \
  && pnpm --filter @mission-control/context-router build \
  && pnpm --filter @mission-control/memory build \
  && pnpm --filter @mission-control/orchestration-server build

WORKDIR /app/apps/orchestration-server
EXPOSE 4100
# Health check: GET /health must return 200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://localhost:4100/health || exit 1

CMD ["node", "dist/index.js"]
