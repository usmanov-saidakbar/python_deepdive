# Course Tracker

Lists the video posts from a Telegram channel on a simple webpage. Clicking a
lesson opens that exact video inside Telegram. Each lesson has a status
dropdown (Not watched / In progress / Done). Typing an email at the top saves
that progress server-side so it follows you to other devices.

## How it works

- `login.js` — run **once**, by you, in your own terminal. Logs in to your
  Telegram account and prints a session string.
- `upload.js` — uses that session to post a local course folder (a Udemy
  download, one subfolder per section) to the channel, reproducing the
  exact message pattern already used for Parts 1-3: a part intro, a header
  per section, then each lesson's video followed by its resource files
  (subtitles/slides/notebooks). Run it yourself; see below.
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

## 2. Upload a new course part to the channel (optional)

Only needed when you have a new part's files locally and want to post them
to the channel. Skip straight to step 3 if the channel already has
everything and you just want to sync.

```bash
npm run upload -- --dir "D:\Udemy - Python 3 Deep Dive (Part 4 - OOP) (12.2022)" --part 4 --subtitle "OOP" --dry-run
```

A course that isn't one of the Python parts goes in with `--course` and no
`--part`, e.g. the Databricks one:

```bash
npm run upload -- --dir "<folder>" --course "Databricks Certified Data Engineer Associate" --subtitle "Databricks DE" --dry-run
npm run upload -- --dir "<folder>" --course "Databricks Certified Data Engineer Associate" --subtitle "Databricks DE" --sections-json
```

`--sections-json` prints the entry to paste into `data/sections.json` (the
website groups the synced videos by it). The text in the last parentheses
of the course title ("Databricks DE") becomes its tab label. The Databricks
course has its own page (`/databricks.html`); see "Databricks Course tab"
below for how a page picks its course.

`--dir` is the course folder (its subfolders are the sections, each named
like `01 - Introduction` or `1 - Introduction`; files like `001 Title.mp4` or
`1. Title.mp4`). Always run with `--dry-run` first and read
through the captions it prints — nothing is sent to Telegram in that mode.
Once it looks right, drop `--dry-run` to actually post everything. It's
slow (165 real video uploads for Part 4) and can take a long time; if it
gets interrupted, resume with `--from-section N --from-lesson N` instead
of starting over — the log lines it prints while running tell you exactly
where to resume from. After it finishes, add that part's section/video
counts to `data/sections.json` (if not already there) and move on to step
3 to pull the new messages into `data/content.json`.

## 3. Pull the video list

```bash
npm run sync
```

This writes `data/content.json`, which is committed to the repo — the
deployed server serves this file directly and never needs your Telegram
session. Whenever the channel has new videos, run `npm run sync` again
locally, then `git add data/content.json && git commit && git push` to
update the live site.

`sync` reads the newest `TG_FETCH_LIMIT` messages of the channel (default
10000), and **every message counts, not just videos**: each video usually
comes with a header or a few resource files (the channel had about 2,100
messages for 695 videos after the Databricks course). If the channel grows
past the limit, the oldest messages (the start of Part 1) silently drop out
and every course after it shifts. Keep `TG_FETCH_LIMIT` comfortably above the
channel's message count.

## 4. Set up progress storage (Upstash, free)

1. Create a free account at https://upstash.com and a new Redis database
   (any region close to you).
2. On the database's page, open the "REST API" tab and copy the
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values.
3. Paste them into `.env`.

Without this, the site still works — browsing, search, tabs — it just can't
save anyone's progress.

## 5. Run it locally

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

## Databricks Course tab

`/databricks.html` (the "Databricks Course" tab) lists the 149 lessons of the
Databricks Data Engineer Associate course by section, with the same search and
Not watched / In progress / Done menu as the Python Deep Dive page. Both pages
run the same `app.js`; attributes on `<body>` choose what each shows:

- `data-course="Databricks"` keeps only the parts whose name contains that text.
- `data-exclude="Databricks"` (on `index.html`) drops them, so the Python page
  shows Python parts only. A new course gets its own page by copying
  `databricks.html` and changing these attributes.
- `data-progress="/api/databricks-progress"` is the page's progress route.
  Progress is saved under `databricks:<email>` in Upstash via `GET`/`PUT
  /api/databricks-progress/:email`, separate from the Python page's.

## Spark Roadmap tab

`/roadmap.html` (the "Spark Roadmap" tab at the top of the page) is a
15-day Spark plan (Monday to Friday), in three phases. Each day has one part,
with its own progress bar and notes box:

- **Days 1–9, theory** (learn the module checklist's 80 questions in 7
  sections): 3–4 topics a day. Each shows the checklist question(s) it answers
  (in red), one article to read and one "Learn:" sentence. Topics marked
  "beyond the checklist" go deeper into how Spark decides how to run a query.
- **Days 10–11, videos:** Module 6 (Batch Processing) of DataTalksClub's Data
  Engineering Zoomcamp, its 16 units split over two days (about 2 hours each),
  each linking the YouTube video and the unit's notes; Day 11 ends with the
  module's optional homework.
- **Days 12–15, Zillacode prep:** one lesson-and-exercise notebook a day in
  `public/spark-lab/notebooks/` (`zillacode_prep_day12.ipynb` to
  `zillacode_prep_day15.ipynb`). They teach the DataFrame API that the theory
  days and the Zoomcamp module don't cover, everything the 52 PySpark problems
  of [Zillacode](https://github.com/davidzajac1/zillacode) use: each lesson
  explains one tool in depth with example cells (their output is stored in
  the notebook), followed by quick exercises in Zillacode's format (a function
  `etl(...)` that returns a DataFrame, with the expected output under the
  task and the answers collapsed at the end). Day 12: how Zillacode runs and
  checks an answer, columns, filters, `when`, nulls, text, regular
  expressions and unions. Day 13: dates, aggregations, the fan-out trap,
  pivot and arrays. Day 14: joins in depth and window functions. Day 15:
  sessions, streaks and other Hard-problem patterns, Spark SQL, debugging,
  UDFs, and a 90-minute mock exam on new data built the way Zillacode builds
  its inputs. The setup cell turns ANSI mode off so Spark 4.2 behaves like
  Zillacode's Spark 3. Every example and answer was run on PySpark 4.2.0,
  and each notebook was re-run top to bottom in a fresh kernel with the same
  outputs. Day 15 ends with setting up Zillacode, which now runs only
  locally with Docker (`docker compose up`, then
  `http://localhost:5173/questions`).

Earlier versions are in git history: the Lab notebooks
(`git show b80b0ed:public/spark-lab/notebooks/day01_lab.ipynb`) and the
practice-only notebooks
(`git show 2d2b4a1:public/spark-lab/notebooks/practice_day12.ipynb`).

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
- **Databricks course links.** `data/course-links.json` maps roadmap item ids
  (the theory topics) to lessons of the Databricks
  Data Engineer Associate course in the channel. Each entry gives the
  lesson's section number `s`, lesson number `l` and `title`, a `kind`
  (`theory` = lecture, `lab` = hands-on demo, shown as "Demo"), a `fit` (`match`, `intro` =
  the course only touches the topic, `background` = related, not the same
  topic) and a one-line `note`. The page (`/api/course-links` plus
  `/api/content`) turns them into Telegram links shown in a blue box under the
  item; an entry shows only when that video is synced and its title matches,
  so nothing links to the wrong lesson. They were matched by reading the
  lesson transcripts against the checklist questions. Many topics here have
  no link because the course (a certification prep) doesn't teach them:
  Catalyst, Tungsten, lazy evaluation, RDDs, join algorithms, salting, memory
  regions, caching, driver OOM, Change Data Feed and watermarks.
- The previous 15-day roadmap is in git history (`git show
  2dfe373:data/roadmap.json`). Its checkmarks and notes stay in saved progress
  but no longer show, because the new item ids and note keys start with `v2-`.
- Notes are saved under `v2-<day>-<part>`: `theory`, `video` or `practice`
  (older `v2-<day>-lab` and `v2-<day>-zillacode` notes stay in storage but no
  longer show).
- With an email entered, progress is saved in Upstash under `roadmap:<email>`
  (separate from the course's `progress:<email>`) via
  `GET`/`PUT /api/roadmap-progress/:email`. Without one, it's kept in the
  browser's localStorage.

## Russian Roadmap tab

`/russian.html` (the "Russian Roadmap" tab) is a 300-day plan to reach B2
speaking in Russian with free resources only. The page is just the plan:
month tabs, a grid of the month's 30 days, the selected day's checklist (3–5
tasks, about 2 hours), and one notes box for the error log. Set a start date
and the page opens on today's day.

- Each month is 4 weeks of 7 days, then a review day (29) and a catch-up day
  (30). A normal day has Anki, one step of the week's grammar topic, a named
  listening (a *Между нами* episode, a Slow Russian episode or an Inklingo
  story) and a speaking task; day 7 is light and holds the weekly check.
  Months 9–10 follow the 15 tasks of the ТРКИ-2 speaking exam, with two full
  mocks.
- Each task carries everything it needs (links, the AI chat prompt, the weekly
  questions), so no task points anywhere else on the page.
- The days live in `data/russian-days.json` (`days` → `items` with `id`,
  `kind`, `text` and optional `keys`); `GET /api/russian-days` serves it. Edit
  it directly, keeping ids stable. A task with `keys` is ticked under those
  keys instead of its id: they're left from the stage checklists the page used
  to have, so ticks saved back then still show.
- Notes from the old per-stage and weekly notes boxes are folded into the one
  notes box when progress loads.
- Progress is saved under its own key: `russian:<email>` in Upstash via
  `GET`/`PUT /api/russian-progress/:email`, or this browser's localStorage
  without an email.
