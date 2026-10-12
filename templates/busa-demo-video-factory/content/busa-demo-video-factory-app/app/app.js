import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { SHOT_STATUSES, statusLabel, VIDEO_STATUSES, withShotRollup } from "./js/video-model.js?v=0.1.0";

// Where a record opens, per view — declared once, in config.js `ui.detail_modes`:
//   videos → page:  a video is a workplace (brief, verified claims, the whole
//                   storyboard); people open one and stay a while.
//   shots  → split: a recording session works the shot list top to bottom, so
//                   the queue stays beside the shot being recorded.
// A `/<record>` path always opens the full page; `?peek=` drives the split.
// On a phone every mode is a page (base-ui.css handles that).
const VIEWS = {
  videos: { base: "videos", title: "Videos", statuses: VIDEO_STATUSES },
  shots: { base: "video-shots", title: "Shots", statuses: SHOT_STATUSES },
};
const VIEW_TOOLTIP = {
  videos: "One row per demo video: its brief, status and storyboard. Open a video to read its verified claims and shots.",
  shots: "Every storyboard shot, worked as a recording queue. Pick a shot to read its scene and script line.",
};
const DETAIL_MODES = Object.fromEntries(
  Object.entries(VIEWS).map(([view, def]) => [view, appConfig.ui?.detail_modes?.[def.base] || "drawer"]),
);

const state = {
  data: null,
  provider: null,
  route: parseRoute(),
  // The list shown per view: one page of rows for one status filter.
  // records.list only has a forward cursor, so cursors[i] fetches page i+1 and
  // only neighbouring pages are reachable — one click, one request.
  lists: {},
  // Records named by the URL that are not on the loaded page (records.get).
  extra: { videos: new Map(), shots: new Map() },
  // A video's storyboard, read for its page on demand.
  storyboards: new Map(),
  notice: "",
};

const byId = (id) => document.getElementById(id);
const els = {
  loadState: byId("loadState"),
  overviewPage: byId("overviewPage"),
  overviewMetrics: byId("overviewMetrics"),
  overviewBody: byId("overviewBody"),
  viewPage: byId("viewPage"),
  viewTitle: byId("viewTitle"),
  viewCount: byId("viewCount"),
  viewNotice: byId("viewNotice"),
  statusSelect: byId("statusSelect"),
  search: byId("search"),
  listPanel: byId("listPanel"),
  detailBar: byId("detailBar"),
  detailBody: byId("detailBody"),
  detailBack: byId("detailBack"),
  detailExpand: byId("detailExpand"),
  syncStatus: byId("sync-status"),
  reviewCount: byId("count-review"),
  reshootCount: byId("count-reshoot"),
  navVideos: byId("nav-count-videos"),
  navShots: byId("nav-count-shots"),
  mobileViewTitle: byId("mobileViewTitle"),
  sidebarScrim: byId("sidebarScrim"),
};

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

const fmt = (value) => (value == null ? "—" : String(value));

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the status filter and
// the peeked record live in the URL so refresh, shared links and Back restore
// the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!VIEWS[view]) view = "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  return {
    view,
    id,
    peek,
    selectedId: VIEWS[view] ? id || peek : "",
    presentation: !VIEWS[view] ? null : id ? "page" : mode === "page" ? null : mode,
    query: params.get("q") || "",
    status: VIEWS[view]?.statuses.includes(status) ? status : "all",
  };
}

const routeQuery = (route, extra = {}) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.status && route.status !== "all") params.set("status", route.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

const sameViewRoute = (view) => (view === state.route.view ? state.route : { view, query: "", status: "all" });
const listUrl = (route = state.route) => `#/${route.view}${routeQuery(route)}`;
// The full page: the record in the path. Always a page, whatever the view's mode.
const detailUrl = (id, view = state.route.view) => `#/${view}/${encodeURIComponent(id)}${routeQuery(sameViewRoute(view))}`;
// What a row (or a cross-link) opens: the page for a `page` view, else `?peek=`.
const recordUrl = (id, view = state.route.view) =>
  DETAIL_MODES[view] === "page" ? detailUrl(id, view) : `#/${view}${routeQuery(sameViewRoute(view), { peek: id })}`;

let previousRouteWasList = false;

function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list: Back/Close/Escape step back to that
  // exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = Boolean(VIEWS[state.route.view]) && !state.route.selectedId;
  state.notice = "";
  els.search.value = state.route.query;
  setMobileSidebarOpen(false);
  render();
  syncList();
  ensureSelected();
}

// Replace the current entry without a hashchange: search keystrokes and filter
// changes should not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const keep = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = keep;
  render();
  syncList();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadState() {
  const provider = await getProvider();
  state.provider = provider;
  const data = await provider.getState();
  closeConnectGate();
  state.data = data;
  state.extra = { videos: new Map(), shots: new Map() };
  state.storyboards = new Map();
  state.lists = {
    videos: freshList("all", data.videos, data.pagination?.videos),
    shots: freshList("all", data.shots, data.pagination?.["video-shots"]),
  };
  render();
  syncList();
  ensureSelected();
}

function freshList(status, rows, nextCursor) {
  return { status, rows: rows || [], cursors: [undefined, nextCursor || null], page: 1, loading: false, error: "" };
}

const loadedVideos = () => state.data?.videos || [];
const loadedShots = () => state.data?.shots || [];

// The status filter is pushed to the server: changing it reads page 1 of that
// status — one request — instead of filtering whatever page happens to be loaded.
async function syncList() {
  const { view, status } = state.route;
  const list = state.lists[view];
  if (!state.data || !list || list.status === status || list.loading) return;
  if (status === "all") {
    const def = VIEWS[view];
    state.lists[view] = freshList(
      "all",
      def.base === "videos" ? loadedVideos() : loadedShots(),
      state.data.pagination?.[def.base],
    );
    render();
    return;
  }
  list.loading = true;
  list.status = status;
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchPage(VIEWS[view].base, undefined, { status });
    if (state.lists[view] !== list || list.status !== status) return;
    state.lists[view] = freshList(status, rows, nextCursor);
  } catch (error) {
    list.loading = false;
    list.error = error instanceof Error ? error.message : String(error);
  }
  render();
  syncList();
}

async function goToPage(view, target) {
  const list = state.lists[view];
  if (!list || list.loading) return;
  if (Math.abs(target - list.page) !== 1 || target < 1) return;
  if (target > list.page && !list.cursors[list.page]) return;
  list.loading = true;
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchPage(VIEWS[view].base, list.cursors[target - 1], {
      status: list.status,
    });
    list.rows = view === "videos" ? withShotRollup(rows, loadedShots()) : rows;
    list.cursors[target] = nextCursor;
    list.page = target;
    list.error = "";
  } catch (error) {
    list.error = error instanceof Error ? error.message : String(error);
  } finally {
    list.loading = false;
    render();
  }
}

function findRecord(view, id) {
  if (!id) return null;
  const rows = [...(state.lists[view]?.rows || []), ...(view === "videos" ? loadedVideos() : loadedShots())];
  return rows.find((row) => row.id === id) || state.extra[view].get(id) || null;
}

// A record named by the URL but not on the loaded page is read on its own
// (records.get) instead of paging until it turns up. A shot's video is read the
// same way so its name, not its id, is shown.
async function ensureSelected() {
  const { view, selectedId } = state.route;
  if (!state.data || !VIEWS[view] || !selectedId) return;
  await ensureRecord(view, selectedId);
  const record = findRecord(view, selectedId);
  if (view === "shots" && record?.video) await ensureRecord("videos", record.video);
  if (view === "videos" && record) await ensureStoryboard(record.id);
}

async function ensureRecord(view, id) {
  if (findRecord(view, id) || state.extra[view].has(id)) return;
  state.extra[view].set(id, undefined);
  try {
    const row = await state.provider.getRecord(VIEWS[view].base, id);
    state.extra[view].set(id, row || null);
  } catch {
    state.extra[view].set(id, null);
  }
  render();
}

async function ensureStoryboard(videoId, more = false) {
  const current = state.storyboards.get(videoId);
  if (current && (!more || current.loading || !current.nextCursor)) return;
  const entry = current || { rows: [], nextCursor: null, loading: false, error: "" };
  entry.loading = true;
  state.storyboards.set(videoId, entry);
  render();
  try {
    const { rows, nextCursor } = await state.provider.fetchShotsForVideo(videoId, more ? entry.nextCursor : undefined);
    entry.rows = more ? [...entry.rows, ...rows] : rows;
    entry.nextCursor = nextCursor;
    entry.error = "";
  } catch (error) {
    // Fall back to the shots already loaded rather than an empty storyboard.
    entry.rows = loadedShots().filter((shot) => shot.video === videoId);
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    entry.loading = false;
    render();
  }
}

// ── Formatting ─────────────────────────────────────────────────────────────
const badge = (status) => `<span class="badge status-${esc(status)}">${esc(statusLabel(status))}</span>`;

// A relation is a record id. Show the target's title; when it is not loaded,
// say so — never print the id.
function videoTitle(videoId) {
  if (!videoId) return "—";
  const video = findRecord("videos", videoId);
  if (video) return video.title || "Untitled video";
  return state.extra.videos.get(videoId) === undefined && state.extra.videos.has(videoId) ? "Loading…" : "Not loaded";
}

function progressCell(video) {
  const recorded = video.shots?.byStatus?.recorded || 0;
  const reshoot = video.shots?.byStatus?.needs_reshoot || 0;
  const total = video.shots?.linked || video.shots?.total || 0;
  if (!total) return '<span class="muted">No shots yet</span>';
  const pct = Math.round((recorded / total) * 100);
  const partial = (video.shots?.total || 0) < total ? ' title="Counted from the shots loaded so far"' : "";
  return `<span class="progress"${partial}><span class="progress-bar"><span style="width:${pct}%"></span></span>
    <span class="progress-text">${recorded}/${total} recorded${reshoot ? ` · <span class="reshoot">${reshoot} reshoot</span>` : ""}</span></span>`;
}

function renderMarkdownTable(md) {
  const lines = String(md ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every((l) => l.startsWith("|"))) {
    return `<p class="prose">${esc(md)}</p>`;
  }
  const cells = (line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return `<table class="table detail-table"><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// ── Shell ──────────────────────────────────────────────────────────────────
function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  els.sidebarScrim.hidden = !open;
}

function navCount(base) {
  const total = state.data?.totals?.[base];
  if (total != null) return String(total);
  const rows = base === "videos" ? loadedVideos() : loadedShots();
  return state.data?.pagination?.[base] ? `${rows.length}+` : String(rows.length);
}

function renderShell() {
  const data = state.data;
  els.syncStatus.textContent = !data ? "Loading" : data.demo ? "Demo data" : "Live from Busabase";
  els.reviewCount.textContent = fmt(data?.statusCounts?.videos?.needs_review);
  els.reshootCount.textContent = fmt(data?.statusCounts?.["video-shots"]?.needs_reshoot);
  els.navVideos.textContent = data ? navCount("videos") : "";
  els.navShots.textContent = data ? navCount("video-shots") : "";
  const view = state.route.view;
  els.mobileViewTitle.textContent = VIEWS[view]?.title || "Overview";
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === view);
  });
}

function render() {
  renderShell();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data);
  const onRecordView = ready && Boolean(VIEWS[view]);
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query));
  els.loadState.hidden = ready;
  els.overviewPage.hidden = !ready || view !== "overview";
  els.viewPage.hidden = !onRecordView;
  if (!ready) return;
  if (onRecordView) renderRecordView();
  else renderOverview();
}

// ── Overview ───────────────────────────────────────────────────────────────
function renderOverview() {
  const videoCounts = state.data.statusCounts?.videos || {};
  const shotCounts = state.data.statusCounts?.["video-shots"] || {};
  const shotTotal = state.data.totals?.["video-shots"];
  const sum = (...values) => (values.some((v) => v == null) ? null : values.reduce((a, b) => a + b, 0));
  const recordedPct =
    shotCounts.recorded == null || !shotTotal ? null : `${Math.round((shotCounts.recorded / shotTotal) * 100)}%`;
  // Three numbers the nav and the attention block do not already show.
  els.overviewMetrics.innerHTML = [
    ["Shots recorded", shotTotal === 0 ? "—" : fmt(recordedPct)],
    ["In production", fmt(sum(videoCounts.recording, videoCounts.post_production))],
    ["Published", fmt(videoCounts.done)],
  ]
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join("");

  const max = Math.max(1, ...VIDEO_STATUSES.map((status) => videoCounts[status] || 0));
  const pipeline = VIDEO_STATUSES.map(
    (status) => `<a class="stage-row" href="#/videos?status=${status}">
      <span class="stage-name">${badge(status)}</span>
      <span class="stage-bar"><span class="status-${status}" style="width:${Math.round(((videoCounts[status] || 0) / max) * 100)}%"></span></span>
      <strong>${fmt(videoCounts[status])}</strong>
    </a>`,
  ).join("");

  const order = { needs_reshoot: 0, pending: 1, recorded: 2 };
  const queue = loadedShots()
    .filter((shot) => shot.recording_status !== "recorded")
    .sort((a, b) => order[a.recording_status] - order[b.recording_status])
    .slice(0, 6);
  const queueRows = queue.length
    ? queue
        .map(
          (shot) => `<a class="queue-row" href="${recordUrl(shot.id, "shots")}">
        <span class="queue-copy"><strong>${esc(shot.title || shot.script_line || "Untitled shot")}</strong>
        <span>${esc(shot.script_line)}</span></span>
        ${badge(shot.recording_status)}
      </a>`,
        )
        .join("")
    : '<p class="muted panel-empty">Every loaded shot is recorded.</p>';

  els.overviewBody.innerHTML = `
    ${warningBanner()}
    <section class="card">
      <div class="card-heading"><div><h2>Pipeline</h2><p>Videos by stage — pick one to see them.</p></div></div>
      <div class="stage-list">${pipeline}</div>
    </section>
    <section class="card">
      <div class="card-heading"><div><h2>Recording queue</h2><p>Reshoots first, then shots not yet recorded.</p></div>
      <a class="button" href="#/shots">All shots</a></div>
      <div class="queue-list">${queueRows}</div>
    </section>`;
}

function warningBanner() {
  const warnings = state.data?.warnings || [];
  return warnings.length ? `<div class="notice-banner">${warnings.map(esc).join("<br>")}</div>` : "";
}

// ── Record views ───────────────────────────────────────────────────────────
function filteredRows(view) {
  const rows = state.lists[view]?.rows || [];
  const query = state.route.query.trim().toLowerCase();
  if (!query) return rows;
  const text = (row) =>
    view === "videos"
      ? [row.title, row.series, statusLabel(row.status), row.owner, row.hook]
      : [row.title, row.scene, row.script_line, row.timecode, statusLabel(row.recording_status), videoTitle(row.video)];
  return rows.filter((row) => text(row).some((value) => String(value || "").toLowerCase().includes(query)));
}

function renderRecordView() {
  const { view, selectedId, presentation } = state.route;
  const def = VIEWS[view];
  const list = state.lists[view];
  const rows = filteredRows(view);
  els.viewTitle.textContent = def.title;
  els.viewTitle.title = VIEW_TOOLTIP[view];
  // Hidden by base-ui unless searching — and shown on phones, where the nav is off-canvas.
  els.viewCount.textContent = state.route.query ? String(rows.length) : navCount(def.base);
  els.statusSelect.innerHTML = [
    `<option value="all">${view === "videos" ? "All stages" : "All shots"}</option>`,
    ...def.statuses.map(
      (status) =>
        `<option value="${status}"${status === state.route.status ? " selected" : ""}>${esc(statusLabel(status))}</option>`,
    ),
  ].join("");
  if (els.search.value !== state.route.query && document.activeElement !== els.search) els.search.value = state.route.query;

  const notices = [...(state.data.warnings || []), list?.error ? `Could not load this page: ${list.error}` : ""].filter(
    Boolean,
  );
  if (state.notice) notices.push(state.notice);
  els.viewNotice.hidden = !notices.length;
  els.viewNotice.innerHTML = notices.map(esc).join("<br>");

  els.listPanel.innerHTML = view === "videos" ? videosTable(rows) : shotsTable(rows);
  els.listPanel.insertAdjacentHTML("beforeend", pager(view));

  const record = selectedId ? findRecord(view, selectedId) : null;
  els.detailBar.hidden = !selectedId;
  els.detailBack.textContent = presentation === "split" ? "Close" : "Back to list";
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId);
  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split"
        ? '<div class="ws-detail-empty">Pick a shot to read its scene, script line and notes.</div>'
        : "";
    return;
  }
  if (!record) {
    const pending = state.extra[view].has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = `<div class="ws-detail-empty">${pending ? "Loading…" : `This ${view === "videos" ? "video" : "shot"} was not found.`}</div>`;
    return;
  }
  els.detailBody.innerHTML = view === "videos" ? videoDetail(record) : shotDetail(record);
}

const rowAttrs = (id) => `data-id="${esc(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}`;

function emptyRow(colspan, list) {
  const filtered = state.route.query || state.route.status !== "all";
  const message = list?.loading
    ? "Loading…"
    : filtered
      ? "Nothing matches this filter."
      : state.route.view === "videos"
        ? "No videos yet. Propose one with scripts/propose_video.mjs."
        : "No shots yet. They arrive with a video's storyboard.";
  return `<tr class="empty-row"><td colspan="${colspan}">${esc(message)}</td></tr>`;
}

function videosTable(rows) {
  const body = rows.length
    ? rows
        .map(
          (video) => `<tr ${rowAttrs(video.id)}>
        <td class="cell-title" title="${esc(video.title)}">${esc(video.title || "Untitled video")}</td>
        <td>${badge(video.status)}</td>
        <td>${progressCell(video)}</td>
        <td>${esc(video.series || "—")}</td>
        <td>${esc(video.owner || "—")}</td>
      </tr>`,
        )
        .join("")
    : emptyRow(5, state.lists.videos);
  return `<table class="ws-table videos-table">
    <thead><tr><th>Title</th><th>Stage</th><th class="ws-col-wide">Recording</th><th class="ws-col-narrow">Series</th><th class="ws-col-narrow">Owner</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function shotsTable(rows) {
  const body = rows.length
    ? rows
        .map(
          (shot) => `<tr ${rowAttrs(shot.id)}>
        <td class="cell-title" title="${esc(shot.script_line)}">${esc(shot.title || shot.script_line || "Untitled shot")}</td>
        <td class="ws-split-keep">${badge(shot.recording_status)}</td>
        <td>${esc(videoTitle(shot.video))}</td>
        <td class="ws-col-narrow">${esc(shot.timecode || "—")}</td>
        <td>${esc(shot.script_line || "—")}</td>
      </tr>`,
        )
        .join("")
    : emptyRow(5, state.lists.shots);
  return `<table class="ws-table shots-table">
    <thead><tr><th>Shot</th><th class="ws-split-keep">Recording</th><th>Video</th><th class="ws-col-narrow">Timecode</th><th class="ws-col-wide">Script line</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function pager(view) {
  const list = state.lists[view];
  if (!list) return "";
  const hasNext = Boolean(list.cursors[list.page]);
  if (list.page === 1 && !hasNext) return "";
  return `<nav class="pager" aria-label="Pagination">
    <button type="button" class="button" data-goto-page="${view}:${list.page - 1}" ${list.loading || list.page <= 1 ? "disabled" : ""}>Prev</button>
    <span class="pager-summary">Page ${list.page}</span>
    <button type="button" class="button" data-goto-page="${view}:${list.page + 1}" ${list.loading || !hasNext ? "disabled" : ""}>Next</button>
  </nav>`;
}

// ── Details ────────────────────────────────────────────────────────────────
function videoDetail(video) {
  const brief = [
    ["Purpose", video.purpose],
    ["Hook", video.hook],
    ["Pain point", video.pain_point],
    ["Concept", video.concept],
  ]
    .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd></div>`)
    .join("");
  const finalUrl = /^https?:\/\//i.test(video.final_video_url)
    ? `<a href="${esc(video.final_video_url)}" target="_blank" rel="noreferrer">${esc(video.final_video_url)}</a>`
    : "Not published";
  const board = state.storyboards.get(video.id);
  const shots = board?.rows || [];
  const shotRows = shots.length
    ? shots
        .map(
          (s) => `<tr data-shot="${esc(s.id)}">
        <td class="num">${esc(s.shot_number || "")}</td>
        <td>${esc(s.timecode || "—")}</td>
        <td>${esc(s.scene || "—")}</td>
        <td><code>${esc(s.code_reference || "—")}</code></td>
        <td>${esc(s.script_line || "—")}</td>
        <td>${badge(s.recording_status)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="muted">${!board || board.loading ? "Loading storyboard…" : "No shots yet."}</td></tr>`;
  return `<article class="record-detail video-detail">
    <header class="detail-head">
      <h2>${esc(video.title || "Untitled video")}</h2>
      <div class="detail-meta">${badge(video.status)}
        <span>Series: ${esc(video.series || "—")}</span><span>Owner: ${esc(video.owner || "—")}</span></div>
    </header>
    <dl class="brief-grid">${brief}</dl>
    <dl class="detail-facts">
      <div><dt>HyperFrame path</dt><dd>${video.hyperframe_path ? `<code>${esc(video.hyperframe_path)}</code>` : "Not started"}</dd></div>
      <div><dt>Final video</dt><dd>${finalUrl}</dd></div>
    </dl>
    ${video.verified_claims ? `<section class="detail-section"><h3>Verified claims</h3>${renderMarkdownTable(video.verified_claims)}</section>` : ""}
    <section class="detail-section">
      <h3>Storyboard <span class="muted">${shots.length}${board?.nextCursor ? "+" : ""} shots</span></h3>
      ${board?.error ? `<div class="notice-banner">Storyboard read failed (${esc(board.error)}); showing loaded shots only.</div>` : ""}
      <table class="table detail-table storyboard-table">
        <thead><tr><th class="num">#</th><th>Timecode</th><th>Scene</th><th>Code ref</th><th>Script line</th><th>Recording</th></tr></thead>
        <tbody>${shotRows}</tbody>
      </table>
      ${board?.nextCursor ? `<button type="button" class="button more-shots" data-more-shots="${esc(video.id)}" ${board.loading ? "disabled" : ""}>Load more shots</button>` : ""}
    </section>
  </article>`;
}

function shotDetail(shot) {
  const videoLink = shot.video
    ? findRecord("videos", shot.video)
      ? `<a href="${detailUrl(shot.video, "videos")}">${esc(videoTitle(shot.video))}</a>`
      : esc(videoTitle(shot.video))
    : "—";
  return `<article class="record-detail shot-detail">
    <header class="detail-head">
      <h2>${esc(shot.title || "Untitled shot")}</h2>
      <div class="detail-meta">${badge(shot.recording_status)}<span>${esc(shot.timecode || "No timecode")}</span></div>
    </header>
    <blockquote class="script-line">${esc(shot.script_line || "No script line yet.")}</blockquote>
    <dl class="detail-facts">
      <div><dt>Video</dt><dd>${videoLink}</dd></div>
      <div><dt>Shot number</dt><dd>${esc(shot.shot_number || "—")}</dd></div>
      <div><dt>Scene</dt><dd>${esc(shot.scene || "—")}</dd></div>
      <div><dt>Code reference</dt><dd><code>${esc(shot.code_reference || "—")}</code></dd></div>
      <div><dt>Note</dt><dd>${esc(shot.note || "—")}</dd></div>
      <div><dt>Assets</dt><dd>${shot.asset_count ? `${shot.asset_count} file${shot.asset_count === 1 ? "" : "s"}` : "None yet"}</dd></div>
    </dl>
  </article>`;
}

// ── Events ─────────────────────────────────────────────────────────────────
els.listPanel.addEventListener("click", (event) => {
  const pagerButton = event.target.closest("[data-goto-page]");
  if (pagerButton) {
    const [view, page] = pagerButton.dataset.gotoPage.split(":");
    goToPage(view, Number(page));
    return;
  }
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const url = recordUrl(row.dataset.id);
  // Switching records while the split shows one replaces the entry, so Close
  // still steps back to the list it was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else {
    location.hash = url;
  }
});
els.detailBody.addEventListener("click", (event) => {
  const more = event.target.closest("[data-more-shots]");
  if (more) {
    ensureStoryboard(more.dataset.moreShots, true);
    return;
  }
  const shotRow = event.target.closest("tr[data-shot]");
  if (shotRow && !event.target.closest("a, button")) location.hash = recordUrl(shotRow.dataset.shot, "shots");
});
els.detailBack.addEventListener("click", closeDetail);
els.statusSelect.addEventListener("change", () => {
  replaceRoute(listUrl({ ...state.route, status: els.statusSelect.value }));
});
els.search.addEventListener("input", () => {
  replaceRoute(`#/${state.route.view}${routeQuery({ ...state.route, query: els.search.value }, { peek: state.route.peek })}`);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.closest?.("input, select, textarea")) {
    event.target.blur();
    return;
  }
  if (document.body.classList.contains("sidebar-open")) {
    setMobileSidebarOpen(false);
    return;
  }
  const { selectedId, presentation } = state.route;
  if (selectedId && presentation && presentation !== "page") closeDetail();
});
const refresh = () => loadState().catch((error) => renderSetupRequired(error, boot));
byId("refresh").addEventListener("click", refresh);
byId("viewRefresh").addEventListener("click", refresh);
byId("mobileRefresh").addEventListener("click", refresh);
byId("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", () => {
  if (!isMobileLayout()) setMobileSidebarOpen(false);
});

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    renderSetupRequired(error, boot);
  }
}

els.search.value = state.route.query;
previousRouteWasList = Boolean(VIEWS[state.route.view]) && !state.route.selectedId;
boot();
