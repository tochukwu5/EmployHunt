"use strict";
/**
 * All settings live here. Anything in UPPERCASE can be overridden with an
 * environment variable (a GitHub Secret or Variable), so you rarely need to
 * edit this file after setup.
 */
const env = process.env;
const str = (v, d) => (v === undefined || v === "" ? d : v);
const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));

/**
 * YOUR PROFILE — the AI reads this to judge whether a post fits you.
 * Edit freely. Be honest about weak areas so it filters them out.
 */
const profile = `
Tochi — full-stack MERN developer (React, Next.js, Node.js, Express, MongoDB, Tailwind) with 4+ years of experience.
Active futures trader (NQ, ES, Gold) with deep knowledge of order flow, ICT concepts, market structure and prop firm rules.

Has built: multi-timeframe TradingView Pine Script indicators, Telegram trading alert bots, trading dashboards,
prop firm tools, a stablecoin payments platform with smart contracts, and business websites.

Uses AI-assisted development, so he can take on almost any web project: websites, landing pages, web apps,
SaaS MVPs, dashboards, admin panels, internal tools, API integrations, bots, scrapers and automations.

STRONGEST FIT: trading tools (Pine Script, TradingView indicators/alerts, trading bots, dashboards, journals,
backtesters), fintech and crypto web apps, websites and landing pages, SaaS MVPs, automations.

WEAK FIT: native-only iOS/Android apps, game development, hardware/embedded, pure graphic design or logos,
video editing, academic ML research, unpaid or equity-only work.
`.trim();

module.exports = {
  profile,

  telegram: {
    token: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  },

  ai: {
    groqKey: env.GROQ_API_KEY,
    groqModel: str(env.GROQ_MODEL, "openai/gpt-oss-120b"),
    groqFallbackModel: str(env.GROQ_FALLBACK_MODEL, "openai/gpt-oss-20b"),
    geminiKey: env.GEMINI_API_KEY,
    geminiModel: str(env.GEMINI_MODEL, "gemini-2.5-flash"),
    // Only alert when the AI is at least this confident it's a real client lead.
    minConfidence: num(env.MIN_CONFIDENCE, 60),
    // Cap on AI checks per run. Highest-scoring posts go first; the rest wait for the next run.
    maxPerRun: num(env.MAX_AI_CALLS_PER_RUN, 25),
    // Pause between AI calls. Keeps us inside Groq's free per-minute token limit (8,000 tokens/min).
    delayMs: num(env.AI_DELAY_MS, 8000),
  },

  // Ignore posts older than this. Older posts have usually already been answered.
  // 12 hours still covers any missed hourly runs.
  maxPostAgeHours: num(env.MAX_POST_AGE_HOURS, 12),
  // How many Bluesky search phrases to run each time (they rotate through the full list).
  searchQueriesPerRun: num(env.SEARCH_QUERIES_PER_RUN, 24),
  // Also alert on full-time job postings, not only freelance gigs.
  includeFulltime: bool(env.INCLUDE_FULLTIME, true),
  // Daily "bot is alive" summary, sent on the first run after this UTC hour. 7 UTC = 8am in Nigeria.
  heartbeatHourUtc: num(env.HEARTBEAT_HOUR_UTC, 7),
  dryRun: bool(env.DRY_RUN, false),

  sources: {
    reddit: {
      enabled: bool(env.ENABLE_REDDIT, true),
      clientId: env.REDDIT_CLIENT_ID,
      clientSecret: env.REDDIT_CLIENT_SECRET,
      userAgent: `node:job-hunter-bot:1.0 (by /u/${str(env.REDDIT_USERNAME, "jobhunter")})`,
      // strict = only strong intent qualifies (for busy discussion subs, to cut noise).
      groups: [
        { strict: false, subs: ["forhire", "hiring", "slavelabour", "jobbit", "freelance_forhire", "DoneDirtCheap"] },
        { strict: true, subs: ["pinescript", "TradingView", "algotrading", "Daytrading", "Forex", "FuturesTrading"] },
        { strict: true, subs: ["startups", "Entrepreneur", "smallbusiness", "SaaS", "SideProject", "cofounder"] },
        { strict: true, subs: ["nocode", "Automate", "shopify", "EntrepreneurRideAlong", "indiehackers"] },
      ],
    },

    hackernews: {
      enabled: bool(env.ENABLE_HACKERNEWS, true),
      // The monthly "Freelancer? Seeking freelancer?" thread stays useful for a week.
      threadMaxAgeHours: 24 * 7,
      queriesPerRun: 3,
    },

    bluesky: {
      enabled: bool(env.ENABLE_BLUESKY, true),
      handle: env.BLUESKY_HANDLE,
      appPassword: env.BLUESKY_APP_PASSWORD,
    },

    mastodon: {
      enabled: bool(env.ENABLE_MASTODON, true),
      instances: ["mastodon.social", "hachyderm.io", "fosstodon.org"],
      hashtags: ["hiring", "getfedihired", "fedihired", "freelance", "webdev", "webdevelopment", "lookingfor"],
    },

    twitter: {
      // Paid — via twitterapi.io, ~$0.15 per 1,000 tweets returned. Off by default so it
      // never turns on (and never costs anything) without you explicitly setting it up.
      enabled: bool(env.ENABLE_TWITTER, false),
      apiKey: env.TWITTERAPI_KEY,
    },
  },
};
