// Uploads a local course folder to the Telegram channel, reproducing the
// exact posting pattern already used for Parts 1-3 (reverse-engineered from
// the live channel history, message by message):
//
//   1. One part-level intro message:
//        🎓 Python 3 Deep Dive (Part 4 - OOP)
//
//        📚 15 sections · 🎬 165 videos · 📎 317 files
//
//        Contents:
//        📂 01. Introduction — 2 videos
//        ...
//
//        #Python_3_Deep_Dive_Part_4_OOP
//
//   2. Per section, one header message:
//        📂 02. Classes
//        🎓 Python 3 Deep Dive (Part 4 - OOP)
//
//        #Python_3_Deep_Dive_Part_4_OOP #S02
//
//   3. Per lesson: the video as its own message, then any resource files
//      (subtitles, slides, notebooks) for that lesson sent together as one
//      album:
//        🎬 3. Objects and Classes - Coding
//        📂 02. Classes
//
//        #S02 #S02_L03 #Objects_and_Classes_Coding
//
//        💻 3. Objects-and-Classes.ipynb
//        #S02_L03
//
// Run this yourself, in your own terminal (never paste anything from it
// into a chat) — it reuses the TG_SESSION already in .env from your
// one-time `npm run login`.
//
// Usage:
//   node upload.js --dir "<path to the course folder>" --part 4 --subtitle "OOP"
//
// The course folder's immediate subfolders are the sections, each named
// like "01 - Introduction". Inside each, files are grouped by their
// leading lesson number (e.g. "003 Objects and Classes - Coding.mp4" and
// "003 Objects-and-Classes.ipynb.zip" belong to lesson 3); the .mp4 is the
// lesson's video, everything else in the group is sent as its resources.
//
// Options:
//   --dir <path>        Course folder (required).
//   --part <n>          Part number, e.g. 4 (required).
//   --subtitle <text>   Short subtitle for "(Part N - <subtitle>)",
//                        matching how parts 1-3 are named (required).
//   --dry-run           Print every caption/order without touching
//                        Telegram or reading TG_SESSION. Do this first.
//   --from-section <n>  Manually skip sections before this one (1-based).
//                        Overrides any auto-resume from a saved progress
//                        file. Use with --from-lesson.
//   --from-lesson <n>   Within --from-section, skip lessons before this
//                        one (1-based). Ignored for later sections.
//   --restart           Ignore any saved progress for this --part and
//                        start over from the very beginning.
//   --delay-ms <n>      Pause between messages, default 2000. Keeps well
//                        clear of flood limits for a user account (as
//                        opposed to a bot, which gets more headroom).
//
// Crash recovery: after every lesson is fully sent, progress is saved to
// upload_progress_part<N>.json next to this script. If the process dies
// (network drop, terminal closed, power loss, etc.), just re-run the exact
// same command — it picks up right after the last completed lesson
// automatically, no flags needed. The file is deleted once the part
// finishes uploading. Pass --restart to ignore it and re-upload everything.
require("dotenv").config();
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    course: "Python 3 Deep Dive",
    dryRun: false,
    sectionsJson: false,
    fromSection: 1,
    fromLesson: 1,
    restart: false,
    delayMs: 2000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--course") args.course = argv[++i];
    else if (a === "--part") args.part = Number(argv[++i]);
    else if (a === "--subtitle") args.subtitle = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--sections-json") args.sectionsJson = true;
    else if (a === "--from-section") args.fromSection = Number(argv[++i]);
    else if (a === "--from-lesson") args.fromLesson = Number(argv[++i]);
    else if (a === "--restart") args.restart = true;
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.dir) throw new Error("--dir is required");
  if (!args.subtitle) throw new Error("--subtitle is required");
  return args;
}

// Everything that varies between courses, computed once. With --part the
// title reads "<course> (Part N - <subtitle>)" exactly like Parts 1-4; without
// it (a standalone course) it reads "<course> (<subtitle>)". `key` names the
// crash-recovery file.
function courseMeta(args) {
  const label = args.part ? `Part ${args.part} - ${args.subtitle}` : args.subtitle;
  return {
    title: `${args.course} (${label})`,
    tag: slugTag(`${args.course} ${args.part ? `Part ${args.part} ` : ""}${args.subtitle}`),
    key: args.part ? String(args.part) : slugTag(args.course),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugTag(text) {
  return text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const RESOURCE_EMOJI = { vtt: "📝", srt: "📝", pdf: "📄", zip: "💻", html: "🌐", htm: "🌐" };
function emojiFor(ext) {
  return RESOURCE_EMOJI[ext.toLowerCase()] || "📎";
}

// Splits "003 Objects and Classes - Coding" into { num: 3, title: "Objects and Classes - Coding" }.
function parseLeadingNumber(nameWithoutExt) {
  const m = nameWithoutExt.match(/^(\d+)(?:\.\s*|\s+)(.+)$/); // "003 Title" or "3. Title"
  if (!m) return null;
  return { num: Number(m[1]), title: m[2].trim() };
}

// Reads duration/width/height straight out of an mp4's moov atom, so
// uploaded videos get a real streaming preview instead of a bare document.
// Falls back to zeros (Telegram still accepts the video, just without a
// duration/size hint) if the file doesn't parse as expected.
function readMp4Meta(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    let duration = 0;
    let timescale = 1;
    let width = 0;
    let height = 0;

    function readBoxes(offset, end) {
      let pos = offset;
      const header = Buffer.alloc(8);
      while (pos + 8 <= end) {
        fs.readSync(fd, header, 0, 8, pos);
        let boxSize = header.readUInt32BE(0);
        const type = header.toString("ascii", 4, 8);
        let headerSize = 8;
        if (boxSize === 1) {
          const large = Buffer.alloc(8);
          fs.readSync(fd, large, 0, 8, pos + 8);
          boxSize = Number(large.readBigUInt64BE(0));
          headerSize = 16;
        } else if (boxSize === 0) {
          boxSize = end - pos;
        }
        const boxEnd = pos + boxSize;

        if (type === "moov" || type === "trak" || type === "mdia") {
          readBoxes(pos + headerSize, boxEnd);
        } else if (type === "mvhd") {
          const body = Buffer.alloc(boxSize - headerSize);
          fs.readSync(fd, body, 0, body.length, pos + headerSize);
          if (body[0] === 1) {
            timescale = body.readUInt32BE(20);
            duration = Number(body.readBigUInt64BE(24));
          } else {
            timescale = body.readUInt32BE(12);
            duration = body.readUInt32BE(16);
          }
        } else if (type === "tkhd" && width === 0) {
          const body = Buffer.alloc(boxSize - headerSize);
          fs.readSync(fd, body, 0, body.length, pos + headerSize);
          const wOffset = body[0] === 1 ? 88 : 76;
          width = body.readUInt32BE(wOffset) >>> 16;
          height = body.readUInt32BE(wOffset + 4) >>> 16;
        }
        pos = boxEnd;
      }
    }

    readBoxes(0, size);
    return { duration: timescale ? Math.round(duration / timescale) : 0, width, height };
  } catch {
    return { duration: 0, width: 0, height: 0 };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Scans the course folder into an ordered list of sections, each with its
// ordered lessons (a video file plus zero or more resource files).
function scanCourse(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // Numeric, so "2 - ..." sorts before "10 - ..." (a plain sort wouldn't).
    .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));

  return entries.map((folderName) => {
    const sepMatch = folderName.match(/^(\d+)\s*-\s*(.+)$/);
    if (!sepMatch) throw new Error(`Section folder "${folderName}" doesn't start with "NN - ..."`);
    const numStr = sepMatch[1].padStart(2, "0");
    const title = sepMatch[2].trim();
    const sectionCaption = `${numStr}. ${title}`;

    const folderPath = path.join(dir, folderName);
    const groups = new Map();
    for (const fileName of fs.readdirSync(folderPath)) {
      const ext = path.extname(fileName).slice(1);
      const base = path.basename(fileName, path.extname(fileName));
      const parsed = parseLeadingNumber(base);
      if (!parsed) continue;
      if (!groups.has(parsed.num)) groups.set(parsed.num, []);
      groups.get(parsed.num).push({ path: path.join(folderPath, fileName), ext, title: parsed.title });
    }

    // Most lessons are a video; a few (e.g. a slides-only lecture) have no
    // .mp4 at all, so the "primary" item falls back to an html/pdf page
    // instead — matching how those lectures already look in the channel.
    const PRIMARY_PRIORITY = ["mp4", "html", "htm", "pdf"];
    const lessons = [...groups.keys()]
      .sort((a, b) => a - b)
      .map((num) => {
        const files = groups.get(num);
        let primary;
        for (const ext of PRIMARY_PRIORITY) {
          primary = files.find((f) => f.ext.toLowerCase() === ext);
          if (primary) break;
        }
        if (!primary) primary = files[0];
        const resources = files.filter((f) => f !== primary);
        return { num, primary, resources };
      });

    return { numStr, title, sectionCaption, lessons };
  });
}

function videoCount(section) {
  return section.lessons.filter((l) => l.primary.ext.toLowerCase() === "mp4").length;
}

function buildIntroCaption(sections, meta) {
  const totalVideos = sections.reduce((n, s) => n + videoCount(s), 0);
  const totalFiles = sections.reduce(
    (n, s) => n + s.lessons.reduce((m, l) => m + 1 + l.resources.length, 0),
    0
  );
  const lines = sections.map((s) => {
    const n = videoCount(s);
    return `📂 ${s.sectionCaption} — ${n} video${n === 1 ? "" : "s"}`;
  });
  return (
    `🎓 ${meta.title}\n\n` +
    `📚 ${sections.length} sections · 🎬 ${totalVideos} videos · 📎 ${totalFiles} files\n\n` +
    `Contents:\n${lines.join("\n")}\n\n#${meta.tag}`
  );
}

function buildSectionCaption(section, meta) {
  return `📂 ${section.sectionCaption}\n🎓 ${meta.title}\n\n#${meta.tag} #S${section.numStr}`;
}

// The entry data/sections.json needs for this course, so the website can group
// the synced videos into the same part/section tree as the channel. Counts are
// videos only, because sync.js only picks up video messages.
function buildSectionsEntry(sections, meta) {
  return {
    part: `🎓 ${meta.title}`,
    sections: sections.map((s) => ({ name: `📂 ${s.sectionCaption}`, count: videoCount(s) })),
  };
}

const PRIMARY_EMOJI = { mp4: "🎬", html: "🌐", htm: "🌐", pdf: "📄" };
function buildPrimaryCaption(lesson, section) {
  const lessonNumStr = String(lesson.num).padStart(2, "0");
  const emoji = PRIMARY_EMOJI[lesson.primary.ext.toLowerCase()] || "📎";
  return (
    `${emoji} ${lesson.num}. ${lesson.primary.title}\n📂 ${section.sectionCaption}\n\n` +
    `#S${section.numStr} #S${section.numStr}_L${lessonNumStr} #${slugTag(lesson.primary.title)}`
  );
}

function buildResourceCaption(resource, lesson, section) {
  const lessonNumStr = String(lesson.num).padStart(2, "0");
  return `${emojiFor(resource.ext)} ${lesson.num}. ${resource.title}\n#S${section.numStr}_L${lessonNumStr}`;
}

async function withFloodRetry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const seconds = err?.seconds || (String(err?.message).match(/FLOOD_WAIT_(\d+)/) || [])[1];
      if (seconds && attempt <= 3) {
        console.warn(`  flood wait on ${label}: sleeping ${seconds}s (attempt ${attempt}/3)`);
        await sleep(Number(seconds) * 1000 + 1000);
        continue;
      }
      throw err;
    }
  }
}

// Draws an inline progress bar for a file upload, throttled so it doesn't
// spam the terminal on every chunk.
function makeProgressBar(label, barLen = 30) {
  const start = Date.now();
  let lastPrint = 0;
  return (progress) => {
    // GramJS calls back with a Number (0..1) once total size is known.
    const pct = typeof progress === "number" ? progress : 0;
    const now = Date.now();
    if (pct < 1 && now - lastPrint < 200) return;
    lastPrint = now;
    const filled = Math.round(barLen * pct);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    const elapsedSec = (now - start) / 1000;
    process.stdout.write(
      `\r  ${label} [${bar}] ${(pct * 100).toFixed(1).padStart(5)}%  ${elapsedSec.toFixed(1)}s` +
        (pct >= 1 ? "\n" : "")
    );
  };
}

async function sendPrimary(client, channel, lesson, section) {
  const isVideo = lesson.primary.ext.toLowerCase() === "mp4";
  const options = {
    file: lesson.primary.path,
    caption: buildPrimaryCaption(lesson, section),
    progressCallback: makeProgressBar(path.basename(lesson.primary.path)),
  };
  if (isVideo) {
    const meta = readMp4Meta(lesson.primary.path);
    const { Api } = require("telegram");
    options.attributes = [
      new Api.DocumentAttributeVideo({
        duration: meta.duration,
        w: meta.width,
        h: meta.height,
        supportsStreaming: true,
      }),
    ];
    options.workers = 4;
  }
  return withFloodRetry(() => client.sendFile(channel, options), path.basename(lesson.primary.path));
}

async function sendResources(client, channel, lesson, section) {
  if (lesson.resources.length === 0) return;
  if (lesson.resources.length === 1) {
    const r = lesson.resources[0];
    await withFloodRetry(
      () => client.sendFile(channel, { file: r.path, caption: buildResourceCaption(r, lesson, section) }),
      path.basename(r.path)
    );
    return;
  }
  await withFloodRetry(
    () =>
      client.sendFile(channel, {
        file: lesson.resources.map((r) => r.path),
        caption: lesson.resources.map((r) => buildResourceCaption(r, lesson, section)),
      }),
    `${lesson.resources.length} resources for lesson ${lesson.num}`
  );
}

function progressFilePath(key) {
  return path.join(__dirname, `upload_progress_part${key}.json`);
}

function loadSavedProgress(part) {
  try {
    return JSON.parse(fs.readFileSync(progressFilePath(part), "utf8"));
  } catch {
    return null;
  }
}

function saveProgress(part, introSent, lastCompleted) {
  const p = progressFilePath(part);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ introSent, lastCompleted }));
  fs.renameSync(tmp, p);
}

function clearProgress(part) {
  fs.rmSync(progressFilePath(part), { force: true });
}

async function dryRun(sections, meta) {
  console.log("===== part intro =====");
  console.log(buildIntroCaption(sections, meta));
  for (const section of sections) {
    console.log(`\n===== section ${section.numStr} header =====`);
    console.log(buildSectionCaption(section, meta));
    for (const lesson of section.lessons) {
      console.log(`\n--- primary: ${path.basename(lesson.primary.path)} ---`);
      console.log(buildPrimaryCaption(lesson, section));
      for (const r of lesson.resources) {
        console.log(`--- resource: ${path.basename(r.path)} ---`);
        console.log(buildResourceCaption(r, lesson, section));
      }
    }
  }
}

async function run(args) {
  const sections = scanCourse(args.dir);
  const meta = courseMeta(args);
  const totalLessons = sections.reduce((n, s) => n + s.lessons.length, 0);
  const totalVideos = sections.reduce((n, s) => n + videoCount(s), 0);
  console.log(
    `Found ${sections.length} sections, ${totalLessons} lessons (${totalVideos} videos) in "${args.dir}"`
  );

  if (args.sectionsJson) {
    console.log("\nEntry for data/sections.json:");
    console.log(JSON.stringify(buildSectionsEntry(sections, meta), null, 2));
    return;
  }

  if (args.dryRun) {
    await dryRun(sections, meta);
    return;
  }

  if (!process.env.TG_SESSION) {
    throw new Error('TG_SESSION is not set. Run "npm run login" first.');
  }

  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");
  const client = new TelegramClient(
    new StringSession(process.env.TG_SESSION),
    Number(process.env.TG_API_ID),
    process.env.TG_API_HASH,
    { connectionRetries: 5 }
  );
  await client.connect();
  const channel = await client.getEntity(process.env.TG_CHANNEL || "sm1523");

  const manualResume = args.fromSection > 1 || args.fromLesson > 1;
  if (args.restart) clearProgress(meta.key);

  let fromSection, fromLesson, introSent;
  if (manualResume) {
    fromSection = args.fromSection;
    fromLesson = args.fromLesson;
    introSent = true;
  } else {
    const saved = args.restart ? null : loadSavedProgress(meta.key);
    if (!saved) {
      fromSection = 1;
      fromLesson = 1;
      introSent = false;
    } else {
      introSent = !!saved.introSent;
      if (!saved.lastCompleted) {
        fromSection = 1;
        fromLesson = 1;
      } else {
        fromSection = saved.lastCompleted.section;
        fromLesson = saved.lastCompleted.lesson + 1;
        if (fromLesson > sections[fromSection - 1].lessons.length) {
          fromSection += 1;
          fromLesson = 1;
        }
      }
      if (fromSection > sections.length) {
        console.log(`upload_progress_part${meta.key}.json says this part is already fully uploaded.`);
        console.log("Delete that file (or pass --restart) if you want to re-send it anyway.");
        await client.disconnect();
        return;
      }
      console.log(`Resuming from saved progress: section ${fromSection}, lesson ${fromLesson}`);
    }
  }

  if (!introSent) {
    console.log("Sending part intro message...");
    await withFloodRetry(
      () => client.sendMessage(channel, { message: buildIntroCaption(sections, meta) }),
      "part intro"
    );
    saveProgress(meta.key, true, null);
    await sleep(args.delayMs);
  }

  for (const [sIdx, section] of sections.entries()) {
    const sectionNum = sIdx + 1;
    if (sectionNum < fromSection) continue;
    const firstLessonToSend = sectionNum === fromSection ? fromLesson : 1;

    if (firstLessonToSend === 1) {
      console.log(`Section ${section.numStr}: sending header...`);
      await withFloodRetry(
        () => client.sendMessage(channel, { message: buildSectionCaption(section, meta) }),
        `section ${section.numStr} header`
      );
      await sleep(args.delayMs);
    }

    for (const [lIdx, lesson] of section.lessons.entries()) {
      const lessonNum = lIdx + 1;
      if (lessonNum < firstLessonToSend) continue;
      console.log(
        `Section ${section.numStr}, lesson ${lessonNum}/${section.lessons.length}: ${lesson.primary.title}`
      );
      await sendPrimary(client, channel, lesson, section);
      await sleep(args.delayMs);
      await sendResources(client, channel, lesson, section);
      await sleep(args.delayMs);
      saveProgress(meta.key, true, { section: sectionNum, lesson: lessonNum });
    }
  }

  clearProgress(meta.key);
  console.log("\nDone. Now run `npm run sync` locally to pull the new messages into data/content.json,");
  console.log("then commit and push data/content.json (data/sections.json already has this part's counts).");
  await client.disconnect();
}

const args = parseArgs(process.argv.slice(2));
run(args).catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
