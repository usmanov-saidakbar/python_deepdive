const EMAIL_KEY = "course-tracker-email";

// One script serves every course page. Attributes on <body> set what a page shows:
//   data-course   keep only the parts whose name contains this text
//   data-exclude  drop the parts whose name contains this text
//   data-progress the progress API route (each page keeps its own map)
const PAGE = document.body.dataset;
const PROGRESS_API = PAGE.progress || "/api/progress";

function keepPart(part) {
  if (PAGE.course && !part.part.includes(PAGE.course)) return false;
  if (PAGE.exclude && part.part.includes(PAGE.exclude)) return false;
  return true;
}

const STATUSES = [
  { value: "not_watched", label: "Not watched" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

// Progress lives on the server, keyed by whatever email the visitor typed in
// (no password) — this is what makes it follow you across devices. `email`
// and `statuses` are populated by loadProgress() before anything renders.
let email = "";
let statuses = {};
let progressError = "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadProgress() {
  progressError = "";
  if (!email) {
    statuses = {};
    return;
  }
  try {
    const res = await fetch(`${PROGRESS_API}/${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    statuses = await res.json();
  } catch (err) {
    statuses = {};
    progressError = "Couldn't load your saved progress — the server's progress storage may not be set up yet.";
  }
}

// Each dropdown change fires a PUT of the *entire* status map. If these ran
// concurrently, out-of-order network completions could let an older, smaller
// snapshot overwrite a newer one server-side and silently drop recent
// changes. Chaining them ensures only one PUT is ever in flight, executed in
// the order they were made, each one reading the live `statuses` at send
// time so it carries every edit made up to that point.
let persistChain = Promise.resolve();

function persistProgress() {
  if (!email) return persistChain;
  const targetEmail = email;
  persistChain = persistChain.then(() =>
    fetch(`${PROGRESS_API}/${encodeURIComponent(targetEmail)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statuses),
    }).catch(() => {
      // Best-effort — the dropdown still reflects the change locally either way.
    })
  );
  return persistChain;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function partItemCount(part) {
  return part.sections.reduce((sum, s) => sum + s.items.length, 0);
}

function countDone(items, statuses) {
  return items.filter((item) => statuses[item.id] === "done").length;
}

function renderProgressBar(done, total) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const wrap = document.createElement("div");
  wrap.className = "progress";
  wrap.innerHTML = `
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-text">${pct}% complete — ${done} of ${total} videos done</div>
  `;
  return wrap;
}

function renderItem(item) {
  const status = statuses[item.id] || "not_watched";

  const li = document.createElement("li");
  li.className = "item" + (status === "done" ? " done" : "");

  const a = document.createElement("a");
  a.href = item.link;
  a.target = "_blank";
  a.rel = "noopener";
  a.innerHTML = `${item.title}<span class="date">${formatDate(item.date)}</span>`;

  const select = document.createElement("select");
  select.className = "status-select";
  select.disabled = !email;
  select.title = email ? "" : "Enter your email above to save progress";
  STATUSES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.label;
    if (s.value === status) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    statuses[item.id] = select.value;
    li.className = "item" + (select.value === "done" ? " done" : "");
    persistProgress();
    renderOverallProgress();
  });

  li.appendChild(a);
  li.appendChild(select);
  return li;
}

function render(parts) {
  const container = document.getElementById("list");
  container.innerHTML = "";

  parts.forEach((part) => {
    const items = part.sections.flatMap((s) => s.items);
    if (items.length === 0) return;

    const partEl = document.createElement("section");
    partEl.className = "part";

    const heading = document.createElement("h2");
    heading.className = "part-heading";
    heading.textContent = part.part;
    partEl.appendChild(heading);

    partEl.appendChild(renderProgressBar(countDone(items, statuses), items.length));

    part.sections.forEach((section) => {
      if (section.items.length === 0) return;

      const sectionEl = document.createElement("div");
      sectionEl.className = "section";

      const sectionHeading = document.createElement("h3");
      sectionHeading.className = "section-heading";
      sectionHeading.textContent = section.name;
      sectionEl.appendChild(sectionHeading);

      const ul = document.createElement("ul");
      ul.className = "list";
      section.items.forEach((item) => ul.appendChild(renderItem(item)));
      sectionEl.appendChild(ul);

      partEl.appendChild(sectionEl);
    });

    container.appendChild(partEl);
  });
}

let allParts = [];
let activeTab = 0;

function countAllItems(parts) {
  return parts.reduce((sum, p) => sum + partItemCount(p), 0);
}

function tabLabel(partName) {
  const match = partName.match(/\(([^)]+)\)/);
  return match ? match[1] : partName;
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  // A page with a single course has nothing to switch between.
  tabsEl.style.display = allParts.length > 1 ? "" : "none";

  allParts.forEach((part, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (i === activeTab ? " active" : "");
    btn.textContent = tabLabel(part.part);
    btn.addEventListener("click", () => {
      activeTab = i;
      document.getElementById("search").value = "";
      refresh();
    });
    tabsEl.appendChild(btn);
  });
}

function renderOverallProgress() {
  const total = countAllItems(allParts);
  const allItems = allParts.flatMap((p) => p.sections.flatMap((s) => s.items));
  const done = countDone(allItems, statuses);

  const holder = document.getElementById("overall-progress");
  holder.innerHTML = "";
  if (total > 0) holder.appendChild(renderProgressBar(done, total));
}

function renderAccount() {
  const el = document.getElementById("account");
  el.innerHTML = "";

  if (email) {
    el.innerHTML = `
      <span>Tracking progress as <strong>${escapeHtml(email)}</strong></span>
      <button type="button" id="switch-email" class="link-btn">switch</button>
    `;
    document.getElementById("switch-email").addEventListener("click", () => {
      email = "";
      localStorage.removeItem(EMAIL_KEY);
      statuses = {};
      renderAccount();
      refresh();
    });
    return;
  }

  el.innerHTML = `
    <input type="email" id="email-input" placeholder="you@example.com" autocomplete="email" />
    <button type="button" id="email-submit">Track my progress</button>
    <div class="account-hint">
      No password — this just remembers your progress by email so it follows you
      to other devices. Anyone who knows the email could see or change that
      progress, so use one only you'd think to type here.
    </div>
  `;
  document.getElementById("email-submit").addEventListener("click", async () => {
    const value = document.getElementById("email-input").value.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      alert("Enter a valid email address.");
      return;
    }
    email = value;
    localStorage.setItem(EMAIL_KEY, email);
    await loadProgress();
    renderAccount();
    refresh();
    if (progressError) alert(progressError);
  });
}

function filterParts(parts, query) {
  if (!query) return parts;
  return parts
    .map((p) => ({
      part: p.part,
      sections: p.sections
        .map((s) => ({ name: s.name, items: s.items.filter((i) => i.title.toLowerCase().includes(query)) }))
        .filter((s) => s.items.length > 0),
    }))
    .filter((p) => p.sections.length > 0);
}

function applyFilter() {
  const statusEl = document.getElementById("status");
  const query = document.getElementById("search").value.trim().toLowerCase();
  const total = countAllItems(allParts);

  // A search query searches every course, regardless of the active tab.
  // With no query, only the active tab's course is shown.
  const scope = query ? allParts : allParts.slice(activeTab, activeTab + 1);
  const filtered = filterParts(scope, query);
  const filteredTotal = countAllItems(filtered);

  if (total === 0) {
    statusEl.textContent = "No videos found yet. The server may still be syncing — refresh in a bit.";
  } else if (query) {
    statusEl.textContent =
      allParts.length > 1 ? `${filteredTotal} of ${total} videos (searching all courses)` : `${filteredTotal} of ${total} videos`;
  } else {
    statusEl.textContent = `${filteredTotal} videos`;
  }

  render(filtered);
}

function refresh() {
  renderTabs();
  applyFilter();
  renderOverallProgress();
}

async function main() {
  const statusEl = document.getElementById("status");
  email = localStorage.getItem(EMAIL_KEY) || "";
  renderAccount();

  try {
    const [content] = await Promise.all([fetch("/api/content").then((r) => r.json()), loadProgress()]);
    allParts = content.filter(keepPart);
    if (allParts.length === 1) document.getElementById("search").placeholder = "Search lessons…";
    refresh();
    if (progressError) statusEl.textContent = progressError;
  } catch (err) {
    statusEl.textContent = "Could not load content.";
  }

  document.getElementById("search").addEventListener("input", applyFilter);
}

main();
