# Mission Control -- Tech Stack

**Last Updated:** February 8, 2026  
**Version:** 0.9.0

All dependency versions are locked. Do not upgrade without testing. Do not add new dependencies without discussing first.

---

## Runtime

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | >= 18.0.0 | Runtime |
| pnpm | >= 9.0.0 | Package manager |
| TypeScript | ^5.3.3 | Type system |

## Build Tools

| Dependency | Version | Purpose |
|---|---|---|
| Turborepo | ^1.11.2 | Monorepo build orchestration |
| Vite | >=5.4.17 | Frontend bundler (apps/mission-control-ui) — **UPGRADE REQUIRED:** apps/mission-control-ui must upgrade from ^5.0.0 to >=5.4.17. Update package.json devDependencies, regenerate lockfile (`pnpm install`), clear CI caches. Use `--host` or `server.host` only when necessary for network access. |
| tsx | ^4.7.0 | TypeScript execution for scripts |
| concurrently | ^8.2.2 | Parallel dev server execution |

## Backend (Convex)

| Dependency | Version | Purpose |
|---|---|---|
| convex | ^1.31.7 | Serverless backend (root) |
| convex | ^1.14.0 | Convex React hooks (UI) |

> Note: Two convex versions exist -- root uses ^1.31.7 for server functions, UI uses ^1.14.0 for React hooks. These should be aligned.

## Frontend

| Dependency | Version | Purpose |
|---|---|---|
| react | ^18.2.0 | UI framework |
| react-dom | ^18.2.0 | DOM rendering |
| framer-motion | ^12.29.2 | Animations and transitions |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop (Kanban board) |
| @dnd-kit/sortable | ^10.0.0 | Sortable drag-and-drop |
| @dnd-kit/utilities | ^3.2.2 | DnD utility functions |

### Frontend Dev Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| @types/react | ^18.2.0 | React type definitions |
| @types/react-dom | ^18.2.0 | ReactDOM type definitions |
| @vitejs/plugin-react | ^4.2.0 | Vite React plugin |

## Integrations

| Dependency | Package | Purpose |
|---|---|---|
| Telegram Bot API | packages/telegram-bot | Operator commands, approvals, notifications |
| OpenClaw SDK | packages/openclaw-sdk | External agent integration |

## Infrastructure

| Tool | Version | Purpose |
|---|---|---|
| Docker | Latest | Containerization |
| Docker Compose | Latest | Multi-container orchestration |
| nginx | Alpine (in Dockerfile) | Static file serving for UI |
| PM2 | ecosystem.config.cjs | Process management (optional) |

## Deployment Targets

- **Development:** Local (pnpm dev + convex dev)
- **Production:** Docker Compose (docker-compose.yml)
- **Database:** Convex Cloud (free tier for MVP, paid for production)
- **Optional:** Vercel (vercel.json exists for UI deployment)

## NOT in the Stack

These technologies are explicitly NOT used. Do not add them:

- Express.js (no REST API server)
- Tailwind CSS (inline styles used instead)
- Next.js (Vite + React SPA)
- Prisma/Drizzle (Convex is the database layer)
- Redis (no caching layer yet)
- WebSocket libraries (Convex handles real-time)
- CSS-in-JS libraries (styled-components, emotion, etc.)
- Component libraries (MUI, Chakra, Ant Design, etc.)

## TypeScript Configuration

- Target: ES2022
- Module: ESNext
- Module resolution: bundler
- Strict mode: enabled
- Path aliases:
  - `@mission-control/shared` -> `packages/shared/src`
  - `@mission-control/state-machine` -> `packages/state-machine/src`
  - `@mission-control/policy-engine` -> `packages/policy-engine/src`
