const path = require("node:path");

const repositoryRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "mission-control-orchestration",
      script: "pnpm",
      args: ["--filter", "@mission-control/orchestration-server", "start"],
      cwd: repositoryRoot,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
