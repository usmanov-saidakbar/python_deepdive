const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "russian-roadmap-progress";
const DAY_KEY = "russian-roadmap-day";
const NOTES_KEY = "log";
const PLAN_DAYS = 300;

const KINDS = {
  setup: "Setup",
  anki: "Anki",
  grammar: "Grammar",
  input: "Listen",
  speak: "Speak",
  write: "Write",
  review: "Review",
  test: "Test",
  project: "Project",
};

// Same email-keyed storage as the other pages, under its own server key.
// progress = { checked: { [key]: true }, notes: { log: "..." }, startDate: "YYYY-MM-DD" }
// A daily task is ticked under its own id ("d37-speak"), or under its `keys` when it has them:
// those come from the stage checklists the page used to have, so ticks saved back then still show.
let email = "";
let progress = emptyProgress();
let progressError = "";
let days = [];
let activeDay = 1;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyProgress() {
  return { checked: {}, notes: {}, startDate: "" };
}

// The page used to keep a notes box per stage and one per week; fold them all into the one box.
function normalizeProgress(data) {
  const result = { ...emptyProgress(), ...(data && typeof data === "object" ? data : {}) };
  const old = Object.keys(result.notes).filter((key) => key !== NOTES_KEY).sort();
  if (old.length) {
    const parts = [result.notes[NOTES_KEY], ...old.map((key) => result.notes[key])].filter(Boolean);
    result.notes = parts.length ? { [NOTES_KEY]: parts.join("\n\n") } : {};
  }
  return result;
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

// One PUT in flight at a time, in order, each sending the live `progress`
// (see the matching comment in app.js for why).
let persistChain = Promise.resolve();

function persistProgress() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (private mode) — the server copy still saves.
  }
  if (!email) return persistChain;
  const targetEmail = email;
  persistChain = persistChain.then(() =>
    fetch(`/api/russian-progress/${encodeURIComponent(targetEmail)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    }).catch(() => {})
  );
  return persistChain;
}

// Typing in the notes box shouldn't fire a PUT per keystroke.
let noteTimer = null;
function persistSoon() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(persistProgress, 600);
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

// Day 1 is the start date. Counted on calendar dates, so clock changes can't shift it.
function todayNumber() {
  const start = startDate();
  if (!start) return null;
  const now = new Date();
  const diff = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.round(diff / 86400000) + 1;
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

// ---------------------------------------------------------------- rendering

function renderProgressBar(done, total, unit) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const wrap = document.createElement("div");
  wrap.className = "progress";
  wrap.innerHTML = `
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-text">${pct}% complete — ${done} of ${total} ${unit} done</div>
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
      email = "";
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
      Without an email, your checklist is saved in this browser only. Same email
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
    localStorage.setItem(EMAIL_KEY, email);
    await loadProgress();
    // First time syncing this email: carry over what was ticked in this browser.
    if (!progressError && Object.keys(progress.checked).length === 0 && Object.keys(local.checked).length > 0) {
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

  try {
    const [daily] = await Promise.all([fetch("/api/russian-days").then((r) => r.json()), loadProgress()]);
    days = daily.days || [];
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
