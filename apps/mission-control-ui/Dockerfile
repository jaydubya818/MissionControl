# Build stage: install deps and build the UI.
# Build from repo root: docker build -f apps/mission-control-ui/Dockerfile --build-arg VITE_CONVEX_URL=https://your-deployment.convex.cloud .
FROM node:20-alpine AS builder

ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}

WORKDIR /app

# Install pnpm and copy workspace config
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY convex ./convex
COPY turbo.json tsconfig.json ./

# Copy workspace packages (minimal so pnpm install succeeds)
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Copy UI app
COPY apps/mission-control-ui ./apps/mission-control-ui

# Install dependencies. Requires convex/_generated (run `npx convex codegen` before docker build).
RUN pnpm install --frozen-lockfile

# Build UI (from repo root so convex/_generated/api resolves)
RUN pnpm exec turbo run build --filter=mission-control-ui

# Runtime stage: serve static files
FROM nginx:alpine

# Copy built assets from builder (Vite output is in apps/mission-control-ui/dist)
COPY --from=builder /app/apps/mission-control-ui/dist /usr/share/nginx/html
COPY apps/mission-control-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
