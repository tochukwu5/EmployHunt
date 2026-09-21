"use strict";
/**
 * Decides whether a keyword-matched post is a REAL client lead.
 *
 * Provider chain (all free tiers, no card needed):
 *   1. Groq  — llama-3.3-70b-versatile   (best quality)
 *   2. Groq  — llama-3.1-8b-instant      (much larger daily allowance)
 *   3. Gemini — gemini-2.5-flash         (independent backup)
 *   4. Rules — keyword score only        (always works, never blocks the bot)
 *
 * If a provider hits its limit or rejects the key, it's skipped for the rest of the run.
 */
const { sleep, log, clip } = require("./util");

const CATEGORIES = ["trading", "fintech", "web", "saas", "ecommerce", "automation", "realestate", "other"];

function systemPrompt(profile) {
  return `You screen social media posts to find CLIENT LEADS for one freelance developer.

DEVELOPER PROFILE:
${profile}

A post IS a lead only if the author (or their company) wants to PAY someone to build, fix, design,
integrate or automate something: a website, app, tool, bot, indicator, dashboard, automation or similar
software work.

A post is NOT a lead if:
- the author is a freelancer, agency or job-seeker offering their own services
- it is discussion, a tutorial, advice, news, a rant, or someone showing their own project
- they only want a quick free tip, not work done
- it is spam, a scam, "crypto recovery", MLM, or asks for something illegal or unethical

Set fit to "low" for equity-only or unpaid work, or work far outside the profile.

Return ONLY this JSON object, nothing else:
{"is_lead":true or false,"confidence":0-100,"category":"trading|fintech|web|saas|ecommerce|automation|realestate|other","job_type":"freelance|fulltime|unclear","need":"what they want built, max 15 words","budget":"the stated budget, or: not stated","fit":"high|medium|low","red_flags":"scam or quality concerns, or: none","reply_angle":"one natural opening sentence for his reply that references their exact need, no hype"}`;
}

function userPrompt(post) {
  return `Platform: ${post.source} (${post.where})
Title: ${post.title || "(none)"}
Post:
${String(post.text || "").slice(0, 1600)}`;
}

async function httpPost(url, headers, payload, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return {
      status: res.status,
      retryAfter: Number(res.headers.get("retry-after")) || 0,
      text: await res.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

const groq = (model, key) => ({
  id: `groq:${model}`,
  family: "groq",
  call: (sys, usr) =>
    httpPost(
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${key}` },
      {
        model,
        temperature: 0.1,
        max_tokens: 350,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
      }
    ),
  read: (text) => JSON.parse(text).choices?.[0]?.message?.content || "",
});

const gemini = (model, key) => ({
  id: `gemini:${model}`,
  family: "gemini",
  call: (sys, usr) => {
    const generationConfig = { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: "application/json" };
    // 2.5 Flash "thinks" by default and that can eat the whole output budget. Turn it off.
    if (/2\.5/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    return httpPost(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": key },
      {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: usr }] }],
        generationConfig,
      }
    );
  },
  read: (text) => (JSON.parse(text).candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""),
});

function providers(cfg) {
  const a = cfg.ai;
  const list = [];
  if (a.groqKey) {
    list.push(groq(a.groqModel, a.groqKey));
    if (a.groqFallbackModel && a.groqFallbackModel !== a.groqModel) list.push(groq(a.groqFallbackModel, a.groqKey));
  }
  if (a.geminiKey) list.push(gemini(a.geminiModel, a.geminiKey));
  return list;
}

function describeAi(cfg) {
  const p = providers(cfg).map((x) => x.id.split(":")[1]);
  return p.length ? p.join(" → ") + " → rules" : "Rules only (add GROQ_API_KEY for AI screening)";
}

const pick = (v, allowed, fallback) => {
  const s = String(v ?? "").toLowerCase().trim();
  return allowed.includes(s) ? s : fallback;
};

/** Turn raw model output into a clean verdict, or null if it's unusable. */
function parseVerdict(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j;
  try {
    j = JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null || !("is_lead" in j)) return null;
  return {
    isLead: j.is_lead === true || String(j.is_lead).toLowerCase() === "true",
    confidence: Math.max(0, Math.min(100, Math.round(Number(j.confidence) || 0))),
    category: pick(j.category, CATEGORIES, "other"),
    jobType: pick(j.job_type, ["freelance", "fulltime", "unclear"], "unclear"),
    need: clip(j.need, 140),
    budget: clip(j.budget, 60) || "not stated",
    fit: pick(j.fit, ["high", "medium", "low"], "medium"),
    redFlags: clip(j.red_flags, 160) || "none",
    replyAngle: clip(j.reply_angle, 240),
  };
}

function extractBudget(text) {
  const m = String(text || "").match(
    /\$\s?\d[\d,]*(?:\.\d+)?\s?[kK]?(?:\s?(?:-|to)\s?\$?\s?\d[\d,]*(?:\.\d+)?\s?[kK]?)?/
  );
  return m ? m[0].replace(/\s+/g, "") : "";
}

/** Fallback when no AI is available. Stricter by design: weak matches won't clear the bar. */
function rulesVerdict(post, match) {
  return {
    isLead: true,
    confidence: Math.min(90, 45 + match.score * 4),
    category: match.category,
    jobType: "unclear",
    need: clip(post.title || post.text, 140),
    budget: extractBudget(`${post.title} ${post.text}`) || "not stated",
    fit: match.category === "trading" || match.category === "fintech" ? "high" : "medium",
    redFlags: "none",
    replyAngle: "",
  };
}

async function classify(post, match, cfg, ctx) {
  const sys = systemPrompt(cfg.profile);
  const usr = userPrompt(post);
  const all = providers(cfg);

  for (const p of all) {
    if (ctx.exhausted.has(p.id)) continue;

    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await p.call(sys, usr);
      } catch (e) {
        log(`  AI ${p.id} network error: ${e.message}`);
        break;
      }

      if (r.status === 200) {
        let raw = "";
        try {
          raw = p.read(r.text);
        } catch {
          /* fall through */
        }
        const v = parseVerdict(raw);
        if (v) return { ...v, mode: p.id, usedAI: true };
        log(`  AI ${p.id} gave unusable output, trying next provider.`);
        break;
      }

      if (r.status === 429) {
        // Short wait = per-minute limit, worth one retry. Long wait = daily cap, move on.
        if (attempt === 0 && r.retryAfter > 0 && r.retryAfter <= 20) {
          await sleep(r.retryAfter * 1000 + 300);
          continue;
        }
        ctx.exhausted.add(p.id);
        log(`  AI ${p.id} limit reached, switching provider.`);
        break;
      }

      if (r.status === 401 || r.status === 403) {
        for (const q of all) if (q.family === p.family) ctx.exhausted.add(q.id);
        ctx.warn(`ai:${p.family}:auth`, `${p.family} rejected the API key (HTTP ${r.status}). Check the secret.`);
        break;
      }

      if (r.status >= 500 && attempt === 0) {
        await sleep(1500);
        continue;
      }

      log(`  AI ${p.id} HTTP ${r.status}: ${r.text.slice(0, 120).replace(/\s+/g, " ")}`);
      break;
    }
  }

  return { ...rulesVerdict(post, match), mode: "rules", usedAI: false };
}

function isAlertable(v, cfg) {
  if (!v.isLead) return false;
  if (v.confidence < cfg.ai.minConfidence) return false;
  if (v.fit === "low") return false;
  if (v.jobType === "fulltime" && !cfg.includeFulltime) return false;
  return true;
}

module.exports = { classify, isAlertable, parseVerdict, rulesVerdict, extractBudget, describeAi };
