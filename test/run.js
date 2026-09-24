"use strict";
/**
 * Offline tests — no API keys or internet needed.  Run with:  npm test
 * They prove the filter separates real clients from sellers and noise.
 */
const assert = require("assert");
const { scorePost } = require("../src/matcher");
const { parseVerdict, rulesVerdict, extractBudget, isAlertable, errorText } = require("../src/classifier");
const { formatLead } = require("../src/notify");
const { rotate } = require("../src/state");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    failed++;
    console.log("  ✗", name, "\n     ", e.message);
  }
}

const P = (title, text, extra = {}) => ({ title, text, strict: false, ...extra });

console.log("\nMatcher — should find real clients");
test("Reddit [Hiring] flair", () => {
  const r = scorePost(P("[Hiring] Need a React dev for dashboard", "Budget $800. Must know Node."));
  assert.ok(r.pass, r.reason);
});
test("Trading request: indicator", () => {
  const r = scorePost(P("", "I need a TradingView indicator that alerts me when price taps a 4H FVG"));
  assert.ok(r.pass, r.reason);
  assert.strictEqual(r.category, "trading");
});
test("Trading request: automate strategy", () => {
  const r = scorePost(P("", "I have a trading strategy I want to automate on MT5, who can help?"));
  assert.ok(r.pass, r.reason);
  assert.strictEqual(r.category, "trading");
});
test("Weak intent + topic on a hiring board", () => {
  const r = scorePost(P("", "anyone know someone who can set up a shopify store for my brand?"));
  assert.ok(r.pass, r.reason);
  assert.strictEqual(r.category, "ecommerce");
});
test("Hacker News SEEKING FREELANCER", () => {
  const r = scorePost(P("", "SEEKING FREELANCER | Remote | React + Node to build our trading journal app"));
  assert.ok(r.pass, r.reason);
});
test("slavelabour [Task]", () => {
  const r = scorePost(P("[Task] Scrape 200 product pages into a spreadsheet", "Paying $40"));
  assert.ok(r.pass, r.reason);
});
test("Plural still matches ('trading bots')", () => {
  const r = scorePost(P("", "Can someone build me a couple of trading bots for crypto?"));
  assert.ok(r.pass, r.reason);
});
test("Client mentioning 'available for work' deep in the post is NOT rejected", () => {
  const long = "We need a developer to build a booking website for our clinic. ".repeat(6);
  const r = scorePost(P("Need a developer for clinic booking site", long + " Please only reply if you are available for work this month."));
  assert.ok(r.pass, r.reason);
});
test("Hiring tag beats a seller phrase", () => {
  const r = scorePost(P("[Hiring] web developer", "Hire me? No — we're hiring you. Need a landing page."));
  assert.ok(r.pass, r.reason);
});

console.log("\nMatcher — should reject sellers and noise");
test("Reddit [For Hire]", () => {
  assert.ok(!scorePost(P("[For Hire] Full stack developer", "Need a website? I can build it.")).pass);
});
test("slavelabour [Offer]", () => {
  assert.ok(!scorePost(P("[Offer] I will build your website for $50", "")).pass);
});
test("Hacker News SEEKING WORK", () => {
  assert.ok(!scorePost(P("", "SEEKING WORK | Remote | React, Node, 6 yrs")).pass);
});
test("Untagged seller", () => {
  assert.ok(!scorePost(P("", "I build websites for small businesses. DM me for rates!")).pass);
});
test("Rhetorical seller hook", () => {
  assert.ok(!scorePost(P("", "Need a website? I design fast modern sites. Portfolio in bio.")).pass);
});
test("Job seeker", () => {
  assert.ok(!scorePost(P("", "Open to work! Frontend developer looking for my next role #opentowork")).pass);
});
test("Plain discussion, no intent", () => {
  assert.ok(!scorePost(P("", "Pine Script v6 finally has proper arrays, love it")).pass);
});
test("Weak intent without a topic", () => {
  assert.ok(!scorePost(P("", "can someone explain why the market dumped today?")).pass);
});
test("Weak intent is not enough on a strict (busy) source", () => {
  const r = scorePost(P("", "anyone know a good indicator for scalping?", { strict: true }));
  assert.ok(!r.pass, r.reason);
});
test("Strong intent still passes on a strict source", () => {
  const r = scorePost(P("", "I need an indicator that marks the opening range", { strict: true }));
  assert.ok(r.pass, r.reason);
});
test("Word boundary: 'idea developer' is not 'ea developer'", () => {
  const r = scorePost(P("", "great idea developer community meetup tonight"));
  assert.ok(!r.pass);
  assert.ok(!(r.topics && r.topics.trading));
});

console.log("\nMatcher — ranking");
test("Trading leads score above generic ones", () => {
  const t = scorePost(P("", "Need a developer to build a TradingView indicator"));
  const g = scorePost(P("", "Need a developer to build a website"));
  assert.ok(t.score > g.score, `${t.score} vs ${g.score}`);
});

console.log("\nAI output parsing");
test("Clean JSON", () => {
  const v = parseVerdict('{"is_lead":true,"confidence":88,"category":"trading","job_type":"freelance","need":"NQ alert bot","budget":"$300","fit":"high","red_flags":"none","reply_angle":"Hi"}');
  assert.strictEqual(v.isLead, true);
  assert.strictEqual(v.confidence, 88);
  assert.strictEqual(v.category, "trading");
});
test("JSON wrapped in ``` fences", () => {
  const v = parseVerdict('```json\n{"is_lead":false,"confidence":20,"category":"web"}\n```');
  assert.strictEqual(v.isLead, false);
});
test("Bad values get safe defaults", () => {
  const v = parseVerdict('{"is_lead":"true","confidence":"250","category":"banana","fit":"amazing"}');
  assert.strictEqual(v.isLead, true);
  assert.strictEqual(v.confidence, 100);
  assert.strictEqual(v.category, "other");
  assert.strictEqual(v.fit, "medium");
});
test("Garbage returns null (falls back to rules)", () => {
  assert.strictEqual(parseVerdict("Sure! Here you go:"), null);
});

console.log("\nRules fallback");
test("Budget extraction", () => {
  assert.strictEqual(extractBudget("budget is $500 - $800 max"), "$500-$800");
  assert.strictEqual(extractBudget("paying $1.5k"), "$1.5k");
});
test("Strong match clears the bar without AI", () => {
  const m = scorePost(P("[Hiring] Need a developer", "Build a trading dashboard"));
  const v = rulesVerdict(P("[Hiring] Need a developer", "Build a trading dashboard"), m);
  assert.ok(isAlertable(v, { ai: { minConfidence: 60 }, includeFulltime: true }));
});
test("Weak match does NOT clear the bar without AI", () => {
  const post = P("", "anyone know someone for a website?");
  const m = scorePost(post);
  const v = rulesVerdict(post, m);
  assert.ok(!isAlertable(v, { ai: { minConfidence: 60 }, includeFulltime: true }), `conf ${v.confidence}`);
});

console.log("\nReal junk from the first live run — must never alert");
const JUNK = [
  ["Seller introducing themselves", "💻 Need a Website for Your Business? I’m a Web Developer creating modern, responsive & professional websites at affordable prices."],
  ["Marketplace ad", "Hire a Professional Web Designer on Mitlance !! If you need a website that looks great, works well, and represents your business online"],
  ["Recommending someone", "Ladies, if you need a website, let me know! Absolutely nailed my vision, professional, and done in under a week!"],
  ["Opinion with a negation", "Your recomp project doesn't need a website that looks like every other VC-backed developer tool's website, i promise."],
  ["Article intro", "Website Development vs Website Builder: Which Is Better? When you need a website, the first big decision is how to build it."],
  ["Poetry", "She who can build a thing, can destroy a thing."],
  ["Joke", "Can someone build a time machine real quick? I'd like to go back and tell 15yo me something."],
];
for (const [name, text] of JUNK) {
  test(name, () => {
    const r = scorePost(P("", text));
    if (r.pass) {
      // If keywords let it through, rules mode must still refuse to alert on it.
      const v = rulesVerdict(P("", text), r);
      assert.ok(!isAlertable(v, { ai: { minConfidence: 60 }, includeFulltime: true }), "would alert: " + r.reason);
    }
  });
}
test("A genuine need still reaches the AI", () => {
  const r = scorePost(P("", "Realizing I need a website for the upcoming January thing I still can't talk about yet"));
  assert.ok(r.pass, r.reason);
});
test("...but without AI it is NOT sent as a guess", () => {
  const post = P("", "Realizing I need a website for the upcoming January thing");
  const v = rulesVerdict(post, scorePost(post));
  assert.ok(!isAlertable(v, { ai: { minConfidence: 60 }, includeFulltime: true }));
});
test("An ad that slips past keywords is still blocked without AI", () => {
  const post = P("", "Stop searching for clients. Find businesses that need a website. HungryDevs is free in open beta");
  const v = rulesVerdict(post, scorePost(post));
  assert.ok(!isAlertable(v, { ai: { minConfidence: 60 }, includeFulltime: true }));
});

console.log("\nAI error reporting");
test("Reads the message from a Groq error", () => {
  const t = errorText('{"error":{"message":"The model llama-3.3-70b-versatile does not exist or you do not have access to it.","type":"invalid_request_error"}}');
  assert.ok(t.includes("does not exist"), t);
});
test("Reads the message from a Gemini error", () => {
  assert.ok(errorText('{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}').includes("not found"));
});

console.log("\nTelegram formatting");
test("HTML special characters are escaped", () => {
  const html = formatLead(
    { source: "Reddit", where: "r/test", author: "u/x", url: "https://x.com/?a=1&b=2", createdAt: 0 },
    { confidence: 90, category: "web", need: "Fix <script> & stuff", budget: "$5", fit: "high", jobType: "freelance", redFlags: "none", replyAngle: "", mode: "groq" }
  );
  assert.ok(html.includes("Fix &lt;script&gt; &amp; stuff"));
  assert.ok(html.includes('href="https://x.com/?a=1&amp;b=2"'));
  assert.ok(!html.includes("<script>"));
});

console.log("\nQuery rotation");
test("Rotates through the list and wraps around", () => {
  const st = { cursors: {} };
  const list = ["a", "b", "c", "d", "e"];
  assert.deepStrictEqual(rotate(st, "k", list, 2), ["a", "b"]);
  assert.deepStrictEqual(rotate(st, "k", list, 2), ["c", "d"]);
  assert.deepStrictEqual(rotate(st, "k", list, 2), ["e", "a"]);
});

async function runTwitterTests() {
  console.log("\nTwitter/X source integration");
  const twitterSrc = require("../src/sources/twitter");
  const now = Math.floor(Date.now() / 1000);

  // No API key configured — should warn and return empty, never throw
  {
    const cfg = { sources: { twitter: { apiKey: undefined } }, maxPostAgeHours: 12, searchQueriesPerRun: 2 };
    const st = { cursors: {} };
    let warned = false;
    const ctx = { now, warn: () => { warned = true; } };
    const posts = await twitterSrc.collect(cfg, st, ctx);
    test("Missing API key warns and returns no posts (never throws)", () => {
      assert.strictEqual(posts.length, 0);
      assert.ok(warned);
    });
  }

  // Real API shape (from twitterapi.io docs) — replies must be dropped, auth header required
  {
    const REAL_SHAPE = {
      tweets: [
        { id: "1", url: "https://x.com/a/status/1", text: "Need a developer for our trading dashboard", createdAt: "Wed Sep 24 10:00:00 +0000 2026", isReply: false, author: { userName: "client1" } },
        { id: "2", url: "https://x.com/b/status/2", text: "same, need a developer too lol", createdAt: "Wed Sep 24 10:05:00 +0000 2026", isReply: true, author: { userName: "replier" } },
      ],
      has_next_page: false, next_cursor: "",
    };
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (!opts || opts.headers["X-API-Key"] !== "k") throw new Error("auth header missing");
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(REAL_SHAPE) };
    };
    const cfg = { sources: { twitter: { apiKey: "k" } }, maxPostAgeHours: 12, searchQueriesPerRun: 1 };
    const st = { cursors: {} };
    const ctx = { now, warn: () => {} };
    const posts = await twitterSrc.collect(cfg, st, ctx);
    global.fetch = origFetch;

    test("Real API response: reply is dropped, original tweet kept", () => {
      assert.strictEqual(posts.length, 1);
      assert.strictEqual(posts[0].id, "twitter:1");
      assert.strictEqual(posts[0].author, "@client1");
    });
    test("Twitter dates parse to a sane Unix timestamp", () => {
      assert.ok(posts[0].createdAt > 1_700_000_000 && posts[0].createdAt < 2_000_000_000);
    });
  }

  // 401 should stop immediately, not burn every remaining rotated query
  {
    let calls = 0;
    const origFetch = global.fetch;
    global.fetch = async () => {
      calls++;
      return { ok: false, status: 401, headers: { get: () => null }, text: async () => "{}" };
    };
    const cfg = { sources: { twitter: { apiKey: "bad" } }, maxPostAgeHours: 12, searchQueriesPerRun: 10 };
    const st = { cursors: {} };
    const ctx = { now, warn: () => {} };
    let threw = false;
    try {
      await twitterSrc.collect(cfg, st, ctx);
    } catch {
      threw = true;
    }
    global.fetch = origFetch;
    test("A rejected (401) key stops after 1 call, not all 10 queries", () => {
      assert.ok(threw);
      assert.strictEqual(calls, 1);
    });
  }
}

runTwitterTests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
});