"use strict";
/**
 * TEMPLATE for adding a new source (e.g. X via twitterapi.io, or Threads).
 *
 * 1. Copy this file, e.g. src/sources/twitter.js
 * 2. Add settings in config.js:   sources: { twitter: { enabled: bool(env.ENABLE_TWITTER, false), apiKey: env.TWITTERAPI_KEY } }
 * 3. Register it in src/sources/index.js
 * 4. Add the API key as a GitHub Secret and map it in .github/workflows/hunt.yml
 *
 * Return posts in this exact shape. Everything else (matching, AI, alerts,
 * de-duplication) happens automatically.
 */
const { fetchJson } = require("../util");
const { rotate } = require("../state");
const { SEARCH_QUERIES } = require("../keywords");

const key = "example";
const name = "Example";

async function collect(cfg, st, ctx) {
  const queries = rotate(st, key, SEARCH_QUERIES, cfg.searchQueriesPerRun);
  const out = [];
  for (const q of queries) {
    // const res = await fetchJson(`https://api.example.com/search?q=${encodeURIComponent(q)}`, { headers: {...} });
    // for (const item of res.items) out.push({
    //   id: `example:${item.id}`,      // must be unique across all sources
    //   source: name,
    //   where: `search "${q}"`,
    //   author: `@${item.user}`,
    //   title: "",
    //   text: item.text,
    //   url: item.url,
    //   createdAt: Math.floor(Date.parse(item.created_at) / 1000),
    //   strict: false,                 // true = only strong intent counts (noisy sources)
    // });
  }
  return out;
}

module.exports = { key, name, collect };
