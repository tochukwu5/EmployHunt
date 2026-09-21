"use strict";
/**
 * Telegram alerts: one message per lead, a daily health check, and error warnings.
 */
const { sleep, esc, escAttr, ago, dateOf } = require("./util");

const EMOJI = {
  trading: "📈", fintech: "💳", web: "🌐", saas: "🚀",
  ecommerce: "🛒", automation: "⚙️", realestate: "🏠", other: "💼",
};
const LABEL = {
  trading: "Trading", fintech: "Fintech", web: "Web", saas: "SaaS / App",
  ecommerce: "E-commerce", automation: "Automation", realestate: "Real estate", other: "Other",
};
const JOB = { freelance: "Freelance", fulltime: "Full-time job", unclear: "Type unclear" };

function formatLead(post, v) {
  const badge = v.confidence >= 80 ? "🟢" : v.confidence >= 65 ? "🟡" : "🟠";
  const cat = v.category in LABEL ? v.category : "other";
  const L = [];

  L.push(`${badge} <b>NEW LEAD</b> · ${EMOJI[cat]} ${LABEL[cat]} · ${v.confidence}%`);
  L.push("");
  L.push(`<b>Need:</b> ${esc(v.need || "(open the post)")}`);
  L.push(`<b>Budget:</b> ${esc(v.budget)}`);
  L.push(`<b>Fit:</b> ${esc(v.fit.toUpperCase())} · ${esc(JOB[v.jobType] || "Type unclear")}`);
  L.push(`<b>Where:</b> ${esc(post.source)} · ${esc(post.where)}${post.createdAt ? " · " + ago(post.createdAt) : ""}`);
  if (post.author) L.push(`<b>By:</b> ${esc(post.author)}`);

  if (v.replyAngle) {
    L.push("");
    L.push(`💬 <i>${esc(v.replyAngle)}</i>`);
  }
  if (v.redFlags && !/^none\.?$/i.test(v.redFlags.trim())) {
    L.push("");
    L.push(`⚠️ ${esc(v.redFlags)}`);
  }

  L.push("");
  L.push(`🔗 <a href="${escAttr(post.url)}">Open post</a>`);
  if (v.mode === "rules") L.push(`<i>Keyword match only, not AI-checked</i>`);
  return L.join("\n");
}

/** Send one message. Retries Telegram's own rate limit; throws on a bad token or chat ID. */
async function send(cfg, html) {
  const url = `https://api.telegram.org/bot${cfg.telegram.token}/sendMessage`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.telegram.chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.ok) return;
    if (res.status === 429) {
      await sleep(((j.parameters && j.parameters.retry_after) || 3) * 1000 + 300);
      continue;
    }
    const err = new Error(`Telegram HTTP ${res.status}: ${j.description || "unknown error"}`);
    err.fatal = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404;
    throw err;
  }
  throw new Error("Telegram kept rate-limiting");
}

async function sendLead(cfg, post, v) {
  await send(cfg, formatLead(post, v));
  await sleep(1100); // stay well under Telegram's per-chat limit
}

async function flushWarnings(cfg, st, now, warnings) {
  const today = dateOf(now);
  const fresh = [];
  const seen = new Set();
  for (const w of warnings) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    if (st.warned[w.key] === today) continue;
    st.warned[w.key] = today;
    fresh.push(w);
  }
  if (!fresh.length) return;
  await send(
    cfg,
    `⚠️ <b>Job Hunter warnings</b>\n\n${fresh.map((w) => "• " + esc(w.msg)).join("\n")}\n\n<i>Each warning is sent at most once a day.</i>`
  );
}

async function maybeHeartbeat(cfg, st, now, sourceNames, aiMode) {
  const today = dateOf(now);
  if (new Date(now * 1000).getUTCHours() < cfg.heartbeatHourUtc || st.lastHeartbeat === today) return;
  const y = st.stats[dateOf(now - 86400)] || { runs: 0, scanned: 0, reviewed: 0, leads: 0 };
  await send(
    cfg,
    `✅ <b>Job Hunter daily check</b>\n\n` +
      `<b>Yesterday:</b> ${y.runs} runs · ${y.scanned.toLocaleString()} posts scanned · ${y.reviewed} reviewed · <b>${y.leads} leads</b>\n` +
      `<b>Sources:</b> ${esc(sourceNames.join(", ") || "none")}\n` +
      `<b>AI:</b> ${esc(aiMode)}`
  );
  st.lastHeartbeat = today;
}

module.exports = { send, sendLead, formatLead, flushWarnings, maybeHeartbeat };
