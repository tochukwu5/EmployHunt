"use strict";
/**
 * KEYWORD BANK
 *
 * Built from your keyword list, reorganised around one idea:
 *   a real lead = INTENT (someone wants something done) + TOPIC (what they want)
 *
 * Matching is case-insensitive, respects word boundaries ("ea developer" will NOT
 * match "idea developer"), and allows a trailing "s" ("trading bot" matches "trading bots").
 *
 * All of these are checked LOCALLY against every fetched post — free and unlimited.
 * Only SEARCH_QUERIES are actually sent to platforms that need a search (Bluesky, Hacker News).
 */

/** Explicit hiring markers. One is enough, and it overrides seller signals. */
const HIRING_TAGS = [
  "[hiring", "[task", "[paid", "[job", "(hiring)",
  "seeking freelancer", "seeking freelancers", "seeking a freelancer",
];

/** Clear requests. Enough on their own to send the post for review. */
const STRONG_INTENT = [
  // general
  "need a website", "need website", "website needed", "looking for a website", "i need a site", "need a site",
  "looking for someone to build", "need someone to build", "need someone to code", "need this built",
  "looking for a developer", "looking for developer", "need a developer", "developer needed",
  "web developer needed", "looking for web developer", "looking for a web developer", "need a web developer",
  "hire a web developer", "hire a developer", "hiring a developer", "hiring web developer", "hiring a web developer",
  "looking for a coder", "need a coder", "coder needed", "looking for programmer", "looking for a programmer",
  "programmer needed", "need a programmer", "need a landing page", "landing page needed",
  "need an app built", "need a web app", "web app needed", "need help building",
  "recommend a developer", "recommend a web developer", "anyone know a developer", "anyone know a good developer",
  "need a freelancer", "looking for a freelancer", "freelancer needed", "freelance developer needed",
  "paid project", "paid gig", "freelance gig", "contract developer", "developer asap", "urgent developer",
  "project needs developer", "project needs a developer",
  // tech-specific requests
  "frontend developer needed", "front end developer needed", "full stack developer needed",
  "fullstack developer needed", "react developer needed", "javascript developer needed",
  "node developer needed", "next.js developer needed", "need a react developer", "need a full stack developer",
  // design/build asks
  "can someone design this", "can someone build this", "who can design this", "who can build this",
  "who can code this", "who can make this", "can anyone build this", "can anyone code this",
  "can someone build me", "can someone build a", "who can build me", "who can build a",
  "need help with my website", "need help with website", "website not working", "website isn't working",
  // trading — requests
  "i need an indicator that", "i need a tradingview indicator that", "can someone code this indicator",
  "can someone code this", "can someone turn this into an indicator", "can someone automate this",
  "looking for someone to automate", "need someone to automate", "need someone to automate my strategy",
  "i have a trading strategy i want to automate", "looking for a developer for my strategy",
  "need a trading website", "trading website needed", "need a trading tool", "trading tool needed",
  "need trading software", "need trading alerts", "need an indicator", "need indicator", "indicator needed",
  "pine script needed", "need pine script", "need a pine script", "pine script developer needed",
  "need a trading bot", "trading bot needed", "automate my strategy", "automate trading strategy",
  "automate my trading", "trading dashboard needed", "need a trading dashboard", "ea developer needed",
  "need an ea", "mt5 developer needed", "mt4 developer needed", "need a tradingview script",
  // tools & automation
  "i need a tool that", "looking for a tool that", "can someone build a tool", "need a dashboard for",
  "need automation", "automate my business", "need a chatbot", "need a bot", "need a scraper",
  "need an api integration", "api integration needed",
  // saas / startup
  "saas developer needed", "looking for saas developer", "build my saas", "mvp needed", "mvp developer",
  "need an mvp", "build my mvp", "startup needs developer", "startup needs a developer",
  "looking for technical cofounder", "looking for a technical cofounder", "need technical cofounder",
  "need a technical cofounder", "need someone to build my idea", "turn my idea into an app",
  "turn my idea into a website", "build my platform",
  // ecommerce / real estate
  "need an ecommerce website", "ecommerce website needed", "build my online store", "need an online store",
  "shopify developer needed", "need a shopify developer", "need a real estate website", "real estate website needed",
];

/** Softer signals. Only count when paired with a TOPIC, and only on non-strict sources. */
const WEAK_INTENT = [
  "looking for someone", "need someone", "need help", "anyone know", "recommend someone", "who can",
  "can someone", "is there anyone", "where can i find", "anyone able to build", "developer recommendations",
  "looking for recommendations", "any developers here", "i have an idea", "i have an app idea",
  "i have a website idea", "i have a saas idea", "i have a startup idea", "want to build", "trying to build",
  "looking to build", "help me build", "i need to build", "i want to build", "i wish there was",
  "someone should build", "why isn't there", "would be nice if there was", "i want to automate",
  "i wish i could automate", "is there a way to automate", "can this be automated", "is there a tool that",
  "does anyone know a tool", "looking for software", "need software for", "need a system for",
  "how do i automate", "how can i build this", "how do i build this", "how do i make this",
  "website redesign", "redesign my website", "website needs work", "my website needs", "hiring",
  "i've been wanting to build", "i've been thinking about building", "how can i turn this into",
  "i want alerts when",
];

/**
 * Seller / job-seeker signals. The author is OFFERING work, not buying it.
 * Only checked in the title and first 300 characters (sellers announce themselves early),
 * and skipped entirely when a HIRING_TAG is present.
 *
 * Note: "developer for hire" was in the original list as an intent phrase — it's almost
 * always a freelancer advertising, so it lives here instead.
 */
const NEGATIVE = [
  "[for hire", "(for hire)", "for hire]", "[offer", "seeking work", "looking for work", "looking for a job",
  "developer for hire", "designer for hire", "freelancer for hire", "coder for hire", "programmer for hire",
  "available for hire", "available for work", "available for freelance", "available for new projects",
  "available for projects", "open to work", "#opentowork", "open for work", "open to freelance",
  "open for freelance", "hire me", "dm me for", "dm for rates", "message me for rates",
  "looking for clients", "looking for new clients", "seeking clients", "taking on clients",
  "taking new clients", "accepting clients", "accepting new clients", "accepting new projects",
  "i build websites", "i build web apps", "i develop websites", "i create websites", "i design websites",
  "we build websites", "we develop websites", "i will build", "i'll build your", "i can build your",
  "i can build you", "offering my services", "my services include", "services i offer",
  "check out my portfolio", "view my portfolio", "slots open", "slots available", "spots open",
  "spots available", "commissions open", "job seeker",
  // rhetorical hooks sellers use ("Need a website? DM me!")
  "need a website?", "need an app?", "need a developer?", "looking for a developer?", "want a website?",
];

/** What they want. Used to confirm weak intent and to pick the alert category. */
const TOPICS = {
  trading: [
    "trading website", "trader website", "trading tool", "trading software", "trading app", "trading dashboard",
    "trading platform", "trading alert", "alert system", "custom alert", "strategy alert", "trade alert",
    "indicator", "custom indicator", "tradingview", "trading view", "pine script", "pinescript",
    "tradingview script", "tradingview bot", "tradingview automation", "alert bot", "trading bot",
    "automated trading", "trading automation", "strategy automation", "expert advisor", "ea developer",
    "mt4", "mt5", "metatrader", "mql4", "mql5", "forex bot", "forex website", "forex developer",
    "forex indicator", "forex dashboard", "crypto trading tool", "crypto dashboard", "crypto bot",
    "futures trading", "futures developer", "nq", "es futures", "es indicator", "nasdaq",
    "market scanner", "trading scanner", "stock scanner", "crypto scanner", "trade journal",
    "trading journal", "risk calculator", "position size calculator", "prop firm", "funded trader",
    "backtest", "backtesting", "backtester", "order flow", "ninjatrader", "sierra chart", "tradovate",
    "webhook", "strategy tester",
  ],
  fintech: [
    "fintech", "finance website", "investment website", "investment platform", "hedge fund", "brokerage",
    "crypto website", "crypto developer", "defi", "web3", "dapp", "smart contract", "blockchain",
    "stablecoin", "payment platform", "payments", "wallet", "remittance",
  ],
  saas: [
    "saas", "mvp", "startup", "dashboard", "admin panel", "internal tool", "internal dashboard", "crm",
    "portal", "client portal", "membership site", "membership website", "booking system", "booking website",
    "subscription", "marketplace", "directory", "platform", "web app", "web application", "webapp",
  ],
  automation: [
    "automation", "automate", "automated", "automating", "bot", "chatbot", "ai tool", "ai agent",
    "ai chatbot", "ai automation", "ai app", "ai website", "zapier", "n8n", "make.com", "scraper",
    "scraping", "scrape", "workflow", "integration", "api integration", "telegram bot", "discord bot",
    "whatsapp bot", "custom software", "custom tool", "custom system",
  ],
  ecommerce: [
    "ecommerce", "e-commerce", "online store", "online shop", "shopify", "woocommerce", "stripe",
    "payment integration", "checkout", "product store", "dropshipping",
  ],
  realestate: [
    "real estate", "property", "properties", "realtor", "rental", "property listing", "listing",
    "housing", "property management", "real estate crm",
  ],
  web: [
    "website", "web site", "landing page", "portfolio website", "personal website", "business website",
    "company website", "redesign", "wordpress", "webflow", "frontend", "front-end", "front end", "backend",
    "back-end", "full stack", "fullstack", "react", "next.js", "nextjs", "node.js", "nodejs", "javascript",
    "typescript", "mern", "tailwind", "mongodb", "firebase", "api", "rest api", "web developer",
    "web development", "web design", "ui/ux", "figma", "responsive",
  ],
};

/**
 * Phrases actually sent as searches to Bluesky and Hacker News, one at a time, rotating.
 * Each is a short exact phrase — combining keywords in one query returns poor results.
 * Keep these high-intent; the local matcher catches everything broader.
 */
const SEARCH_QUERIES = [
  "need a developer", "looking for a developer", "looking for a web developer", "need a web developer",
  "need a website", "need someone to build", "looking for someone to build", "who can build",
  "can someone build", "hiring a developer", "need a freelancer", "looking for a freelancer",
  "pine script developer", "need a pine script", "tradingview indicator", "need an indicator",
  "custom indicator", "trading bot developer", "need a trading bot", "automate my strategy",
  "automate my trading", "need a dashboard", "need a landing page", "build my mvp", "need an mvp",
  "technical cofounder", "need an app built", "need a web app", "i need a tool that",
  "looking for a tool that", "someone should build", "i wish there was a tool", "shopify developer",
  "need a react developer", "need a full stack developer", "looking for a coder", "need help building",
  "mt5 developer", "website redesign", "need automation",
];

module.exports = { HIRING_TAGS, STRONG_INTENT, WEAK_INTENT, NEGATIVE, TOPICS, SEARCH_QUERIES };
