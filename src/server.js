#!/usr/bin/env node
"use strict";
/**
 * RAILWAY / ALWAYS-ON RUNNER
 *
 * This is what you run on Railway instead of GitHub Actions.
 * It does the exact same scan as `node src/index.js`, just on its own
 * internal clock — no external cron needed. It:
 *
 *   1. Runs a scan immediately on boot (so you see it working right away).
 *   2. Then runs again every RUN_INTERVAL_MINUTES (default 60 = every hour).
 *   3. Keeps the process alive forever in between.
 *
 * Start it with:  node src/server.js
 * (Railway: set the service's Start Command to that, or `npm run server`.)
 */
const { spawn } = require("child_process");
const path = require("path");
const { log } = require("./util");

const INTERVAL_MINUTES = Number(process.env.RUN_INTERVAL_MINUTES) || 60;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;
const SCRIPT = path.join(__dirname, "index.js");

let running = false;

function runScanOnce() {
  if (running) {
    log("Previous scan is still running — skipping this tick so runs never overlap.");
    return;
  }
  running = true;
  log(`Starting scan (next one in ${INTERVAL_MINUTES} min)...`);

  const child = spawn(process.execPath, [SCRIPT], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    running = false;
    log(`Scan finished with exit code ${code}.`);
  });

  child.on("error", (err) => {
    running = false;
    log(`Scan failed to start: ${err.message}`);
  });
}

log(`Job Hunter server starting. Scanning every ${INTERVAL_MINUTES} minutes.`);
runScanOnce();
setInterval(runScanOnce, INTERVAL_MS);

process.on("uncaughtException", (err) => {
  log(`Uncaught error (server stays alive): ${err && err.stack ? err.stack : err}`);
});
process.on("unhandledRejection", (err) => {
  log(`Unhandled rejection (server stays alive): ${err && err.stack ? err.stack : err}`);
});