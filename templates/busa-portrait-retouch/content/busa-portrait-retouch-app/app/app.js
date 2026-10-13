import { messages, resolveLanguage } from "./i18n/messages.js";
import {
  closeConnectGate,
  passConnectGate,
  renderProductOnboarding,
  renderSetupRequired,
} from "./js/connect-gate.js?v=0.1.0";
import { appConfig } from "./js/config.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { flaggedChecks } from "./js/retouch-model.js?v=0.1.0";

// Where a candidate opens, per view — declared (with the reasons) once, in
// config.js `ui.detail_modes`. A `/<id>` path always opens the full page;
// `?peek=<id>` drives the split queue and the drawer. Phones always get the page
// (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const VIEW_STATUSES = {
  queue: ["needs_review", "changes_requested"],
  approved: ["approved"],
  done: ["done"],
  blocked: ["blocked"],
};

const app = document.getElementById("app");
const scrim = document.getElementById("sidebarScrim");
const state = {
  data: null,
  candidates: [],
  nextCursor: null,
  loadingMore: false,
  // Candidates opened by URL that are not on a loaded page (records.get).
  extra: new Map(),
  missing: new Set(),
  route: parseRoute(),
  lang: resolveLanguage(),
  compareMode: "split",
  reveal: 50,
  draftStrength: null,
  localFileName: "",
  settingsTab: "guide",
  busy: false,
  pendingDecision: null,
};

const t = (key, values = {}) =>
  String(messages[state.lang]?.[key] || messages.en[key] || key).replace(/\{(\w+)\}/g, (_, name) =>
    String(values[name] ?? ""),
  );
const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<candidate>][?q=…&peek=…]`. Search and the peeked candidate live in
// the URL, so refresh, shared links and Back restore the same list context.
function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [first = "overview", second = ""] = path.split("/");
  const params = new URLSearchParams(query);
  const view = RECORD_VIEWS.includes(first) || first === "settings" ? first : "overview";
  let id = "";
  try {
    id = second ? decodeURIComponent(second) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: mode ? id || peek : "",
    presentation: !mode ? null : id ? "page" : peek ? mode : null,
    query: mode ? params.get("q") || "" : "",
  };
}

const routeQuery = (extra = {}, route = state.route) => {
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};
const listUrl = (route = state.route) => `#/${route.view}${routeQuery({}, route)}`;
const pageUrl = (id, route = state.route) => `#/${route.view}/${encodeURIComponent(id)}${routeQuery({}, route)}`;
const peekUrl = (id, view = state.route.view) => {
  const route = view === state.route.view ? state.route : { view, query: "" };
  return `#/${view}${routeQuery({ peek: id }, route)}`;
};

let previousRouteWasList = false;

function onRouteChange() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list marks the entry, so Close / Escape / Back
  // step back to that exact list instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous.view === state.route.view) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  if (previous.selectedId !== state.route.selectedId) state.draftStrength = null;
  if (state.route.view !== "settings") returnHash = window.location.hash || "#/overview";
  setSidebarOpen(false);
  render();
  ensureSelected();
}

// Search keystrokes replace the entry instead of each becoming a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  state.route = parseRoute();
}

function closeDetail() {
  if (history.state?.fromList) history.back();
  else window.location.hash = listUrl();
}

function isMobile() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  scrim.hidden = !open;
}

// ── Data helpers ───────────────────────────────────────────────────────────
const statusLabel = (status) =>
  ({
    needs_review: t("queue"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
  })[status] || t("queue");
const statusTone = (status) =>
  ["approved", "done"].includes(status) ? "positive" : status === "blocked" ? "danger" : "warning";
const statusBadge = (status) => `<span class="badge ${statusTone(status)}">${esc(statusLabel(status))}</span>`;

function viewCandidates(view = state.route.view) {
  const statuses = VIEW_STATUSES[view] || [];
  return state.candidates.filter((item) => statuses.includes(item.status));
}

function searchMatches(items, query = state.route.query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [item.title, item.source_label, item.output_label, t(item.preset), `#${item.ref}`, statusLabel(item.status)]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

function findCandidate(id) {
  if (!id) return null;
  return state.candidates.find((item) => item.candidate_id === id) || state.extra.get(id) || null;
}

// Exact totals from records.count when the provider has them; otherwise the
// loaded rows, with "+" while more pages exist (never a partial window
// presented as a total).
function statusTotal(statuses) {
  const counts = state.data?.snapshot?.counts;
  if (counts) return String(statuses.reduce((sum, status) => sum + Number(counts[status] || 0), 0));
  const loaded = state.candidates.filter((item) => statuses.includes(item.status)).length;
  return `${loaded}${state.nextCursor ? "+" : ""}`;
}

const formatDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(state.lang === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const checksSummary = (candidate) => {
  const flagged = flaggedChecks(candidate);
  return flagged
    ? `<span class="badge warning">${esc(t("flaggedN", { n: flagged }))}</span>`
    : `<span class="checks-ok">${esc(t("allPass"))}</span>`;
};

const thumb = (candidate) =>
  candidate.output_url
    ? `<img class="row-thumb" src="${esc(candidate.output_url)}" alt="" loading="lazy" />`
    : `<span class="row-thumb" aria-hidden="true"></span>`;

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  if (!state.data) return;
  state.lang = resolveLanguage();
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  const { view } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  // Help & Settings is a dialog over the overview; closing it returns to
  // whatever was open before.
  const page = onRecordView ? renderRecordView() : renderOverview();
  app.innerHTML = `${renderSidebar()}<main class="main">${renderMobileBar()}${page}</main>${view === "settings" ? renderSettings() : ""}`;
  syncBodyState();
  bindEvents();
}

function syncBodyState() {
  const { view, selectedId, presentation } = state.route;
  const onRecordView = RECORD_VIEWS.includes(view);
  const mode = DETAIL_MODES[view];
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle("ws-detail-page", onRecordView && presentation === "page");
  body.toggle("ws-detail-drawer", onRecordView && mode === "drawer" && presentation !== "page");
  body.toggle("ws-layout-split", onRecordView && mode === "split" && presentation !== "page");
  body.toggle("ws-searching", onRecordView && Boolean(state.route.query.trim()));
}

function renderSidebar() {
  const navTarget = state.route.view === "settings" ? "overview" : state.route.view;
  return `<aside class="sidebar" id="appSidebar">
    <div class="brand">
      <div class="brand-icon" aria-hidden="true">PR</div>
      <div class="brand-copy"><strong>${esc(t("app"))}</strong><span>${esc(t("subtitle"))}</span></div>
      <button class="icon-button sidebar-toggle" data-collapse type="button" title="Toggle sidebar"><span class="panel-icon"></span></button>
    </div>
    <a class="attention" href="#/queue"><span>${esc(t("needsAttention"))}</span><strong>${esc(statusTotal(VIEW_STATUSES.queue))}</strong></a>
    <nav class="nav" aria-label="Workflow">
      ${navItem("overview", t("overview"), "", navTarget)}
      ${navItem("queue", t("queue"), statusTotal(VIEW_STATUSES.queue), navTarget)}
      ${navItem("approved", t("approved"), statusTotal(VIEW_STATUSES.approved), navTarget)}
      ${navItem("done", t("done"), statusTotal(VIEW_STATUSES.done), navTarget)}
      ${navItem("blocked", t("blocked"), statusTotal(VIEW_STATUSES.blocked), navTarget)}
    </nav>
    <div class="sidebar-footer">
      ${state.data.demo ? `<span class="demo-label">${esc(t("demo"))}</span>` : ""}
      <button class="nav-plain" data-route="settings" type="button">${esc(t("settings"))}</button>
    </div>
  </aside>`;
}

function navItem(view, label, count, active) {
  return `<button class="${active === view ? "active" : ""}" data-route="${view}" type="button"><span>${esc(label)}</span>${count ? `<small>${esc(count)}</small>` : ""}</button>`;
}

function renderMobileBar() {
  const { view } = state.route;
  const title = view === "settings" ? t("settings") : t(view);
  return `<div class="mobile-topbar">
    <button class="icon-button" data-open-sidebar type="button" aria-label="Open sidebar"><span class="panel-icon"></span></button>
    <strong>${esc(title)}</strong>
    <button class="icon-button" data-route="settings" type="button" aria-label="${esc(t("settings"))}">?</button>
  </div>`;
}

// Overview: the only page with the hero and the metrics band. The band holds
// three numbers the nav does not: the queue split into its two halves, and
// how many candidates failed a naturalness check.
function renderOverview() {
  const counts = state.data.snapshot.counts;
  const loadedFlagged = state.candidates.filter((item) => flaggedChecks(item) > 0).length;
  const flaggedLabel = `${loadedFlagged}${state.nextCursor ? "+" : ""}`;
  const queue = viewCandidates("queue").slice(0, 5);
  return `<section class="ws-overview" id="overviewPage">
    <header class="page-hero">
      <div>
        <h1>${esc(t("overview"))}</h1>
        <p>${esc(t("overviewLead"))}</p>
      </div>
      <div class="page-actions"><button class="button primary" data-route="queue" type="button">${esc(t("openQueue"))}</button></div>
    </header>
    <div class="ws-metrics" aria-label="${esc(t("overview"))}">
      <div><span>${esc(t("firstReview"))}</span><strong>${esc(counts ? counts.needs_review : statusTotal(["needs_review"]))}</strong></div>
      <div><span>${esc(t("changesRequested"))}</span><strong>${esc(counts ? counts.changes_requested : statusTotal(["changes_requested"]))}</strong></div>
      <div><span>${esc(t("checksFlagged"))}</span><strong>${esc(flaggedLabel)}</strong></div>
    </div>
    <div class="overview-grid">
      <section class="card overview-card">
        <h2>${esc(t("nextInQueue"))}</h2>
        ${
          queue.length
            ? `<div class="queue-preview">${queue
                .map(
                  (item) => `<a class="queue-preview-row" href="${esc(peekUrl(item.candidate_id, "queue"))}">
                    ${thumb(item)}<span class="queue-preview-title">${esc(item.title)}</span>${statusBadge(item.status)}</a>`,
                )
                .join("")}</div>
              <button class="button" data-route="queue" type="button">${esc(t("viewAll"))}</button>`
            : `<p class="muted">${esc(t("queueClear"))}</p>`
        }
      </section>
      <section class="card overview-card">
        <h2>${esc(t("startRetouch"))}</h2>
        <p class="muted">${esc(t("startRetouchHint"))}</p>
        <div class="intake">
          <label class="button file-button"><input type="file" accept="image/*" data-local-file /><span>${esc(t("choosePhoto"))}</span></label>
          <strong>${esc(state.localFileName || t("selected"))}</strong>
          <button class="button" data-copy-cli type="button">${esc(t("copy"))}</button>
        </div>
        <code class="cli-preview">${esc(cliCommand())}</code>
      </section>
    </div>
  </section>`;
}

// Record view: one toolbar row over a full-bleed table; the detail renders
// beside it (split), over it (drawer) or instead of it (page).
function renderRecordView() {
  const { view, query } = state.route;
  return `<section class="ws-view">
    <header class="ws-toolbar">
      <div class="ws-title">
        <h1 title="${esc(t(`desc_${view}`))}">${esc(t(view))}</h1>
        <span class="ws-count" data-view-count>${esc(viewCountLabel())}</span>
      </div>
      <div class="ws-actions">
        <input class="search-field" type="search" data-search value="${esc(query)}" placeholder="${esc(t("searchPlaceholder"))}" aria-label="${esc(t("search"))}" autocomplete="off" />
      </div>
    </header>
    <div class="ws-workspace">
      <div class="ws-list" data-list>${renderList()}</div>
      <aside class="ws-detail" aria-live="polite">${renderDetail()}</aside>
    </div>
  </section>`;
}

function viewCountLabel() {
  if (state.route.query.trim()) return String(searchMatches(viewCandidates()).length);
  return statusTotal(VIEW_STATUSES[state.route.view] || []);
}

function renderList() {
  const { view, selectedId } = state.route;
  const all = viewCandidates();
  const items = searchMatches(all);
  const queue = view === "queue";
  // Second column survives the narrow split queue and phones: the queue's
  // status (first review vs. sent back), or when a verdict was given.
  const head = `<tr>
    <th>${esc(t("colPortrait"))}</th>
    <th class="col-mid">${esc(queue ? t("colStatus") : t("colDecided"))}</th>
    <th>${esc(t("preset"))}</th>
    <th class="ws-col-num col-num-tight">${esc(t("colStrength"))}</th>
    <th class="ws-col-num col-num-tight">${esc(t("colFaces"))}</th>
    <th class="col-checks">${esc(t("colChecks"))}</th>
    <th class="ws-col-num col-ref">#</th>
  </tr>`;
  const rows = items
    .map(
      (item) => `<tr class="${item.candidate_id === selectedId ? "ws-selected" : ""}" data-candidate="${esc(item.candidate_id)}" tabindex="0">
      <td><span class="cell-portrait">${thumb(item)}<strong>${esc(item.title)}</strong></span></td>
      <td>${queue ? statusBadge(item.status) : esc(formatDate(item.decided_at) || "-")}</td>
      <td>${esc(t(item.preset))}</td>
      <td class="ws-col-num">${esc(item.strength)}%</td>
      <td class="ws-col-num">${esc(item.face_count)}</td>
      <td>${checksSummary(item)}</td>
      <td class="ws-col-num">${esc(item.ref)}</td>
    </tr>`,
    )
    .join("");
  const empty = !items.length
    ? `<p class="list-empty">${esc(all.length ? t("noMatches") : t("empty"))}</p>`
    : "";
  const more = state.nextCursor
    ? `<div class="list-more"><button class="button" data-load-more type="button" ${state.loadingMore ? "disabled" : ""}>${esc(state.loadingMore ? t("loading") : t("loadMore"))}</button></div>`
    : "";
  return `<table class="ws-table"><thead>${head}</thead><tbody>${rows}</tbody></table>${empty}${more}`;
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  if (!selectedId) {
    if (DETAIL_MODES[view] !== "split") return "";
    const first = searchMatches(viewCandidates())[0];
    return `<div class="ws-detail-empty"><p>${esc(t("pickFromQueue"))}</p>${
      first
        ? `<button class="button" data-open-candidate="${esc(first.candidate_id)}" type="button">${esc(t("startFirst"))}</button>`
        : ""
    }</div>`;
  }
  const candidate = findCandidate(selectedId);
  const pageMode = presentation === "page" || isMobile();
  const bar = `<div class="ws-detail-bar">
    <div class="detail-nav">
      <button class="button" data-close-detail type="button">${esc(pageMode ? `← ${t("back")}` : t("closeDetail"))}</button>
      ${presentation !== "page" && candidate ? `<a class="button detail-expand" href="${esc(pageUrl(selectedId))}">${esc(t("openFullPage"))}</a>` : ""}
    </div>
    ${
      candidate
        ? `<div class="detail-actions">
        <button class="button primary" data-decision="approve" type="button">${esc(t("approve"))}</button>
        <button class="button" data-decision="request_changes" type="button">${esc(t("changes"))}</button>
        <button class="button danger" data-decision="block" type="button">${esc(t("block"))}</button>
      </div>`
        : ""
    }
  </div>`;
  if (!candidate) {
    const text = state.missing.has(selectedId) ? t("notLoaded") : t("loading");
    return `${bar}<p class="ws-detail-empty">${esc(text)}</p>`;
  }
  const strength = state.draftStrength ?? candidate.strength;
  const pending = state.pendingDecision?.candidate_id === candidate.candidate_id;
  return `${bar}
    <div class="detail-body">
      <div class="detail-heading"><h2>${esc(candidate.title)}</h2><span class="detail-ref">${esc(t("ref"))} #${esc(candidate.ref)}</span>${statusBadge(candidate.status)}</div>
      ${
        pending
          ? `<p class="pending-cr">${esc(t("pendingCr", { id: state.pendingDecision.change_request_id || t("pendingCrNoId") }))}</p>`
          : ""
      }
      <div class="compare-modes" role="group" aria-label="Comparison mode">
        ${segment("before", t("before"))}${segment("split", t("split"))}${segment("after", t("after"))}
      </div>
      ${renderCompare(candidate)}
      <section class="controls-band">
        <div class="control-head"><label for="strength">${esc(t("strength"))}</label><output>${strength}%</output></div>
        <input id="strength" type="range" min="0" max="100" step="1" value="${strength}" data-strength />
        <div class="facts">
          <span><small>${esc(t("preset"))}</small><strong>${esc(t(candidate.preset))}</strong></span>
          <span><small>${esc(t("faces"))}</small><strong>${esc(candidate.face_count)}</strong></span>
          ${checkFact("texture", candidate.checks.texture)}${checkFact("identity", candidate.checks.identity)}${checkFact("tone", candidate.checks.tone)}
        </div>
      </section>
      ${
        candidate.decision_comment
          ? `<section class="review-note"><small>${esc(t("decisionNote"))}</small><p>${esc(candidate.decision_comment)}</p></section>`
          : ""
      }
      <section class="review-note"><label for="reviewNote">${esc(t("note"))}</label><textarea id="reviewNote" rows="3" placeholder="${esc(t("note"))}"></textarea></section>
      <section class="file-facts"><div><small>${esc(t("source"))}</small><strong>${esc(candidate.source_label)}</strong></div><div><small>${esc(t("output"))}</small><strong>${esc(candidate.output_label)}</strong></div></section>
    </div>`;
}

function segment(mode, label) {
  return `<button class="${state.compareMode === mode ? "active" : ""}" data-compare-mode="${mode}" type="button">${esc(label)}</button>`;
}

function renderCompare(candidate) {
  const mode = state.compareMode;
  const reveal = mode === "before" ? 0 : mode === "after" ? 100 : state.reveal;
  return `<figure class="compare" style="--reveal:${reveal}%">
    <img class="before-image" src="${esc(candidate.source_url)}" alt="${esc(t("before"))}" />
    <div class="after-mask"><img class="after-image" src="${esc(candidate.output_url)}" alt="${esc(t("after"))}" /></div>
    ${mode === "split" ? `<div class="divider"></div><input class="compare-range" type="range" min="0" max="100" value="${state.reveal}" aria-label="${esc(t("split"))}" data-reveal />` : ""}
    <figcaption><span>${esc(t("before"))}</span><span>${esc(t("after"))}</span></figcaption>
  </figure>`;
}

function checkFact(key, value) {
  if (!value) return `<span><small>${esc(t(key))}</small><strong>-</strong></span>`;
  const pass = value === "pass";
  return `<span><small>${esc(t(key))}</small><strong class="${pass ? "check-pass" : "check-flag"}">${pass ? "✓ " : ""}${esc(t(value))}</strong></span>`;
}

function renderSettings() {
  const tab = state.settingsTab;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(t("settings"))}">
    <header><h2>${esc(t("settings"))}</h2><button class="icon-button" data-close-settings type="button" aria-label="${esc(t("close"))}">×</button></header>
    <nav class="modal-tabs">${settingsTab("guide")}${settingsTab("resources")}${settingsTab("privacy")}</nav>
    <div class="modal-body">${settingsPanel(tab)}</div>
  </section></div>`;
}

function settingsTab(tab) {
  return `<button class="${state.settingsTab === tab ? "active" : ""}" data-settings-tab="${tab}" type="button">${esc(t(tab))}</button>`;
}

const dl = (pairs) => `<dl>${pairs.map(([term, value]) => `<dt>${esc(term)}</dt><dd>${value}</dd>`).join("")}</dl>`;

function settingsPanel(tab) {
  if (tab === "resources")
    return dl([
      [t("folder"), esc(appConfig.folder.slug)],
      [t("bases"), "jobs · candidates · settings"],
      [t("images"), esc(t("imagesValue"))],
      [t("schema"), `v${esc(appConfig.schemaVersion)}`],
    ]);
  if (tab === "privacy")
    return dl([
      [t("metadata"), esc(t("metadataValue"))],
      [t("externalUpload"), esc(t("externalUploadValue"))],
      [t("overwrite"), esc(t("overwriteValue"))],
    ]);
  return dl([
    [t("preset"), `${esc(t("natural"))} · 35%`],
    [t("cli"), "<code>node scripts/retouch.mjs portrait.jpg --preset natural --strength 35</code>"],
    [t("policy"), esc(t("noOverwriting"))],
  ]);
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  app.querySelectorAll("[data-route]").forEach((button) =>
    button.addEventListener("click", () => {
      setSidebarOpen(false);
      window.location.hash = `#/${button.dataset.route}`;
    }),
  );
  app.querySelector("[data-open-sidebar]")?.addEventListener("click", () => setSidebarOpen(true));
  app
    .querySelector("[data-collapse]")
    ?.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
  bindList();
  app.querySelector("[data-search]")?.addEventListener("input", (event) => {
    replaceRoute(
      `#/${state.route.view}${routeQuery({ peek: state.route.peek }, { ...state.route, query: event.target.value })}`,
    );
    refreshList();
  });
  app.querySelector("[data-open-candidate]")?.addEventListener("click", (event) => {
    window.location.hash = peekUrl(event.currentTarget.dataset.openCandidate);
  });
  app.querySelector("[data-close-detail]")?.addEventListener("click", closeDetail);
  app.querySelectorAll("[data-compare-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      state.compareMode = button.dataset.compareMode;
      render();
    }),
  );
  app.querySelector("[data-reveal]")?.addEventListener("input", (event) => {
    state.reveal = Number(event.target.value);
    event.target.closest(".compare").style.setProperty("--reveal", `${state.reveal}%`);
  });
  app.querySelector("[data-strength]")?.addEventListener("input", (event) => {
    state.draftStrength = Number(event.target.value);
    event.target.previousElementSibling.querySelector("output").textContent = `${state.draftStrength}%`;
  });
  app.querySelector("[data-local-file]")?.addEventListener("change", (event) => {
    state.localFileName = event.target.files?.[0]?.name || "";
    render();
  });
  app.querySelector("[data-copy-cli]")?.addEventListener("click", copyCli);
  app
    .querySelectorAll("[data-decision]")
    .forEach((button) => button.addEventListener("click", () => submitDecision(button.dataset.decision)));
  app.querySelectorAll("[data-settings-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      state.settingsTab = button.dataset.settingsTab;
      render();
    }),
  );
  app.querySelector("[data-close-settings]")?.addEventListener("click", closeSettings);
}

function bindList() {
  const list = app.querySelector("[data-list]");
  if (!list) return;
  const open = (row) => {
    const id = row.dataset.candidate;
    window.location.hash = id === state.route.selectedId && state.route.presentation !== "page" ? listUrl() : peekUrl(id);
  };
  list.querySelectorAll("[data-candidate]").forEach((row) => {
    row.addEventListener("click", () => open(row));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open(row);
    });
  });
  list.querySelector("[data-load-more]")?.addEventListener("click", loadMore);
}

// Search narrows the list in place, so the input keeps focus.
function refreshList() {
  const list = app.querySelector("[data-list]");
  if (!list) return;
  list.innerHTML = renderList();
  const count = app.querySelector("[data-view-count]");
  if (count) count.textContent = viewCountLabel();
  syncBodyState();
  bindList();
}

let returnHash = "#/overview";
function closeSettings() {
  window.location.hash = returnHash;
}

function cliCommand() {
  const name = state.localFileName || "portrait.jpg";
  return `node scripts/retouch.mjs ${JSON.stringify(name)} --preset natural --strength 35 --compare ${JSON.stringify(name.replace(/\.[^.]+$/, "-proof.jpg"))}`;
}

async function copyCli() {
  await navigator.clipboard.writeText(cliCommand()).catch(() => null);
}

async function loadMore() {
  if (!state.nextCursor || state.loadingMore) return;
  state.loadingMore = true;
  refreshList();
  try {
    const provider = await getProvider();
    const page = await provider.loadMoreCandidates(state.nextCursor);
    const seen = new Set(state.candidates.map((item) => item.candidate_id));
    state.candidates.push(...page.candidates.filter((item) => !seen.has(item.candidate_id)));
    state.nextCursor = page.next_cursor || null;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loadingMore = false;
    render();
  }
}

// A candidate named by the URL but not on a loaded page: one records.get.
async function ensureSelected() {
  const id = state.route.selectedId;
  if (!id || findCandidate(id) || state.missing.has(id) || !state.data) return;
  try {
    const provider = await getProvider();
    const candidate = await provider.getCandidate?.(id);
    if (candidate) state.extra.set(id, candidate);
    else state.missing.add(id);
  } catch {
    state.missing.add(id);
  }
  if (state.route.selectedId === id) render();
}

async function submitDecision(action) {
  if (state.busy) return;
  const candidate = findCandidate(state.route.selectedId);
  if (!candidate) return;
  const comment = app.querySelector("#reviewNote")?.value || "";
  state.busy = true;
  try {
    const provider = await getProvider();
    const result = await provider.submitDecision({
      candidate_id: candidate.candidate_id,
      action,
      comment,
      strength: state.draftStrength ?? candidate.strength,
    });
    state.draftStrength = null;
    state.pendingDecision = { candidate_id: candidate.candidate_id, ...result };
    render();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    state.busy = false;
  }
}

async function loadState() {
  const provider = await getProvider();
  state.data = await provider.getState();
  if (!state.data.demo && state.data.readiness?.runtime !== "ready") {
    const context = state.data.readiness?.safe_context || {};
    renderSetupRequired(
      new Error(`${context.error_code || "SETUP_REQUIRED"}: ${context.reason || "portrait workspace"}`),
      loadState,
    );
    return;
  }
  if (!state.data.demo && state.data.readiness?.onboarding !== "complete") {
    renderProductOnboarding(state.data, loadState);
    return;
  }
  state.candidates = [...(state.data.snapshot.candidates || [])];
  state.nextCursor = state.data.snapshot.next_cursor || null;
  state.extra = new Map();
  state.missing = new Set();
  closeConnectGate();
  state.route = parseRoute();
  previousRouteWasList = RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
  render();
  ensureSelected();
}

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).includes("SETUP_")) renderSetupRequired(error, boot);
    else throw error;
  }
}

scrim.addEventListener("click", () => setSidebarOpen(false));
window.addEventListener("hashchange", onRouteChange);
let wasMobile = isMobile();
window.addEventListener("resize", () => {
  if (!isMobile()) setSidebarOpen(false);
  if (wasMobile !== isMobile()) {
    wasMobile = isMobile();
    render();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape inside a field only leaves the field; a second Escape closes.
  if (event.target instanceof HTMLElement && event.target.matches("input, textarea")) {
    event.target.blur();
    return;
  }
  if (state.route.view === "settings") closeSettings();
  else if (document.body.classList.contains("sidebar-open")) setSidebarOpen(false);
  else if (state.route.selectedId) closeDetail();
});

boot().catch((error) => {
  app.innerHTML = `<main class="fatal"><h1>Portrait Retouch</h1><p>${esc(error instanceof Error ? error.message : error)}</p></main>`;
});
