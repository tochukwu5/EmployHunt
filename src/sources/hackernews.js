"use strict";
/**
 * HACKER NEWS — free, no API key.
 *
 * 1. The monthly "Ask HN: Freelancer? Seeking freelancer?" thread. Replies start with
 *    either "SEEKING WORK" (a freelancer — rejected) or "SEEKING FREELANCER" (a client — lead).
 *    Very small volume, very high quality.
 * 2. A few rotating searches over recent stories.
 */
const { fetchJson, htmlToText, sleep, toEpoch } = require("../util");
const { rotate } = require("../state");
const { SEARCH_QUERIES } = require("../keywords");

const key = "hackernews";
const name = "Hacker News";
const API = "https://hn.algolia.com/api/v1";

async function freelancerThread(hc) {
  const res = await fetchJson(`${API}/search_by_date?tags=story,author_whoishiring&hitsPerPage=10`);
  const hit = (res.hits || []).find((h) => /seeking freelancer/i.test(h.title || ""));
  if (!hit) return [];

  const item = await fetchJson(`${API}/items/${hit.objectID}`, {}, { timeoutMs: 30000 });
  return (item.children || [])
    .filter((c) => c && c.text)
    .map((c) => ({
      id: `hn:${c.id}`,
      source: name,
      where: "Freelancer thread",
      author: c.author || "",
      title: "",
      text: htmlToText(c.text),
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      createdAt: c.created_at_i || toEpoch(c.created_at),
      maxAgeHours: hc.threadMaxAgeHours,
      strict: false,
    }));
}

async function searchStories(queries, since) {
  const out = [];
  for (const q of queries) {
    const url =
      `${API}/search_by_date?query=${encodeURIComponent(q)}&tags=story` +
      `&numericFilters=created_at_i>${since}&hitsPerPage=20`;
    const res = await fetchJson(url);
    for (const h of res.hits || []) {
      out.push({
        id: `hn:${h.objectID}`,
        source: name,
        where: "Stories",
        author: h.author || "",
        title: h.title || "",
        text: htmlToText(h.story_text || ""),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        createdAt: h.created_at_i || 0,
        strict: true,
      });
    }
    await sleep(300);
  }
  return out;
}

async function collect(cfg, st, ctx) {
  const hc = cfg.sources.hackernews;
  const since = ctx.now - cfg.maxPostAgeHours * 3600;
  const out = [];
  const errors = [];

  try {
    out.push(...(await freelancerThread(hc)));
  } catch (e) {
    errors.push(`thread: ${e.message.slice(0, 90)}`);
  }

  try {
    out.push(...(await searchStories(rotate(st, "hackernews", SEARCH_QUERIES, hc.queriesPerRun), since)));
  } catch (e) {
    errors.push(`search: ${e.message.slice(0, 90)}`);
  }

  if (errors.length && !out.length) throw new Error(errors[0]);
  return out;
}

module.exports = { key, name, collect };
