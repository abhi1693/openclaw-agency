/**
 * PM2 ecosystem config for the AMS SQS consumer worker.
 *
 * Start:   pm2 start ecosystem.ams.config.js
 * Stop:    pm2 stop mc-ams-worker
 * Logs:    pm2 logs mc-ams-worker
 * Status:  pm2 show mc-ams-worker
 */

const path = require("path");

const BACKEND = path.resolve(__dirname, "backend");
const VENV_PYTHON = path.join(BACKEND, ".venv", "bin", "python");

module.exports = {
  apps: [
    {
      name: "mc-ams-worker",
      script: VENV_PYTHON,
      args: "-m app.workers.ams_worker",
      cwd: BACKEND,
      interpreter: "none",          // script IS the interpreter
      autorestart: true,
      restart_delay: 5000,           // 5s cooldown between restarts
      max_restarts: 20,
      watch: false,
      env: {
        // Inherit shell environment; sensitive vars (AWS keys) should be in
        // backend/.env or exported before starting pm2.
        PYTHONUNBUFFERED: "1",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: path.join(BACKEND, "logs", "ams-worker-out.log"),
      error_file: path.join(BACKEND, "logs", "ams-worker-err.log"),
      merge_logs: false,
    },
  ],
};
