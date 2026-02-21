/**
 * PM2 Configuration for Workflow Executor
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs workflow-executor
 *   pm2 stop workflow-executor
 *   pm2 restart workflow-executor
 */

module.exports = {
  apps: [
    {
      name: "workflow-executor",
      script: "./dist/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
      // Restart strategy
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
