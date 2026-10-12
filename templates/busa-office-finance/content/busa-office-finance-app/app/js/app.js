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
  X,
} from "../vendor/lucide.js";
const root = document.querySelector("#app");
let locale =
    new URLSearchParams(location.search).get("lang") === "zh-CN"
      ? "zh-CN"
      : "en",
  state = null,
  navOpen = false,
  loading = false,
  loadMoreFailed = false,
  seq = 0,
  // The parsed hash: the view, the record it names, and the list context
  // (search + status) that Back and shared links restore.
  view = { key: "overview", recordId: null, presentation: null, q: "", status: "" };
const t = (k) => messages[locale][k] || k;
const name = (b) => b.nameI18n?.[locale] || b.name;
// Seeded copy is bilingual "English / 中文"; show the reader's half.
const half = (text) => {
  const parts = String(text || "").split(" / ");
  return parts.length === 2 ? parts[locale === "zh-CN" ? 1 : 0] : text || "";
};
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
  close: X,
};
const icon = (k) =>
  createElement(icons[k], { "aria-hidden": "true" }).outerHTML;
const baseOf = (key) => appConfig.bases.find((b) => b.key === key);
const isView = (key) => key === "attention" || Boolean(baseOf(key));
// How a row opens. Bases declare theirs in `ui.detail_modes`; the cross-register
// attention queue is not a Base, so its mode is the app's own.
const detailMode = (key = view.key) =>
  key === "attention"
    ? appConfig.ui.attention_detail_mode
    : appConfig.ui.detail_modes[key] || "drawer";
const MONEY = ["amount", "balance", "bankBalance", "revenue", "cost"];

// ── Routing: #/<view>[/<record>][?q=&status=&peek=] ──────────────────────
// A `/record` path is always the full page; `?peek=` is the drawer or split
// selection, so both are refreshable and shareable.
function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [rawKey, rawId] = path.split("/");
  const params = new URLSearchParams(query);
  let key = "overview",
    id = null;
  try {
    key = decodeURIComponent(rawKey || "overview");
    id = rawId ? decodeURIComponent(rawId) : null;
  } catch {
    key = "overview";
  }
  if (!isView(key)) return { key: "overview", recordId: null, presentation: null, q: "", status: "" };
  const peek = detailMode(key) === "page" ? null : params.get("peek");
  return {
    key,
    recordId: id || peek || null,
    presentation: id ? "page" : detailMode(key) === "page" ? null : detailMode(key),
    q: params.get("q") || "",
    status: params.get("status") || "",
  };
}
const listQuery = (extra = {}) => {
  const params = new URLSearchParams();
  if (view.q) params.set("q", view.q);
  if (view.status) params.set("status", view.status);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const text = params.toString();
  return text ? "?" + text : "";
};
const listUrl = () => "#/" + view.key + listQuery();
const pageUrl = (id) => "#/" + view.key + "/" + encodeURIComponent(id) + listQuery();
const recordUrl = (id) =>
  detailMode() === "page" ? pageUrl(id) : "#/" + view.key + listQuery({ peek: id });

function badge(s) {
  const cls = ["blocked", "exception", "restricted"].includes(s)
    ? "danger"
    : ["paid", "accepted", "filed", "issued", "matched", "reconciled"].includes(
          s,
        )
      ? "positive"
      : ["pending", "review", "approved", "preparing", "unmatched"].includes(s)
        ? "warning"
        : "";
  return s
    ? '<span class="badge ' + cls + '">' + esc(t(s)) + "</span>"
    : esc(t("noValue"));
}
function display(field, value) {
  if (value == null || value === "") return t("noValue");
  if (field.type === "relation")
    return esc(resolveRelation(value, state.records) || t("notLoaded"));
  if (field.slug === "status" || field.slug === "direction")
    return esc(t(value));
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
function rowsFor(key) {
  let rs = state.records.filter((r) =>
    key === "attention"
      ? attentionReason(r, state.reviewTime)
      : r.baseKey === key,
  );
  const q = view.q.trim().toLowerCase();
  if (q)
    rs = rs.filter((r) => {
      const fields = baseOf(r.baseKey).fields;
      return Object.entries(r.fields).some(([k, v]) => {
        const field = fields.find((f) => f.slug === k);
        if (field?.type === "relation") return false;
        const shown = k === "status" || k === "direction" ? t(v) : "";
        return (String(v ?? "") + " " + shown).toLowerCase().includes(q);
      });
    });
  if (view.status) rs = rs.filter((r) => r.fields.status === view.status);
  return rs;
}
// One line per row: the name, then status (the column a phone and the split
// queue keep), then the register's own facts. Currency rides on the amount.
function columnsFor(key) {
  if (key === "attention") return ["title", "status", "register", "owner", "due"];
  const rest = baseOf(key).columns.filter(
    (c) => !["title", "status", "currency"].includes(c),
  );
  return ["title", "status", ...rest].slice(0, 5);
}
function heading(key, column) {
  if (column === "register") return t("register");
  const field = (key === "attention" ? appConfig.bases[0] : baseOf(key)).fields.find(
    (f) => f.slug === column,
  );
  return field ? field.nameI18n?.[locale] || field.name : column;
}
function cell(r, column) {
  if (column === "title")
    return (
      '<a class="row-link" href="' +
      esc(recordUrl(r.id)) +
      '" data-record="' +
      esc(r.id) +
      '">' +
      esc(r.fields.title) +
      "</a>"
    );
  if (column === "status") return badge(r.fields.status);
  if (column === "register") return esc(name(baseOf(r.baseKey)));
  if (MONEY.includes(column)) return money(r, column);
  const field = baseOf(r.baseKey).fields.find((f) => f.slug === column) || {
    slug: column,
    type: "text",
  };
  return display(field, r.fields[column]);
}
function table(rs, key) {
  const columns = columnsFor(key);
  return (
    '<table class="ws-table"><thead><tr>' +
    columns
      .map(
        (c) =>
          '<th class="' +
          (MONEY.includes(c) ? "ws-col-num" : "") +
          '">' +
          esc(heading(key, c)) +
          "</th>",
      )
      .join("") +
    "</tr></thead><tbody>" +
    rs
      .map(
        (r) =>
          '<tr class="' +
          (r.id === view.recordId ? "ws-selected" : "") +
          '" data-record="' +
          esc(r.id) +
          '">' +
          columns
            .map(
              (c) =>
                '<td class="' +
                (MONEY.includes(c) ? "ws-col-num" : "") +
                '">' +
                cell(r, c) +
                "</td>",
            )
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}
function detail(rs) {
  const r = state.records.find((x) => x.id === view.recordId);
  const page = view.presentation === "page";
  const queueIndex = rs.findIndex((x) => x.id === view.recordId);
  const nextRecord =
    detailMode() === "split" && !page && queueIndex >= 0 ? rs[queueIndex + 1] : null;
  const bar =
    '<header class="ws-detail-bar"><button class="detail-back" id="detailBack" type="button">' +
    "<span>← " +
    t("back") +
    '</span></button><div class="detail-bar-actions">' +
    (nextRecord
      ? '<a class="button" href="' +
        esc(recordUrl(nextRecord.id)) +
        '">' +
        t("nextInQueue") +
        " →</a>"
      : "") +
    (r && !page
      ? '<a class="button detail-expand" href="' +
        esc(pageUrl(r.id)) +
        '"><span>' +
        t("openFull") +
        "</span></a>"
      : "") +
    (!page
      ? '<button class="icon-button detail-close" id="detailClose" type="button" title="' +
        t("close") +
        '" aria-label="' +
        t("close") +
        '">' +
        icon("close") +
        "</button>"
      : "") +
    "</div></header>";
  if (!view.recordId)
    return (
      bar.replace('id="detailBack"', 'id="detailBack" hidden') +
      '<div class="ws-detail-empty">' +
      t("select") +
      "</div>"
    );
  if (!r)
    return (
      bar +
      '<div class="empty"><h2>' +
      t("none") +
      "</h2><p>" +
      t("recordNotLoaded") +
      "</p></div>"
    );
  const base = baseOf(r.baseKey),
    reason = attentionReason(r, state.reviewTime);
  return (
    bar +
    '<article class="detail-body">' +
    // The cross-register queue is the one place the register is not implied.
    (view.key === "attention"
      ? '<div class="subtle">' + esc(name(base)) + "</div>"
      : "") +
    "<h2>" +
    esc(r.fields.title) +
    "</h2>" +
    badge(r.fields.status) +
    (reason
      ? '<div class="attention-note">' +
        esc(reason === "reason" ? r.fields.reason : t(reason)) +
        "</div>"
      : "") +
    (reason !== "staleReason" && isStaleBalance(r, state.reviewTime)
      ? '<div class="attention-note">' + t("staleReason") + "</div>"
      : "") +
    "<dl>" +
    base.fields
      .filter((f) => !["title", "status"].includes(f.slug))
      .map(
        (f) =>
          "<dt>" +
          esc(f.nameI18n?.[locale] || f.name) +
          "</dt><dd>" +
          display(f, r.fields[f.slug]) +
          "</dd>",
      )
      .join("") +
    "</dl></article>"
  );
}
function failureBanner() {
  return state.failures?.length
    ? '<div class="warning-banner">' +
        t("partialFailure") +
        ": " +
        state.failures
          .map((f) => esc(name(baseOf(f.key))) + " (" + esc(f.code) + ")")
          .join(" · ") +
        "</div>"
    : "";
}
const menuButton = () =>
  '<button class="icon-button menu" id="menu" type="button" aria-label="' +
  t("openMenu") +
  '" title="' +
  t("openMenu") +
  '">' +
  icon("menu") +
  "</button>";
const refreshButton = () =>
  '<button id="refresh" class="icon-button" type="button" title="' +
  t("refresh") +
  '" aria-label="' +
  t("refresh") +
  '">' +
  icon("refresh") +
  "</button>";
function overview() {
  const att = state.records.filter((r) => attentionReason(r, state.reviewTime));
  const cashier = appConfig.appId.endsWith("cashier");
  const sums =
    Object.entries(
      moneyByCurrency(
        state.records.filter(
          (r) =>
            r.baseKey ===
            (appConfig.appId.endsWith("finance") ? "expenses" : "payments"),
        ),
      ),
    )
      .map(([currency, amount]) => currency + " " + amount.toLocaleString(locale))
      .join(" · ") || "—";
  // Three numbers the nav cannot show: each takes a computation over records.
  const metrics = [
    [t("watch"), att.length],
    [
      t(cashier ? "stale" : "paidMetric"),
      state.records.filter((r) =>
        cashier
          ? isStaleBalance(r, state.reviewTime)
          : r.baseKey === "expenses" && r.fields.status === "paid",
      ).length,
    ],
    [t(appConfig.appId.endsWith("finance") ? "expenseSubtotal" : "paymentSubtotal"), sums],
  ];
  return (
    '<section class="ws-overview">' +
    '<header class="page-hero"><div class="hero-title">' +
    menuButton() +
    "<div><h1>" +
    esc(appConfig.appTitle[locale]) +
    "</h1><p>" +
    esc(half(appConfig.folder.description)) +
    '</p></div></div><div class="page-actions">' +
    refreshButton() +
    "</div></header>" +
    failureBanner() +
    '<section class="ws-metrics" aria-label="' +
    t("overview") +
    '">' +
    metrics
      .map(
        ([label, value]) =>
          '<div class="metric"><span>' +
          esc(label) +
          "</span><strong>" +
          esc(value) +
          "</strong></div>",
      )
      .join("") +
    "</section>" +
    '<div class="overview-grid"><section class="card flush"><div class="card-heading"><h2>' +
    t("registers") +
    '</h2></div><div class="overview-list">' +
    appConfig.bases
      .map((b) => {
        const count = state.records.filter(
          (r) => r.baseKey === b.key && attentionReason(r, state.reviewTime),
        ).length;
        return (
          '<a class="overview-item" href="#/' +
          b.key +
          '"><div><strong>' +
          esc(name(b)) +
          "</strong><p>" +
          (count ? count + " " + t("needsAttention") : t("allClear")) +
          "</p></div><span>" +
          t("go") +
          " →</span></a>"
        );
      })
      .join("") +
    '</div></section><section class="card flush"><div class="card-heading"><h2>' +
    t("attention") +
    '</h2><a class="card-link" href="#/attention">' +
    t("openQueue") +
    ' →</a></div><div class="overview-list">' +
    (att.length
      ? att
          .slice(0, 5)
          .map((r) => {
            const reason = attentionReason(r, state.reviewTime);
            return (
              '<a class="overview-item" href="#/attention?peek=' +
              encodeURIComponent(r.id) +
              '"><div><strong>' +
              esc(r.fields.title) +
              "</strong><p>" +
              esc(r.fields.owner) +
              " · " +
              esc(reason === "reason" ? r.fields.reason : t(reason)) +
              "</p></div>" +
              badge(r.fields.status) +
              "</a>"
            );
          })
          .join("")
      : '<div class="empty">' + t("allClear") + "</div>") +
    '</div></section></div><p class="footnote">' +
    t("scope") +
    "</p></section>"
  );
}
function recordView() {
  const key = view.key,
    base = baseOf(key),
    rs = rowsFor(key),
    nextCursor = base ? state.pageInfo[key]?.nextCursor : null,
    loadedHere = base ? state.records.filter((r) => r.baseKey === key).length : 0;
  const statuses = [
    ...new Set(
      state.records
        .filter((r) =>
          key === "attention"
            ? attentionReason(r, state.reviewTime)
            : r.baseKey === key,
        )
        .map((r) => r.fields.status)
        .filter(Boolean),
    ),
  ];
  return (
    '<section class="ws-view">' +
    '<header class="ws-toolbar"><div class="ws-title">' +
    menuButton() +
    '<h1 title="' +
    esc(key === "attention" ? t("attentionHelp") : half(base.description)) +
    '">' +
    esc(key === "attention" ? t("attention") : name(base)) +
    '</h1><span class="ws-count">' +
    rs.length +
    '</span></div><div class="ws-actions"><input id="search" type="search" autocomplete="off" placeholder="' +
    t("search") +
    '" aria-label="' +
    t("search") +
    '" title="' +
    t("scope") +
    '" value="' +
    esc(view.q) +
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
          (view.status === s ? "selected" : "") +
          ">" +
          esc(t(s)) +
          "</option>",
      )
      .join("") +
    "</select>" +
    refreshButton() +
    "</div></header>" +
    failureBanner() +
    '<div class="ws-workspace"><div class="ws-list" id="list">' +
    (rs.length
      ? table(rs, key)
      : '<div class="empty">' +
        t(state.failures?.some((f) => f.key === key) ? "error" : "empty") +
        "</div>") +
    (nextCursor
      ? '<div class="list-foot"><span>' +
        loadedHere +
        " " +
        t("loaded") +
        (state.totalCount[key] != null
          ? " / " + state.totalCount[key] + " " + t("records")
          : "") +
        (loadMoreFailed ? " · " + t("loadMoreError") : "") +
        '</span><button class="button" id="next" type="button" ' +
        (loading ? "disabled" : "") +
        ">" +
        t("next") +
        "</button></div>"
      : "") +
    '</div><aside class="ws-detail" id="detail" aria-label="' +
    t("detail") +
    '">' +
    detail(rs) +
    "</aside></div></section>"
  );
}
function navCount(k) {
  if (!baseOf(k)) return "";
  const total = state.totalCount[k];
  const loadedHere = state.records.filter((r) => r.baseKey === k).length;
  return (
    "<small>" +
    esc(total ?? loadedHere + (state.pageInfo[k]?.nextCursor ? "+" : "")) +
    "</small>"
  );
}
function render() {
  if (!state) return;
  const onView = view.key !== "overview";
  const body = document.body.classList;
  body.toggle("ws-detail-open", onView && Boolean(view.recordId));
  body.toggle("ws-detail-page", onView && view.presentation === "page");
  body.toggle("ws-detail-drawer", onView && view.presentation === "drawer");
  body.toggle(
    "ws-layout-split",
    onView && detailMode() === "split" && view.presentation !== "page",
  );
  body.toggle("ws-searching", onView && Boolean(view.q || view.status));
  document.documentElement.lang = locale;
  document.title = appConfig.appTitle[locale];
  // Re-rendering replaces the table; keep the list where the reader left it.
  const scroll = document.querySelector("#list")?.scrollTop || 0;
  const searchFocus =
    document.activeElement?.id === "search"
      ? document.activeElement.selectionStart
      : null;
  root.innerHTML =
    '<div class="shell ' +
    (navOpen ? "nav-open" : "") +
    '"><button class="scrim" type="button" aria-label="' +
    t("closeMenu") +
    '" id="scrim"></button><aside class="sidebar"><div><div class="brand">' +
    esc(appConfig.appTitle[locale]) +
    '</div><div class="subtle">' +
    t("readOnly") +
    '</div></div><nav class="nav">' +
    [
      ["overview", t("overview"), "grid"],
      ["attention", t("attention"), "alert"],
      ...appConfig.bases.map((b) => [b.key, name(b), "list"]),
    ]
      .map(
        ([k, label, ic]) =>
          '<a class="' +
          (view.key === k ? "active" : "") +
          '" href="#/' +
          k +
          '">' +
          icon(ic) +
          "<span>" +
          esc(label) +
          "</span>" +
          navCount(k) +
          "</a>",
      )
      .join("") +
    '</nav><div class="sidebar-bottom"><div><div class="subtle">' +
    t("asof") +
    "</div><strong>" +
    new Date(state.reviewTime).toISOString().slice(0, 10) +
    '</strong></div><div class="sidebar-tools"><select id="locale" aria-label="' +
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
    '</button></div></div></aside><main class="main">' +
    (onView ? recordView() : overview()) +
    "</main></div>";
  const list = document.querySelector("#list");
  if (list) list.scrollTop = scroll;
  if (searchFocus != null) {
    const el = document.querySelector("#search");
    el.focus();
    el.setSelectionRange(searchFocus, searchFocus);
  }
  bind();
}
// Search and the status filter rewrite the URL in place, so Back and a shared
// link return to the same narrowed list without adding history entries.
function setListContext(patch) {
  const mode = detailMode();
  view = {
    ...view,
    ...patch,
    recordId: null,
    presentation: mode === "page" ? null : mode,
  };
  history.replaceState(null, "", listUrl());
  render();
}
function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}
function bind() {
  document.querySelector("#locale").onchange = (e) => {
    locale = e.target.value;
    const url = new URL(location.href);
    url.searchParams.set("lang", locale);
    history.replaceState(history.state, "", url);
    render();
  };
  document.querySelector("#refresh").onclick = load;
  for (const kind of ["help", "settings"])
    document.querySelector("#" + kind).onclick = (event) =>
      openDeskDialog(kind, {
        locale,
        appId: appConfig.appId,
        state,
        trigger: event.currentTarget,
      });
  document.querySelector("#menu").onclick = () => {
    navOpen = true;
    render();
  };
  document.querySelector("#scrim").onclick = () => {
    navOpen = false;
    render();
  };
  // The whole row opens the record; the title is a real link for keyboard,
  // middle-click and copy-link.
  for (const row of document.querySelectorAll("tr[data-record]")) {
    row.onclick = (event) => {
      if (event.target.closest("a")) return;
      location.hash = recordUrl(row.dataset.record);
    };
  }
  document.querySelector("#detailBack")?.addEventListener("click", closeDetail);
  document.querySelector("#detailClose")?.addEventListener("click", closeDetail);
  document.querySelector("#status")?.addEventListener("change", (e) =>
    setListContext({ status: e.target.value }),
  );
  document.querySelector("#search")?.addEventListener("input", (e) =>
    setListContext({ q: e.target.value }),
  );
  document.querySelector("#next")?.addEventListener("click", next);
}
async function next() {
  if (loading) return;
  const key = view.key,
    token = seq,
    cursor = state.pageInfo[key]?.nextCursor;
  if (!cursor) return;
  loading = true;
  loadMoreFailed = false;
  render();
  try {
    const page = await getProvider().loadMore(key, cursor);
    if (token !== seq) return;
    state.records = appendPage(state.records, page.records);
    state.loadedAt = Date.now();
    state.pageInfo[key] = { nextCursor: page.nextCursor };
  } catch {
    loadMoreFailed = true;
  } finally {
    loading = false;
    render();
  }
}
async function load() {
  const token = ++seq;
  loading = true;
  loadMoreFailed = false;
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
    // Clear the flag before drawing: rendering while it is still set left
    // "Load more" disabled after every cold load.
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
      '</p><button class="retry" id="retry">' +
      t("retry") +
      "</button></div>";
    document.querySelector("#retry").onclick = load;
  } finally {
    loading = false;
  }
}
function syncRoute() {
  const wasList = view.key !== "overview" && !view.recordId;
  const previousKey = view.key;
  view = parseHash();
  // A record opened from its list can step Back to that list entry instead of
  // pushing a new one the browser's Back would then have to undo.
  if (view.recordId && wasList && previousKey === view.key)
    history.replaceState({ fromList: true }, "");
  navOpen = false;
  loadMoreFailed = false;
  render();
}
window.addEventListener("hashchange", syncRoute);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
  if (navOpen) {
    navOpen = false;
    render();
  } else if (view.recordId && view.presentation !== "page") closeDetail();
});
view = parseHash();
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
