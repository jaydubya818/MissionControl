/**
 * PM2 Ecosystem Configuration
 * 
 * Manages all Mission Control agents
 */

module.exports = {
  apps: [
    // Mission Control Agents
    {
      name: "agent-sofie",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Sofie",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    {
      name: "agent-backend-dev",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Backend Developer",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    {
      name: "agent-frontend-dev",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "Frontend Developer",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    {
      name: "agent-devops",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "mission-control",
        AGENT_NAME: "DevOps",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    
    // SellerFi Agents
    {
      name: "agent-bj",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "sellerfi",
        AGENT_NAME: "BJ",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    
    // OpenClaw Agents
    {
      name: "agent-scout",
      script: "pnpm",
      args: "dev",
      cwd: "/Users/jaywest/MissionControl/packages/agent-runner",
      env: {
        CONVEX_URL: "https://different-gopher-55.convex.cloud",
        PROJECT_SLUG: "openclaw",
        AGENT_NAME: "Scout",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
  ],
};
