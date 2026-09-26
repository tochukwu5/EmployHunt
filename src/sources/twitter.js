"use strict";
const { fetchJson, sleep, toEpoch } = require("../util");
const { rotate } = require("../state");
const { SEARCH_QUERIES } = require("../keywords");

const key = "twitter";
const name = "Twitter/X";
const API = "https://api.twitterapi.io/twitter/tweet/advanced_search";
const MIN_GAP_MS = 5500; // paces requests to stay under 0.2 QPS limit

function buildQuery(phrase, sinceEpoch) {
  return `"${phrase}" -filter:replies -filter:retweets lang:en since_time:${sinceEpoch}`;
}

// Tries each key in order for a single query. Returns { res, keyIndex } on success.
// A key that comes back 401 (bad key) or 402 (out of credits) is skipped for the
// REST of this run (remembered in badKeys), so later queries don't waste time
// retrying a dead key.
async function fetchWithKeyFallback(url, keys, startAt, badKeys, ctx) {
  let lastErr = null;
  for (let i = startAt; i < keys.length; i++) {
    if (badKeys.has(i)) continue;
    try {
      const res = await fetchJson(url, { headers: { "X-API-Key": keys[i] } }, { retries: 1 });
      return { res, keyIndex: i };
    } catch (e) {
      if (e.status === 401 || e.status === 402) {
        badKeys.add(i);
        ctx.warn(
          `twitter:key${i + 1}`,
          `Twitter API key #${i + 1} is ${e.status === 402 ? "out of credits" : "invalid"}. Switching to the next key.`
        );
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("All Twitter API keys are unavailable (out of credits or invalid).");
}

async function collect(cfg, st, ctx) {
  const tc = cfg.sources.twitter;
  const keys = (tc.apiKeys || []).filter(Boolean);
  if (!keys.length) {
    ctx.warn("twitter:auth", "Twitter/X is enabled but no TWITTERAPI_KEY is set.");
    return [];
  }

  const since = ctx.now - cfg.maxPostAgeHours * 3600;
  const queries = rotate(st, key, SEARCH_QUERIES, cfg.searchQueriesPerRun);
  const out = [];
  const errors = [];
  const badKeys = new Set();
  let preferredStart = Number.isInteger(st.twitterKeyIndex) ? st.twitterKeyIndex : 0;
  if (preferredStart >= keys.length) preferredStart = 0;

  for (const q of queries) {
    if (badKeys.size >= keys.length) {
      errors.push("all keys exhausted");
      break;
    }
    try {
      const url = `${API}?query=${encodeURIComponent(buildQuery(q, since))}&queryType=Latest`;
      const { res, keyIndex } = await fetchWithKeyFallback(url, keys, preferredStart, badKeys, ctx);
      preferredStart = keyIndex;
      st.twitterKeyIndex = keyIndex;
      for (const t of res.tweets || []) {
        if (t.isReply) continue;
        const handle = (t.author && t.author.userName) || "";
        out.push({
          id: `twitter:${t.id}`,
          source: name,
          where: `search "${q}"`,
          author: handle ? `@${handle}` : "",
          title: "",
          text: t.text || "",
          url: t.url || (t.id ? `https://x.com/i/web/status/${t.id}` : ""),
          createdAt: toEpoch(t.createdAt) || ctx.now,
          strict: false,
        });
      }
    } catch (e) {
      errors.push(`"${q}": ${e.message.slice(0, 80)}`);
      if (e.status === 429) break;
    }
    await sleep(MIN_GAP_MS);
  }

  if (errors.length && !out.length) throw new Error(errors[0]);
  if (errors.length) ctx.warn("twitter:partial", `Some Twitter searches failed: ${errors[0]}`);
  return out;
}

module.exports = { key, name, collect };