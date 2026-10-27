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

- **Theory** (learn the answers): a short, time-boxed reading list with links,
  then one answer card per checklist question, listing what a complete answer
  must cover. 🧭 cards go beyond the checklist.
- **Lab** (a Jupyter notebook per day in `public/spark-lab/notebooks/`,
  solved in place): type an official tutorial or GitHub
  example (PySpark user guide chapters, Spark and Delta example scripts),
  write two exercises built on it, each with a self-check and a reference
  solution, then prove the day's questions in the plan and the Spark UI.

The *Checklist coverage* panel lists every checklist question, the day that
covers it and whether its answer card is ticked. Set a start date and the page
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
- The lab starter kit is served from `public/spark-lab/`: `lab_utils.py`
  (session with Delta and Avro, seeded data generators, plan and timing
  helpers; written for PySpark 4.2.0 and delta-spark 4.4.1), `bad_job.py`
  (the deliberately slow job for the Day 8 refactor lab) and `solutions/`
  (reference solutions for the Day 1–9 exercises, each run on Spark 4.2).
- With an email entered, progress is saved in Upstash under `roadmap:<email>`
  (separate from the course's `progress:<email>`) via
  `GET`/`PUT /api/roadmap-progress/:email`. Without one, it's kept in the
  browser's localStorage.
