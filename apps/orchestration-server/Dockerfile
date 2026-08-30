# syntax=docker/dockerfile:1.7
FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS build

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/orchestration-server ./apps/orchestration-server
COPY packages ./packages
COPY agents ./agents
COPY contracts ./contracts
COPY convex ./convex

RUN pnpm install --frozen-lockfile \
  && pnpm run ci:prepare \
  && pnpm --filter @mission-control/orchestration-server build

FROM node:24.18.1-bookworm-slim@sha256:235600a8101ab264e117b1768e925532262668dc9b581ef1dd7d96ced463b8e7 AS runtime

ENV NODE_ENV=production \
    ORCHESTRATION_PORT=4100
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/orchestration-server ./apps/orchestration-server
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/agents ./agents
COPY --from=build --chown=node:node /app/contracts ./contracts

USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/orchestration-server/dist/apps/orchestration-server/src/index.js"]
