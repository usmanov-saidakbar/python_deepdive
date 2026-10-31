# Course Tracker

Lists the video posts from a Telegram channel on a simple webpage. Clicking a
lesson opens that exact video inside Telegram. Each lesson has a status
dropdown (Not watched / In progress / Done). Typing an email at the top saves
that progress server-side so it follows you to other devices.

## How it works

- `login.js` — run **once**, by you, in your own terminal. Logs in to your
  Telegram account and prints a session string.
- `sync.js` — uses that session to read the channel's message history and
  pull out every video (message id, caption as title, date, and a direct
  `t.me/<channel>/<id>` link).
- `server.js` — Express app. Serves the webpage and the video list as JSON.
  It only talks to Telegram (initial sync + the `SYNC_CRON` schedule) if
  `TG_SESSION` is set in its environment. **On the deployed server, leave
  `TG_SESSION` unset** — your Telegram login only ever needs to run on your
  own machine. Sync locally, then commit and push the resulting
  `data/content.json`; the live server just serves that file.
- Watch status is stored in a free [Upstash](https://upstash.com) Redis
  database, keyed by whatever email the visitor typed in — **there's no
  password**. This is a convenience identifier, not real authentication:
  anyone who knows (or guesses) an email can see and edit that email's
  progress. It's intentionally lightweight for a personal tracker; don't
  reuse this pattern for anything that needs real security. Regular disk
  storage isn't used because free hosts like Render wipe it on every
  redeploy — Upstash's free tier is small but genuinely persistent.

## 1. One-time Telegram login (do this yourself, not through an AI chat)

Your API ID and API hash are already filled into `.env`. Do **not** type
your Telegram login code or 2FA password into a chat with anyone or
anything — including an AI assistant. Run this directly in your own
terminal instead:

```bash
cd course-tracker
npm install
npm run login
```

It will ask for the login code Telegram just sent you, and your 2FA
password if you have one set. When it finishes it prints a long
`TG_SESSION` value — copy that into `.env` (replace the empty `TG_SESSION=`
line). That session string is equivalent to being logged into your account,
so keep `.env` private (it's already git-ignored).

## 2. Pull the video list

```bash
npm run sync
```

This writes `data/content.json`, which is committed to the repo — the
deployed server serves this file directly and never needs your Telegram
session. Whenever the channel has new videos, run `npm run sync` again
locally, then `git add data/content.json && git commit && git push` to
update the live site.

## 3. Set up progress storage (Upstash, free)

1. Create a free account at https://upstash.com and a new Redis database
   (any region close to you).
2. On the database's page, open the "REST API" tab and copy the
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values.
3. Paste them into `.env`.

Without this, the site still works — browsing, search, tabs — it just can't
save anyone's progress.

## 4. Run it locally

```bash
npm start
```

Open http://localhost:3000.

## Deploying for free

**Render.com (recommended, easiest)**

1. Push this folder to a GitHub repo, with `data/content.json` committed
   (make sure `.env` is *not* committed — `.gitignore` already excludes it).
2. On Render: New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Don't set any `TG_*` env vars on Render at all — the server runs fine
   without them and just serves the committed `data/content.json`. Your
   Telegram session stays only on your own machine. Do add
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (same values as
   your local `.env`) so progress-saving works on the live site.
5. Free web services on Render sleep after ~15 minutes idle and wake up
   slowly on the next request, and the disk is not persistent across
   deploys. Neither matters here: the video list is a static file in the
   repo, and progress lives in Upstash, not on Render's disk.

**If you want it to never sleep:** the only *actually* free-forever,
always-on option is a small VM on a cloud "always free" tier — Oracle
Cloud's Always Free VM or Google Cloud's e2-micro free tier. That needs a
bit more setup (SSH in, install Node, run the app with `pm2` or a systemd
service) but has no sleep/cold-start and no time limit. Ask if you want a
walkthrough for either.

## Notes / caveats

- Uses the `telegram` (GramJS) package to log in as your own account (not a
  bot) — this is required to read a channel's full message history. GramJS
  itself is archived upstream (no longer actively maintained) but is still
  the most widely used and stable library for this; there's a community
  fork (`teleproto`) if GramJS ever breaks against a future Telegram API
  change.
- Only messages containing a video are listed; the first line of the
  caption is used as the title (falls back to "Video #<id>" if there's no
  caption).
- `POST /api/sync?key=<ADMIN_KEY>` lets you trigger a manual re-sync without
  waiting for the cron schedule.
- Progress endpoints: `GET /api/progress/:email` and
  `PUT /api/progress/:email` (body: the full status map). Both 503 if Upstash
  isn't configured.

## Spark Roadmap tab

`/roadmap.html` (the "Spark Roadmap" tab at the top of the page) is a 2-week
Spark module: 10 study days (Monday to Friday, about 4 focused hours each)
covering the module checklist's 80 questions in 7 sections, plus a deeper
thread on how Spark decides how to run a query. Every day is split into two
parts, each with its own progress bar and notes box:

- **Theory** (learn the checklist topics): 3–4 topics a day. Each shows the
  checklist question(s) it answers (in red), one article to read and one
  "Learn:" sentence. Topics marked "beyond the checklist" go deeper into how
  Spark decides how to run a query.
- **Lab** (one Jupyter notebook per day in `public/spark-lab/notebooks/`,
  solved in place): the Lab tab shows only the notebook link. Every lab uses
  the same three small shop tables (customers, products, orders; 7 to 16
  rows each) written out in its setup cell, so nothing is downloaded and
  every result can be checked by eye. A lab adds one small table when a topic
  needs it (reviews, promotions, events, messy sign-ups), and generates a big
  table with `spark.range` where a measurement needs volume (file sizes,
  shuffles, skew, spills). Part A asks short questions that show the day's
  checklist topics in the Spark UI and in query plans; Part B has original
  coding problems, each a one-line task with its expected output table and a
  collapsed hint, building up to interview-style problems. There are no check
  cells: the answers (code plus the result of the reference run) sit
  collapsed in an *Answers* section at the very end of each notebook. Day 10
  is a final project (a Delta Lake bronze/silver/gold lakehouse built from
  messy raw files) plus 10 timed problems written as `etl(...)` functions.

The *Checklist coverage* panel lists every checklist question, the day that
covers it and whether its topic is ticked. Set a start date and the page
shows which study day today is; weekends count as catch-up time.

- Checklist data lives in `data/roadmap.json`. Each day nests
  `parts` → `activities` → `blocks` → `items`. Items can carry `url` (the
  title becomes a link), `links` (extra links after the text) and, on answer
  cards, `q` and `asks` (the checklist codes and questions they answer, which
  feed the coverage panel). Text can mark code with `backticks`. Edit the file
  directly to add or change items; keep each item's `id` stable so saved
  checkmarks still line up.
- The previous 15-day roadmap is in git history (`git show
  2dfe373:data/roadmap.json`). Its checkmarks and notes stay in saved progress
  but no longer show, because the new item ids and note keys start with `v2-`.
- Notes are saved under `v2-<day>-theory`, `v2-<day>-lab` and
  `v2-<day>-recall`.
- With an email entered, progress is saved in Upstash under `roadmap:<email>`
  (separate from the course's `progress:<email>`) via
  `GET`/`PUT /api/roadmap-progress/:email`. Without one, it's kept in the
  browser's localStorage.

## GIS Roadmap tab

`/gis.html` (the "GIS Roadmap" tab) is a 12-month GeoAI + GIS + urban
analytics plan, based on *GeoAI + GIS + Urban Analytics: End-to-End Roadmap*
(Sep 30, 2026). It has 7 stages in order (Stage 0 self-assessment, GIS
fundamentals, spatial data science, GeoAI on vector data, remote sensing and
imagery, spatial databases and web GIS, LLMs and GIS), plus two tabs that run
all year: the urban analytics track and the portfolio.

- Every topic has a target depth level, and the level decides which steps of
  the learning loop it shows as chips: L2 = *Use*; L3 = *Use, Break,
  Understand*; L4 = all four, with *Rebuild* (a from-scratch version). Each
  topic links the exact chapter or page to read and names a Tashkent practice
  task.
- Stage 0 is a self-assessment with one chip per round (start, months 3, 6, 9
  and 12); its rounds are left out of the progress bars. Each stage that ends
  in a portfolio project shows that project's steps (built, on GitHub, written
  up), shared with the Portfolio tab.
- Every stage has a notes box (a Break log for the technical stages), and the
  weekly check keeps one entry per ISO week. Set a start date and the page
  shows which month and stage you're in and when the next self-assessment is
  due.
- Data lives in `data/gis-roadmap.json` (`stages` → `groups` of `topics`,
  `checks`, `selfcheck` or `projects`, plus `sources`). Item text can mark code
  with `backticks` and links with `[label](https://...)`. Keep each item's `id`
  stable so saved checkmarks still line up.
- Progress is saved like the Spark roadmap's, under its own key: `gis:<email>`
  in Upstash via `GET`/`PUT /api/gis-progress/:email`, or this browser's
  localStorage without an email.
