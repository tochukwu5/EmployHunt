"use strict";
/**
 * BLUESKY — free.
 *
 * Bluesky can't be read as a feed of "all posts", so this one uses real searches.
 * Each run sends SEARCH_QUERIES_PER_RUN exact-phrase searches, one at a time,
 * then picks up where it stopped on the next run — cycling the full list every few hours.
 *
 * Needs BLUESKY_HANDLE + BLUESKY_APP_PASSWORD (an app password, NOT your real password).
 */
const { fetchJson, sleep, toEpoch } = require("../util");
const { rotate } = require("../state");
const { SEARCH_QUERIES } = require("../keywords");

const key = "bluesky";
const name = "Bluesky";

async function login(bc) {
  const r = await fetchJson(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: bc.handle, password: bc.appPassword }),
    },
    { retries: 1 }
  );
  return r.accessJwt || null;
}

async function collect(cfg, st, ctx) {
  const bc = cfg.sources.bluesky;
  let jwt = null;

  if (bc.handle && bc.appPassword) {
    try {
      jwt = await login(bc);
    } catch (e) {
      ctx.warn("bluesky:auth", `Bluesky login failed (${e.message.slice(0, 80)}). Check handle and app password.`);
    }
  }

  const base = jwt ? "https://bsky.social/xrpc" : "https://public.api.bsky.app/xrpc";
  const headers = jwt ? { Authorization: `Bearer ${jwt}` } : {};
  const since = new Date((ctx.now - cfg.maxPostAgeHours * 3600) * 1000).toISOString();
  const queries = rotate(st, "bluesky", SEARCH_QUERIES, cfg.searchQueriesPerRun);

  const out = [];
  const errors = [];

  for (const q of queries) {
    try {
      const url =
        `${base}/app.bsky.feed.searchPosts?q=${encodeURIComponent(`"${q}"`)}` +
        `&sort=latest&limit=40&since=${encodeURIComponent(since)}`;
      const res = await fetchJson(url, { headers }, { retries: 1 });
      for (const p of res.posts || []) {
        const handle = (p.author && p.author.handle) || "";
        const rkey = String(p.uri || "").split("/").pop();
        out.push({
          id: `bsky:${p.uri}`,
          source: name,
          where: `search "${q}"`,
          author: handle ? `@${handle}` : "",
          title: "",
          text: (p.record && p.record.text) || "",
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          createdAt: toEpoch((p.record && p.record.createdAt) || p.indexedAt),
          strict: false,
        });
      }
    } catch (e) {
      errors.push(`"${q}": ${e.message.slice(0, 80)}`);
      if (e.status === 401 || e.status === 403) break; // no point trying the rest
    }
    await sleep(400);
  }

  if (errors.length && !out.length) {
    const hint = jwt ? "" : " (add BLUESKY_HANDLE and BLUESKY_APP_PASSWORD)";
    throw new Error(errors[0] + hint);
  }
  return out;
}

module.exports = { key, name, collect };
