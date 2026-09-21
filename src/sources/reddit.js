"use strict";
/**
 * REDDIT — free.
 *
 * Fetches the newest posts from groups of subreddits in ONE call per group
 * (Reddit lets you combine them: r/forhire+hiring+slavelabour/new).
 * All keywords are then matched locally. No per-keyword searches needed.
 *
 * Uses the official API when REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are set,
 * otherwise falls back to the public feed (which Reddit may rate-limit).
 */
const { fetchJson, sleep, log } = require("../util");

const key = "reddit";
const name = "Reddit";

async function getToken(rc) {
  if (!rc.clientId || !rc.clientSecret) return null;
  const auth = Buffer.from(`${rc.clientId}:${rc.clientSecret}`).toString("base64");
  const res = await fetchJson(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": rc.userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
    { retries: 1 }
  );
  return res.access_token || null;
}

async function fetchGroup(subs, token, rc) {
  const joined = subs.join("+");
  const url = token
    ? `https://oauth.reddit.com/r/${joined}/new?limit=100&raw_json=1`
    : `https://www.reddit.com/r/${joined}/new.json?limit=100&raw_json=1`;
  const headers = { "User-Agent": rc.userAgent };
  if (token) headers.Authorization = `Bearer ${token}`;
  const data = await fetchJson(url, { headers }, { retries: 1 });
  return ((data && data.data && data.data.children) || []).map((c) => c.data).filter(Boolean);
}

async function collect(cfg, st, ctx) {
  const rc = cfg.sources.reddit;
  let token = null;

  if (rc.clientId && rc.clientSecret) {
    try {
      token = await getToken(rc);
    } catch (e) {
      ctx.warn("reddit:auth", `Reddit login failed (${e.message.slice(0, 80)}). Using the public feed instead.`);
    }
  } else {
    log("  Reddit: no API credentials, using the public feed.");
  }

  const out = [];
  const errors = [];

  for (const group of rc.groups) {
    try {
      const items = await fetchGroup(group.subs, token, rc);
      for (const d of items) {
        if (d.stickied || d.removed_by_category || d.over_18) continue;
        // Flair like "Hiring" or "For Hire" goes into the title as "[Hiring]" so tags match.
        const flair = d.link_flair_text ? `[${d.link_flair_text}] ` : "";
        out.push({
          id: `reddit:${d.id}`,
          source: name,
          where: `r/${d.subreddit}`,
          author: d.author ? `u/${d.author}` : "",
          title: `${flair}${d.title || ""}`,
          text: d.selftext || "",
          url: `https://www.reddit.com${d.permalink}`,
          createdAt: Math.floor(d.created_utc || 0),
          strict: group.strict,
        });
      }
    } catch (e) {
      errors.push(`${group.subs[0]}+… ${e.message.slice(0, 90)}`);
    }
    await sleep(700);
  }

  if (errors.length && !out.length) throw new Error(errors[0]);
  if (errors.length) ctx.warn("reddit:partial", `Some Reddit groups failed: ${errors[0]}`);
  return out;
}

module.exports = { key, name, collect };
