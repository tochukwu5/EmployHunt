"use strict";
/**
 * TWITTER / X — paid, via twitterapi.io (a third-party gateway, not official X API).
 *
 * Uses GET /twitter/tweet/advanced_search, rotating through SEARCH_QUERIES the same way
 * Bluesky does. Billed per tweet RETURNED, not per call — an empty search costs the
 * 15-credit minimum ($0.00015), so quiet keywords cost almost nothing.
 *
 * Rate limit: the free/pay-as-you-go tier is 0.2 QPS (one request per 5 seconds). This file
 * paces every call 5.5s apart to stay under that — raising SEARCH_QUERIES_PER_RUN makes
 * this source take longer per run, not fail. At 24 queries that's ~2.2 minutes, well inside
 * the 15-minute workflow timeout.
 *
 * Auth header per the API spec is "X-API-Key" (not "Authorization: Bearer ...").
 */
const { fetchJson, sleep, toEpoch } = require("../util");
const { rotate } = require("../state");
const { SEARCH_QUERIES } = require("../keywords");

const key = "twitter";
const name = "Twitter/X";
const API = "https://api.twitterapi.io/twitter/tweet/advanced_search";

// Paces requests to stay under the account's 0.2 QPS (1 request / 5s) limit.
const MIN_GAP_MS = 5500;

/**
 * Exact phrase, original tweets only (no replies/retweets), English, and only what's
 * new since the last check. since_time must be Unix seconds per the API's query syntax.
 */
function buildQuery(phrase, sinceEpoch) {
  return `"${phrase}" -filter:replies -filter:retweets lang:en since_time:${sinceEpoch}`;
}

async function collect(cfg, st, ctx) {
  const tc = cfg.sources.twitter;
  if (!tc.apiKey) {
    ctx.warn("twitter:auth", "Twitter/X is enabled but TWITTERAPI_KEY is missing.");
    return [];
  }

  const since = ctx.now - cfg.maxPostAgeHours * 3600;
  const queries = rotate(st, key, SEARCH_QUERIES, cfg.searchQueriesPerRun);
  const out = [];
  const errors = [];

  for (const q of queries) {
    try {
      const url = `${API}?query=${encodeURIComponent(buildQuery(q, since))}&queryType=Latest`;
      const res = await fetchJson(url, { headers: { "X-API-Key": tc.apiKey } }, { retries: 1 });

      for (const t of res.tweets || []) {
        // Defensive filter: -filter:replies is passed in the query, but that's a request
        // to Twitter's search, not a guarantee. Drop anything the API itself marks as a
        // reply, since replies are almost always noise ("same, need a dev too") rather
        // than a standalone hiring post.
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
      if (e.status === 401 || e.status === 403) break; // bad/exhausted key, no point continuing
    }
    await sleep(MIN_GAP_MS);
  }

  if (errors.length && !out.length) throw new Error(errors[0]);
  if (errors.length) ctx.warn("twitter:partial", `Some Twitter searches failed: ${errors[0]}`);
  return out;
}

module.exports = { key, name, collect };