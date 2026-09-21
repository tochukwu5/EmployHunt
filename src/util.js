"use strict";
/**
 * Shared helpers. Zero dependencies — uses Node's built-in fetch (Node 18+).
 */
const fs = require("fs");
const path = require("path");

/** Load a local .env file for testing on your own machine. On GitHub, secrets come from the workflow. */
function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * GET/POST that returns parsed JSON.
 * Retries on network errors, 429 and 5xx. Does NOT retry auth or bad-request errors.
 */
async function fetchJson(url, opts = {}, { retries = 2, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : {};

      const err = new Error(`HTTP ${res.status} :: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      err.status = res.status;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw err;

      lastErr = err;
      if (attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(ra > 0 ? Math.min(ra, 30) * 1000 : 1500 * (attempt + 1));
      }
    } catch (e) {
      if (e.status && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Decode common HTML entities. &amp; is decoded last so we never double-decode. */
function decodeEntities(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Strip HTML from Mastodon / Hacker News content into readable text. */
function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape text for Telegram's HTML parse mode. Unescaped < or & breaks the whole message. */
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

function ago(epochSec) {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - epochSec) / 60));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const dateOf = (epochSec) => new Date(epochSec * 1000).toISOString().slice(0, 10);

const toEpoch = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? Math.floor(typeof v === "number" ? t : t / 1000) : 0;
};

module.exports = {
  loadEnv, sleep, log, fetchJson, decodeEntities, htmlToText,
  esc, escAttr, clip, ago, dateOf, toEpoch,
};
