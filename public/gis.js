const EMAIL_KEY = "course-tracker-email";
const LOCAL_KEY = "gis-roadmap-progress";
const TAB_KEY = "gis-roadmap-tab";

// A topic's depth level decides which steps of the loop it needs (see "How to use this roadmap").
const LEVELS = {
  2: { name: "User", steps: ["use"] },
  3: { name: "Understander", steps: ["use", "break", "understand"] },
  4: { name: "Builder", steps: ["use", "break", "understand", "rebuild"] },
};
const STEPS = {
  use: { label: "Use", hint: "Got a correct result with a library or QGIS, on real data" },
  break: { label: "Break", hint: "Changed parameters, the CRS or the data size, and wrote down what changed" },
  understand: { label: "Understand", hint: "Read the theory and the formula; you can say why it works and when it breaks" },
  rebuild: { label: "Rebuild", hint: "Wrote a small version from scratch that matches the library, or explained it in 5 sentences" },
};

// Same email-keyed storage as the other pages, under its own server key.
// progress = { checked: { [key]: true }, notes: { [key]: "..." }, startDate: "YYYY-MM-DD" }
// Keys: "<topicId>:<step>", "<selfCheckId>:r<round>", "<projectId>:<step>", or "<checkId>".
let email = "";
let progress = emptyProgress();
let progressError = "";
let plan = { stages: [], sources: [], selfCheckRounds: [], projectSteps: [] };
let activeStage = "s0";

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
    const res = await fetch(`/api/gis-progress/${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    progress = normalizeProgress(await res.json());
  } catch (err) {
    progress = readLocal();
    progressError = "Couldn't load your saved GIS progress from the server — showing this browser's copy.";
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
    fetch(`/api/gis-progress/${encodeURIComponent(targetEmail)}`, {
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

// The keys a stage counts: its topics and checks, plus the portfolio project it builds.
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

function allKeys() {
  return [...new Set(plan.stages.flatMap(stageKeys))];
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
  if (on) progress.checked[key] = true;
  else delete progress.checked[key];
  persistProgress();
  refresh();
}

// ---------------------------------------------------------------- plan position

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Where today falls in the 12 months: null, { before: days }, or { month, firstWeek, stages }.
function planPosition() {
  if (!progress.startDate) return null;
  const start = new Date(progress.startDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < start) return { before: Math.round((start - today) / 86400000) };
  let elapsed = (today.getFullYear() - start.getFullYear()) * 12 + today.getMonth() - start.getMonth();
  if (today.getDate() < start.getDate()) elapsed--;
  const month = elapsed + 1;
  const firstWeek = today - start < 7 * 86400000;
  const stages = firstWeek
    ? ["s0"]
    : plan.stages.filter((s) => s.months && s.key !== "s0" && s.months[0] <= month && month <= s.months[1]).map((s) => s.key);
  return { month, firstWeek, stages, start };
}

function renderStartDate() {
  const input = document.getElementById("start-date");
  input.value = progress.startDate || "";
  const hint = document.getElementById("today-hint");
  const position = planPosition();
  if (!position) {
    hint.textContent = "Set it to see which month and stage you're in.";
    return;
  }
  if (position.before) {
    hint.textContent = `Starts in ${position.before} day${position.before === 1 ? "" : "s"}.`;
    return;
  }
  if (position.month > 12) {
    hint.textContent = "The 12 months are over: finish your open items and redo the self-assessment.";
    return;
  }
  const names = position.stages.map((key) => {
    const stage = plan.stages.find((s) => s.key === key);
    return `${stage.tab}: ${stage.title}`;
  });
  const nextRound = [3, 6, 9, 12].find((m) => m >= position.month);
  const review = nextRound
    ? ` Next self-assessment (Stage 0, "Month ${nextRound}"): ${formatDate(addMonths(position.start, nextRound))}.`
    : "";
  hint.textContent = `Month ${position.month} of 12 · ${names.join(" → ") || "Final capstone"}.${review}`;
}

function todayStages() {
  const position = planPosition();
  if (!position || position.before || position.month > 12) return [];
  return position.month === 12 && !position.firstWeek ? ["portfolio"] : position.stages;
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
  const keys = allKeys();
  const holder = document.getElementById("overall-progress");
  holder.innerHTML = "";
  if (keys.length === 0) return;
  holder.appendChild(renderProgressBar(countChecked(keys), keys.length));
  const topics = allTopics();
  const projects = (plan.stages.find((s) => s.key === "portfolio")?.groups || []).flatMap((g) => g.items);
  const built = projects.filter((p) => progress.checked[`${p.id}:built`]).length;
  const text = document.createElement("div");
  text.className = "progress-text";
  text.textContent = `${topics.filter(topicDone).length} of ${topics.length} topics at their target level · ${built} of ${projects.length} portfolio projects built`;
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

// A row of toggle chips, one per key: the loop steps of a topic, the rounds of a self-check, the steps of a project.
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
  head.innerHTML = `<span class="badge level l${topic.level}" title="Target depth: L${topic.level} ${level.name}">L${topic.level} ${level.name}</span><strong class="topic-title">${escapeHtml(topic.title)}</strong>${done ? ' <span class="topic-reached">reached ✓</span>' : ""}`;
  li.appendChild(head);

  if (topic.stage) {
    const stage = plan.stages.find((s) => s.key === topic.stage);
    const line = document.createElement("div");
    line.className = "topic-line";
    line.append("With ");
    line.appendChild(stageButton(topic.stage, `${stage.tab}: ${stage.title}`));
    li.appendChild(line);
  }
  if (topic.sources.length) li.appendChild(renderLinks("Source:", topic.sources));
  if (topic.practice && topic.practice !== "—") {
    const line = document.createElement("div");
    line.className = "topic-line";
    line.innerHTML = `${topic.stage ? "Tashkent question" : "Practice"}: ${formatText(topic.practice)}`;
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
  (item.links || []).forEach((link) => {
    const extra = renderLink(`↗ ${link.label}`, link.url);
    extra.className = "item-link";
    body.append(document.createElement("br"), extra);
  });
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
    line.append("Closed in ");
    line.appendChild(stageButton(item.stage, `${stage.tab}: ${stage.title}`));
    li.appendChild(line);
  }
  li.appendChild(
    renderChips(plan.selfCheckRounds.map((round, i) => ({ key: `${item.id}:r${i}`, label: round, hint: `I could answer it at the ${round.toLowerCase()} self-assessment` })))
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
  if (group.note) {
    const note = document.createElement("p");
    note.className = "activity-note";
    note.innerHTML = formatText(group.note);
    parent.appendChild(note);
  }
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
  const items = stage.groups.flatMap((g) => g.items);
  const p = document.createElement("p");
  p.className = "activity-note";
  p.textContent =
    "Answered without looking anything up: " +
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
    if (item.note) li.append(` — ${item.note}`);
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

// ---------------------------------------------------------------- tabs and stage

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
    section.innerHTML = `<h3 class="section-heading">Stage practice: portfolio project ${escapeHtml(project.n)}</h3>`;
    const ul = document.createElement("ul");
    ul.className = "list";
    ul.appendChild(renderProject(project, stage.projectNote));
    section.appendChild(ul);
    el.appendChild(section);
  }

  if (stage.extras) {
    const section = document.createElement("div");
    section.className = "section";
    stage.extras.forEach((extra) => renderLinkList(extra.label, extra.items, section));
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
  textarea.placeholder = "Built: …\nReached L3/L4: …\nBreak log entries: …\nConnected to: …";
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
    const [content] = await Promise.all([fetch("/api/gis-roadmap").then((r) => r.json()), loadProgress()]);
    plan = content;
    const today = todayStages();
    let saved = null;
    try {
      saved = localStorage.getItem(TAB_KEY);
    } catch {}
    const known = (key) => plan.stages.some((s) => s.key === key);
    activeStage = today.length && known(today[today.length - 1]) ? today[today.length - 1] : known(saved) ? saved : plan.stages[0].key;
    renderSources();
    refresh();
    if (progressError) statusEl.textContent = progressError;
  } catch (err) {
    statusEl.textContent = "Could not load the GIS roadmap.";
  }

  document.getElementById("start-date").addEventListener("change", (e) => {
    progress.startDate = e.target.value;
    persistProgress();
    refresh();
  });
}

main();
