/* SaverR PWA v1.6 — music player + reels + movies + library */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  categories: [],
  tags: [],               // all tags {id,name,parent_id,parent_name,kind,usage_count}
  mode: "video",
  category: "other",
  pickedTags: new Set(),
  preview: null,          // probed meta for paste
  media: [],              // library items
  filter: "all",
  q: "",
  musicQ: "",
  musicTag: "all",
  jobs: [],
  pollTimer: null,
  reelsTag: "reels",
  reelsItems: [],
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
  const u = ["B", "KB", "MB", "GB"]; let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + " " + u[i];
}
function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : m;
  return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

/* ================================================================
   AUDIO ENGINE — single global <audio>, queue, auto-advance
   NOTE: "Audio" naam mat use karna — browser ka built-in constructor
   shadow hota hai aur `new Audio()` TDZ ReferenceError deta hai
   (pura script mar jata tha, nav dead — yehi bug tha)
================================================================ */
const Player = {
  el: new window.Audio(),
  queue: [],
  index: -1,
  load(items, index) {
    this.queue = items;
    this.index = index;
    this.playCurrent();
  },
  playCurrent() {
    const item = this.queue[this.index];
    if (!item) return;
    this.el.src = `/api/media/${item.id}/stream`;
    this.el.play().catch(() => {});
    renderMini();
    renderNowPlaying();
  },
  toggle() {
    if (!this.el.src) { if (this.queue.length) this.playCurrent(); return; }
    if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause();
  },
  next() { if (this.index < this.queue.length - 1) { this.index++; this.playCurrent(); } },
  prev() { if (this.index > 0) { this.index--; this.playCurrent(); } },
};
Player.el.addEventListener("ended", () => Player.next());
Player.el.addEventListener("play", () => setPlayIcons(true));
Player.el.addEventListener("pause", () => setPlayIcons(false));
Player.el.addEventListener("timeupdate", () => {
  const d = Player.el.duration || 0, c = Player.el.currentTime || 0;
  const pct = d ? (c / d) * 100 : 0;
  $("#np-seek").value = pct; $("#np-cur").textContent = fmtDur(c);
  $("#np-dur").textContent = fmtDur(d);
});
function setPlayIcons(playing) {
  const ic = playing ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z";
  $("#mini-play-ic").innerHTML = `<path d="${ic}"/>`;
  $("#np-play-ic").innerHTML = `<path d="${ic}"/>`;
}
function currentTrack() { return Player.queue[Player.index] || null; }

function renderMini() {
  const item = currentTrack();
  const bar = $("#mini-player");
  bar.hidden = !item;
  if (!item) return;
  $("#mini-art").src = `/api/thumb/${item.id}`;
  $("#mini-title").textContent = item.title || "Untitled";
  $("#mini-sub").textContent = item.uploader || item.category || "";
}
function renderNowPlaying() {
  const item = currentTrack();
  if (!item || $("#np-sheet").hidden) return;
  $("#np-art").src = `/api/thumb/${item.id}`;
  $("#np-title").textContent = item.title || "Untitled";
  $("#np-sub").textContent = [item.uploader, fmtDur(item.duration)].filter(Boolean).join(" · ");
}$( "#mini-play").onclick = () => Player.toggle();
$("#mini-next").onclick = () => Player.next();
$("#mini-prev").onclick = () => Player.prev();
$("#np-play").onclick = () => Player.toggle();
$("#np-next").onclick = () => Player.next();
$("#np-prev").onclick = () => Player.prev();
$("#np-seek").oninput = (e) => {
  const d = Player.el.duration || 0;
  if (d) Player.el.currentTime = (e.target.value / 100) * d;
};
$("#mini-player").addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  $("#np-sheet").hidden = false;
  renderNowPlaying();
});
$("#np-backdrop").onclick = () => ($("#np-sheet").hidden = true);

/* ================================================================
   NAVIGATION
================================================================ */
$$(".nav-btn").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view)));

function switchView(name) {
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  if (name === "library") loadLibrary();
  if (name === "music") loadMusic();
  if (name === "reels") loadReels();
  if (name === "movies") loadMovies();
  if (name === "add") loadAddStats();
}

/* ================================================================
   ADD VIEW — paste → probe → preview → tags → download
================================================================ */
async function initAdd() {
  state.categories = await api("/api/categories");
  state.tags = await api("/api/tags");
  renderCategoryChips();
  $("#paste-btn").onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#url").value = text.trim();
      probeUrl();
    } catch { toast("Clipboard access nahi mila"); }
  };
  $("#url").addEventListener("change", probeUrl);
  $("#url").addEventListener("paste", () => setTimeout(probeUrl, 100));
  $("#mode-video").onclick = () => setMode("video");
  $("#mode-audio").onclick = () => setMode("audio");
  $("#download-btn").onclick = startDownload;
  $("#tagmgr-add").onclick = addTagFromManager;
}

function renderCategoryChips() {
  const wrap = $("#cat-chips");
  wrap.innerHTML = "";
  state.categories.forEach((c) => {
    if (c === "other") return;
    const b = document.createElement("button");
    b.className = "chip" + (state.category === c ? " active" : "");
    b.textContent = c;
    b.onclick = () => {
      state.category = c;
      $$("#cat-chips .chip").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderTagChips();
    };
    wrap.appendChild(b);
  });
}

function renderTagChips() {
  const wrap = $("#tag-chips");
  wrap.innerHTML = "";
  const kind = state.mode === "audio" ? "audio" : "video";
  const eligible = state.tags.filter((t) => !t.kind || t.kind === kind);
  // parents first, then children (indent)
  const parents = eligible.filter((t) => !t.parent_id);
  const kids = eligible.filter((t) => t.parent_id);
  [...parents, ...kids].forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.pickedTags.has(t.name) ? " active" : "") +
      (t.parent_id ? " chip-sub" : "");
    b.textContent = t.name;
    b.onclick = () => {
      state.pickedTags.has(t.name) ? state.pickedTags.delete(t.name)
                                   : state.pickedTags.add(t.name);
      renderTagChips();
    };
    wrap.appendChild(b);
  });
}

function setMode(m) {
  state.mode = m;
  $("#mode-video").classList.toggle("active", m === "video");
  $("#mode-audio").classList.toggle("active", m === "audio");
  renderTagChips();
}

async function probeUrl() {
  const url = $("#url").value.trim();
  const st = $("#probe-status");
  if (!url.startsWith("http")) return;
  st.textContent = "Link check kar rahe hain…";
  state.preview = null;
  $("#preview-card").hidden = true;
  try {
    const meta = await api("/api/probe?url=" + encodeURIComponent(url));
    state.preview = meta;
    $("#preview-thumb").src = meta.thumbnail || "";
    $("#preview-thumb").onerror = function () { this.style.display = "none"; };
    $("#preview-title").textContent = meta.title || "Untitled";
    $("#preview-meta").textContent =
      [meta.uploader, meta.duration ? fmtDur(meta.duration) : ""].filter(Boolean).join(" · ");
    $("#preview-card").hidden = false;
    st.textContent = "";
  } catch (e) {
    st.textContent = "❌ " + e.message;
    st.className = "msg err";
  }
}

async function startDownload() {
  const url = $("#url").value.trim();
  const msg = $("#add-msg");
  if (!state.preview || !url) {
    msg.textContent = "Pehle valid link paste karo";
    msg.className = "msg err";
    return;
  }
  const btn = $("#download-btn");
  btn.disabled = true;
  try {
    const res = await api("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url, category: state.category, mode: state.mode,
        tags: [...state.pickedTags],
      }),
    });
    if (res.duplicate) {
      msg.textContent = "Ye pehle se saved hai (Library mein dekho)";
      msg.className = "msg ok";
    } else {
      msg.textContent = "Download queue mein aa gaya!";
      msg.className = "msg ok";
      $("#url").value = "";
      $("#preview-card").hidden = true;
      state.preview = null;
      state.pickedTags.clear();
      renderTagChips();
      pollJobs(true);
    }
  } catch (e) {
    msg.textContent = "❌ " + e.message;
    msg.className = "msg err";
  }
  btn.disabled = false;
}

/* ---------------- jobs ---------------- */
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
    const statusText = {
      queued: "Queue", downloading: j.progress + "%",
      processing: "Converting", done: "Done", error: "Error",
    }[j.status] || j.status;
    const sub = j.status === "downloading" && j.speed
      ? `${j.speed} · ETA ${j.eta || "?"}` : (j.error ? j.error : j.category);
    d.innerHTML = `
      <div class="job-info">
        <div class="job-title">${escapeHtml(j.title || j.url || "…")}</div>
        <div class="job-sub">${escapeHtml(String(sub))}</div>
        <div class="bar ${j.status}"><div style="width:${j.status === "done" ? 100 : j.progress || 2}%"></div></div>
      </div>
      <div class="job-status">${statusText}</div>`;
    el.appendChild(d);
  });
}
async function pollJobs(force = false) {
  try {
    state.jobs = await api("/api/jobs");
    renderJobs();
    const anyActive = state.jobs.some((j) => ["queued", "downloading", "processing"].includes(j.status));
    schedulePoll(anyActive ? 1200 : 5000);
  } catch { schedulePoll(5000); }
}
function schedulePoll(ms) {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(pollJobs, ms);
}
async function loadAddStats() {
  try {
    const s = await api("/api/stats");
    const k = s.by_kind || {};
    $("#add-stats").innerHTML = `
      <div><b>${s.total_count}</b><span>Saved</span></div>
      <div><b>${k.audio || 0}</b><span>Audio</span></div>
      <div><b>${k.video || 0}</b><span>Video</span></div>
      <div><b>${fmtSize(s.total_size)}</b><span>Total</span></div>`;
  } catch {}
}

/* ================================================================
   MUSIC VIEW
================================================================ */
async function loadMusic() {
  const params = new URLSearchParams({ kind: "audio" });
  if (state.musicTag !== "all") params.set("tag", state.musicTag);
  if (state.musicQ) params.set("q", state.musicQ);
  try {
    const data = await api("/api/media?" + params);
    renderMusicChips();
    const list = $("#song-list");
    const empty = $("#music-empty");
    empty.hidden = data.items.length > 0;
    list.innerHTML = "";
    data.items.forEach((m, i) => {
      const row = document.createElement("div");
      row.className = "song-row";
      const cur = currentTrack();
      const playing = cur && cur.id === m.id && !Player.el.paused;
      row.innerHTML = `
        <img class="song-art" src="/api/thumb/${m.id}" alt=""
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23334155%22><path d=%22M9 18V5l12-2v13%22/><circle cx=%226%22 cy=%2218%22 r=%223%22/><circle cx=%2218%22 cy=%2216%22 r=%223%22/></svg>'">
        <div class="song-info">
          <div class="song-title">${escapeHtml(m.title || "Untitled")}</div>
          <div class="song-sub">${escapeHtml((m.tags || []).slice(0, 3).join(", ") || m.uploader || "")}</div>
        </div>
        <div class="song-dur">${fmtDur(m.duration)}</div>`;
      row.onclick = () => Player.load(data.items, i);
      list.appendChild(row);
    });
    renderMini();
  } catch (e) { toast("Music load fail: " + e.message); }
}

function renderMusicChips() {
  const el = $("#music-chips");
  el.innerHTML = "";
  const audioTags = ["all", "podcast", "songs",
    ...state.tags.filter((t) => t.parent_name === "songs").map((t) => t.name)];
  audioTags.forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.musicTag === t ? " active" : "");
    b.textContent = t === "all" ? "All" : t;
    b.onclick = () => { state.musicTag = t; loadMusic(); };
    el.appendChild(b);
  });
}
$("#music-search").addEventListener("input", (e) => {
  state.musicQ = e.target.value.trim();
  clearTimeout(window._mq);
  window._mq = setTimeout(loadMusic, 300);
});

/* ================================================================
   REELS VIEW — full-screen snap scroll
================================================================ */
async function loadReels() {
  renderReelsChips();
  const params = new URLSearchParams({ kind: "video" });
  if (state.reelsTag !== "all") params.set("tag", state.reelsTag);
  try {
    const data = await api("/api/media?" + params);
    state.reelsItems = data.items;
    const track = $("#reels-track");
    $("#reels-empty").hidden = data.items.length > 0;
    track.innerHTML = "";
    data.items.forEach((m) => {
      const slide = document.createElement("div");
      slide.className = "reel-slide";
      slide.dataset.id = m.id;
      slide.innerHTML = `
        <video src="/api/media/${m.id}/stream" loop muted playsinline preload="metadata"></video>
        <div class="reel-overlay">
          <div class="reel-meta">
            <div class="reel-title">${escapeHtml(m.title || "Untitled")}</div>
            <div class="reel-tags">${escapeHtml((m.tags || []).join(" · "))}</div>
          </div>
          <div class="reel-actions">
            <button class="reel-btn reel-mute" aria-label="Mute toggle">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
            </button>
            <a class="reel-btn" href="/api/media/${m.id}/file" download aria-label="Save offline">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </a>
          </div>
        </div>`;
      const video = $("video", slide);
      const muteBtn = $(".reel-mute", slide);
      muteBtn.onclick = () => {
        video.muted = !video.muted;
        muteBtn.classList.toggle("off", !video.muted);
      };
      video.addEventListener("click", () => {
        if (video.paused) video.play().catch(() => {}); else video.pause();
      });
      track.appendChild(slide);
    });
  } catch (e) { toast("Reels load fail: " + e.message); }
}

// autoplay visible reel
const reelObserver = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    const v = $("video", en.target);
    if (!v) return;
    if (en.isIntersecting && en.intersectionRatio > 0.6) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  });
}, { threshold: [0, 0.6, 1] });
document.addEventListener("DOMContentLoaded", () => {
  const track = $("#reels-track");
  if (track) {
    new MutationObserver(() => {
      $$(".reel-slide", track).forEach((s) => reelObserver.observe(s));
    }).observe(track, { childList: true });
  }
});

function renderReelsChips() {
  const el = $("#reels-chips");
  el.innerHTML = "";
  const opts = ["all", "reels", "music-videos", "movies",
    ...state.tags.filter((t) => !t.parent_id && t.kind === "video" &&
      !["reels", "music-videos", "movies"].includes(t.name)).map((t) => t.name)];
  [...new Set(opts)].forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.reelsTag === t ? " active" : "");
    b.textContent = t === "all" ? "All" : t;
    b.onclick = () => { state.reelsTag = t; loadReels(); };
    el.appendChild(b);
  });
}

/* ================================================================
   MOVIES VIEW — netflix-style hero + rows, MX player
================================================================ */
async function loadMovies() {
  try {
    const data = await api("/api/media?kind=video&limit=100");
    const body = $("#movies-body");
    if (!data.items.length) {
      body.innerHTML = `<div class="empty"><div class="empty-emoji">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
        </div><p>Koi video nahi. Pehla movie/music-video save karo!</p></div>`;
      return;
    }
    const hero = data.items[0];
    const rows = {};
    data.items.forEach((m) => {
      const key = (m.tags || [])[0] || "other";
      (rows[key] = rows[key] || []).push(m);
    });
    body.innerHTML = `
      <div class="hero" id="hero">
        <img src="/api/thumb/${hero.id}" alt="" onerror="this.style.display='none'">
        <div class="hero-gradient"></div>
        <div class="hero-info">
          <div class="hero-label">Featured</div>
          <div class="hero-title">${escapeHtml(hero.title || "Untitled")}</div>
          <button class="hero-play" id="hero-play">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
            Play
          </button>
        </div>
      </div>
      ${Object.entries(rows).map(([tag, items]) => `
        <div class="movie-row">
          <h3>${escapeHtml(tag)}</h3>
          <div class="movie-scroll">
            ${items.map((m) => `
              <div class="movie-card" data-id="${m.id}">
                <img src="/api/thumb/${m.id}" alt="" loading="lazy" onerror="this.style.opacity=.2">
                <div class="movie-card-t">${escapeHtml(m.title || "")}</div>
              </div>`).join("")}
          </div>
        </div>`).join("")}`;
    $("#hero-play").onclick = () => openMx(hero);
    $$(".movie-card", body).forEach((card) => {
      card.onclick = () => {
        const m = data.items.find((x) => x.id === card.dataset.id);
        if (m) openMx(m);
      };
    });
  } catch (e) { toast("Movies load fail: " + e.message); }
}

/* ---------------- MX player ---------------- */
const Mx = {
  open(m) {
    const v = $("#mx-video");
    v.src = `/api/media/${m.id}/stream`;
    $("#mx-title").textContent = m.title || "";
    $("#mx-sheet").hidden = false;
    document.body.classList.add("mx-open");
    v.play().catch(() => {});
  },
  close() {
    const v = $("#mx-video");
    v.pause();
    v.src = "";
    $("#mx-sheet").hidden = true;
    document.body.classList.remove("mx-open");
  },
};
function openMx(m) { Mx.open(m); }
$("#mx-close").onclick = () => Mx.close();
$("#mx-center").onclick = () => {
  const v = $("#mx-video");
  if (v.paused) v.play().catch(() => {}); else v.pause();
};
function setMxIcon() {
  const v = $("#mx-video");
  const ic = v.paused ? "M8 5v14l11-7z" : "M6 5h4v14H6zm8 0h4v14h-4z";
  $("#mx-play-ic").innerHTML = `<path d="${ic}"/>`;
}
$("#mx-video").addEventListener("play", setMxIcon);
$("#mx-video").addEventListener("pause", setMxIcon);
$("#mx-video").addEventListener("timeupdate", () => {
  const v = $("#mx-video");
  const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
  $("#mx-seek").value = pct;
  $("#mx-cur").textContent = fmtDur(v.currentTime);
  $("#mx-dur").textContent = fmtDur(v.duration);
});
$("#mx-seek").oninput = (e) => {
  const v = $("#mx-video");
  if (v.duration) v.currentTime = (e.target.value / 100) * v.duration;
};
$("#mx-back10").onclick = () => { $("#mx-video").currentTime -= 10; };
$("#mx-fwd10").onclick = () => { $("#mx-video").currentTime += 10; };

/* ================================================================
   LIBRARY VIEW
================================================================ */
async function loadLibrary() {
  try {
    const params = new URLSearchParams();
    if (state.filter !== "all") params.set("tag", state.filter);
    if (state.q) params.set("q", state.q);
    const data = await api("/api/media?" + params);
    state.media = data.items;
    renderFilterChips();
    renderGrid();
  } catch (e) { toast("Library load fail: " + e.message); }
}
function renderFilterChips() {
  const el = $("#filter-chips");
  el.innerHTML = "";
  const used = new Set(state.media.flatMap((m) => m.tags || []));
  ["all", ...state.tags.filter((t) => used.has(t.name) || t.usage_count > 0)
    .filter((t) => !t.parent_id).map((t) => t.name)].forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.filter === c ? " active" : "");
    b.textContent = c === "all" ? "All" : c;
    b.onclick = () => { state.filter = c; loadLibrary(); };
    el.appendChild(b);
  });
}
const ICON_MUSIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const ICON_VIDEO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>`;

function renderGrid() {
  const grid = $("#grid");
  $("#empty").hidden = state.media.length > 0;
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
        <div class="c">${escapeHtml((m.tags || []).slice(0, 2).join(", "))}${m.duration ? " · " + fmtDur(m.duration) : ""}</div>
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

/* ---------------- player sheet (library) with tag editing ---------------- */
let playerCurrent = null;
async function openPlayer(m) {
  playerCurrent = m;
  const wrap = $("#player-wrap");
  const isAudio = m.mode === "audio" || ["mp3", "m4a"].includes((m.ext || "").toLowerCase());
  if (isAudio) {
    // route through music player
    Player.load([m], 0);
    $("#np-sheet").hidden = false;
    renderNowPlaying();
    return;
  }
  wrap.innerHTML = `<video controls autoplay playsinline src="/api/media/${m.id}/stream"></video>`;
  $("#player-title").textContent = m.title || "Untitled";
  $("#player-meta").textContent =
    `${(m.tags || []).join(", ") || m.category} · ${(m.ext || "").toUpperCase()} · ${fmtSize(m.filesize)}`;
  renderPlayerTags();
  $("#dl-file").href = `/api/media/${m.id}/file`;
  $("#player-sheet").hidden = false;
}
function renderPlayerTags() {
  const el = $("#player-tags");
  el.innerHTML = "";
  (playerCurrent.tags || []).forEach((t) => {
    const b = document.createElement("button");
    b.className = "chip active";
    b.innerHTML = `${escapeHtml(t)} <span class="chip-x">×</span>`;
    b.title = "Remove tag";
    b.onclick = async () => {
      const next = playerCurrent.tags.filter((x) => x !== t);
      await saveTags(next);
    };
    el.appendChild(b);
  });
}
async function saveTags(tagNames) {
  try {
    const res = await api(`/api/media/${playerCurrent.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: tagNames }),
    });
    playerCurrent.tags = res.tags;
    renderPlayerTags();
    toast("Tags update ho gaye");
  } catch (e) { toast("Tag save fail: " + e.message); }
}
$("#player-tag-add").onclick = async () => {
  const inp = $("#player-tag-input");
  const val = inp.value.trim();
  if (!val || !playerCurrent) return;
  const next = [...new Set([...(playerCurrent.tags || []), val])];
  inp.value = "";
  await saveTags(next);
};
$("#sheet-backdrop").onclick = () => {
  $("#player-sheet").hidden = true;
  $("#player-wrap").innerHTML = "";
  playerCurrent = null;
  loadLibrary();
};
$("#delete-btn").onclick = async () => {
  if (!playerCurrent) return;
  if (!confirm("Delete karna hai? File server se bhi delete hogi.")) return;
  try {
    await api("/api/media/" + playerCurrent.id, { method: "DELETE" });
    toast("Delete ho gaya");
    $("#player-sheet").hidden = true;
    $("#player-wrap").innerHTML = "";
    playerCurrent = null;
    loadLibrary();
  } catch (e) { toast("Delete fail: " + e.message); }
};

/* ---------------- tag manager ---------------- */
function openTagManager() {
  const sel = $("#tagmgr-parent");
  sel.innerHTML = `<option value="">(no parent)</option>` +
    state.tags.filter((t) => !t.parent_id)
      .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
  renderTagMgrList();
  $("#tagmgr-sheet").hidden = false;
}
function renderTagMgrList() {
  const el = $("#tagmgr-list");
  el.innerHTML = "";
  state.tags.forEach((t) => {
    const row = document.createElement("div");
    row.className = "tagmgr-row";
    row.innerHTML = `
      <div class="tagmgr-name ${t.parent_id ? "sub" : ""}">
        ${t.parent_id ? "└ " : ""}${escapeHtml(t.name)}
        <span class="tagmgr-kind">${escapeHtml(t.kind || "")}</span>
      </div>
      <span class="tagmgr-count">${t.usage_count}</span>
      <button class="icon-btn sm" data-act="rename" aria-label="Rename">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
      <button class="icon-btn sm danger" data-act="del" aria-label="Delete">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`;
    $('[data-act="rename"]', row).onclick = async () => {
      const nn = prompt("Naya naam:", t.name);
      if (!nn || nn === t.name) return;
      try {
        await api(`/api/tags/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nn }),
        });
        await refreshTags();
        renderTagMgrList();
        toast("Rename ho gaya");
      } catch (e) { toast(e.message); }
    };
    $('[data-act="del"]', row).onclick = async () => {
      if (!confirm(`'${t.name}' delete? (sub-tags bhi delete honge)`)) return;
      try {
        await api(`/api/tags/${t.id}`, { method: "DELETE" });
        await refreshTags();
        renderTagMgrList();
        toast("Delete ho gaya");
      } catch (e) { toast(e.message); }
    };
    el.appendChild(row);
  });
}
async function addTagFromManager() {
  const nameEl = $("#tagmgr-name");
  const parentEl = $("#tagmgr-parent");
  const name = nameEl.value.trim();
  if (!name) return;
  try {
    await api("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent: parentEl.value || null }),
    });
    nameEl.value = "";
    await refreshTags();
    renderTagMgrList();
    renderTagChips();
    toast("Tag add ho gaya");
  } catch (e) { toast(e.message); }
}
async function refreshTags() {
  state.tags = await api("/api/tags");
}
$("#tagmgr-backdrop").onclick = () => ($("#tagmgr-sheet").hidden = true);

/* ---------------- conn badge ---------------- */
async function detectConn() {
  const isLan = location.hostname === "192.168.29.101" ||
    location.hostname.endsWith(".local") || location.hostname.startsWith("192.168.");
  $("#conn-text").textContent = isLan ? "LAN" : "Cloud";
  try {
    const cfg = await api("/api/config");
    if (!isLan && !cfg.tunnel_url) $("#conn-text").textContent = "Cloud";
  } catch {}
}

/* ---------------- init ---------------- */
(async function init() {
  try {
    await initAdd();
    await loadAddStats();
    await detectConn();
    pollJobs();
    // library header me tag-manage button
    const brand = $("#view-library .brand");
    const mgrBtn = document.createElement("button");
    mgrBtn.className = "icon-btn sm";
    mgrBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
    mgrBtn.setAttribute("aria-label", "Manage tags");
    mgrBtn.onclick = openTagManager;
    brand.appendChild(mgrBtn);
  } catch (e) {
    toast("Backend se connect nahi ho paya: " + e.message);
  }
})();
