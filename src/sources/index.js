"use strict";
/**
 * SOURCE REGISTRY
 *
 * Every source exports: { key, name, collect(cfg, state, ctx) } and returns an array of posts:
 *   { id, source, where, author, title, text, url, createdAt, strict?, maxAgeHours? }
 *
 * To add a paid source later (X via twitterapi.io, Threads), copy _template.js,
 * add its settings under `sources` in config.js, and add it to the list below.
 */
const reddit = require("./reddit");
const hackernews = require("./hackernews");
const bluesky = require("./bluesky");
const mastodon = require("./mastodon");
const twitter = require("./twitter");

const ALL = [reddit, hackernews, bluesky, mastodon, twitter];

function enabledSources(cfg) {
  return ALL.filter((s) => cfg.sources[s.key] && cfg.sources[s.key].enabled);
}

module.exports = { ALL, enabledSources };