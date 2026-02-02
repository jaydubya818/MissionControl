# Telegram Bot Dockerfile
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/telegram-bot/package.json ./packages/telegram-bot/
COPY packages/shared/package.json ./packages/shared/
COPY convex ./convex/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/telegram-bot ./packages/telegram-bot/
COPY packages/shared ./packages/shared/

# Build telegram bot
WORKDIR /app/packages/telegram-bot
RUN pnpm build

# Start bot
CMD ["node", "dist/index.js"]
