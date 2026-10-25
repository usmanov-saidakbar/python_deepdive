require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { Redis } = require("@upstash/redis");
const { sync } = require("./sync");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DATA_FILE = path.join(__dirname, "data", "content.json");
const SECTIONS_FILE = path.join(__dirname, "data", "sections.json");
const ROADMAP_FILE = path.join(__dirname, "data", "roadmap.json");

// Progress storage: keyed by whatever email the visitor typed in, with no
// password check. This is a convenience identifier, not authentication —
// anyone who knows (or guesses) an email can see and edit that progress.
// Needs a free Upstash Redis database (see README) so it survives redeploys;
// without it, progress just isn't saved server-side.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

app.use(express.static(path.join(__dirname, "public")));
// Roadmap progress includes free-text daily logs, so allow more than the 100kb default.
app.use(express.json({ limit: "1mb" }));

function loadContent() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function loadSectionDefs() {
  try {
    return JSON.parse(fs.readFileSync(SECTIONS_FILE, "utf8"));
  } catch {
    return [];
  }
}

// Videos are stored as one flat, chronologically-ordered list (upload order).
// sections.json describes each course part and, within it, how many videos in
// a row belong to each named section. Anything left over after all known
// parts/sections are consumed (course parts we don't have a breakdown for
// yet) is kept together at the end so nothing gets dropped.
function groupContent(items, partDefs) {
  const parts = [];
  let cursor = 0;

  for (const partDef of partDefs) {
    const sections = [];
    for (const def of partDef.sections) {
      const slice = items.slice(cursor, cursor + def.count);
      if (slice.length === 0) break;
      sections.push({ name: def.name, items: slice });
      cursor += def.count;
    }
    if (sections.length > 0) {
      parts.push({ part: partDef.part, sections });
    }
  }

  if (cursor < items.length) {
    parts.push({ part: "🎓 Ungrouped", sections: [{ name: "📂 Ungrouped", items: items.slice(cursor) }] });
  }

  return parts;
}

app.get("/api/content", (req, res) => {
  const items = loadContent();
  const partDefs = loadSectionDefs();
  res.json(groupContent(items, partDefs));
});

app.get("/api/roadmap", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(ROADMAP_FILE, "utf8")));
  } catch {
    res.json([]);
  }
});

// Course progress and roadmap progress are stored under separate Redis keys
// so each page can PUT its whole map without clobbering the other's.
function progressRoutes(route, keyPrefix) {
  app.get(`${route}/:email`, async (req, res) => {
    if (!redis) return res.status(503).json({ error: "progress storage not configured" });
    const email = normalizeEmail(req.params.email);
    if (!email) return res.status(400).json({ error: "invalid email" });
    try {
      const data = await redis.get(`${keyPrefix}:${email}`);
      res.json(data || {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(`${route}/:email`, async (req, res) => {
    if (!redis) return res.status(503).json({ error: "progress storage not configured" });
    const email = normalizeEmail(req.params.email);
    if (!email) return res.status(400).json({ error: "invalid email" });
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      return res.status(400).json({ error: "body must be a status map" });
    }
    try {
      await redis.set(`${keyPrefix}:${email}`, req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

progressRoutes("/api/progress", "progress");
progressRoutes("/api/roadmap-progress", "roadmap");

app.post("/api/sync", async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const items = await sync();
    res.json({ ok: true, count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  if (!process.env.TG_SESSION) {
    console.log('No TG_SESSION set yet — run "npm run login" then "npm run sync".');
    return;
  }

  // Populate the list on boot (disk is not guaranteed to persist on free hosts).
  sync().catch((err) => console.error("Initial sync failed:", err.message));

  cron.schedule(process.env.SYNC_CRON || "0 */6 * * *", () => {
    sync().catch((err) => console.error("Scheduled sync failed:", err.message));
  });
});
