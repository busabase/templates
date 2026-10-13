import { MESSAGES, resolveLang } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  newCharacter,
  newShot,
  renderDetail,
  renderList,
  renderOverview,
  renderSong,
} from "./js/workspace-views.js";

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------
// Demo mode: `/?demo=<scene>&lang=en|zh` shows deterministic mock data.
const PAGE_QUERY = new URLSearchParams(window.location.search);
const URL_LANG = PAGE_QUERY.get("lang") || "";

// Where a record opens, per view — declared once in config.js
// `ui.detail_modes` (cast → drawer, storyboard → split; the reasons are there).
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);

export const state = {
  data: null,
  view: "overview",
  selectedId: null,
  // "page" | "drawer" | "split" | null — how the selected record is shown.
  presentation: null,
  peek: "",
  search: "",
  lang: URL_LANG || localStorage.getItem("kmv_lang") || "auto",
  toast: null,
  loadingMore: {},
  loadMoreError: {},
  hasLoadedMore: false,
};

const VIEWS = ["overview", "song", "cast", "storyboard"];
export const DURATIONS = [4, 5, 6, 8, 10, 12];
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-mv.sidebarCollapsed";

export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
function lang() {
  return resolveLang(state.lang);
}
export function t(key) {
  const l = lang();
  return MESSAGES[l]?.[key] || MESSAGES.zh[key] || key;
}
export function secs(n) {
  const v = Math.round(Number(n) || 0);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
export function project() {
  return state.data?.project || {};
}
export function settings() {
  return project()._settings || {};
}

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}
function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  document.getElementById("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}
function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = document.getElementById("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}
function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}
function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function applyState(payload) {
  state.data = payload;
  render();
}
export function toast(message, kind = "ok") {
  state.toast = { message, kind };
  render();
  setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = null;
      render();
    }
  }, 4200);
}

// File pickers for uploads. Uploaded bytes go straight to the provider
// (a real Busabase Asset, or a synthetic placeholder in demo mode) — there is
// no base64/data_base64 round trip through a server endpoint any more.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Routing: `#/<view>[/<record>][?q=…&peek=…]`. Search and the peeked record
// live in the URL so refresh, shared links and Back restore the same list.
// `#/concept` (the old first page) still lands on Overview.
// ---------------------------------------------------------------------------
function parseHash() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [view, rawId] = path.split("/");
  const params = new URLSearchParams(query);
  let id = "";
  try {
    id = rawId ? decodeURIComponent(rawId) : "";
  } catch {
    id = "";
  }
  state.view = VIEWS.includes(view) ? view : "overview";
  const mode = DETAIL_MODES[state.view];
  state.peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
  state.selectedId = mode ? id || state.peek || null : null;
  state.presentation = !mode ? null : id ? "page" : mode === "page" ? null : mode;
  state.search = mode ? params.get("q") || "" : "";
}
function routeQuery(extra = {}) {
  const params = new URLSearchParams();
  if (state.search) params.set("q", state.search);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}
export function listUrl(view = state.view) {
  return view === state.view ? `#/${view}${routeQuery()}` : `#/${view}`;
}
// The full page: the record in the path, whatever the view's mode.
export function detailUrl(id, view = state.view) {
  return `#/${view}/${encodeURIComponent(id)}${view === state.view ? routeQuery() : ""}`;
}
// What a row opens: the page for a `page` view, else `?peek=`.
export function recordUrl(id, view = state.view) {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  return view === state.view ? `#/${view}${routeQuery({ peek: id })}` : `#/${view}?peek=${encodeURIComponent(id)}`;
}

let previousRouteWasList = false;
function setRoute() {
  const previousView = state.view;
  parseHash();
  // A record opened from its own list marks the entry, so Back/Close/Escape
  // step back to that list instead of pushing a new one.
  if (state.selectedId && previousRouteWasList && previousView === state.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.view) && !state.selectedId;
  setMobileSidebarOpen(false);
  render();
}
// Replace the current entry without a hashchange: keystrokes and switching
// rows inside an open drawer/split should not each become a Back step.
export function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const wasList = previousRouteWasList;
  parseHash();
  previousRouteWasList = wasList;
  render();
}
export function go(view) {
  location.hash = `#/${view}`;
}
export function openRecord(id, view = state.view) {
  const url = recordUrl(id, view);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (view === state.view && state.peek) replaceRoute(url);
  else location.hash = url;
}
export function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ---------------------------------------------------------------------------
// Boot / state loading
// ---------------------------------------------------------------------------
export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.data = data;
  window.dispatchEvent(new CustomEvent("busa-mv:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.data?.demo || location.hash) return;
  const demoRoutes = {
    overview: "#/overview",
    song: "#/song",
    cast: "#/cast?peek=char-demo-dreamer",
    storyboard: "#/storyboard?peek=shot-demo-01",
  };
  history.replaceState(null, "", demoRoutes[state.data.demo_scenario] || "#/overview");
  parseHash();
}

async function refresh() {
  try {
    await loadState();
  } catch (e) {
    console.error(e);
  }
}
async function pollLock() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
  if (state.data?.demo) return;
  if (state.hasLoadedMore) return;
  await refresh();
}

export async function loadMore(key) {
  const cursor = state.data?.pagination?.[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const target = key === "cast" ? project().characters : project().shots;
    const known = new Set(target.map((item) => item.id));
    target.push(...page.items.filter((item) => !known.has(item.id)));
    state.data.pagination[key] = page.nextCursor;
    state.hasLoadedMore = true;
  } catch {
    state.loadMoreError[key] = true;
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

window.addEventListener("hashchange", setRoute);

// ---------------------------------------------------------------------------
// Chrome wiring
// ---------------------------------------------------------------------------
function wireChrome() {
  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) {
      setMobileSidebarOpen(false);
      go(btn.dataset.view);
    }
  });
  document.getElementById("nextStepButton").addEventListener("click", () => routeNextStep());
  document.getElementById("newItemButton").addEventListener("click", () => onNewItem());
  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);
  document.getElementById("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
  document.getElementById("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
  document.getElementById("detailBack").addEventListener("click", closeDetail);
  window.addEventListener("resize", () => {
    syncResponsiveShell();
    render();
  });
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    replaceRoute(`#/${state.view}${routeQuery({ peek: state.peek })}`);
  });
  document.getElementById("list").addEventListener("click", (e) => {
    const more = e.target.closest("[data-load-more]");
    if (more) return loadMore(more.dataset.loadMore);
    const row = e.target.closest("tr[data-select]");
    if (row) openRecord(row.dataset.select);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("settingsModal").classList.contains("hidden")) {
      document.getElementById("settingsModal").classList.add("hidden");
      return;
    }
    // Escape inside a field only leaves the field; a second Escape closes.
    if (e.target.closest?.("textarea, input, select")) {
      e.target.blur();
      return;
    }
    if (state.selectedId && state.presentation && state.presentation !== "page") closeDetail();
  });
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsButton").addEventListener("click", () => openSettings());
  document.getElementById("closeSettings").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  document.querySelector(".modal-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-settings-tab]");
    if (!btn) return;
    document.querySelectorAll(".modal-tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document
      .querySelectorAll(".settings-panel")
      .forEach((p) => p.classList.toggle("active", p.dataset.settingsPanel === btn.dataset.settingsTab));
  });
  const langSel = document.getElementById("languageSelect");
  langSel.value = state.lang;
  langSel.addEventListener("change", (e) => {
    state.lang = e.target.value;
    localStorage.setItem("kmv_lang", state.lang);
    applyChrome();
    render();
  });
  applyChrome();
}

function applyChrome() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const langSel = document.getElementById("languageSelect");
  if (langSel) {
    const labels =
      lang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
    for (const option of langSel.options) option.textContent = labels[option.value] || option.textContent;
  }
  const si = document.getElementById("searchInput");
  if (si) si.placeholder = t("search_placeholder");
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
}

const VIEW_TITLE_KEYS = {
  overview: ["nav_overview", "sub_concept"],
  song: ["nav_song", "sub_song"],
  cast: ["nav_cast", "sub_cast"],
  storyboard: ["nav_storyboard", "sub_storyboard"],
};

export function render() {
  if (!state.data) return;
  const { view, selectedId, presentation } = state;
  const onRecordView = RECORD_VIEWS.includes(view);
  const body = document.body.classList;
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle("ws-layout-split", onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.search));
  body.add("ws-has-mobile-bar");
  syncSidebar();
  const [titleKey, subKey] = VIEW_TITLE_KEYS[view];
  document.getElementById("loadState").hidden = true;
  document.getElementById("overviewPage").hidden = view !== "overview";
  document.getElementById("viewPage").hidden = !onRecordView;
  document.getElementById("songPage").hidden = view !== "song";
  document.getElementById("mobileViewTitle").textContent = t(titleKey);
  document.getElementById("lockBanner").hidden = !state.data.lock?.locked;
  // The view's description moves to the title tooltip: record views carry
  // no description line.
  for (const id of ["viewTitle", "songTitle"]) document.getElementById(id).title = t(subKey);
  document.getElementById("viewTitle").textContent = t(titleKey);
  const search = document.getElementById("searchInput");
  if (search.value !== state.search) search.value = state.search;
  document.getElementById("newItemButton").textContent = view === "storyboard" ? t("new_shot") : t("new_character");
  const expand = document.getElementById("detailExpand");
  expand.hidden = !(onRecordView && selectedId && presentation !== "page");
  if (!expand.hidden) expand.href = detailUrl(selectedId);
  // On a phone every mode is a page, so the button always goes back.
  document.getElementById("detailBack").textContent =
    presentation && presentation !== "page" && !isMobileLayout() ? t("close") : t("back_to_list");
  renderToast();
  if (view === "overview") renderOverview();
  else if (view === "song") renderSong();
  else {
    renderList();
    renderDetail();
  }
}

function syncSidebar() {
  const data = state.data;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.getElementById("navCountCast").textContent = navCount("cast");
  document.getElementById("navCountStoryboard").textContent = navCount("shots");
  document.getElementById("mobileViewMeta").textContent = RECORD_VIEWS.includes(state.view)
    ? navCount(state.view === "cast" ? "cast" : "shots")
    : "";
  const sel = document.getElementById("projectSelect");
  sel.innerHTML = (data.projects || [])
    .map((p) => `<option value="${esc(p.id)}" selected>${esc(p.title || p.id)}</option>`)
    .join("");
  document.getElementById("nextStepLabel").textContent = t(`step_${data.next_step || "review"}`);
}

// Per-Base totals sit next to the nav item: the exact count when the provider
// has one, else the loaded rows marked "+" while more pages remain.
export function navCount(key) {
  const exact = state.data?.totalCount?.[key];
  if (typeof exact === "number") return String(exact);
  const loaded = (key === "cast" ? project().characters : project().shots) || [];
  return `${loaded.length}${state.data?.pagination?.[key] ? "+" : ""}`;
}

function renderToast() {
  let node = document.getElementById("kmvToast");
  if (!state.toast) {
    if (node) node.remove();
    return;
  }
  if (!node) {
    node = document.createElement("div");
    node.id = "kmvToast";
    document.body.appendChild(node);
  }
  node.className = `toast ${state.toast.kind}`;
  node.textContent = state.toast.message;
}

function routeNextStep() {
  const map = {
    upload_song: "song",
    set_concept: "overview",
    add_cast: "cast",
    generate_cast_refs: "cast",
    add_shots: "storyboard",
    fill_shot_images: "storyboard",
    fill_shot_videos: "storyboard",
    review: "overview",
  };
  go(map[state.data?.next_step] || "overview");
}
function onNewItem() {
  if (state.view === "cast") return newCharacter();
  if (state.view === "storyboard") return newShot();
}

// ---------------------------------------------------------------------------
// LIST panel
// ---------------------------------------------------------------------------
export function statusClass(status) {
  return { approved: "positive", needs_review: "warning", blocked: "danger" }[status] || "";
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function openSettings() {
  document.getElementById("settingsModal").classList.remove("hidden");
  document.getElementById("projectPath").textContent = state.data?.config_summary?.config_path || "";
  const ic = settings();
  document.getElementById("imageSettingsMount").innerHTML = `
    <div class="image-config">
      <label class="field"><span>Base URL</span><input id="imgBase" value="${esc(ic.image_base_url || "")}" /></label>
      <label class="field"><span>Model</span><input id="imgModel" value="${esc(ic.image_model || "")}" /></label>
      <label class="field"><span>Size</span><input id="imgSize" value="${esc(ic.image_size || "")}" /></label>
      <div class="field"><span>API Key</span><div class="settings-row"><code>KELLY_MV_IMAGE_API_KEY</code><span>set for the trusted generation script, not this browser</span></div></div>
      <div class="form-actions"><button class="mini-button" id="imgSave">保存</button></div>
    </div>`;
  document.getElementById("imgSave").addEventListener("click", async () => {
    if (state.data?.demo) return toast(t("demo_read_only"), "danger");
    const body = {
      base_url: document.getElementById("imgBase").value,
      model: document.getElementById("imgModel").value,
      size: document.getElementById("imgSize").value,
    };
    try {
      const provider = await getProvider();
      await provider.saveImageConfig(body);
      await loadState();
      openSettings();
      toast(t("toast_concept_saved"));
    } catch (e) {
      toast(e.message, "danger");
    }
  });
  document.getElementById("songSettingsMount").innerHTML = `
    <div class="settings-row"><span>${t("settings_draft_backend")}</span><code>${esc(ic.song_draft_backend || "songgeneration-v2-mlx")}</code></div>
    <div class="settings-row"><span>${t("settings_draft_status")}</span><code>${t("settings_draft_not_ready")}</code></div>
    <p class="muted">创歌为后续能力，当前请直接上传 MP3。</p>`;
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    parseHash();
    previousRouteWasList = RECORD_VIEWS.includes(state.view) && !state.selectedId;
    syncResponsiveShell();
    wireChrome();
    await loadState();
    setInterval(pollLock, 5000);
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    console.error(error);
    const node = document.getElementById("loadState");
    node.hidden = false;
    node.classList.add("error");
    node.textContent = error instanceof Error ? error.message : String(error);
  }
}

boot();
