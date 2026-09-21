"use strict";
/**
 * Scores a post against the keyword bank. Runs locally — no API cost.
 *
 * A post qualifies for AI review when it has:
 *   - a hiring tag (e.g. "[Hiring]", "SEEKING FREELANCER"), or
 *   - a strong request ("need a developer", "can someone code this indicator"), or
 *   - weak intent + a topic, on a non-strict source ("anyone know..." + "shopify")
 *
 * Seller posts ("[For Hire]", "available for work") are rejected first.
 */
const K = require("./keywords");

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary aware, allows an optional plural "s". Compiled once at startup. */
function compile(list) {
  return list.map((k) => ({
    k,
    re: new RegExp(`(?:^|[^a-z0-9])${escRe(norm(k))}s?(?=$|[^a-z0-9])`),
  }));
}

const C = {
  tags: compile(K.HIRING_TAGS),
  strong: compile(K.STRONG_INTENT),
  weak: compile(K.WEAK_INTENT),
  neg: compile(K.NEGATIVE),
  topics: Object.fromEntries(Object.entries(K.TOPICS).map(([cat, list]) => [cat, compile(list)])),
};

const hits = (text, list) => list.filter((x) => x.re.test(text)).map((x) => x.k);

// When topics tie, the earlier category wins — your niche comes first.
const PRIORITY = ["trading", "fintech", "saas", "automation", "ecommerce", "realestate", "web"];

function pickCategory(topicHits) {
  let best = "other";
  let most = 0;
  for (const cat of PRIORITY) {
    const n = (topicHits[cat] || []).length;
    if (n > most) {
      best = cat;
      most = n;
    }
  }
  return best;
}

function scorePost(post) {
  const title = norm(post.title);
  const body = norm(post.text);
  const full = `${title} \n ${body}`.trim();
  const head = `${title} ${body.slice(0, 300)}`;

  const tags = hits(full, C.tags);

  // Sellers announce themselves early. An explicit hiring tag always wins.
  const negatives = tags.length ? [] : hits(head, C.neg);
  if (negatives.length) {
    return { pass: false, score: 0, category: "other", reason: `seller signal "${negatives[0]}"` };
  }

  const strong = hits(full, C.strong);
  const weak = hits(full, C.weak);

  const topicHits = {};
  let topicCount = 0;
  for (const [cat, list] of Object.entries(C.topics)) {
    const h = hits(full, list);
    if (h.length) {
      topicHits[cat] = h;
      topicCount += h.length;
    }
  }

  let pass = false;
  let reason;
  if (tags.length) {
    pass = true;
    reason = `tag "${tags[0]}"`;
  } else if (strong.length) {
    pass = true;
    reason = `request "${strong[0]}"`;
  } else if (weak.length && topicCount && !post.strict) {
    pass = true;
    reason = `"${weak[0]}" + topic`;
  } else if (weak.length && topicCount && post.strict) {
    reason = "weak intent on a busy discussion source";
  } else if (weak.length) {
    reason = "intent but no topic";
  } else {
    reason = "no intent";
  }

  let score = tags.length * 5 + strong.length * 3 + weak.length + Math.min(topicCount, 5);
  if (topicHits.trading) score += 3; // your niche
  else if (topicHits.fintech) score += 2;

  return { pass, score, category: pickCategory(topicHits), reason, tags, strong, weak, topics: topicHits };
}

module.exports = { scorePost, norm };
