/* SaverR PWA logic */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  categories: [],
  category: "other",
  mode: "video",
  filter: "all",
  q: "",
  media: [],
  jobs: [],
  pollTimer: null,
  currentMedia: null,
};

/* ---------------- helpers ---------------- */
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.hidden = true), ms);
}

function fmtSize(b) {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + " " + u[i];
}

function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + String(sec).padStart(2, "0");
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

/* ---------------- navigation ---------------- */
$$(".nav-btn").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);

function switchView(name) {
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  if (name === "library") loadLibrary();
  if (name === "stats") loadStats();
  if (name === "add") loadAddStats();
}

/* ---------------- add view ---------------- */
async function initAdd() {
  const cats = await api("/api/categories");
  state.categories = cats;
  const wrap = $("#cat-chips");
  wrap.innerHTML = "";
  cats.forEach((c) => {
    if (c === "other") return;
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = c.charAt(0).toUpperCase() + c.slice(1);
    b.dataset.cat = c;
    b.onclick = () => {
      state.category = c;
      $$("#cat-chips .chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    };
    wrap.appendChild(b);
  });
  $("#mode-video").onclick = () => setMode("video");
  $("#mode-audio").onclick = () => setMode("audio");
  $("#download-btn").onclick = startDownload;
  $("#paste-btn").onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#url").value = text.trim();
      toast("Paste ho gaya");
    } catch { toast("Clipboard access nahi mila"); }
  };
}

function setMode(m) {
  state.mode = m;
  $("#mode-video").classList.toggle("active", m === "video");
  $("#mode-audio").classList.toggle("active", m === "audio");
}

async function startDownload() {
  const url = $("#url").value.trim();
  const msg = $("#add-msg");
  if (!url) { msg.textContent = "Pehle link paste karo"; msg.className = "msg err"; return; }
  const btn = $("#download-btn");
  btn.disabled = true;
  msg.textContent = "Job bhej rahe hain…";
  msg.className = "msg";
  try {
    const res = await api("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, category: state.category, mode: state.mode }),
    });
    if (res.duplicate) {
      msg.textContent = "Ye pehle se saved hai (Library mein dekho)";
      msg.className = "msg ok";
    } else {
      msg.textContent = "Download queue mein aa gaya!";
      msg.className = "msg ok";
      $("#url").value = "";
      pollJobs(true);
    }
  } catch (e) {
    msg.textContent = "❌ " + e.message;
    msg.className = "msg err";
  }
  btn.disabled = false;
}

/* ---------------- jobs polling ---------------- */
function renderJobs() {
  const card = $("#downloads-card");
  const active = state.jobs.filter((j) => ["queued", "downloading", "processing"].includes(j.status));
  const recent = state.jobs.filter((j) => ["done", "error"].includes(j.status)).slice(0, 5);
  const list = [...active, ...recent];
  card.hidden = list.length === 0;
  const el = $("#jobs-list");
  el.innerHTML = "";
  list.forEach((j) => {
    const d = document.createElement("div");
    d.className = "job";
    const title = j.title || j.url || "…";
    const statusText = {
      queued: "⏳ Queue", downloading: j.progress + "%",
      processing: "⚙️ Converting", done: "✅ Done", error: "❌ Error",
    }[j.status] || j.status;
    const sub = j.status === "downloading" && j.speed
      ? `${j.speed} · ETA ${j.eta || "?"}` : (j.error ? j.error : j.category);
    d.innerHTML = `
      <div class="job-info">
        <div class="job-title">${escapeHtml(title)}</div>
        <div class="job-sub">${escapeHtml(String(sub))}</div>
        <div class="bar ${j.status}"><div style="width:${j.status === "done" ? 100 : j.progress || 2}%"></div></div>
      </div>
      <div class="job-status">${statusText}</div>`;
    el.appendChild(d);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function pollJobs(force = false) {
  try {
    state.jobs = await api("/api/jobs");
    renderJobs();
    const anyActive = state.jobs.some((j) => ["queued", "downloading", "processing"].includes(j.status));
    schedulePoll(anyActive ? 1200 : 5000);
  } catch {
    schedulePoll(5000);
  }
}

function schedulePoll(ms) {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(pollJobs, ms);
}

async function loadAddStats() {
  try {
    const s = await api("/api/stats");
    $("#add-stats").innerHTML = `
      <div><b>${s.total_count}</b><span>Saved</span></div>
      <div><b>${fmtSize(s.total_size)}</b><span>Total</span></div>
      <div><b>${s.by_category ? s.by_category.length : 0}</b><span>Categories</span></div>`;
  } catch {}
}

/* ---------------- library ---------------- */
async function loadLibrary() {
  try {
    const params = new URLSearchParams();
    if (state.filter !== "all") params.set("category", state.filter);
    if (state.q) params.set("q", state.q);
    const data = await api("/api/media?" + params.toString());
    state.media = data.items;
    renderFilterChips();
    renderGrid();
  } catch (e) { toast("Library load fail: " + e.message); }
}

function renderFilterChips() {
  const el = $("#filter-chips");
  el.innerHTML = "";
  ["all", ...state.categories].forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.filter === c ? " active" : "");
    b.textContent = c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1);
    b.onclick = () => { state.filter = c; loadLibrary(); };
    el.appendChild(b);
  });
}

const ICON_MUSIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const ICON_VIDEO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`;

function renderGrid() {
  const grid = $("#grid");
  const empty = $("#empty");
  empty.hidden = state.media.length > 0;
  grid.innerHTML = "";
  state.media.forEach((m) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    const isAudio = m.mode === "audio" || ["mp3", "m4a"].includes((m.ext || "").toLowerCase());
    const inner = isAudio
      ? `<div class="thumb"><div class="audio-ic">${ICON_MUSIC}</div></div>`
      : `<div class="thumb">
           <img loading="lazy" src="/api/thumb/${m.id}" alt=""
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="audio-ic" style="display:none">${ICON_VIDEO}</div>
         </div>`;
    tile.innerHTML = `
      ${inner}
      <div class="meta">
        <div class="t">${escapeHtml(m.title || "Untitled")}</div>
        <div class="c">${escapeHtml(m.category)}${m.duration ? " · " + fmtDur(m.duration) : ""}</div>
      </div>`;
    tile.onclick = () => openPlayer(m);
    grid.appendChild(tile);
  });
}

$("#search").addEventListener("input", (e) => {
  state.q = e.target.value.trim();
  clearTimeout(window._sq);
  window._sq = setTimeout(loadLibrary, 300);
});

/* ---------------- player sheet ---------------- */
function openPlayer(m) {
  state.currentMedia = m;
  const wrap = $("#player-wrap");
  const isAudio = m.mode === "audio" || ["mp3", "m4a"].includes((m.ext || "").toLowerCase());
  wrap.innerHTML = isAudio
    ? `<img src="/api/thumb/${m.id}" style="width:100%;border-radius:14px;max-height:34dvh;object-fit:cover" onerror="this.style.display='none'">
       <audio controls autoplay src="/api/media/${m.id}/stream" style="width:100%;margin-top:10px"></audio>`
    : `<video controls autoplay playsinline src="/api/media/${m.id}/stream"></video>`;
  $("#player-title").textContent = m.title || "Untitled";
  $("#player-meta").textContent =
    `${m.category} · ${(m.ext || "").toUpperCase()} · ${fmtSize(m.filesize)}${m.duration ? " · " + fmtDur(m.duration) : ""}`;
  $("#dl-file").href = `/api/media/${m.id}/file`;
  $("#player-sheet").hidden = false;
}

function closeSheet() {
  $("#player-sheet").hidden = true;
  $("#player-wrap").innerHTML = ""; // stops playback
  state.currentMedia = null;
}

$("#sheet-backdrop").onclick = closeSheet;

$("#delete-btn").onclick = async () => {
  if (!state.currentMedia) return;
  if (!confirm("Delete karna hai? File server se bhi delete hogi.")) return;
  try {
    await api("/api/media/" + state.currentMedia.id, { method: "DELETE" });
    toast("Delete ho gaya");
    closeSheet();
    loadLibrary();
  } catch (e) { toast("Delete fail: " + e.message); }
};

/* ---------------- stats ---------------- */
async function loadStats() {
  try {
    const s = await api("/api/stats");
    const rows = (s.by_category || []).map(
      (c) => `<div class="cat-row"><div class="n">${escapeHtml(c.category)}</div>
              <div class="v">${c.count} items · ${fmtSize(c.size)}</div></div>`
    ).join("");
    $("#stats-body").innerHTML = `
      <section class="card">
        <div class="stat-grid">
          <div class="stat-card"><b>${s.total_count}</b><span>Total videos</span></div>
          <div class="stat-card"><b>${fmtSize(s.total_size)}</b><span>Disk used</span></div>
          <div class="stat-card"><b>${s.by_category.length}</b><span>Categories used</span></div>
          <div class="stat-card"><b>8508</b><span>Port (LAN)</span></div>
        </div>
      </section>
      <section class="card"><h3 style="margin:0 0 6px">📁 By category</h3>${rows || "<p style='color:var(--muted)'>Kuch nahi</p>"}</section>`;
  } catch (e) { toast("Stats fail: " + e.message); }
}

/* ---------------- conn badge / tunnel ---------------- */
async function detectConn() {
  const isLan = location.hostname === "192.168.29.101" || location.hostname.endsWith(".local");
  $("#conn-text").textContent = isLan ? "LAN" : "Cloud";
  try {
    const cfg = await api("/api/config");
    if (!isLan && !cfg.tunnel_url) $("#conn-text").textContent = "Cloud (no tunnel set)";
  } catch {}
}

/* ---------------- service worker ---------------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* ---------------- init ---------------- */
(async function init() {
  try {
    await initAdd();
    await loadAddStats();
    await detectConn();
    pollJobs();
  } catch (e) {
    toast("Backend se connect nahi ho paya: " + e.message);
  }
})();
