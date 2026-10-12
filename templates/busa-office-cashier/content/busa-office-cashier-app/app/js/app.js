import { appConfig } from "./config.js";
import { messages } from "./messages.js";
import { getRuntime } from "./runtime.js";
import { getProvider, isDemo } from "./providers/index.js";
import {
  attentionReason,
  moneyByCurrency,
  resolveRelation,
  appendPage,
  isStaleBalance,
} from "./model.js";
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { openDeskDialog } from "./dialog.js";
import {
  createElement,
  RefreshCw,
  Menu,
  LayoutDashboard,
  List,
  TriangleAlert,
  CircleHelp,
  Settings,
} from "../vendor/lucide.js";

// Where a record opens, per view. Chosen by what the cashier does with it:
//   attention → split:  the review queue is worked top to bottom, one flagged
//                       record after the next, so the queue stays beside it.
//   accounts, checks, payments, ledger → drawer: each record is a fact the
//                       cashier scans many of, reads one or two fields of
//                       (balance, receipt, match state) and returns to the list.
// `#/<view>/<id>` always opens the full page; `?peek=<id>` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
const DETAIL_MODES = appConfig.ui.detail_modes;
const RECORD_VIEWS = Object.keys(DETAIL_MODES);
const MONEY = ["amount", "balance", "bankBalance"];

const root = document.querySelector("#app");
let locale =
    new URLSearchParams(location.search).get("lang") === "zh-CN"
      ? "zh-CN"
      : "en",
  state = null,
  route = parseRoute(),
  navOpen = false,
  loading = false,
  seq = 0,
  previousRouteWasList = false;
// Records read on their own because a link named one outside the loaded page.
const fetched = new Map();
const t = (k) => messages[locale][k] || k;
const name = (b) => b.nameI18n?.[locale] || b.name;
const baseOf = (key) => appConfig.bases.find((b) => b.key === key);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  refresh: RefreshCw,
  menu: Menu,
  grid: LayoutDashboard,
  list: List,
  alert: TriangleAlert,
  help: CircleHelp,
  settings: Settings,
};
const icon = (k) =>
  createElement(icons[k], { "aria-hidden": "true" }).outerHTML;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the state filter and the
// peeked record live in the URL so refresh, shared links and Back restore the
// same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(search);
  let view = parts[0] || "overview";
  if (!RECORD_VIEWS.includes(view)) view = "overview";
  let id = "";
  try {
    id = parts[1] && view !== "attention" ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? params.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: id || peek,
    presentation: !mode ? null : id ? "page" : peek ? mode : null,
    query: params.get("q") || "",
    status: params.get("status") || "",
  };
}
const routeQuery = (extra = {}, r = route) => {
  const params = new URLSearchParams();
  if (r.query) params.set("q", r.query);
  if (r.status) params.set("status", r.status);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const text = params.toString();
  return text ? "?" + text : "";
};
const listUrl = (r = route) => "#/" + r.view + routeQuery({}, r);
const fullPageUrl = (record) =>
  "#/" + record.baseKey + "/" + encodeURIComponent(record.id);
const peekUrl = (id, view = route.view) =>
  "#/" +
  view +
  routeQuery(
    { peek: id },
    view === route.view ? route : { query: "", status: "" },
  );

function setRoute() {
  const previous = route;
  route = parseRoute();
  // A detail opened from its own list replaces nothing but is marked, so
  // Close / Escape / Back step back to that exact list entry.
  if (
    route.selectedId &&
    previousRouteWasList &&
    previous.view === route.view
  ) {
    history.replaceState({ fromList: true }, "");
  }
  previousRouteWasList =
    RECORD_VIEWS.includes(route.view) && !route.selectedId;
  navOpen = false;
  render();
}
// Search keystrokes, filter changes and switching the peeked record replace
// the entry rather than each becoming a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  route = parseRoute();
  render();
}
function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Formatting ─────────────────────────────────────────────────────────────
function badge(s) {
  const cls = ["blocked", "exception", "restricted"].includes(s)
    ? "danger"
    : ["paid", "matched", "reconciled"].includes(s)
      ? "positive"
      : ["pending", "approved", "unmatched"].includes(s)
        ? "warning"
        : "";
  return s ? '<span class="badge ' + cls + '">' + esc(t(s)) + "</span>" : "";
}
function display(field, value) {
  if (value == null || value === "") return t("noValue");
  if (field.type === "relation")
    return esc(resolveRelation(value, state.records) || t("notLoaded"));
  if (field.type === "select") return esc(t(value));
  if (field.type === "number")
    return Number.isFinite(value) ? value.toLocaleString(locale) : t("noValue");
  if (field.type === "date")
    return esc(String(value).slice(0, 16).replace("T", " "));
  return typeof value === "string" || typeof value === "boolean"
    ? esc(value)
    : t("noValue");
}
const money = (r, k) =>
  Number.isFinite(r.fields[k])
    ? esc(r.fields.currency || "") + " " + r.fields[k].toLocaleString(locale)
    : t("noValue");
const reasonText = (r) => {
  const reason = attentionReason(r, state.reviewTime);
  return reason === "reason" ? r.fields.reason : reason ? t(reason) : "";
};

// ── Data shaping ───────────────────────────────────────────────────────────
function rowsFor(view) {
  let rs = state.records.filter((r) =>
    view === "attention"
      ? attentionReason(r, state.reviewTime)
      : r.baseKey === view,
  );
  const q = route.query.toLowerCase();
  if (q)
    rs = rs.filter((r) => {
      const fields = baseOf(r.baseKey).fields;
      return Object.entries(r.fields).some(([k, v]) => {
        const f = fields.find((x) => x.slug === k);
        if (!f || f.type === "relation") return false;
        const text = f.type === "select" ? v + " " + t(v) : String(v ?? "");
        return text.toLowerCase().includes(q);
      });
    });
  if (route.status) rs = rs.filter((r) => r.fields.status === route.status);
  return rs;
}
// Columns per view: the record name, its state, then the facts the cashier
// compares across rows. Each gets its own column instead of a second line.
function columnsFor(view) {
  const label = (base, k) => {
    const f = base.fields.find((x) => x.slug === k);
    return f?.nameI18n?.[locale] || f?.name || k;
  };
  if (view === "attention")
    return [
      { key: "title", label: label(baseOf("payments"), "title") },
      { key: "status", label: label(baseOf("payments"), "status") },
      { key: "register", label: t("register") },
      { key: "why", label: t("why"), cls: "ws-col-wide" },
      { key: "owner", label: t("owner") },
      { key: "due", label: t("dueChecked") },
    ];
  const base = baseOf(view);
  return ["title", "status", "entity"]
    .concat(
      base.columns.filter(
        (k) => !["title", "status", "currency", "entity"].includes(k),
      ),
    )
    .map((k) => ({
      key: k,
      label: label(base, k),
      cls: MONEY.includes(k) ? "ws-col-num" : "",
    }));
}
function cell(r, col) {
  if (col.key === "status") return badge(r.fields.status);
  if (col.key === "register") return esc(name(baseOf(r.baseKey)));
  if (col.key === "why") return esc(reasonText(r));
  if (col.key === "due")
    return display({ type: "date" }, r.fields.due || r.fields.checkedAt);
  if (MONEY.includes(col.key)) return money(r, col.key);
  const field = baseOf(r.baseKey).fields.find((f) => f.slug === col.key);
  return field ? display(field, r.fields[col.key]) : t("noValue");
}
function selectedRecord() {
  const id = route.selectedId;
  if (!id) return null;
  const loaded = state.records.find(
    (r) => r.id === id && (route.view === "attention" || r.baseKey === route.view),
  );
  if (loaded) return loaded;
  return fetched.get(route.view + ":" + id) || null;
}
async function fetchSelected(view, id) {
  const key = view + ":" + id;
  if (fetched.has(key) || view === "attention") return;
  fetched.set(key, { pending: true });
  try {
    fetched.set(key, await getProvider().getRecord(view, id));
  } catch {
    fetched.set(key, { missing: true });
  }
  if (route.view === view && route.selectedId === id) render();
}

// ── Views ──────────────────────────────────────────────────────────────────
function table(rs, view) {
  const cols = columnsFor(view);
  const head = cols
    .map(
      (c) =>
        '<th class="' +
        (c.cls || "") +
        (c.key === "status" ? " ws-split-keep" : "") +
        '">' +
        esc(c.label) +
        "</th>",
    )
    .join("");
  const body = rs
    .map(
      (r) =>
        '<tr data-record="' +
        esc(r.id) +
        '" class="' +
        (r.id === route.selectedId ? "ws-selected" : "") +
        '">' +
        cols
          .map((c, i) => {
            const content = cell(r, c);
            const tip = i === 0 || c.key === "why" ? content : "";
            return (
              '<td class="' +
              (c.cls || "") +
              (c.key === "status" ? " ws-split-keep" : "") +
              '"' +
              (tip ? ' title="' + tip + '"' : "") +
              ">" +
              (i === 0
                ? '<a class="row-link" href="' +
                  esc(
                    DETAIL_MODES[view] === "page"
                      ? fullPageUrl(r)
                      : peekUrl(r.id, view),
                  ) +
                  '">' +
                  content +
                  "</a>"
                : content) +
              "</td>"
            );
          })
          .join("") +
        "</tr>",
    )
    .join("");
  return (
    '<table class="ws-table"><thead><tr>' +
    head +
    "</tr></thead><tbody>" +
    body +
    "</tbody></table>"
  );
}
function detailHtml(view) {
  const mode = route.presentation || DETAIL_MODES[view];
  if (!route.selectedId)
    return '<div class="ws-detail-empty">' + t("select") + "</div>";
  const r = selectedRecord();
  const bar = (record) =>
    '<div class="ws-detail-bar"><button class="button" type="button" data-close-detail>' +
    t("back") +
    "</button>" +
    (record && mode !== "page"
      ? '<a class="button" href="' +
        esc(fullPageUrl(record)) +
        '">' +
        t("openFull") +
        "</a>"
      : "") +
    "</div>";
  if (!r || r.pending || r.missing) {
    if (!r) fetchSelected(view, route.selectedId);
    return (
      bar(null) +
      '<p class="detail-state">' +
      t(r?.missing || isDemo() || view === "attention" ? "recordMissing" : "loadingRecord") +
      "</p>"
    );
  }
  const base = baseOf(r.baseKey),
    reason = attentionReason(r, state.reviewTime);
  return (
    bar(r) +
    '<h2 class="detail-title">' +
    esc(r.fields.title) +
    "</h2>" +
    badge(r.fields.status) +
    (reason
      ? '<div class="attention-note">' + esc(reasonText(r)) + "</div>"
      : "") +
    (reason !== "staleReason" && isStaleBalance(r, state.reviewTime)
      ? '<div class="attention-note">' + t("staleReason") + "</div>"
      : "") +
    '<dl class="detail-fields">' +
    (view === "attention"
      ? "<dt>" + t("register") + "</dt><dd>" + esc(name(base)) + "</dd>"
      : "") +
    base.fields
      // Title and status are already the heading and its badge.
      .filter((f) => f.slug !== "title" && f.slug !== "status")
      .map(
        (f) =>
          "<dt>" +
          esc(f.nameI18n?.[locale] || f.name) +
          "</dt><dd>" +
          display(f, r.fields[f.slug]) +
          "</dd>",
      )
      .join("") +
    "</dl>"
  );
}
function overview() {
  const att = rowsFor("attention");
  const stale = state.records.filter((r) =>
    isStaleBalance(r, state.reviewTime),
  ).length;
  const differences = state.records.filter(
    (r) =>
      r.baseKey === "checks" &&
      Number.isFinite(r.fields.balance) &&
      Number.isFinite(r.fields.bankBalance) &&
      r.fields.balance !== r.fields.bankBalance,
  ).length;
  const sums =
    Object.entries(
      moneyByCurrency(state.records.filter((r) => r.baseKey === "payments")),
    )
      .map(([c, a]) => c + " " + a.toLocaleString(locale))
      .join(" · ") || "—";
  // Every number covers loaded rows only; the tooltip says so.
  const metric = (label, value) =>
    '<div><span title="' +
    esc(label + " · " + t("scope")) +
    '">' +
    esc(label) +
    '</span><strong title="' +
    esc(value) +
    '">' +
    esc(value) +
    "</strong></div>";
  const registers = appConfig.bases
    .map((b) => {
      const flagged = att.filter((r) => r.baseKey === b.key).length;
      return (
        '<a class="overview-item" href="#/' +
        b.key +
        '"><strong>' +
        esc(name(b)) +
        "</strong><span>" +
        flagged +
        " " +
        t("attention") +
        "</span><em>" +
        t("go") +
        " →</em></a>"
      );
    })
    .join("");
  const queue = att.length
    ? att
        .slice(0, 6)
        .map(
          (r) =>
            '<a class="overview-item queue-item" href="' +
            esc(peekUrl(r.id, "attention")) +
            '"><strong title="' +
            esc(r.fields.title) +
            '">' +
            esc(r.fields.title) +
            '</strong><span title="' +
            esc(reasonText(r)) +
            '">' +
            esc(reasonText(r)) +
            "</span>" +
            badge(r.fields.status) +
            "</a>",
        )
        .join("")
    : '<p class="empty">' + t("noAttention") + "</p>";
  return (
    '<section class="ws-overview"><header class="page-hero"><div><h1>' +
    t("overview") +
    "</h1><p>" +
    t("lead") +
    " " +
    t("scope") +
    '</p></div><div class="page-actions"><a class="button primary" href="#/attention">' +
    icon("alert") +
    t("openQueue") +
    '</a></div></header><div class="ws-metrics">' +
    metric(t("stale"), String(stale)) +
    metric(t("differenceMetric"), String(differences)) +
    metric(t("paymentSubtotal"), sums) +
    '</div><div class="overview-grid"><section class="card flush"><div class="card-heading"><h2>' +
    t("registers") +
    "</h2></div>" +
    registers +
    '</section><section class="card flush"><div class="card-heading"><h2>' +
    t("attention") +
    "</h2></div>" +
    queue +
    "</section></div></section>"
  );
}
function recordView(view) {
  const base = baseOf(view),
    rs = rowsFor(view),
    more = base ? state.pageInfo[view]?.nextCursor : null,
    total = base ? state.totalCount[view] : null,
    anyMore = Object.values(state.pageInfo).some((p) => p?.nextCursor);
  const searching = Boolean(route.query || route.status);
  const count = searching
    ? rs.length + (more || (!base && anyMore) ? "+" : "")
    : base
      ? (total ?? rs.length + (more ? "+" : ""))
      : rs.length + (anyMore ? "+" : "");
  const statuses = [
    ...new Set(
      state.records
        .filter((r) => view === "attention" || r.baseKey === view)
        .map((r) => r.fields.status)
        .filter(Boolean),
    ),
  ];
  const failed = state.failures?.some((f) => f.key === view);
  return (
    '<section class="ws-view"><header class="ws-toolbar"><div class="ws-title"><h1 title="' +
    esc(view === "attention" ? t("attentionHelp") + " " + t("scope") : t("scope")) +
    '">' +
    esc(view === "attention" ? t("attention") : name(base)) +
    '</h1><span class="ws-count" title="' +
    esc(rs.length + " " + t("loaded")) +
    '">' +
    esc(count) +
    '</span></div><div class="ws-actions"><input id="search" class="search-field" type="search" autocomplete="off" placeholder="' +
    t("search") +
    '" aria-label="' +
    t("search") +
    '" value="' +
    esc(route.query) +
    '"><select id="status" aria-label="' +
    t("all") +
    '"><option value="">' +
    t("all") +
    "</option>" +
    statuses
      .map(
        (s) =>
          '<option value="' +
          esc(s) +
          '" ' +
          (route.status === s ? "selected" : "") +
          ">" +
          esc(t(s)) +
          "</option>",
      )
      .join("") +
    '</select></div></header><div class="ws-workspace"><div class="ws-list">' +
    (rs.length
      ? table(rs, view)
      : '<p class="empty">' + t(failed ? "error" : "empty") + "</p>") +
    (more
      ? '<div class="list-more"><button id="next" class="button" type="button" ' +
        (loading ? "disabled" : "") +
        ">" +
        t("next") +
        "</button></div>"
      : "") +
    '</div><aside class="ws-detail" aria-live="polite">' +
    detailHtml(view) +
    "</aside></div></section>"
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────
function render() {
  if (!state) return;
  document.documentElement.lang = locale;
  document.title = appConfig.appTitle[locale];
  const { view, selectedId, presentation } = route;
  const onRecordView = view !== "overview";
  const body = document.body.classList;
  body.add("ws-has-mobile-bar");
  body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
  body.toggle(
    "ws-detail-page",
    onRecordView && presentation === "page" && Boolean(selectedId),
  );
  body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
  body.toggle(
    "ws-layout-split",
    onRecordView && DETAIL_MODES[view] === "split" && presentation !== "page",
  );
  body.toggle(
    "ws-searching",
    onRecordView && Boolean(route.query || route.status),
  );
  // Keep the list's scroll position when re-rendering the same view (picking
  // another row in a drawer or split must not jump the list to the top).
  const list = root.querySelector(".ws-list");
  const keepScroll =
    list && root.dataset.view === view ? list.scrollTop : 0;
  const att = state.records.filter((r) =>
    attentionReason(r, state.reviewTime),
  );
  const anyMore = Object.values(state.pageInfo).some((p) => p?.nextCursor);
  const title =
    view === "overview"
      ? t("overview")
      : view === "attention"
        ? t("attention")
        : name(baseOf(view));
  root.dataset.view = view;
  root.innerHTML =
    '<div class="shell ' +
    (navOpen ? "nav-open" : "") +
    '"><button class="scrim" aria-label="' +
    t("closeMenu") +
    '" id="scrim"></button><aside class="sidebar"><div><div class="brand">' +
    esc(appConfig.appTitle[locale]) +
    '</div><div class="subtle">' +
    t("readOnly") +
    '</div></div><nav class="nav">' +
    [
      ["overview", t("overview"), "grid", null],
      ["attention", t("attention"), "alert", att.length + (anyMore ? "+" : "")],
      ...appConfig.bases.map((b) => [
        b.key,
        name(b),
        "list",
        state.totalCount[b.key] ??
          state.records.filter((r) => r.baseKey === b.key).length +
            (state.pageInfo[b.key]?.nextCursor ? "+" : ""),
      ]),
    ]
      .map(
        ([k, label, ic, n]) =>
          '<a class="' +
          (view === k ? "active" : "") +
          '" href="#/' +
          k +
          '">' +
          icon(ic) +
          '<span class="nav-label">' +
          esc(label) +
          "</span>" +
          (n != null
            ? '<small class="' +
              (k === "attention" && att.length ? "nav-attention" : "") +
              '">' +
              esc(n) +
              "</small>"
            : "") +
          "</a>",
      )
      .join("") +
    '</nav><div class="sidebar-bottom"><div><div class="subtle">' +
    t("asof") +
    "</div><strong>" +
    new Date(state.reviewTime).toISOString().slice(0, 10) +
    '</strong></div><div class="tools"><select id="locale" aria-label="' +
    t("language") +
    '"><option value="en" ' +
    (locale === "en" ? "selected" : "") +
    '>EN</option><option value="zh-CN" ' +
    (locale === "zh-CN" ? "selected" : "") +
    '>中文</option></select><button id="help" class="icon-button" type="button" title="' +
    t("help") +
    '" aria-label="' +
    t("help") +
    '">' +
    icon("help") +
    '</button><button id="settings" class="icon-button" type="button" title="' +
    t("settings") +
    '" aria-label="' +
    t("settings") +
    '">' +
    icon("settings") +
    '</button><button class="icon-button" type="button" data-refresh title="' +
    t("refresh") +
    '" aria-label="' +
    t("refresh") +
    '">' +
    icon("refresh") +
    '</button></div></div></aside><main class="main"><header class="mobile-bar"><button class="icon-button" type="button" id="menu" aria-label="' +
    t("openMenu") +
    '">' +
    icon("menu") +
    "</button><strong>" +
    esc(title) +
    '</strong><button class="icon-button" type="button" data-refresh aria-label="' +
    t("refresh") +
    '">' +
    icon("refresh") +
    "</button></header>" +
    (state.failures?.length
      ? '<div class="warning-banner">' +
        t("partialFailure") +
        ": " +
        state.failures
          .map((f) => esc(name(baseOf(f.key))) + " (" + esc(f.code) + ")")
          .join(" · ") +
        "</div>"
      : "") +
    (view === "overview" ? overview() : recordView(view)) +
    "</main></div>";
  if (keepScroll) root.querySelector(".ws-list").scrollTop = keepScroll;
}

// ── Events (delegated once; the shell re-renders as innerHTML) ─────────────
root.addEventListener("click", (event) => {
  const target = event.target;
  if (target.closest("[data-refresh]")) return load();
  if (target.closest("#menu")) {
    navOpen = true;
    return render();
  }
  if (target.closest("#scrim")) {
    navOpen = false;
    return render();
  }
  if (target.closest("[data-close-detail]")) return closeDetail();
  if (target.closest("#next")) return next();
  for (const kind of ["help", "settings"]) {
    const trigger = target.closest("#" + kind);
    if (trigger)
      return openDeskDialog(kind, {
        locale,
        appId: appConfig.appId,
        state,
        trigger,
      });
  }
  const row = target.closest("tr[data-record]");
  if (!row || (target.closest("a") && event.metaKey)) return;
  event.preventDefault();
  const url =
    DETAIL_MODES[route.view] === "page"
      ? "#/" + route.view + "/" + encodeURIComponent(row.dataset.record)
      : peekUrl(row.dataset.record);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (route.peek) replaceRoute(url);
  else location.hash = url;
});
root.addEventListener("change", (event) => {
  if (event.target.id === "locale") {
    locale = event.target.value;
    const url = new URL(location.href);
    url.searchParams.set("lang", locale);
    history.replaceState(history.state, "", url);
    render();
  }
  if (event.target.id === "status")
    replaceRoute(
      "#/" +
        route.view +
        routeQuery({ peek: route.peek }, { ...route, status: event.target.value }),
    );
});
root.addEventListener("input", (event) => {
  if (event.target.id !== "search") return;
  const pos = event.target.selectionStart;
  replaceRoute(
    "#/" +
      route.view +
      routeQuery({ peek: route.peek }, { ...route, query: event.target.value }),
  );
  const el = document.querySelector("#search");
  el.focus();
  el.setSelectionRange(pos, pos);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
  if (event.target.closest?.("input, select")) {
    event.target.blur();
    return;
  }
  if (navOpen) {
    navOpen = false;
    render();
    return;
  }
  if (route.peek) closeDetail();
});
window.addEventListener("hashchange", setRoute);

// ── Loading ────────────────────────────────────────────────────────────────
async function next() {
  if (loading) return;
  const key = route.view,
    token = seq,
    cursor = state.pageInfo[key]?.nextCursor;
  if (!cursor) return;
  loading = true;
  render();
  try {
    const page = await getProvider().loadMore(key, cursor);
    if (token !== seq) return;
    state.records = appendPage(state.records, page.records);
    state.loadedAt = Date.now();
    state.pageInfo[key] = { nextCursor: page.nextCursor };
  } catch {
    alert(t("error"));
  } finally {
    loading = false;
    render();
  }
}
async function load() {
  const token = ++seq;
  loading = true;
  fetched.clear();
  root.innerHTML =
    '<div class="gate"><h1>' +
    esc(appConfig.appTitle[locale]) +
    "</h1><p>" +
    t("loading") +
    "</p></div>";
  try {
    const result = await getProvider().getState();
    if (token !== seq) return;
    state = { ...result, loadedAt: Date.now() };
    loading = false;
    render();
  } catch (error) {
    if (token !== seq) return;
    const code = String(
      error.code || error.message || "BRIDGE_UNAVAILABLE",
    ).split(":")[0];
    root.innerHTML =
      '<div class="gate"><h1>' +
      t("error") +
      "</h1><p>" +
      esc(code) +
      '</p><button class="button" id="retry" type="button">' +
      t("retry") +
      "</button></div>";
    document.querySelector("#retry").onclick = load;
  } finally {
    loading = false;
  }
}
previousRouteWasList = RECORD_VIEWS.includes(route.view) && !route.selectedId;
const runtime = await getRuntime();
if (!isDemo() && runtime.runtime === "unknown") {
  root.innerHTML = '<div class="gate">' + t("unknown") + "</div>";
} else {
  const gate = createAirAppConnectGate({
    appName: appConfig.appTitle[locale],
    demoHref: "?demo=1#/overview",
    shouldGate: () => !isDemo() && !runtime.hosted,
  });
  if (await gate.pass({ onReady: load })) await load();
}
