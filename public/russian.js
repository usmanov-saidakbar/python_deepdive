const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "russian-roadmap-progress";
const TAB_KEY = "russian-roadmap-tab";
const DAY_KEY = "russian-roadmap-day";
const PLAN_DAYS = 300;
// Self-assessment days: day 29 of every second month (the review day).
const REVIEW_DAYS = [59, 119, 179, 239, 299];

// A topic's depth level decides which steps it needs (see "How to use this roadmap").
const LEVELS = {
  2: { name: "Recognize", steps: ["learn", "spot"] },
  3: { name: "Use", steps: ["learn", "drill", "speak"] },
  4: { name: "Automatic", steps: ["learn", "drill", "speak", "auto"] },
};
const STEPS = {
  learn: { label: "Learn", hint: "Read or watched the explanation; you can say the rule and give 3 examples" },
  spot: { label: "Spot", hint: "Found and understood 10 examples in real texts or audio" },
  drill: { label: "Drill", hint: "Did the exercises out loud until about 9 in 10 were right" },
  speak: { label: "Speak", hint: "Said 10+ sentences of your own with it, and used it in a conversation" },
  auto: { label: "Automatic", hint: "It came out right in unplanned speech: a whole conversation without a correction on it" },
};
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
// progress = { checked: { [key]: true }, notes: { [key]: "..." }, startDate: "YYYY-MM-DD" }
// Keys: "<topicId>:<step>", "<selfCheckId>:r<round>", "<projectId>:<step>", "<checkId>", or a daily
// task's own id ("d37-speak"). A daily task with `keys` ticks those keys instead, so the
// 300-day plan and the stage checklists share one set of checkmarks.
let email = "";
let progress = emptyProgress();
let progressError = "";
let plan = { stages: [], sources: [], selfCheckRounds: [], projectSteps: [] };
let days = [];
let activeStage = "s0";
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

// Typing in a notes box shouldn't fire a PUT per keystroke.
let noteTimer = null;
function persistSoon() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(persistProgress, 600);
}

// ---------------------------------------------------------------- keys and counts

function projectById(id) {
  for (const stage of plan.stages) {
    for (const group of stage.groups || []) {
      const found = group.items.find((item) => item.id === id);
      if (found) return found;
    }
  }
  return null;
}

function itemKeys(item, kind) {
  if (kind === "topics") return LEVELS[item.level].steps.map((step) => `${item.id}:${step}`);
  if (kind === "projects") return plan.projectSteps.map((step) => `${item.id}:${step.key}`);
  if (kind === "selfcheck") return plan.selfCheckRounds.map((_, i) => `${item.id}:r${i}`);
  return [item.id];
}

// The keys a stage counts: its topics and checks, plus the speaking project it ends with.
// Self-assessment rounds are a measurement, not work, so they stay out of the progress bars.
function stageKeys(stage) {
  const keys = [];
  (stage.groups || []).forEach((group) => {
    if (group.kind === "selfcheck") return;
    group.items.forEach((item) => keys.push(...itemKeys(item, group.kind)));
  });
  if (stage.projectRef) keys.push(...itemKeys(projectById(stage.projectRef), "projects"));
  return [...new Set(keys)];
}

function countChecked(keys) {
  return keys.filter((key) => progress.checked[key]).length;
}

function allTopics() {
  return plan.stages.flatMap((stage) =>
    (stage.groups || []).filter((g) => g.kind === "topics").flatMap((g) => g.items)
  );
}

function topicDone(topic) {
  return itemKeys(topic, "topics").every((key) => progress.checked[key]);
}

function setChecked(key, on) {
  setKeys([key], on);
}

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

function stageOfDay(n) {
  const day = days[n - 1];
  return day ? plan.stages.find((s) => s.key === day.stage) : null;
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
    hint.textContent = `All ${PLAN_DAYS} days are behind you: finish your open tasks, take a mock again and redo the self-assessment.`;
    return;
  }
  const stage = stageOfDay(n);
  const next = REVIEW_DAYS.find((d) => d >= n);
  const review = next ? ` Next self-assessment: day ${next} (${formatDate(dateOfDay(next))}).` : "";
  hint.textContent = `Today is day ${n} of ${PLAN_DAYS} · month ${monthOfDay(n)} · ${stage ? `${stage.tab}: ${stage.title}` : ""}.${review}`;
}

function todayStages() {
  const n = todayNumber();
  if (n === null || n < 1 || n > PLAN_DAYS) return [];
  const keys = n <= 7 ? ["s0"] : [];
  const stage = stageOfDay(n);
  if (stage) keys.push(stage.key);
  return keys;
}

// ---------------------------------------------------------------- rendering helpers

function renderProgressBar(done, total, unit = "steps") {
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
  const topics = allTopics();
  const projects = (plan.stages.find((s) => s.key === "projects")?.groups || []).flatMap((g) => g.items);
  const recorded = projects.filter((p) => progress.checked[`${p.id}:recorded`]).length;
  const fullDays = days.filter((day) => dayCounts(day).done === day.items.length).length;
  const text = document.createElement("div");
  text.className = "progress-text";
  text.textContent = `${fullDays} of ${days.length} days complete · ${topics.filter(topicDone).length} of ${topics.length} topics at their target level · ${recorded} of ${projects.length} speaking projects recorded`;
  holder.appendChild(text);
}

function renderLink(label, url) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = label;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

function renderLinks(prefix, links) {
  const line = document.createElement("div");
  line.className = "topic-line";
  line.append(`${prefix} `);
  links.forEach((link, i) => {
    if (i > 0) line.append(" · ");
    line.appendChild(renderLink(link.label, link.url));
  });
  return line;
}

// A row of toggle chips, one per key: the steps of a topic, the rounds of a self-check, the steps of a project.
function renderChips(entries) {
  const row = document.createElement("div");
  row.className = "chips";
  entries.forEach(({ key, label, hint }) => {
    const on = !!progress.checked[key];
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (on ? " on" : "");
    chip.setAttribute("aria-pressed", String(on));
    chip.title = hint || "";
    chip.textContent = `${on ? "✓ " : ""}${label}`;
    chip.addEventListener("click", () => setChecked(key, !on));
    row.appendChild(chip);
  });
  return row;
}

function stageButton(stageKey, text) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link-btn";
  btn.textContent = text;
  btn.addEventListener("click", () => {
    selectStage(stageKey);
    refresh();
    document.getElementById("tabs").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return btn;
}

function renderTopic(topic) {
  const level = LEVELS[topic.level];
  const done = topicDone(topic);
  const li = document.createElement("li");
  li.className = "item topic-item" + (done ? " done" : "");

  const head = document.createElement("div");
  head.className = "topic-head";
  head.innerHTML = `<span class="badge level l${topic.level}" title="Target depth: ${level.name}">${level.name}</span><strong class="topic-title">${escapeHtml(topic.title)}</strong>${done ? ' <span class="topic-reached">reached ✓</span>' : ""}`;
  li.appendChild(head);

  if (topic.sources.length) li.appendChild(renderLinks("Source:", topic.sources));
  if (topic.practice) {
    const line = document.createElement("div");
    line.className = "topic-line";
    line.innerHTML = `Say it: ${formatText(topic.practice)}`;
    li.appendChild(line);
  }
  li.appendChild(
    renderChips(level.steps.map((step) => ({ key: `${topic.id}:${step}`, label: STEPS[step].label, hint: STEPS[step].hint })))
  );
  return li;
}

function renderCheck(item) {
  const on = !!progress.checked[item.id];
  const li = document.createElement("li");
  li.className = "item check-item" + (on ? " done" : "");
  const label = document.createElement("label");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = on;
  box.addEventListener("change", () => setChecked(item.id, box.checked));
  const body = document.createElement("span");
  body.className = "check-text";
  body.innerHTML = formatText(item.text);
  label.append(box, body);
  li.appendChild(label);
  return li;
}

function renderSelfCheck(item) {
  const li = document.createElement("li");
  li.className = "item topic-item";
  const text = document.createElement("div");
  text.className = "topic-title-line";
  text.innerHTML = formatText(item.text);
  li.appendChild(text);
  if (item.stage) {
    const stage = plan.stages.find((s) => s.key === item.stage);
    const line = document.createElement("div");
    line.className = "topic-line";
    line.append("Worked on in ");
    line.appendChild(stageButton(item.stage, `${stage.tab}: ${stage.title}`));
    li.appendChild(line);
  }
  li.appendChild(
    renderChips(plan.selfCheckRounds.map((round, i) => ({ key: `${item.id}:r${i}`, label: round, hint: `I could do it at the ${round.toLowerCase()} self-assessment` })))
  );
  return li;
}

function renderProject(project, note) {
  const keys = itemKeys(project, "projects");
  const li = document.createElement("li");
  li.className = "item topic-item project-item" + (countChecked(keys) === keys.length ? " done" : "");
  li.innerHTML = `
    <div class="topic-head"><span class="badge project-badge">Project ${escapeHtml(project.n)}</span><strong class="topic-title">${escapeHtml(project.title)}</strong></div>
    <div class="topic-line">${escapeHtml(project.stage)} · proves: ${escapeHtml(project.proves)}</div>
    ${note ? `<div class="topic-line">${formatText(note)}</div>` : ""}
  `;
  li.appendChild(renderChips(plan.projectSteps.map((step) => ({ key: `${project.id}:${step.key}`, label: step.label, hint: step.hint }))));
  return li;
}

function renderGroup(group, parent) {
  const keys = group.kind === "selfcheck" ? [] : group.items.flatMap((item) => itemKeys(item, group.kind));
  const heading = document.createElement("h3");
  heading.className = "section-heading";
  heading.innerHTML = `${escapeHtml(group.label)}${keys.length ? ` <span class="muted">${countChecked(keys)}/${keys.length}</span>` : ""}`;
  parent.appendChild(heading);
  const ul = document.createElement("ul");
  ul.className = "list";
  group.items.forEach((item) => {
    if (group.kind === "topics") ul.appendChild(renderTopic(item));
    else if (group.kind === "selfcheck") ul.appendChild(renderSelfCheck(item));
    else if (group.kind === "projects") ul.appendChild(renderProject(item));
    else ul.appendChild(renderCheck(item));
  });
  parent.appendChild(ul);
}

function renderSelfCheckSummary(stage) {
  const items = stage.groups.filter((g) => g.kind === "selfcheck").flatMap((g) => g.items);
  const p = document.createElement("p");
  p.className = "activity-note";
  p.textContent =
    "Could do it without help: " +
    plan.selfCheckRounds.map((round, i) => `${round} ${items.filter((item) => progress.checked[`${item.id}:r${i}`]).length}/${items.length}`).join(" · ");
  return p;
}

function renderLinkList(label, items, parent) {
  const heading = document.createElement("h4");
  heading.className = "block-heading";
  heading.textContent = label;
  const ul = document.createElement("ul");
  ul.className = "link-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.appendChild(renderLink(item.label, item.url));
    if (item.note) {
      // Notes may hold [label](https://...) links too; formatText escapes before adding tags.
      const note = document.createElement("span");
      note.innerHTML = ` — ${formatText(item.note)}`;
      li.appendChild(note);
    }
    ul.appendChild(li);
  });
  parent.append(heading, ul);
}

function renderNotes(stage) {
  const key = `stage-${stage.key}`;
  const el = document.createElement("div");
  el.className = "section";
  el.innerHTML = `<h3 class="section-heading">${escapeHtml(stage.notes.heading)}</h3>`;
  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.rows = 8;
  textarea.placeholder = stage.notes.placeholder;
  textarea.value = progress.notes[key] || "";
  textarea.addEventListener("input", () => {
    if (textarea.value) progress.notes[key] = textarea.value;
    else delete progress.notes[key];
    persistSoon();
  });
  el.appendChild(textarea);
  return el;
}

function renderNextButton(stage) {
  const idx = plan.stages.indexOf(stage);
  const next = plan.stages[idx + 1];
  if (!next) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "next-btn";
  btn.textContent = `Next: ${next.tab} →`;
  btn.addEventListener("click", () => {
    selectStage(next.key);
    refresh();
    document.getElementById("tabs").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return btn;
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
    const stage = plan.stages.find((s) => s.key === monthDays[0].stage);
    btn.title = `Days ${(m - 1) * 30 + 1}–${m * 30}${stage ? ` · ${stage.tab}: ${stage.title}` : ""}`;
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
  const stage = stageOfDay(day.n);
  const where = day.week
    ? `Month ${day.month}, week ${(day.week - 1) % 4 + 1}, day ${day.dow}${day.dow === 7 ? " (light day)" : ""}`
    : `Month ${day.month}, day ${(day.n - 1) % 30 + 1} (${day.theme.toLowerCase()})`;
  const date = startDate() ? ` · ${formatDate(dateOfDay(day.n))}` : "";
  const { done, total } = dayCounts(day);

  const card = document.createElement("section");
  card.className = "part day-card";
  card.innerHTML = `
    <h3 class="part-heading">Day ${day.n}${day.n === today ? ' <span class="day-today">today</span>' : ""}</h3>
    <div class="day-meta">${escapeHtml(where)}${escapeHtml(date)}${stage ? ` · ${escapeHtml(`${stage.tab}: ${stage.title}`)}` : ""}</div>
    ${day.week ? `<p class="day-goal"><strong>This week:</strong> ${escapeHtml(day.theme)}</p>` : ""}
  `;
  card.appendChild(renderProgressBar(done, total, "tasks"));
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

// ---------------------------------------------------------------- stage tabs (reference)

function selectStage(key) {
  activeStage = key;
  try {
    localStorage.setItem(TAB_KEY, key);
  } catch {}
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  const today = todayStages();
  plan.stages.forEach((stage) => {
    const keys = stageKeys(stage);
    const complete = keys.length > 0 && countChecked(keys) === keys.length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "tab" + (stage.key === activeStage ? " active" : "") + (complete ? " complete" : "") + (today.includes(stage.key) ? " today" : "");
    btn.textContent = `${complete ? "✓ " : ""}${stage.tab}`;
    btn.title = `${stage.title} · ${stage.when}${keys.length ? ` — ${countChecked(keys)}/${keys.length}` : ""}`;
    btn.addEventListener("click", () => {
      selectStage(stage.key);
      refresh();
    });
    tabsEl.appendChild(btn);
  });
}

function renderStage() {
  const container = document.getElementById("stage");
  container.innerHTML = "";
  const stage = plan.stages.find((s) => s.key === activeStage);
  if (!stage) return;

  const el = document.createElement("section");
  el.className = "part";
  el.innerHTML = `
    <h2 class="part-heading">${escapeHtml(stage.tab.startsWith("Stage") ? `${stage.tab}: ${stage.title}` : stage.title)}</h2>
    <div class="day-meta">${escapeHtml(stage.when)}${stage.pace ? ` · ${escapeHtml(stage.pace)}` : ""}</div>
    <p class="day-goal"><strong>Goal:</strong> ${escapeHtml(stage.goal)}</p>
  `;
  (stage.intro || []).forEach((text) => {
    const p = document.createElement("p");
    p.className = "day-goal";
    p.innerHTML = formatText(text);
    el.appendChild(p);
  });

  const keys = stageKeys(stage);
  if (keys.length) el.appendChild(renderProgressBar(countChecked(keys), keys.length));
  if (stage.groups.some((g) => g.kind === "selfcheck")) el.appendChild(renderSelfCheckSummary(stage));

  if (stage.sources) {
    const box = document.createElement("div");
    box.className = "section";
    renderLinkList("Main sources", stage.sources, box);
    el.appendChild(box);
  }
  (stage.callouts || []).forEach((text) => {
    const p = document.createElement("p");
    p.className = "callout";
    p.innerHTML = formatText(text);
    el.appendChild(p);
  });

  stage.groups.forEach((group) => {
    const section = document.createElement("div");
    section.className = "section";
    renderGroup(group, section);
    el.appendChild(section);
  });

  if (stage.projectRef) {
    const section = document.createElement("div");
    section.className = "section";
    const project = projectById(stage.projectRef);
    section.innerHTML = `<h3 class="section-heading">Stage project: speaking project ${escapeHtml(project.n)}</h3>`;
    const ul = document.createElement("ul");
    ul.className = "list";
    ul.appendChild(renderProject(project, stage.projectNote));
    section.appendChild(ul);
    el.appendChild(section);
  }

  el.appendChild(renderNotes(stage));
  const next = renderNextButton(stage);
  if (next) el.appendChild(next);
  container.appendChild(el);
}

// ---------------------------------------------------------------- weekly check and sources

// ISO week: weeks start on Monday, week 1 contains the year's first Thursday.
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

function renderWeekly() {
  const body = document.getElementById("weekly-body");
  body.innerHTML = "";
  const { year, week } = isoWeek(new Date());
  const key = `week-${year}-W${String(week).padStart(2, "0")}`;
  document.getElementById("weekly-summary").textContent = `Weekly check · week ${week}, ${year}`;

  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.rows = 6;
  textarea.placeholder = "Minutes spoken: …\nHours listened: …\nReached Use / Automatic: …\nTop 3 mistakes: …\nNew thing I can say: …";
  textarea.value = progress.notes[key] || "";
  textarea.addEventListener("input", () => {
    if (textarea.value) progress.notes[key] = textarea.value;
    else delete progress.notes[key];
    persistSoon();
  });
  body.appendChild(textarea);

  const earlier = Object.keys(progress.notes)
    .filter((k) => k.startsWith("week-") && k !== key)
    .sort()
    .reverse();
  if (earlier.length) {
    const details = document.createElement("details");
    details.className = "earlier-weeks";
    details.innerHTML = `<summary>Earlier weeks (${earlier.length})</summary>`;
    earlier.forEach((k) => {
      const h = document.createElement("h4");
      h.className = "block-heading";
      h.textContent = k.replace("week-", "").replace("-W", ", week ");
      const pre = document.createElement("p");
      pre.className = "week-note";
      pre.textContent = progress.notes[k];
      details.append(h, pre);
    });
    body.appendChild(details);
  }
}

function renderSources() {
  const body = document.getElementById("sources-body");
  body.innerHTML = "";
  plan.sources.forEach((group) => renderLinkList(group.label, group.items, body));
  if (plan.basedOn) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = `Based on: ${plan.basedOn}.`;
    body.appendChild(p);
  }
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
  renderTabs();
  renderStage();
  renderOverallProgress();
  renderWeekly();
  window.scrollTo(0, scrollY);
}

async function main() {
  const statusEl = document.getElementById("status");
  email = localStorage.getItem(EMAIL_KEY) || "";
  renderAccount();

  try {
    const [content, daily] = await Promise.all([
      fetch("/api/russian-roadmap").then((r) => r.json()),
      fetch("/api/russian-days").then((r) => r.json()),
      loadProgress(),
    ]);
    plan = content;
    days = daily.days || [];
    let savedTab = null;
    let savedDay = null;
    try {
      savedTab = localStorage.getItem(TAB_KEY);
      savedDay = Number(localStorage.getItem(DAY_KEY));
    } catch {}
    // Open today's day when the plan is running, otherwise the last day you looked at.
    const today = todayNumber();
    activeDay = today && today >= 1 && today <= days.length ? today : savedDay >= 1 && savedDay <= days.length ? savedDay : 1;
    const known = (key) => plan.stages.some((s) => s.key === key);
    const todays = todayStages();
    activeStage = todays.length && known(todays[todays.length - 1]) ? todays[todays.length - 1] : known(savedTab) ? savedTab : plan.stages[0].key;
    renderSources();
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
