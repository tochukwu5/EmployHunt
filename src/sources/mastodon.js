"use strict";
/**
 * MASTODON — free, no account needed.
 *
 * Reads public hashtag timelines (#hiring, #getfedihired, #freelance, ...) on a few
 * large instances, then matches keywords locally. The same post often appears on
 * several instances, so we de-duplicate on its canonical URI.
 */
const { fetchJson, htmlToText, sleep, toEpoch } = require("../util");

const key = "mastodon";
const name = "Mastodon";

async function collect(cfg, st, ctx) {
  const mc = cfg.sources.mastodon;
  const out = [];
  const errors = [];

  for (const inst of mc.instances) {
    for (const tag of mc.hashtags) {
      try {
        const res = await fetchJson(
          `https://${inst}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40`,
          { headers: { Accept: "application/json" } },
          { retries: 1 }
        );
        for (const s of Array.isArray(res) ? res : []) {
          if (!s || s.reblog) continue;
          const text = htmlToText(`${s.spoiler_text ? s.spoiler_text + "\n" : ""}${s.content || ""}`);
          out.push({
            id: `masto:${s.uri || s.url || s.id}`,
            source: name,
            where: `#${tag}`,
            author: s.account && s.account.acct ? `@${s.account.acct}` : "",
            title: "",
            text,
            url: s.url || s.uri,
            createdAt: toEpoch(s.created_at),
            strict: true,
          });
        }
      } catch (e) {
        errors.push(`${inst} #${tag}: ${e.message.slice(0, 70)}`);
      }
      await sleep(250);
    }
  }

  if (errors.length && !out.length) throw new Error(errors[0]);
  return out;
}

module.exports = { key, name, collect };
