#!/usr/bin/env node
"use strict";
/**
 * JOB HUNTER BOT
 *
 *   fetch posts  →  keyword filter (free)  →  AI check (free tier)  →  Telegram alert
 *
 * Usage:
 *   node src/index.js          normal run
 *   node src/index.js --dry    print alerts to the console, send nothing, save nothing
 *   node src/index.js --ping   send a test message to Telegram and exit
 */
const { loadEnv, log, sleep } = require("./util");
loadEnv();

const cfg = require("./config");
const state = require("./state");
const { scorePost } = require("./matcher");
const { classify, isAlertable, describeAi } = require("./classifier");
const notify = require("./notify");
const { enabledSources } = require("./sources");

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry") || cfg.dryRun;

async function main() {
  const hasTelegram = Boolean(cfg.telegram.token && cfg.telegram.chatId);
  if (!hasTelegram && !DRY) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID. Add them as GitHub Secrets (or in .env locally).");
    process.exit(1);
  }

  if (args.has("--ping")) {
    await notify.send(cfg, "✅ <b>Job Hunter connected.</b>\nLead alerts will arrive in this chat.");
    log("Test message sent to Telegram.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const st = state.load();
  const warnings = [];
  const ctx = {
    now,
    warn: (key, msg) => {
      warnings.push({ key, msg });
      log("WARN", msg);
    },
  };

  const sources = enabledSources(cfg);
  const aiMode = describeAi(cfg);
  log(`Sources: ${sources.map((s) => s.name).join(", ") || "none"}`);
  log(`AI: ${aiMode}${DRY ? "   [DRY RUN]" : ""}`);

  // 1. Fetch every source in parallel. One failing source never stops the others.
  const settled = await Promise.allSettled(sources.map((s) => s.collect(cfg, st, ctx)));
  let posts = [];
  settled.forEach((r, i) => {
    const s = sources[i];
    if (r.status === "fulfilled") {
      log(`  ${s.name}: ${r.value.length} posts`);
      posts.push(...r.value);
    } else {
      ctx.warn(`source:${s.key}`, `${s.name} failed: ${(r.reason && r.reason.message) || r.reason}`);
    }
  });

  // 2. Remove duplicates, old posts, and anything already reviewed.
  const byId = new Map();
  for (const p of posts) if (p && p.id && p.url && !byId.has(p.id)) byId.set(p.id, p);
  posts = [...byId.values()];

  const fresh = posts.filter((p) => {
    if (!p.createdAt) return true;
    const limit = (p.maxAgeHours || cfg.maxPostAgeHours) * 3600;
    return now - p.createdAt <= limit;
  });
  const unseen = fresh.filter((p) => !state.isSeen(st, p.id));

  // 3. Keyword filter — free, checks every keyword against every post.
  const candidates = [];
  for (const post of unseen) {
    const match = scorePost(post);
    if (match.pass) candidates.push({ post, match });
  }
  candidates.sort((a, b) => b.match.score - a.match.score);
  log(`Scanned ${posts.length} | fresh ${fresh.length} | new ${unseen.length} | keyword matches ${candidates.length}`);

  const batch = candidates.slice(0, cfg.ai.maxPerRun);
  if (candidates.length > batch.length) {
    log(`${candidates.length - batch.length} lower-scored matches deferred to the next run.`);
  }

  // 4. AI check, then alert.
  const aiCtx = { exhausted: new Set(), warn: ctx.warn };
  let leads = 0;
  let sendFailures = 0;
  let reviewed = 0;

  for (let i = 0; i < batch.length; i++) {
    const { post, match } = batch[i];
    const v = await classify(post, match, cfg, aiCtx);
    reviewed++;
    const alert = isAlertable(v, cfg);
    const preview = (post.title || post.text).replace(/\s+/g, " ").slice(0, 70);
    log(`  ${alert ? "LEAD" : "skip"} ${String(v.confidence).padStart(3)}% [${v.mode}] ${post.source}: ${preview}`);

    let delivered = true;
    if (alert) {
      if (DRY) {
        console.log("\n" + notify.formatLead(post, v).replace(/<[^>]+>/g, "") + "\n");
        leads++;
      } else {
        try {
          await notify.sendLead(cfg, post, v);
          leads++;
          sendFailures = 0;
        } catch (e) {
          delivered = false;
          sendFailures++;
          log(`  Telegram send failed: ${e.message}`);
          if (e.fatal || sendFailures >= 3) {
            log("Stopping this run: Telegram is not accepting messages. Check the token and chat ID.");
            break;
          }
        }
      }
    }

    // Only remember a post once it's genuinely finished with:
    //  - a lead that failed to reach Telegram is kept and retried
    //  - a post the AI couldn't check (AI down) is kept, so the AI checks it next run
    const aiSkipped = v.aiFailed && !alert;
    if (delivered && !aiSkipped) state.markSeen(st, post.id, now);
    if (v.usedAI && i < batch.length - 1) await sleep(cfg.ai.delayMs);
  }

  state.bumpStats(st, now, { scanned: posts.length, reviewed, leads });

  if (DRY) {
    log(`Dry run finished. ${leads} lead(s) would have been sent. Nothing was saved.`);
    return;
  }

  try {
    await notify.maybeHeartbeat(cfg, st, now, sources.map((s) => s.name), aiMode);
    await notify.flushWarnings(cfg, st, now, warnings);
  } catch (e) {
    log(`Could not send status message: ${e.message}`);
  }

  state.prune(st, now);
  st.lastRun = now;
  state.save(st);
  log(`Done. ${leads} lead(s) sent.`);

  if (sendFailures >= 3) process.exitCode = 1; // makes the GitHub run show red so you notice
}

main().catch((e) => {
  console.error("Fatal:", e && e.stack ? e.stack : e);
  process.exit(1);
});