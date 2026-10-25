const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "spark-roadmap-progress";
const DAY_KEY = "spark-roadmap-day";
const DIFFICULTY = { E: "Easy", M: "Medium", H: "Hard" };

// Every day is split into Theory, Lab and Exercise, and each part has its own
// notes box. The Exercise box is the original daily log, so it keeps the bare
// day number as its key and logs written before the split still show up.
const PART_NOTES = {
  theory: {
    suffix: "-theory",
    heading: "Theory notes",
    placeholder: "Write up the 📘 Learn & Note topics in your own words: the core ideas, principles, formulas and explanations you'll want to revisit.",
  },
  lab: {
    suffix: "-lab",
    heading: "Lab notes",
    placeholder: "Paste the explain outputs you saved. Note the plan you predicted vs. what explain and the Spark UI showed, and what broke and how you fixed it.",
  },
  exercise: {
    suffix: "",
    heading: "Recap and daily log",
    placeholder: "Answer today's checklist questions in your own words. Note which drills were slow and why, then re-answer yesterday's questions from memory.",
  },
};

// Same email-keyed storage as the course page, under a separate server key.
// Without an email, progress is kept in this browser only.
// progress = { checked: { [itemId]: true }, notes: { [day | "day-part"]: "..." }, startDate: "YYYY-MM-DD" }
let email = "";
let progress = emptyProgress();
let progressError = "";
let days = [];
let activeDay = 1;
let activePart = "theory";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyProgress() {
  return { checked: {}, notes: {}, startDate: "" };
}

function normalizeProgress(data) {
  return { ...emptyProgress(), ...(data && typeof data === "object" ? data : {}) };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
    const res = await fetch(`/api/roadmap-progress/${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    progress = normalizeProgress(await res.json());
  } catch (err) {
    progress = readLocal();
    progressError = "Couldn't load your saved roadmap progress from the server — showing this browser's copy.";
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
    fetch(`/api/roadmap-progress/${encodeURIComponent(targetEmail)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress),
    }).catch(() => {})
  );
  return persistChain;
}

// Typing in the daily log shouldn't fire a PUT per keystroke.
let noteTimer = null;
function persistSoon() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(persistProgress, 600);
}

function dayItems(day) {
  return day.parts.flatMap(partItems);
}

function partItems(part) {
  return part.activities.flatMap(activityItems);
}

function activityItems(activity) {
  return activity.blocks.flatMap((b) => b.items);
}

// Open a day on the first part that still has unticked items.
function firstOpenPart(day) {
  const open = day.parts.find((part) => countChecked(partItems(part)) < partItems(part).length);
  return (open || day.parts[0]).key;
}

function selectDay(dayNumber) {
  activeDay = dayNumber;
  activePart = firstOpenPart(days.find((d) => d.day === dayNumber));
  try {
    localStorage.setItem(DAY_KEY, String(activeDay));
  } catch {}
}

function countChecked(items) {
  return items.filter((item) => progress.checked[item.id]).length;
}

function renderProgressBar(done, total, unit = "items") {
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
  const all = days.flatMap(dayItems);
  const daysDone = days.filter((d) => countChecked(dayItems(d)) === dayItems(d).length).length;
  const holder = document.getElementById("overall-progress");
  holder.innerHTML = "";
  if (all.length === 0) return;
  holder.appendChild(renderProgressBar(countChecked(all), all.length));
  const daysText = document.createElement("div");
  daysText.className = "progress-text";
  daysText.textContent = `${daysDone} of ${days.length} days fully complete`;
  holder.appendChild(daysText);
}

// Which roadmap day "today" is, counting the start date as Day 1.
function todayDayNumber() {
  if (!progress.startDate) return null;
  const start = new Date(progress.startDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - start) / 86400000) + 1;
}

function renderStartDate() {
  const input = document.getElementById("start-date");
  input.value = progress.startDate || "";
  const hint = document.getElementById("today-hint");
  const n = todayDayNumber();
  if (n === null) hint.textContent = "Set it to see which day you're on.";
  else if (n < 1) hint.textContent = `Starts in ${1 - n} day${n === 0 ? "" : "s"}.`;
  else if (n > days.length) hint.textContent = "Roadmap period is over — finish any open items.";
  else hint.textContent = `Today is Day ${n}.`;
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  const today = todayDayNumber();

  days.forEach((day) => {
    const items = dayItems(day);
    const done = countChecked(items);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "tab" +
      (day.day === activeDay ? " active" : "") +
      (done === items.length ? " complete" : "") +
      (day.day === today ? " today" : "");
    btn.textContent = done === items.length ? `✓ Day ${day.day}` : `Day ${day.day}`;
    btn.title = `${day.theme} — ${done}/${items.length}`;
    btn.addEventListener("click", () => {
      selectDay(day.day);
      refresh();
    });
    tabsEl.appendChild(btn);
  });
}

function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item check-item" + (progress.checked[item.id] ? " done" : "");

  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!progress.checked[item.id];
  box.addEventListener("change", () => {
    if (box.checked) progress.checked[item.id] = true;
    else delete progress.checked[item.id];
    persistProgress();
    refresh();
  });

  const body = document.createElement("span");
  body.className = "check-text";
  const badge = item.difficulty
    ? `<span class="badge badge-${item.difficulty}">${DIFFICULTY[item.difficulty]}</span>`
    : "";
  const title = item.title ? `<strong>${escapeHtml(item.title)}</strong>${item.difficulty ? "" : ":"} ` : "";
  body.innerHTML = `${badge}${title}${item.difficulty && item.title ? "<br />" : ""}${escapeHtml(item.text)}`;

  label.appendChild(box);
  label.appendChild(body);
  li.appendChild(label);
  return li;
}

function renderTable(table) {
  // Wide tables (Day 11 has five columns) scroll sideways on a phone instead of the page.
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const el = document.createElement("table");
  el.className = "symptoms";
  el.innerHTML =
    `<tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>` +
    table.rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  wrap.appendChild(el);
  return wrap;
}

function renderPartSwitch(day) {
  const nav = document.createElement("div");
  nav.className = "part-switch";
  nav.id = "part-switch";

  day.parts.forEach((part, i) => {
    const items = partItems(part);
    const done = countChecked(items);
    const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "part-switch-btn" + (part.key === activePart ? " active" : "") + (done === items.length ? " complete" : "");
    btn.setAttribute("aria-pressed", String(part.key === activePart));
    btn.innerHTML = `
      <span class="part-switch-name">${i + 1}. ${escapeHtml(part.name)}${done === items.length ? " ✓" : ""}</span>
      <span class="part-switch-tagline">${escapeHtml(part.tagline)}</span>
      <span class="part-switch-meta">${part.time ? `${escapeHtml(part.time)} · ` : ""}${done}/${items.length}</span>
      <span class="part-switch-track"><span class="part-switch-fill" style="width:${pct}%"></span></span>
    `;
    btn.addEventListener("click", () => {
      activePart = part.key;
      refresh();
    });
    nav.appendChild(btn);
  });
  return nav;
}

function renderBlock(block, parent) {
  if (block.label) {
    const sub = document.createElement("h4");
    sub.className = "block-heading" + (block.label === "What to learn first" ? " learn-first" : "");
    const added = block.added ? ` <span class="badge badge-added" title="Beginner lesson the original checklist assumes you know">added</span>` : "";
    sub.innerHTML = `${escapeHtml(block.label)}${added} <span class="muted">${countChecked(block.items)}/${block.items.length}</span>`;
    parent.appendChild(sub);
  }
  if (block.note) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = block.note;
    parent.appendChild(note);
  }
  const ul = document.createElement("ul");
  ul.className = "list";
  block.items.forEach((item) => ul.appendChild(renderItem(item)));
  parent.appendChild(ul);
}

function renderActivity(activity) {
  const items = activityItems(activity);
  const el = document.createElement("div");
  el.className = "section";

  const heading = document.createElement("h3");
  heading.className = "section-heading";
  const time = activity.time ? `${escapeHtml(activity.time)} · ` : "";
  heading.innerHTML = `${escapeHtml(activity.name)} <span class="muted">${time}${countChecked(items)}/${items.length}</span>`;
  el.appendChild(heading);

  if (activity.note) {
    const note = document.createElement("p");
    note.className = "activity-note";
    note.textContent = activity.note;
    el.appendChild(note);
  }

  activity.blocks.forEach((block) => renderBlock(block, el));

  if (activity.table) el.appendChild(renderTable(activity.table));
  if (activity.footnote) {
    const foot = document.createElement("p");
    foot.className = "activity-note";
    foot.textContent = activity.footnote;
    el.appendChild(foot);
  }
  return el;
}

function renderPartNotes(day, part) {
  const config = PART_NOTES[part.key];
  const key = `${day.day}${config.suffix}`;
  const notesEl = document.createElement("div");
  notesEl.className = "section";
  notesEl.innerHTML = `<h3 class="section-heading">${escapeHtml(config.heading)}</h3>`;
  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.rows = 8;
  textarea.placeholder = config.placeholder;
  textarea.value = progress.notes[key] || "";
  textarea.addEventListener("input", () => {
    if (textarea.value) progress.notes[key] = textarea.value;
    else delete progress.notes[key];
    persistSoon();
  });
  notesEl.appendChild(textarea);
  return notesEl;
}

// "Next: Lab", "Next: Exercise", then "Next: Day N+1" at the end of a day.
function renderNextButton(day, part) {
  const idx = day.parts.indexOf(part);
  const nextPart = day.parts[idx + 1];
  const nextDay = days.find((d) => d.day === day.day + 1);
  if (!nextPart && !nextDay) return null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "next-btn";
  btn.textContent = nextPart ? `Next: ${nextPart.name} →` : `Next: Day ${nextDay.day} →`;
  btn.addEventListener("click", () => {
    if (nextPart) activePart = nextPart.key;
    else selectDay(nextDay.day);
    refresh();
    document.getElementById(nextPart ? "part-switch" : "tabs").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return btn;
}

function renderDay() {
  const container = document.getElementById("day");
  container.innerHTML = "";
  const day = days.find((d) => d.day === activeDay);
  if (!day) return;

  const items = dayItems(day);
  const dayEl = document.createElement("section");
  dayEl.className = "part";
  dayEl.innerHTML = `
    <h2 class="part-heading">Day ${day.day}: ${escapeHtml(day.title)}</h2>
    <div class="day-meta">Checklist section: ${escapeHtml(day.checklist)} · Lab output: ${escapeHtml(day.labOutput)}</div>
    ${day.intro ? `<p class="day-goal">${escapeHtml(day.intro)}</p>` : ""}
    <p class="day-goal"><strong>Goal:</strong> ${escapeHtml(day.goal)}</p>
    ${day.note ? `<p class="activity-note">${escapeHtml(day.note)}</p>` : ""}
  `;
  dayEl.appendChild(renderProgressBar(countChecked(items), items.length));
  dayEl.appendChild(renderPartSwitch(day));

  const part = day.parts.find((p) => p.key === activePart) || day.parts[0];
  const partEl = document.createElement("div");
  partEl.className = `day-part day-part-${part.key}`;
  const partHeading = document.createElement("h3");
  partHeading.className = "day-part-heading";
  partHeading.innerHTML = `${escapeHtml(part.name)} <span class="muted">${escapeHtml(part.tagline)}${part.time ? ` · ${escapeHtml(part.time)}` : ""}</span>`;
  partEl.appendChild(partHeading);
  if (part.studyFrom) {
    const study = document.createElement("p");
    study.className = "study-from";
    study.innerHTML = `<strong>Study from:</strong> ${escapeHtml(part.studyFrom)}`;
    partEl.appendChild(study);
  }

  part.activities.forEach((activity) => partEl.appendChild(renderActivity(activity)));
  partEl.appendChild(renderPartNotes(day, part));
  const next = renderNextButton(day, part);
  if (next) partEl.appendChild(next);

  dayEl.appendChild(partEl);
  container.appendChild(dayEl);
}

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
      as the course page; no password, so use one only you'd think to type here.
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
  renderTabs();
  renderDay();
  renderOverallProgress();
  window.scrollTo(0, scrollY);
}

async function main() {
  const statusEl = document.getElementById("status");
  email = localStorage.getItem(EMAIL_KEY) || "";
  renderAccount();

  try {
    const [content] = await Promise.all([fetch("/api/roadmap").then((r) => r.json()), loadProgress()]);
    days = content;
    const today = todayDayNumber();
    const saved = Number(localStorage.getItem(DAY_KEY));
    activeDay = today >= 1 && today <= days.length ? today : saved || 1;
    activePart = firstOpenPart(days.find((d) => d.day === activeDay) || days[0]);
    refresh();
    if (progressError) statusEl.textContent = progressError;
  } catch (err) {
    statusEl.textContent = "Could not load the roadmap.";
  }

  document.getElementById("start-date").addEventListener("change", (e) => {
    progress.startDate = e.target.value;
    persistProgress();
    refresh();
  });
}

main();
