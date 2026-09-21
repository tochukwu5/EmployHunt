# Job Hunter Bot

Scans Reddit, Hacker News, Bluesky and Mastodon every hour for people who want to **hire** someone
to build something, then sends each real lead to your Telegram with a suggested opening line.

```
fetch posts  →  keyword filter (free)  →  AI check (free)  →  Telegram alert
```

- **Cost: $0.** Runs on GitHub Actions' free tier. AI uses Groq's free tier.
- **No `npm install`.** Zero dependencies — only Node's built-in tools.
- **Never alerts twice** on the same post.
- **Never loses a lead** if Telegram is briefly down — it retries next run.
- **Keeps working if the free AI runs out** — it falls back automatically.

---

## Setup — about 20 minutes

### Step 1 — Create a Telegram bot

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Pick a name, e.g. `Lead Hunter`, and a username ending in `bot`.
3. Copy the **token** it gives you. That's your `TELEGRAM_BOT_TOKEN`.
4. Open your new bot and press **Start** (it can't message you until you do).
5. Visit this in a browser, replacing `YOUR_TOKEN`:
   `https://api.telegram.org/botYOUR_TOKEN/getUpdates`
6. Find `"chat":{"id":123456789` — that number is your `TELEGRAM_CHAT_ID`.

> You can reuse your FVGFisher bot, but a separate one keeps lead alerts away from trading alerts.

### Step 2 — Get a free Groq AI key (strongly recommended)

1. Go to **console.groq.com** and sign up. No card needed.
2. Open **API Keys** → **Create API Key**.
3. Copy it. That's your `GROQ_API_KEY`.

**Why this matters:** without it the bot uses keywords only, and some noise gets through.
For example, a post saying *"if you need a developer, always check references"* contains a hiring
phrase but isn't a client. The AI filters that out. Keywords alone can't.

### Step 3 — Free Gemini backup key (optional)

Used only if Groq hits its daily limit.

1. Go to **aistudio.google.com** → **Get API key**. No card needed.
2. Copy it. That's your `GEMINI_API_KEY`.

### Step 4 — Bluesky (optional but recommended)

Bluesky search needs a login. Use an **app password**, never your real password.

1. Create a free account at **bsky.app** if you don't have one.
2. **Settings → Privacy and security → App passwords → Add App Password**.
3. `BLUESKY_HANDLE` is your handle, e.g. `tochi.bsky.social`.
4. `BLUESKY_APP_PASSWORD` is the password it generates.

### Step 5 — Reddit (optional)

Reddit works without this, but with credentials it's more reliable.

1. Go to **reddit.com/prefs/apps** → **create another app**.
2. Choose **script**. Redirect URI: `http://localhost`.
3. The string under the app name is `REDDIT_CLIENT_ID`. The **secret** is `REDDIT_CLIENT_SECRET`.
4. `REDDIT_USERNAME` is your Reddit username.

> Reddit has been tightening API access. If it asks you to apply or won't let you create an app,
> skip this step. The bot falls back to Reddit's public feed automatically.

### Step 6 — Put it on GitHub

Create a new **private** repository on GitHub named `job-hunter-bot`, then from inside this folder:

```bash
git init
git add .
git commit -m "Job hunter bot"
git branch -M main
git remote add origin https://github.com/tochukwu5/job-hunter-bot.git
git push -u origin main
```

Make sure the `.github/workflows/hunt.yml` file is included — that's what runs the bot.

### Step 7 — Add your keys as Secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**.

Add each one, name exactly as shown:

| Secret name | Required? |
|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** |
| `TELEGRAM_CHAT_ID` | **Yes** |
| `GROQ_API_KEY` | Strongly recommended |
| `GEMINI_API_KEY` | Optional |
| `BLUESKY_HANDLE` | Optional |
| `BLUESKY_APP_PASSWORD` | Optional |
| `REDDIT_CLIENT_ID` | Optional |
| `REDDIT_CLIENT_SECRET` | Optional |
| `REDDIT_USERNAME` | Optional |

Secrets are encrypted. Nobody can see them, not even in the logs.

### Step 8 — Run it once by hand

1. Go to the **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
2. Click **Job Hunter** on the left → **Run workflow** → **Run workflow**.
3. Wait about a minute, then click the run to watch the log.

After that it runs **every hour on its own**.

### Step 9 — Check Telegram

You'll get any leads found, plus a daily check-in message each morning around 8am Nigeria time
telling you the bot is alive and how many posts it scanned.

> **First run heads-up:** the first run looks back 48 hours (and a week on the Hacker News
> freelancer thread), so it may send a batch of alerts at once. After that it's only new posts.

---

## Reading an alert

```
🟢 NEW LEAD · 📈 Trading · 92%

Need: NQ alerts on 4H FVG taps
Budget: $400
Fit: HIGH · Freelance
Where: Reddit · r/forhire · 1h ago
By: u/client1

💬 I build exactly this — FVG alerts on NQ with Telegram delivery.

🔗 Open post
```

- **🟢 80%+ · 🟡 65–79% · 🟠 60–64%** — how sure the AI is this is a real client.
- **💬** — a suggested opening line. Rewrite it in your own words before sending.
- **⚠️** — appears if the AI spotted scam signs or quality concerns. Read these carefully.
- *"Keyword match only, not AI-checked"* — the AI was unavailable for that one. Judge it yourself.

**Speed wins.** The first specific, relevant reply usually gets the job. Reply fast.

---

## Tuning

Change these under **Settings → Secrets and variables → Actions → Variables tab** (not Secrets).
No code edits needed.

| Variable | Default | What it does |
|---|---|---|
| `MIN_CONFIDENCE` | `60` | Raise to 70 for fewer, better alerts. Lower for more. |
| `MAX_AI_CALLS_PER_RUN` | `25` | AI checks per run. Best matches go first. |
| `MAX_POST_AGE_HOURS` | `48` | Ignore posts older than this. |
| `INCLUDE_FULLTIME` | `true` | Set `false` for freelance gigs only. |
| `ENABLE_REDDIT` etc. | `true` | Set `false` to switch a source off. |

**To edit your profile** (what the AI thinks you're good at): edit the `profile` text in `src/config.js`.
**To add keywords:** edit `src/keywords.js`. Each list is explained at the top of the file.
**To change the schedule:** edit the `cron` line in `.github/workflows/hunt.yml`.

---

## Will it stay free?

**GitHub Actions:** private repos get **2,000 free minutes a month**. Each run is billed as at least
1 minute, so hourly runs use roughly 720–1,500 minutes. That fits.

If you ever run short, either change the schedule to every 2 hours (`"7 */2 * * *"`), or make the
repo public — public repos get unlimited free minutes, and your keys stay safe because Secrets are
encrypted.

**Groq:** the 70B model allows about 1,000 checks a day, the 8B model 14,400. After keyword filtering
you'll typically use 20–100 a day. When 70B runs out, the bot switches to 8B, then Gemini, then rules.

---

## Troubleshooting

**No messages at all** — Check the Actions log. The most common cause is a wrong chat ID, or not
pressing **Start** on the bot in Telegram.

**"Reddit failed" warning** — Reddit sometimes blocks GitHub's servers. Add Reddit credentials
(Step 5). The other sources keep working regardless.

**"Bluesky failed" warning** — Add `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD` (Step 4).

**"groq rejected the API key"** — The key is wrong or was deleted. Make a new one.

**Red X on a run** — Telegram refused the messages. Check the token and chat ID. Any leads from that
run are kept and retried, not lost.

**Warnings arrive at most once a day**, so a broken source won't spam you.

---

## Test on your own computer (optional)

No install needed — just Node 18 or newer.

```bash
cp .env.example .env      # then fill in your keys
npm test                  # 30 offline checks, no keys needed
node src/index.js --ping  # sends a test message to your Telegram
node src/index.js --dry   # does a real scan, prints leads, sends and saves nothing
```

---

## Adding paid sources later

When you add X (via twitterapi.io) or Threads:

1. Copy `src/sources/_template.js` to e.g. `src/sources/twitter.js` and fill it in.
2. Add its settings under `sources` in `src/config.js`.
3. Register it in `src/sources/index.js`.
4. Add its API key as a GitHub Secret and map it in `hunt.yml`.

Matching, AI screening, alerts and de-duplication all work automatically for any new source.

---

## How it decides

1. **Fetch** — Reddit and Mastodon pull the newest posts from targeted communities. Hacker News reads
   the monthly freelancer thread. Bluesky runs rotating exact-phrase searches.
2. **Keyword filter** — every keyword in `keywords.js` is checked against every post. A post needs a
   hiring tag, a clear request, or softer intent plus a topic. Seller posts (`[For Hire]`,
   *"available for work"*, *"Need a website? DM me"*) are rejected. Busy discussion communities need
   a clear request, not just a vague question.
3. **AI check** — reads each remaining post against your profile and decides if it's a paying client.
4. **Alert** — sends the leads, highest scoring first. Trading work is ranked above general web work.
