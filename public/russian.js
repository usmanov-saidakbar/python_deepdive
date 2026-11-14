const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "russian-roadmap-progress";
const DAY_KEY = "russian-roadmap-day";
const NOTES_KEY = "log";
const PLAN_DAYS = 300;

const KINDS = {
  setup: "Setup",
  anki: "Words",
  grammar: "Grammar",
  input: "Listen",
  speak: "Speak",
  write: "Write",
  review: "Review",
  test: "Test",
  project: "Project",
};

// Same email-keyed storage as the other pages, under its own server key.
// progress = {
//   checked: { [key]: true }, notes: { log: "..." }, startDate: "YYYY-MM-DD",
//   cards, myWords, wordLog, wordDir   (the word trainer, see below)
// }
// A daily task is ticked under its own id ("d37-speak"), or under its `keys` when it has them:
// those come from the stage checklists the page used to have, so ticks saved back then still show.
let email = "";
let progress = emptyProgress();
let progressError = "";
let days = [];
let activeDay = 1;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyProgress() {
  return { checked: {}, notes: {}, startDate: "", cards: {}, myWords: [], wordLog: {} };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// The page used to keep a notes box per stage and one per week; fold them all into the one box.
function normalizeProgress(data) {
  const result = { ...emptyProgress(), ...(isPlainObject(data) ? data : {}) };
  if (!isPlainObject(result.checked)) result.checked = {};
  if (!isPlainObject(result.notes)) result.notes = {};
  if (!isPlainObject(result.cards)) result.cards = {};
  if (!Array.isArray(result.myWords)) result.myWords = [];
  if (!isPlainObject(result.wordLog)) result.wordLog = {};
  const old = Object.keys(result.notes).filter((key) => key !== NOTES_KEY).sort();
  if (old.length) {
    const parts = [result.notes[NOTES_KEY], ...old.map((key) => result.notes[key])].filter(Boolean);
    result.notes = parts.length ? { [NOTES_KEY]: parts.join("\n\n") } : {};
  }
  return result;
}

function hasProgress(p) {
  return Object.keys(p.checked).length > 0 || Object.keys(p.cards).length > 0 || p.myWords.length > 0;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Data text may mark code with `backticks` and links with [label](https://...).
// Escape first, then add the tags, so nothing in the data can inject HTML.
function formatText(str) {
  return escapeHtml(str)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function readLocal() {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem(LOCAL_KEY)));
  } catch {
    return emptyProgress();
  }
}

async function loadProgress() {
  progressError = "";
  if (!email) {
    progress = readLocal();
    return;
  }
  try {
    const res = await fetch(`/api/russian-progress/${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    progress = normalizeProgress(await res.json());
  } catch (err) {
    progress = readLocal();
    progressError = "Couldn't load your saved Russian progress from the server — showing this browser's copy.";
  }
}

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (private mode) — the server copy still saves.
  }
}

// One PUT in flight at a time, in order, each sending the live `progress`
// (see the matching comment in app.js for why).
let persistChain = Promise.resolve();

function persistProgress() {
  saveLocal();
  if (!email) return persistChain;
  const targetEmail = email;
  persistChain = persistChain.then(() => {
    const body = JSON.stringify(progress);
    return fetch(`/api/russian-progress/${encodeURIComponent(targetEmail)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      // Lets the last save finish when the tab closes; browsers refuse it for bodies over 64 KB.
      keepalive: new TextEncoder().encode(body).length < 60000,
    }).catch(() => {});
  });
  return persistChain;
}

// Typing in the notes box or rating cards shouldn't fire a PUT per keystroke or answer:
// save to this browser at once, and to the server a moment later.
let saveTimer = null;
function persistSoon(delay = 600) {
  saveLocal();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistProgress();
  }, delay);
}

function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  persistProgress();
}

// ---------------------------------------------------------------- ticks

function setKeys(keys, on) {
  keys.forEach((key) => {
    if (on) progress.checked[key] = true;
    else delete progress.checked[key];
  });
  persistProgress();
  refresh();
}

// A daily task is done when all its keys are ticked (its own id when it has none).
function taskKeys(task) {
  return task.keys && task.keys.length ? task.keys : [task.id];
}

function taskDone(task) {
  return taskKeys(task).every((key) => progress.checked[key]);
}

function dayCounts(day) {
  const done = day.items.filter(taskDone).length;
  return { done, total: day.items.length };
}

// ---------------------------------------------------------------- plan position

function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function startDate() {
  if (!progress.startDate) return null;
  const [y, m, d] = progress.startDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Days since 1970 on the local calendar, so clock changes can't shift a day.
function dayIndex(date = new Date()) {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// Day 1 is the start date.
function todayNumber() {
  const start = startDate();
  if (!start) return null;
  return dayIndex() - dayIndex(start) + 1;
}

function dateOfDay(n) {
  const d = startDate();
  d.setDate(d.getDate() + n - 1);
  return d;
}

function monthOfDay(n) {
  return Math.ceil(n / 30);
}

function renderStartDate() {
  const input = document.getElementById("start-date");
  input.value = progress.startDate || "";
  const hint = document.getElementById("today-hint");
  const n = todayNumber();
  if (n === null) {
    hint.textContent = "Set it to see which day of the plan today is.";
    return;
  }
  if (n < 1) {
    hint.textContent = `Starts in ${1 - n} day${1 - n === 1 ? "" : "s"}.`;
    return;
  }
  if (n > PLAN_DAYS) {
    hint.textContent = `All ${PLAN_DAYS} days are behind you: finish any open tasks.`;
    return;
  }
  hint.textContent = `Today is day ${n} of ${PLAN_DAYS}.`;
}

// ---------------------------------------------------------------- word trainer
//
// Spaced repetition on the page, so words don't need Anki. Ready-made words come from the
// plan (`day.words`, 10 per study day); your own words are in progress.myWords.
// progress.cards[id] = { due, ivl, ease, reps, lapses }: `due` is a dayIndex(), `ivl` the
// interval in days (0 while you're still learning the word), `ease` how fast the interval
// grows, in percent, as in Anki. A card is created the first time you answer it.
// progress.wordLog["YYYY-MM-DD"] = { n: ready words started, o: own words started,
// a: answers, x: times "+10 new words" was pressed }.

const NEW_PER_DAY = 10;
const NEW_CARD = { due: 0, ivl: 0, ease: 250, reps: 0, lapses: 0 };
const STRESS_RE = /́/g;
const GRADES = ["Again", "Hard", "Good", "Easy"];

let readyWords = []; // { id, ru, en, day } in plan order
let readyById = new Map();
let readyByKey = new Map();
let session = null; // { queue: [card ids], shown: false }
let myWordsOpen = false;
let ruVoice = null;

// A word's id is its text without stress marks, so fixing a stress mark keeps the progress.
function cardId(ru) {
  return ru.replace(STRESS_RE, "");
}

// What you'd type for a word: no stress, case or punctuation. Finds ready-made words you add yourself.
function matchKey(ru) {
  return cardId(ru)
    .toLowerCase()
    .replace(/[^а-яёa-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReadyWords() {
  readyWords = days.flatMap((day) => (day.words || []).map(([ru, en]) => ({ id: cardId(ru), ru, en, day: day.n })));
  readyById = new Map(readyWords.map((w) => [w.id, w]));
  readyByKey = new Map(readyWords.map((w) => [matchKey(w.ru), w]));
}

function dateKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayLog() {
  return progress.wordLog[dateKey()] || {};
}

function ownIds() {
  return new Set(progress.myWords.map((w) => w.id));
}

function findWord(id) {
  return readyById.get(id) || progress.myWords.find((w) => w.id === id) || null;
}

function cardStatus(id) {
  const card = progress.cards[id];
  if (!card) return "new";
  return card.ivl >= 1 ? "learned" : "learning";
}

// Ready-made words come in plan order, up to today's day when a start date is set, and at most
// NEW_PER_DAY a day; each "+10 new words" adds ten more and lets you go ahead of the plan.
// Your own words always come the day you add them.
function newIds() {
  const log = todayLog();
  const extra = log.x || 0;
  const own = ownIds();
  const today = todayNumber();
  const lastDay = today === null || extra > 0 ? Infinity : today;
  const room = NEW_PER_DAY * (1 + extra) - (log.n || 0);
  const ready =
    room > 0
      ? readyWords
          .filter((w) => w.day <= lastDay && !progress.cards[w.id] && !own.has(w.id))
          .slice(0, room)
          .map((w) => w.id)
      : [];
  const mine = progress.myWords.filter((w) => !progress.cards[w.id]).map((w) => w.id);
  return [...mine, ...ready];
}

function dueIds() {
  const today = dayIndex();
  return Object.entries(progress.cards)
    .filter(([id, card]) => card.due <= today && findWord(id))
    .sort((a, b) => a[1].due - b[1].due || a[1].ivl - b[1].ivl)
    .map(([id]) => id);
}

function streak() {
  let count = 0;
  const d = new Date();
  if (!todayLog().a) d.setDate(d.getDate() - 1); // today still counts until midnight
  while ((progress.wordLog[dateKey(d)] || {}).a) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function wordStats() {
  let learned = 0;
  let known = 0;
  for (const [id, card] of Object.entries(progress.cards)) {
    if (!findWord(id)) continue;
    if (card.ivl >= 1) learned++;
    if (card.ivl >= 21) known++;
  }
  const readyLearned = readyWords.filter((w) => (progress.cards[w.id] || NEW_CARD).ivl >= 1).length;
  const own = ownIds();
  const unstarted = readyWords.filter((w) => !progress.cards[w.id] && !own.has(w.id));
  const today = todayNumber();
  const waiting = today === null ? 0 : unstarted.filter((w) => w.day <= today).length;
  return { learned, known, readyLearned, unstarted, waiting };
}

// The next state of a card for grade g (0 Again, 1 Hard, 2 Good, 3 Easy).
// `requeue` > 0: show it again in this session, that many cards later.
function schedule(card, g, today) {
  const next = { ...card };
  if (card.ivl === 0) {
    // New, or forgotten and being learned again.
    if (g < 2) return { next, requeue: g === 0 ? 3 : 6 };
    next.ivl = g === 2 ? 1 : 4;
  } else if (g === 0) {
    next.lapses += 1;
    next.ease = Math.max(130, card.ease - 20);
    next.ivl = 0;
    next.due = today;
    return { next, requeue: 3 };
  } else if (g === 1) {
    next.ease = Math.max(130, card.ease - 15);
    next.ivl = Math.max(card.ivl + 1, Math.round(card.ivl * 1.2));
  } else {
    const good = Math.max(card.ivl + 1, Math.round((card.ivl * card.ease) / 100));
    if (g === 2) next.ivl = good;
    else {
      next.ease = card.ease + 15;
      next.ivl = Math.max(good + 1, Math.round(good * 1.3));
    }
  }
  next.ivl = Math.min(next.ivl, 365);
  next.reps += 1;
  next.due = today + next.ivl;
  return { next, requeue: 0 };
}

function intervalLabel(card, g) {
  const { next, requeue } = schedule(card, g, 0);
  if (requeue) return requeue <= 3 ? "soon" : "later";
  const d = next.ivl;
  if (d === 1) return "1 day";
  if (d < 30) return `${d} days`;
  if (d < 365) return `${Math.round(d / 30)} mo`;
  return "1 year";
}

function startSession() {
  const reviews = dueIds();
  const fresh = newIds();
  const queue = [];
  // One new word after every two reviews, so the new ones don't all wait for the end.
  while (reviews.length || fresh.length) {
    queue.push(...reviews.splice(0, 2));
    if (fresh.length) queue.push(fresh.shift());
  }
  session = queue.length ? { queue, shown: false } : null;
}

function showAnswer() {
  if (!session) return;
  session.shown = true;
  renderTrainer();
}

function answer(g) {
  if (!session || !session.shown) return;
  const id = session.queue[0];
  const key = dateKey();
  const log = (progress.wordLog[key] = progress.wordLog[key] || {});
  if (!progress.cards[id]) {
    const field = ownIds().has(id) ? "o" : "n";
    log[field] = (log[field] || 0) + 1;
  }
  log.a = (log.a || 0) + 1;
  const today = dayIndex();
  const { next, requeue } = schedule(progress.cards[id] || { ...NEW_CARD, due: today }, g, today);
  progress.cards[id] = next;
  session.queue.shift();
  if (requeue) session.queue.splice(Math.min(requeue, session.queue.length), 0, id);
  session.shown = false;
  if (session.queue.length) {
    persistSoon(1500);
    renderTrainer();
    return;
  }
  // Done: tick today's Words task.
  session = null;
  const n = todayNumber();
  const task = n >= 1 && n <= days.length ? days[n - 1].items.find((t) => t.kind === "anki") : null;
  if (task) taskKeys(task).forEach((k) => (progress.checked[k] = true));
  persistSoon(300);
  refresh();
}

function addOwnWord(ruRaw, enRaw) {
  // An apostrophe after a vowel marks the stress: приве'т → приве́т.
  const ru = ruRaw.trim().replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ])['’]/g, "$1́");
  const en = enRaw.trim();
  if (!ru || !en) return "Type the word and what it means.";
  const key = matchKey(ru);
  if (progress.myWords.some((w) => matchKey(w.ru) === key)) return `«${ru}» is already in your words.`;
  const ready = readyByKey.get(key);
  if (ready && progress.cards[ready.id]) return `«${ready.ru}» is already in your cards (day ${ready.day}).`;
  // A ready-made word you add yourself keeps its id: it comes now instead of on its plan day.
  const word = ready
    ? { id: ready.id, ru: ready.ru, en, added: dateKey() }
    : { id: `my:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ru, en, added: dateKey() };
  progress.myWords.push(word);
  if (session && !session.queue.includes(word.id)) session.queue.push(word.id);
  persistSoon();
  return "";
}

function deleteOwnWord(id) {
  progress.myWords = progress.myWords.filter((w) => w.id !== id);
  delete progress.cards[id];
  if (session) {
    session.queue = session.queue.filter((q) => q !== id);
    if (!session.queue.length) session = null;
  }
  persistSoon();
}

// Read a word aloud with the browser's Russian voice, if it has one.
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  ruVoice = speechSynthesis.getVoices().find((v) => (v.lang || "").toLowerCase().startsWith("ru")) || null;
}

function speakable(ru) {
  return ru.replace(STRESS_RE, "").replace(/\(.*?\)/g, "").replace(/\s+\/\s+/g, ", ").replace(/…/g, "");
}

function speak(ru) {
  if (!ruVoice) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speakable(ru));
  utterance.voice = ruVoice;
  utterance.lang = ruVoice.lang;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

function speakButton(ru) {
  if (!ruVoice) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "speak-btn";
  btn.textContent = "🔊";
  btn.title = "Listen";
  btn.setAttribute("aria-label", "Listen");
  btn.addEventListener("click", () => speak(ru));
  return btn;
}

function renderFlashcard() {
  const id = session.queue[0];
  const word = findWord(id);
  const card = progress.cards[id];
  const enFirst = progress.wordDir === "en";

  const wrap = document.createElement("div");
  wrap.className = "flashcard";
  const meta = document.createElement("div");
  meta.className = "fc-meta";
  const left = session.queue.length;
  const source = readyById.has(id) && !ownIds().has(id) ? `day ${word.day}` : "your word";
  meta.innerHTML = `<span>${left} card${left === 1 ? "" : "s"} left</span><span>${!card ? '<span class="fc-new">new</span> · ' : ""}${source}</span>`;
  wrap.appendChild(meta);

  const side = (text, isRu, cls) => {
    const div = document.createElement("div");
    div.className = cls;
    const span = document.createElement("span");
    span.textContent = text;
    div.appendChild(span);
    const btn = isRu ? speakButton(text) : null;
    if (btn) div.appendChild(btn);
    return div;
  };
  wrap.appendChild(side(enFirst ? word.en : word.ru, !enFirst, "fc-word"));
  if (session.shown) wrap.appendChild(side(enFirst ? word.ru : word.en, enFirst, "fc-answer"));

  const buttons = document.createElement("div");
  if (!session.shown) {
    buttons.className = "fc-show";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "next-btn";
    btn.textContent = "Show answer";
    btn.addEventListener("click", showAnswer);
    buttons.appendChild(btn);
  } else {
    buttons.className = "fc-grades";
    GRADES.forEach((label, g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `grade-btn grade-${label.toLowerCase()}`;
      btn.innerHTML = `${label}<small>${intervalLabel(card || NEW_CARD, g)}</small>`;
      btn.addEventListener("click", () => answer(g));
      buttons.appendChild(btn);
    });
  }
  wrap.appendChild(buttons);

  const foot = document.createElement("div");
  foot.className = "fc-foot";
  foot.innerHTML = `<span>Space: show · 1–4: rate</span>`;
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "link-btn";
  stop.textContent = "Stop for now";
  stop.addEventListener("click", () => {
    session = null;
    flushSave();
    refresh();
  });
  foot.appendChild(stop);
  wrap.appendChild(foot);
  return wrap;
}

function renderMyWords() {
  const details = document.createElement("details");
  details.className = "my-words";
  details.open = myWordsOpen;
  details.addEventListener("toggle", () => (myWordsOpen = details.open));
  details.innerHTML = `<summary>Add your own words · ${progress.myWords.length} so far</summary>`;

  const form = document.createElement("form");
  form.className = "add-word";
  form.innerHTML = `
    <input type="text" name="ru" placeholder="слово (stress: сло'во)" autocomplete="off" lang="ru" aria-label="Russian word or phrase" />
    <input type="text" name="en" placeholder="meaning" autocomplete="off" aria-label="Meaning" />
    <button type="submit" class="next-btn">Add</button>
  `;
  const note = document.createElement("div");
  note.className = "add-word-note";
  note.textContent =
    "Words you didn't know from a lesson or listening, and corrections from your error log. They come up in the trainer today. Type ' after the stressed vowel to mark the stress.";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const problem = addOwnWord(form.ru.value, form.en.value);
    if (problem) {
      note.textContent = problem;
      note.classList.add("warn");
      return;
    }
    myWordsOpen = true;
    renderTrainer();
    document.querySelector(".add-word input[name=ru]").focus();
  });
  details.append(form, note);

  if (progress.myWords.length) {
    const ul = document.createElement("ul");
    ul.className = "word-list my-word-list";
    [...progress.myWords].reverse().forEach((w) => {
      const li = wordItem(w.ru, w.en, cardStatus(w.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "word-del";
      del.textContent = "×";
      del.title = `Delete «${w.ru}»`;
      del.setAttribute("aria-label", del.title);
      del.addEventListener("click", () => {
        if (!confirm(`Delete «${w.ru}» and its progress?`)) return;
        deleteOwnWord(w.id);
        renderTrainer();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    details.appendChild(ul);
  }
  return details;
}

function renderTrainer() {
  const el = document.getElementById("trainer");
  el.innerHTML = "";
  if (!readyWords.length) return;

  const head = document.createElement("div");
  head.className = "trainer-head";
  head.innerHTML = '<h3 class="trainer-title">Word trainer</h3>';
  const dir = document.createElement("div");
  dir.className = "dir-switch";
  [
    ["ru", "Russian first"],
    ["en", "English first"],
  ].forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.className = (progress.wordDir || "ru") === value ? "active" : "";
    btn.addEventListener("click", () => {
      if (value === "ru") delete progress.wordDir;
      else progress.wordDir = value;
      persistSoon();
      renderTrainer();
    });
    dir.appendChild(btn);
  });
  head.appendChild(dir);
  el.appendChild(head);

  if (session) {
    el.appendChild(renderFlashcard());
    return;
  }

  const stats = wordStats();
  const streakDays = streak();
  const due = dueIds().length;
  const freshIds = newIds();
  const fresh = freshIds.length;
  const own = ownIds();
  const freshReady = freshIds.filter((id) => !own.has(id)).length;
  const line = document.createElement("div");
  line.className = "trainer-stats";
  line.innerHTML =
    `<strong>${stats.learned}</strong> words learned · <strong>${stats.known}</strong> known well` +
    (streakDays ? ` · <strong>${streakDays}</strong>-day streak` : "");
  el.appendChild(line);
  el.appendChild(renderProgressBar(stats.readyLearned, readyWords.length, "ready-made words"));

  const action = document.createElement("div");
  action.className = "trainer-action";
  if (due || fresh) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "next-btn";
    const parts = [due && `${due} review${due === 1 ? "" : "s"}`, fresh && `${fresh} new`].filter(Boolean);
    btn.textContent = `Study now: ${parts.join(", ")}`;
    btn.addEventListener("click", () => {
      startSession();
      renderTrainer();
    });
    action.appendChild(btn);
  } else {
    const done = document.createElement("span");
    done.className = "trainer-done";
    done.textContent = todayLog().a ? "✓ Done for today." : "Nothing due today.";
    action.appendChild(done);
    if (stats.unstarted.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "secondary-btn";
      more.textContent = "+10 new words";
      more.title = stats.waiting ? "Catch up on earlier days' words" : "Go ahead of the plan";
      more.addEventListener("click", () => {
        const key = dateKey();
        const log = (progress.wordLog[key] = progress.wordLog[key] || {});
        log.x = (log.x || 0) + 1;
        persistSoon();
        startSession();
        renderTrainer();
      });
      action.appendChild(more);
    }
  }
  el.appendChild(action);

  const hint = document.createElement("p");
  hint.className = "trainer-hint";
  if (!progress.startDate) {
    hint.textContent = `${NEW_PER_DAY} new words a day in plan order. Set your start date to keep them in step with the plan.`;
  } else if (stats.waiting > freshReady) {
    hint.textContent = `${stats.waiting} words from earlier days are waiting. When today's cards are done, “+10 new words” catches up.`;
  } else if (stats.unstarted.length) {
    hint.textContent = `New words come ${NEW_PER_DAY} a day with the plan; next up: day ${stats.unstarted[0].day}.`;
  } else {
    hint.textContent = "You've started every ready-made word. Keep up the reviews.";
  }
  el.appendChild(hint);
  el.appendChild(renderMyWords());
}

function wordItem(ru, en, status) {
  const li = document.createElement("li");
  li.className = `word w-${status}`;
  li.title = { new: "Not studied yet", learning: "Learning", learned: "Learned" }[status];
  const dot = document.createElement("span");
  dot.className = "w-dot";
  const r = document.createElement("span");
  r.className = "w-ru";
  r.textContent = ru;
  const e = document.createElement("span");
  e.className = "w-en";
  e.textContent = en;
  li.append(dot, r, e);
  return li;
}

function renderDayWords(day) {
  const block = document.createElement("div");
  block.className = "day-words";
  const learned = day.words.filter(([ru]) => cardStatus(cardId(ru)) === "learned").length;
  block.innerHTML = `<div class="day-words-head">Words for day ${day.n} <span class="muted">· ${learned} of ${day.words.length} learned</span></div>`;
  const ul = document.createElement("ul");
  ul.className = "word-list";
  day.words.forEach(([ru, en]) => ul.appendChild(wordItem(ru, en, cardStatus(cardId(ru)))));
  block.appendChild(ul);
  return block;
}

document.addEventListener("keydown", (e) => {
  if (!session || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
  // Only while the card is on screen, so Space still scrolls the plan further down.
  const card = document.querySelector(".flashcard");
  const box = card && card.getBoundingClientRect();
  if (!box || box.bottom < 0 || box.top > window.innerHeight) return;
  if (!session.shown && (e.key === " " || e.key === "Enter")) {
    e.preventDefault();
    showAnswer();
  } else if (session.shown && ["1", "2", "3", "4"].includes(e.key)) {
    e.preventDefault();
    answer(Number(e.key) - 1);
  }
});

window.addEventListener("pagehide", flushSave);

// ---------------------------------------------------------------- rendering

function renderProgressBar(done, total, unit) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const wrap = document.createElement("div");
  wrap.className = "progress";
  wrap.innerHTML = `
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-text">${pct}% complete — ${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${unit} done</div>
  `;
  return wrap;
}

function renderOverallProgress() {
  const holder = document.getElementById("overall-progress");
  holder.innerHTML = "";
  const tasks = days.flatMap((day) => day.items);
  if (tasks.length === 0) return;
  holder.appendChild(renderProgressBar(tasks.filter(taskDone).length, tasks.length, "daily tasks"));
}

function renderNotes() {
  const el = document.getElementById("notes");
  el.innerHTML = '<h3 class="section-heading">Notes and error log</h3>';
  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.rows = 8;
  textarea.placeholder =
    "Error log: what I said → what's correct (where it came up)\nЯ живу в Ташкент → Я живу в Ташкенте (exchange call)\n\nPlacement results, B2 date, mock scores: …";
  textarea.value = progress.notes[NOTES_KEY] || "";
  textarea.addEventListener("input", () => {
    if (textarea.value) progress.notes[NOTES_KEY] = textarea.value;
    else delete progress.notes[NOTES_KEY];
    persistSoon();
  });
  el.appendChild(textarea);
}

// ---------------------------------------------------------------- the 300-day plan

function selectDay(n) {
  activeDay = Math.min(Math.max(n, 1), days.length);
  try {
    localStorage.setItem(DAY_KEY, String(activeDay));
  } catch {}
}

function goToDay(n) {
  selectDay(n);
  refresh();
  document.getElementById("month-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMonthTabs() {
  const el = document.getElementById("month-tabs");
  el.innerHTML = "";
  const today = todayNumber();
  for (let m = 1; m <= Math.ceil(days.length / 30); m++) {
    const monthDays = days.slice((m - 1) * 30, m * 30);
    const complete = monthDays.every((day) => dayCounts(day).done === day.items.length);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "tab" +
      (monthOfDay(activeDay) === m ? " active" : "") +
      (complete ? " complete" : "") +
      (today && monthOfDay(today) === m ? " today" : "");
    btn.textContent = `${complete ? "✓ " : ""}Month ${m}`;
    btn.title = `Days ${(m - 1) * 30 + 1}–${m * 30}`;
    btn.addEventListener("click", () => {
      // Open today's day if it's in this month, otherwise the month's first unfinished day.
      const open = today && monthOfDay(today) === m ? today : (monthDays.find((day) => dayCounts(day).done < day.items.length) || monthDays[0]).n;
      selectDay(open);
      refresh();
    });
    el.appendChild(btn);
  }
}

function renderDayGrid() {
  const el = document.getElementById("day-grid");
  el.innerHTML = "";
  const today = todayNumber();
  const m = monthOfDay(activeDay);
  days.slice((m - 1) * 30, m * 30).forEach((day) => {
    const { done, total } = dayCounts(day);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "day-cell" +
      (day.n === activeDay ? " active" : "") +
      (done === total ? " done" : done > 0 ? " partial" : "") +
      (day.n === today ? " today" : "") +
      (day.week ? "" : " review");
    btn.textContent = day.n;
    btn.title = `Day ${day.n}${day.theme ? ` · ${day.theme}` : ""} — ${done}/${total} done`;
    btn.setAttribute("aria-label", btn.title);
    btn.addEventListener("click", () => {
      selectDay(day.n);
      refresh();
    });
    el.appendChild(btn);
  });
}

function renderTask(task) {
  const on = taskDone(task);
  const li = document.createElement("li");
  li.className = "item check-item day-task" + (on ? " done" : "");
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = on;
  box.addEventListener("change", () => setKeys(taskKeys(task), box.checked));
  const body = document.createElement("span");
  body.className = "check-text";
  body.innerHTML = `<span class="badge kind kind-${task.kind}">${KINDS[task.kind] || task.kind}</span>${formatText(task.text)}`;
  label.append(box, body);
  li.appendChild(label);
  return li;
}

function renderDayPanel() {
  const el = document.getElementById("day-panel");
  el.innerHTML = "";
  const day = days[activeDay - 1];
  if (!day) return;
  const today = todayNumber();
  const where = day.week
    ? `Month ${day.month}, week ${(day.week - 1) % 4 + 1}, day ${day.dow}${day.dow === 7 ? " (light day)" : ""}`
    : `Month ${day.month}, day ${(day.n - 1) % 30 + 1} (${day.theme.toLowerCase()})`;
  const date = startDate() ? ` · ${formatDate(dateOfDay(day.n))}` : "";

  const card = document.createElement("section");
  card.className = "part day-card";
  card.innerHTML = `
    <h3 class="part-heading">Day ${day.n}${day.n === today ? ' <span class="day-today">today</span>' : ""}</h3>
    <div class="day-meta">${escapeHtml(where)}${escapeHtml(date)}</div>
    ${day.week ? `<p class="day-goal"><strong>This week:</strong> ${escapeHtml(day.theme)}</p>` : ""}
  `;
  const ul = document.createElement("ul");
  ul.className = "list";
  day.items.forEach((task) => ul.appendChild(renderTask(task)));
  card.appendChild(ul);
  if (day.words && day.words.length) card.appendChild(renderDayWords(day));

  const nav = document.createElement("div");
  nav.className = "day-nav";
  const addButton = (text, n, primary) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = primary ? "next-btn" : "secondary-btn";
    btn.textContent = text;
    btn.addEventListener("click", () => goToDay(n));
    nav.appendChild(btn);
  };
  if (day.n > 1) addButton(`← Day ${day.n - 1}`, day.n - 1, false);
  if (today && today >= 1 && today <= days.length && today !== day.n) addButton("Today", today, false);
  if (day.n < days.length) addButton(`Day ${day.n + 1} →`, day.n + 1, true);
  card.appendChild(nav);
  el.appendChild(card);
}

// ---------------------------------------------------------------- account

function renderAccount() {
  const el = document.getElementById("account");
  el.innerHTML = "";

  if (email) {
    el.innerHTML = `
      <span>Tracking progress as <strong>${escapeHtml(email)}</strong></span>
      <button type="button" id="switch-email" class="link-btn">switch</button>
    `;
    document.getElementById("switch-email").addEventListener("click", async () => {
      flushSave();
      email = "";
      session = null;
      localStorage.removeItem(EMAIL_KEY);
      await loadProgress();
      renderAccount();
      refresh();
    });
    return;
  }

  el.innerHTML = `
    <input type="email" id="email-input" placeholder="you@example.com" autocomplete="email" />
    <button type="button" id="email-submit">Sync across devices</button>
    <div class="account-hint">
      Without an email, your checklist and words are saved in this browser only. Same email
      as the other pages; no password, so use one only you'd think to type here.
    </div>
  `;
  document.getElementById("email-submit").addEventListener("click", async () => {
    const value = document.getElementById("email-input").value.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      alert("Enter a valid email address.");
      return;
    }
    const local = progress;
    email = value;
    session = null;
    localStorage.setItem(EMAIL_KEY, email);
    await loadProgress();
    // First time syncing this email: carry over what was ticked and studied in this browser.
    if (!progressError && !hasProgress(progress) && hasProgress(local)) {
      progress = local;
      persistProgress();
    }
    renderAccount();
    refresh();
    if (progressError) alert(progressError);
  });
}

function refresh() {
  const scrollY = window.scrollY;
  renderStartDate();
  renderTrainer();
  renderMonthTabs();
  renderDayGrid();
  renderDayPanel();
  renderNotes();
  renderOverallProgress();
  window.scrollTo(0, scrollY);
}

async function main() {
  const statusEl = document.getElementById("status");
  email = localStorage.getItem(EMAIL_KEY) || "";
  renderAccount();

  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", () => {
      const had = Boolean(ruVoice);
      pickVoice();
      if (!had && ruVoice) renderTrainer();
    });
  }

  try {
    const [daily] = await Promise.all([fetch("/api/russian-days").then((r) => r.json()), loadProgress()]);
    days = daily.days || [];
    buildReadyWords();
    let savedDay = null;
    try {
      savedDay = Number(localStorage.getItem(DAY_KEY));
    } catch {}
    // Open today's day when the plan is running, otherwise the last day you looked at.
    const today = todayNumber();
    activeDay = today && today >= 1 && today <= days.length ? today : savedDay >= 1 && savedDay <= days.length ? savedDay : 1;
    refresh();
    if (progressError) statusEl.textContent = progressError;
  } catch (err) {
    statusEl.textContent = "Could not load the Russian roadmap.";
  }

  document.getElementById("start-date").addEventListener("change", (e) => {
    progress.startDate = e.target.value;
    persistProgress();
    const today = todayNumber();
    if (today && today >= 1 && today <= days.length) selectDay(today);
    refresh();
  });
}

main();
