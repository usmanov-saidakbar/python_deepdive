const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "spark-roadmap-progress";
const DAY_KEY = "spark-roadmap-day";
const DIFFICULTY = { E: "Easy", M: "Medium", H: "Hard" };

// Same email-keyed storage as the course page, under a separate server key.
// Without an email, progress is kept in this browser only.
// progress = { checked: { [itemId]: true }, notes: { [day]: "..." }, startDate: "YYYY-MM-DD" }
let email = "";
let progress = emptyProgress();
let progressError = "";
let days = [];
let activeDay = 1;

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
  return day.sections.flatMap((s) => s.items);
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
      activeDay = day.day;
      try {
        localStorage.setItem(DAY_KEY, String(activeDay));
      } catch {}
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

function renderDay() {
  const container = document.getElementById("day");
  container.innerHTML = "";
  const day = days.find((d) => d.day === activeDay);
  if (!day) return;

  const items = dayItems(day);
  const partEl = document.createElement("section");
  partEl.className = "part";
  partEl.innerHTML = `
    <h2 class="part-heading">Day ${day.day}: ${escapeHtml(day.title)}</h2>
    <div class="day-meta">Checklist section: ${escapeHtml(day.checklist)} · Lab output: ${escapeHtml(day.labOutput)}</div>
    <p class="day-goal"><strong>Goal:</strong> ${escapeHtml(day.goal)}</p>
  `;
  partEl.appendChild(renderProgressBar(countChecked(items), items.length));

  day.sections.forEach((section) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "section";

    const heading = document.createElement("h3");
    heading.className = "section-heading";
    heading.innerHTML = `${escapeHtml(section.name)} <span class="muted">${countChecked(section.items)}/${section.items.length}</span>`;
    sectionEl.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "list";
    section.items.forEach((item) => ul.appendChild(renderItem(item)));
    sectionEl.appendChild(ul);
    partEl.appendChild(sectionEl);
  });

  const notesEl = document.createElement("div");
  notesEl.className = "section";
  notesEl.innerHTML = `<h3 class="section-heading">Daily log</h3>`;
  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.rows = 8;
  textarea.placeholder = "Answer today's checklist questions in your own words. Note plans you predicted vs. what explain showed.";
  textarea.value = progress.notes[day.day] || "";
  textarea.addEventListener("input", () => {
    if (textarea.value) progress.notes[day.day] = textarea.value;
    else delete progress.notes[day.day];
    persistSoon();
  });
  notesEl.appendChild(textarea);
  partEl.appendChild(notesEl);

  container.appendChild(partEl);
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
  renderStartDate();
  renderTabs();
  renderDay();
  renderOverallProgress();
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
