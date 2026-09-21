"use strict";
/**
 * Remembers what the bot has already reviewed, so you never get the same lead twice.
 * Stored in state/state.json, which GitHub Actions commits back after every run.
 *
 * Only posts that reached the AI step are remembered. Posts rejected by keywords are
 * simply re-checked next time — that's free, and keeps this file small.
 */
const fs = require("fs");
const path = require("path");
const { dateOf } = require("./util");

const FILE = path.join(__dirname, "..", "state", "state.json");
const SEEN_DAYS = 10;
const KEEP_DAYS = 8;

const empty = () => ({
  version: 1,
  seen: {},
  cursors: {},
  stats: {},
  warned: {},
  lastHeartbeat: null,
  lastRun: null,
});

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { ...empty(), ...s, seen: s.seen || {}, cursors: s.cursors || {}, stats: s.stats || {}, warned: s.warned || {} };
  } catch {
    return empty();
  }
}

/** Write to a temp file then rename, so a crash can never leave a half-written file. */
function save(st) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
  fs.renameSync(tmp, FILE);
}

const isSeen = (st, id) => Object.prototype.hasOwnProperty.call(st.seen, id);
const markSeen = (st, id, now) => {
  st.seen[id] = now;
};

function recentDates(now, n) {
  const out = new Set();
  for (let i = 0; i < n; i++) out.add(dateOf(now - i * 86400));
  return out;
}

function prune(st, now) {
  const cutoff = now - SEEN_DAYS * 86400;
  for (const [id, t] of Object.entries(st.seen)) if (t < cutoff) delete st.seen[id];
  const keep = recentDates(now, KEEP_DAYS);
  for (const d of Object.keys(st.stats)) if (!keep.has(d)) delete st.stats[d];
  for (const [k, d] of Object.entries(st.warned)) if (!keep.has(d)) delete st.warned[k];
}

function bumpStats(st, now, { scanned, reviewed, leads }) {
  const d = dateOf(now);
  const s = st.stats[d] || (st.stats[d] = { runs: 0, scanned: 0, reviewed: 0, leads: 0 });
  s.runs += 1;
  s.scanned += scanned;
  s.reviewed += reviewed;
  s.leads += leads;
}

/** Return the next `n` items from a list, remembering where we stopped for next run. */
function rotate(st, key, list, n) {
  if (!list.length || n <= 0) return [];
  let c = Number(st.cursors[key]) || 0;
  if (c >= list.length) c = 0;
  const count = Math.min(n, list.length);
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[(c + i) % list.length]);
  st.cursors[key] = (c + count) % list.length;
  return out;
}

module.exports = { load, save, isSeen, markSeen, prune, bumpStats, rotate, FILE };
