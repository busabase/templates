import { appConfig as C } from "./config.js";
import {
  createElement,
  Menu,
  X,
  RotateCw,
  CircleHelp,
} from "../vendor/icons.js";
import { copy } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { detectAirAppRuntime } from "../vendor/busabase-airapp.js";
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import {
  attentionReason,
  isActive,
  caseTimeline,
  verifiedAmounts,
  mergePage,
  metricQueries,
} from "./model.js";

// Where a record opens, per view. Chosen by what people do with the record:
//   cases → page: a case is a workplace of its own — it gathers its deadlines,
//     costs, timeline and verified amounts, and counsel stays on it for minutes.
//   deadlines, settlements, updates → drawer: facts people scan many of, read
//     one or two fields of, and return to the list (or jump to the case).
//   tasks → split: legal follow-up is a queue worked top to bottom.
//   attention (cross-ledger "Needs attention") → split: literally a queue.
// A `/<record>` path always opens the full page; `?peek=` drives drawer/split.
// On a phone every mode is a page (base-ui.css handles that).
// Base modes are declared once, in config.js `ui.detail_modes`.
const DETAIL_MODES = { ...C.ui.detail_modes, attention: "split" };
const VIEWS = ["overview", ...C.bases.map((b) => b.key), "attention"];
// Columns per view: the first names the record, then a chosen set — long
// notes stay in the detail. Split queues show only the first two columns.
const COLUMNS = {
  cases: ["name", "status", "code", "counterparty", "owner", "due", "next"],
  deadlines: ["name", "status", "case", "owner", "due", "source"],
  settlements: ["name", "status", "case", "kind", "amount", "currency", "due"],
  updates: ["name", "status", "case", "owner", "due", "source"],
  tasks: ["name", "status", "case", "owner", "due", "next"],
};

const $ = (id) => document.getElementById(id),
  e = (x) =>
    String(x ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
const params = new URLSearchParams(location.search);
const state = {
  lang: params.get("lang") === "zh-CN" ? "zh-CN" : "en",
  route: null,
  data: null,
  provider: null,
  runtime: null,
  busy: false,
  morePending: false,
  generation: 0,
  // Records named by the URL but not on the loaded page, read with records.get.
  fetched: new Map(),
  fetching: new Set(),
};
const T = () => copy[state.lang],
  zh = () => state.lang === "zh-CN",
  label = (b) => (zh() ? b.labelZh : b.name),
  today = () => new Date().toLocaleDateString("en-CA"),
  base = (k) => C.bases.find((b) => b.key === k),
  all = () => state.data?.records || [],
  isMobile = () => window.matchMedia("(max-width: 720px)").matches,
  text = (x) => {
    if (x === null || x === undefined || x === "") return T().unknown;
    const s = String(x);
    return /^(rec|bse|bsf|nod|cmt|crq)[a-z0-9]{15,}$/.test(s) ? T().unknown : s;
  };
const labels = {
  open: ["Open", "进行中"],
  paused: ["Paused", "已暂停"],
  on_hold: ["On hold", "暂缓"],
  needs_review: ["Needs review", "待复核"],
  blocked: ["Blocked", "受阻"],
  accepted: ["Accepted", "已接受"],
  completed: ["Completed", "已完成"],
  rejected: ["Rejected", "未通过"],
  withdrawn: ["Withdrawn", "已退出"],
  approved: ["Approved", "已批准"],
  sent: ["Sent", "已发送"],
  declined: ["Declined", "已拒绝"],
  feedback_missing: ["Feedback missing", "缺少反馈"],
  scheduled: ["Scheduled", "已安排"],
  litigation: ["Litigation", "诉讼中"],
  settlement: ["Settlement", "和解中"],
  investigation: ["Investigation", "调查中"],
  closed: ["Closed", "已结案"],
  overdue: ["Overdue", "已逾期"],
  unverified: ["Unverified", "待核验"],
  verified: ["Verified", "已核验"],
  recorded: ["Recorded", "已记录"],
  recovery: ["Recovery", "回款"],
  cost: ["Cost", "成本"],
};
const statusText = (x) => labels[x]?.[zh() ? 1 : 0] || text(x);
const reason = (r) => attentionReason(r, today());
const navLabel = (k) =>
  k === "overview" ? T().overview : k === "attention" ? T().attention : label(base(k));
const fieldLabel = (b, slug) => {
  const f = b.fields.find((x) => x.slug === slug);
  return f ? (zh() ? f.labelZh : f.name) : slug;
};
const badge = (r) => {
  const tone = reason(r) ? "warning" : isActive(r) ? "active" : "positive";
  return '<span class="badge ' + tone + '">' + e(statusText(r.fields.status)) + "</span>";
};
const amountText = (v) =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString(state.lang) : "-";
const caseByCode = (code) =>
  typeof code === "string" && code.trim()
    ? all().find((x) => x.baseKey === "cases" && x.fields.code === code)
    : null;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, filter and the peeked
// record live in the URL so refresh, shared links and Back restore the same
// list context. The pre-migration `#/cases` form is the same list URL.
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  const view = VIEWS.includes(parts[0]) ? parts[0] : "overview";
  let id = "";
  try {
    id = view !== "overview" && parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  const peek = mode && !id ? q.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: id || peek,
    presentation: id ? "page" : mode || null,
    query: q.get("q") || "",
    status: q.get("status") || "",
  };
}
const routeQuery = (route, extra = {}) => {
  const q = new URLSearchParams();
  if (route.query) q.set("q", route.query);
  if (route.status) q.set("status", route.status);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? "?" + s : "";
};
const listUrl = (route = state.route) => "#/" + route.view + routeQuery(route);
const pageUrl = (view, id, route) =>
  "#/" + view + "/" + encodeURIComponent(id) + (route ? routeQuery(route) : "");
const recordUrl = (view, id, route) =>
  DETAIL_MODES[view] === "page"
    ? pageUrl(view, id, route)
    : "#/" + view + (route ? routeQuery(route, { peek: id }) : "?peek=" + encodeURIComponent(id));

let previousRouteWasList = false;
function setRoute() {
  const previous = state.route;
  state.route = parseRoute();
  // A detail opened from its own list is marked, so Back/Close/Escape step
  // back to that exact list entry instead of pushing a new one.
  if (state.route.selectedId && previousRouteWasList && previous?.view === state.route.view)
    history.replaceState({ fromList: true }, "");
  previousRouteWasList = state.route.view !== "overview" && !state.route.selectedId;
  $("search").value = state.route.query;
  sidebar(false);
  draw();
}
// Search keystrokes and filter changes replace the entry instead of each
// becoming a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  const wasList = previousRouteWasList;
  state.route = parseRoute();
  previousRouteWasList = wasList;
  draw();
}
function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Data views ─────────────────────────────────────────────────────────────
const narrowed = () => Boolean(state.route.query || state.route.status);
function viewRows() {
  const view = state.route.view;
  return view === "attention"
    ? all().filter(reason)
    : all().filter((r) => r.baseKey === view);
}
function rows() {
  const query = state.route.query.toLowerCase();
  return viewRows().filter((r) => {
    if (state.route.status && r.fields.status !== state.route.status) return false;
    if (!query) return true;
    return [...Object.values(r.fields), statusText(r.fields.status)].some((v) =>
      String(v ?? "").toLowerCase().includes(query),
    );
  });
}
const columnClass = (slug) =>
  slug === "status"
    ? "col-status"
    : slug === "reason"
      ? "col-reason"
    : slug === "due"
      ? "col-date"
      : slug === "code" || slug === "case"
        ? "col-code"
        : slug === "amount"
          ? "ws-col-num"
          : slug === "currency"
            ? "ws-col-narrow"
            : slug === "next" || slug === "counterparty"
              ? "ws-col-wide"
              : "";
function cell(r, slug) {
  const f = r.fields;
  if (slug === "status") return badge(r);
  if (slug === "kind") return e(statusText(f.kind));
  if (slug === "amount") return e(amountText(f.amount));
  if (slug === "reason") return e(T()[reason(r)] || "");
  if (slug === "ledger") return e(label(base(r.baseKey)));
  return e(text(f[slug]));
}

function sidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("scrim").hidden = !open;
}

function drawNav() {
  const t = T();
  $("nav").setAttribute("aria-label", t.views);
  $("nav").innerHTML = VIEWS.map((k) => {
    let count = "";
    if (base(k) && state.data) {
      const loaded = all().filter((r) => r.baseKey === k).length;
      count = state.data.failures?.includes(k)
        ? "-"
        : (state.data.totalCount[k] ??
          loaded + (state.data.pageInfo[k]?.nextCursor ? "+" : ""));
    }
    return (
      '<a class="nav-item ' +
      (k === state.route.view ? "active" : "") +
      '" href="#/' +
      k +
      '"><span>' +
      e(navLabel(k)) +
      "</span>" +
      (base(k) ? "<span>" + e(count) + "</span>" : "") +
      "</a>"
    );
  }).join("");
}

function drawOverview() {
  const t = T();
  $("overviewContext").textContent =
    (state.provider?.name === "demo" ? t.example : t.workspace) +
    " · " +
    (state.data?.loadedAt
      ? new Date(state.data.loadedAt).toLocaleString(state.lang)
      : t.unknown);
  $("overviewTitle").textContent = zh() ? C.appNameZh : C.appName;
  $("overviewSummary").textContent = zh() ? C.descriptionZh : C.description;
  $("overviewHelp").replaceChildren(
    createElement(CircleHelp, { width: 16, height: 16, "aria-hidden": "true" }),
    document.createTextNode(t.help),
  );
  $("metrics").setAttribute("aria-label", t.metrics);
  $("metrics").innerHTML = metricQueries
    .map((q) => {
      const v = state.data?.metrics?.[q.key];
      return (
        '<a href="#/' +
        q.baseKey +
        '"><span title="' +
        e(t[q.key]) +
        '">' +
        e(t[q.key]) +
        "</span><strong>" +
        e(typeof v === "number" ? v : "—") +
        "</strong></a>"
      );
    })
    .join("");
  // One card per ledger: what it is for and how many of its loaded rows need
  // attention. Totals are already beside each nav item, so they are not repeated.
  $("ledgerGrid").innerHTML = C.bases
    .map((b) => {
      const failed = state.data?.failures?.includes(b.key);
      const pending = all().filter((r) => r.baseKey === b.key && reason(r)).length;
      return (
        '<a class="card ledger-card" href="#/' +
        b.key +
        '"><h2>' +
        e(label(b)) +
        "</h2><p>" +
        e(zh() ? b.descriptionZh : b.description) +
        '</p><span class="ledger-foot">' +
        (failed
          ? '<span class="badge danger">' + e(t.unreadable) + "</span>"
          : "<strong>" + pending + "</strong><span>" + e(t.needReview) + "</span>") +
        '<span class="ledger-open">' +
        e(t.openLedger) +
        " →</span></span></a>"
      );
    })
    .join("");
}

function drawToolbar() {
  const t = T(),
    view = state.route.view,
    b = base(view);
  $("viewTitle").textContent = navLabel(view);
  $("viewTitle").title =
    (b ? (zh() ? b.descriptionZh : b.description) : t.attention) + " · " + t.loaded;
  $("statusLabel").textContent = t.status;
  $("searchLabel").textContent = t.search;
  $("search").placeholder = t.search;
  $("search").setAttribute("aria-label", t.search);
  // Only the states present in this view, not every ledger's.
  const statuses = [
    ...new Set(
      [...viewRows().map((r) => r.fields.status), state.route.status].filter(Boolean),
    ),
  ];
  $("status").setAttribute("aria-label", t.status);
  $("status").innerHTML =
    '<option value="">' +
    e(t.all) +
    "</option>" +
    statuses
      .map((s) => '<option value="' + e(s) + '">' + e(statusText(s)) + "</option>")
      .join("");
  $("status").value = state.route.status;
}

function drawList() {
  const t = T(),
    view = state.route.view,
    b = base(view),
    items = rows(),
    more = b && state.data?.pageInfo[view]?.nextCursor;
  $("resultCount").textContent = items.length + (more ? "+" : "");
  if (!items.length) {
    $("recordList").innerHTML =
      '<div class="empty-state"><strong>' +
      e(narrowed() || view !== "attention" ? t.empty : t.noAttention) +
      "</strong>" +
      (narrowed()
        ? '<button class="button" data-clear type="button">' + e(t.clear) + "</button>"
        : "") +
      "</div>";
  } else {
    // The attention queue leads with *why*: name + reason survive in the split.
    const cols = b ? COLUMNS[view] : ["name", "reason", "status", "ledger", "owner", "due"];
    const head = cols
      .map((slug) => {
        const name =
          slug === "reason"
            ? t.reasonLabel
            : slug === "ledger"
              ? t.ledger
              : b
                ? fieldLabel(b, slug)
                : slug === "name"
                  ? fieldLabel(C.bases[0], "name")
                  : slug === "status"
                    ? t.status
                    : slug === "owner"
                      ? t.owner
                      : t.due;
        return (
          '<th class="' +
          columnClass(slug) +
          '">' +
          e(name) +
          "</th>"
        );
      })
      .join("");
    const body = items
      .map(
        (r) =>
          '<tr data-record="' +
          e(r.id) +
          '"' +
          (r.id === state.route.selectedId ? ' class="ws-selected"' : "") +
          ">" +
          cols
            .map(
              (slug) =>
                '<td class="' +
                columnClass(slug) +
                (slug === "name" ? " cell-primary" : "") +
                '">' +
                cell(r, slug) +
                "</td>",
            )
            .join("") +
          "</tr>",
      )
      .join("");
    $("recordList").innerHTML =
      '<table class="ws-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table>";
  }
  $("more").textContent = t.more;
  $("more").disabled = state.morePending;
  // Load more reads one more page of this ledger, on explicit action only.
  $("more").hidden = !more || narrowed();
}

function findSelected() {
  const { view, selectedId } = state.route;
  if (!selectedId) return null;
  const loaded = all().find(
    (r) => r.id === selectedId && (view === "attention" || r.baseKey === view),
  );
  if (loaded) return loaded;
  const fetched = state.fetched.get(selectedId);
  if (fetched && fetched.baseKey === view) return fetched;
  // Not on the loaded page: read just this record (once), then redraw.
  if (base(view) && state.provider?.getRecord && !state.fetched.has(selectedId) && !state.fetching.has(selectedId)) {
    state.fetching.add(selectedId);
    state.provider
      .getRecord(view, selectedId)
      .then((r) => state.fetched.set(selectedId, r))
      .catch(() => state.fetched.set(selectedId, null))
      .finally(() => {
        state.fetching.delete(selectedId);
        draw();
      });
  }
  return null;
}

function fieldRow(name, valueHtml) {
  return '<div class="field-row"><span>' + e(name) + "</span><strong>" + valueHtml + "</strong></div>";
}
function caseLink(code) {
  const c = caseByCode(code);
  if (!c) return e(text(code));
  return '<a href="' + pageUrl("cases", c.id) + '">' + e(code) + " · " + e(text(c.fields.name)) + "</a>";
}

function drawDetail() {
  const t = T(),
    { view, selectedId, presentation } = state.route;
  const r = findSelected();
  $("detailBar").hidden = !selectedId;
  $("back").textContent = presentation === "page" || isMobile() ? t.back : t.close;
  $("detailExpand").hidden = !selectedId || presentation === "page" || !r;
  if (r) $("detailExpand").href = pageUrl(r.baseKey, r.id);
  $("detailExpand").textContent = t.openFull;
  $("detailEmpty").hidden = Boolean(r);
  $("detailEmpty").textContent = !selectedId
    ? t.select
    : state.fetching.has(selectedId)
      ? t.fetching
      : t.notLoaded;
  $("detail").hidden = !r;
  if (!r) return;
  const b = base(r.baseKey);
  const why = reason(r);
  let fields = "";
  // The cross-ledger queue mixes Bases, so it says which ledger a record is from.
  if (view === "attention") fields += fieldRow(t.ledger, e(label(b)));
  if (why) fields += fieldRow(t.reasonLabel, '<span class="reason">' + e(t[why]) + "</span>");
  for (const f of b.fields) {
    // Name is the heading, status is the badge, notes get their own section.
    if (f.slug === "name" || f.slug === "status" || f.slug === "notes") continue;
    const v = r.fields[f.slug];
    const html =
      f.slug === "status" || f.slug === "kind"
        ? e(statusText(v))
        : f.slug === "amount"
          ? e(amountText(v))
          : f.slug === "case"
            ? caseLink(v)
            : e(text(v));
    fields += fieldRow(zh() ? f.labelZh : f.name, html);
  }
  const notesField = b.fields.find((f) => f.slug === "notes");
  $("detail").innerHTML =
    "<h2>" +
    e(text(r.fields.name)) +
    '</h2><div class="detail-badges">' +
    badge(r) +
    '</div><div class="detail-fields">' +
    fields +
    "</div>" +
    (notesField
      ? '<section class="evidence-note"><h3>' +
        e(zh() ? notesField.labelZh : notesField.name) +
        "</h3><p>" +
        e(text(r.fields.notes)) +
        "</p></section>"
      : "") +
    related(r);
}

function related(r) {
  const t = T(),
    f = r.fields;
  if (r.baseKey !== "cases" || typeof f.code !== "string" || !f.code.trim()) return "";
  const linked = all().filter((x) => x.fields.case === f.code && x.baseKey !== "updates");
  let out = linked.length
    ? '<section class="related"><h3>' +
      e(t.related) +
      "</h3>" +
      linked
        .map(
          (x) =>
            '<a class="timeline-row" href="' +
            recordUrl(x.baseKey, x.id) +
            '"><strong>' +
            e(text(x.fields.name)) +
            "</strong><p>" +
            e(label(base(x.baseKey))) +
            " · " +
            e(statusText(x.fields.status)) +
            " · " +
            e(text(x.fields.due)) +
            "</p></a>",
        )
        .join("") +
      "</section>"
    : "";
  const timeline = caseTimeline(all(), f.code);
  out +=
    '<section class="related"><h3>' +
    e(t.timeline) +
    "</h3>" +
    timeline
      .map(
        (x) =>
          '<a class="timeline-row" href="' +
          recordUrl("updates", x.id) +
          '"><strong>' +
          e(text(x.fields.due)) +
          " · " +
          e(text(x.fields.name)) +
          "</strong><p>" +
          e(text(x.fields.notes)) +
          "</p></a>",
      )
      .join("") +
    "</section>";
  const amounts = verifiedAmounts(all().filter((x) => x.fields.case === f.code));
  out +=
    '<section class="related"><h3>' +
    e(t.money) +
    "</h3>" +
    Object.entries(amounts)
      .map(([currency, a]) =>
        fieldRow(
          currency,
          e(statusText("recovery")) +
            " " +
            e(a.recovery.toLocaleString(state.lang)) +
            " / " +
            e(statusText("cost")) +
            " " +
            e(a.cost.toLocaleString(state.lang)),
        ),
      )
      .join("") +
    "</section>";
  return out;
}

function draw() {
  const t = T();
  const { view, selectedId, presentation } = state.route;
  const ready = Boolean(state.data);
  const onView = ready && view !== "overview";
  const mode = DETAIL_MODES[view];
  const body = document.body.classList;
  body.toggle("ws-detail-open", onView && Boolean(selectedId));
  body.toggle("ws-detail-page", onView && presentation === "page" && Boolean(selectedId));
  body.toggle("ws-detail-drawer", onView && mode === "drawer" && presentation !== "page");
  body.toggle("ws-layout-split", onView && mode === "split" && presentation !== "page");
  body.toggle("ws-searching", onView && narrowed());
  document.documentElement.lang = state.lang;
  document.title = zh() ? C.appNameZh : C.appName;
  $("language").value = state.lang;
  $("languageLabel").textContent = t.language;
  for (const [id, title] of [
    ["openNav", t.openNav],
    ["closeNav", t.closeNav],
    ["scrim", t.closeNav],
    ["refresh", t.refresh],
    ["help", t.help],
    ["closeHelp", t.close],
  ]) {
    $(id).title = title;
    $(id).setAttribute("aria-label", title);
  }
  $("brand").textContent = zh() ? C.appNameZh : C.appName;
  $("brandSub").textContent = zh() ? "业务工作台" : "Operations workspace";
  $("mobileBrand").textContent = view === "overview" ? $("brand").textContent : navLabel(view);
  $("attentionLabel").textContent = t.attention;
  $("attentionCount").textContent = ready ? all().filter(reason).length : "—";
  $("attentionScope").textContent = t.loaded;
  $("attentionLink").classList.toggle("active", view === "attention");
  $("overviewPage").hidden = !ready || view !== "overview";
  $("viewPage").hidden = !onView;
  drawNav();
  if (ready && view === "overview") drawOverview();
  if (onView) {
    drawToolbar();
    drawList();
    drawDetail();
  }
}

// ── Loading ────────────────────────────────────────────────────────────────
const isDemo = () => params.get("demo") === "1";
const gate = createAirAppConnectGate({
  appName: C.appName,
  demoHref: "?demo=1",
  shouldGate: () => !isDemo() && state.runtime?.hosted !== true,
  onProvision: () => {
    throw new Error("Install this template to create its declared resources.");
  },
});
function showNotice(message) {
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
}
async function load() {
  if (state.busy) return;
  state.busy = true;
  const generation = ++state.generation;
  $("loading").textContent = T().loading;
  $("error").hidden = true;
  showNotice("");
  try {
    state.runtime = await detectAirAppRuntime();
    if (!isDemo() && state.runtime.runtime === "unknown")
      throw new Error("BRIDGE_UNAVAILABLE: runtime probe did not answer");
    if (!(await gate.pass({ onReady: load }))) return;
    state.provider = await getProvider();
    const data = await state.provider.getState();
    if (generation !== state.generation) return;
    state.data = data;
    state.fetched.clear();
    draw();
    if (data.errors?.length) showNotice(T().partial);
    else if (Date.now() - Date.parse(data.loadedAt) > 900000) showNotice(T().stale);
  } catch (err) {
    state.data = null;
    draw();
    $("error").hidden = false;
    const permission =
      err?.code === "FORBIDDEN" || /permission denied/i.test(err?.message || "");
    $("error").replaceChildren(
      document.createTextNode((permission ? T().permission : T().error) + " "),
    );
    const b = document.createElement("button");
    b.className = "button";
    b.type = "button";
    b.textContent = T().retry;
    b.onclick = load;
    $("error").append(b);
    console.warn("Workflow provider unavailable", err?.code || "READ_FAILED");
  } finally {
    state.busy = false;
    $("loading").textContent = "";
  }
}
// One page, on explicit action only.
async function loadMore() {
  const key = state.route.view,
    cursor = state.data?.pageInfo[key]?.nextCursor,
    generation = state.generation;
  if (!cursor || state.morePending) return;
  state.morePending = true;
  drawList();
  try {
    const page = await state.provider.loadMore(key, cursor);
    if (generation !== state.generation) return;
    state.data.records = mergePage(state.data.records, page.records);
    state.data.pageInfo[key] = { nextCursor: page.nextCursor };
  } catch {
    showNotice(T().error);
  } finally {
    state.morePending = false;
    draw();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
$("nav").addEventListener("click", (ev) => {
  if (ev.target.closest("a")) sidebar(false);
});
$("attentionLink").addEventListener("click", () => sidebar(false));
$("recordList").addEventListener("click", (ev) => {
  if (ev.target.closest("[data-clear]")) {
    $("search").value = "";
    replaceRoute(listUrl({ ...state.route, query: "", status: "" }));
    return;
  }
  const row = ev.target.closest("tr[data-record]");
  if (!row) return;
  const url = recordUrl(state.route.view, row.dataset.record, state.route);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  if (state.route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else location.hash = url;
});
$("search").oninput = (ev) =>
  replaceRoute(
    "#/" + state.route.view + routeQuery({ ...state.route, query: ev.target.value }, { peek: state.route.peek }),
  );
$("status").onchange = (ev) =>
  replaceRoute("#/" + state.route.view + routeQuery({ ...state.route, status: ev.target.value }));
$("language").onchange = (ev) => {
  state.lang = ev.target.value;
  const url = new URL(location.href);
  url.searchParams.set("lang", state.lang);
  history.replaceState(history.state, "", url);
  draw();
};
$("openNav").onclick = () => sidebar(true);
$("closeNav").onclick = () => sidebar(false);
$("scrim").onclick = () => sidebar(false);
$("back").onclick = closeDetail;
$("refresh").onclick = load;
$("more").onclick = loadMore;
function openHelp() {
  const t = T();
  $("helpTitle").textContent = t.help;
  $("helpBody").innerHTML =
    "<p>" +
    e(t.checklist) +
    "</p><p>" +
    e(t.proposal) +
    "</p>" +
    fieldRow(
      t.source,
      e(state.provider ? (state.provider.name === "demo" ? t.example : t.workspace) : t.unknown),
    ) +
    fieldRow(
      t.refreshed,
      e(state.data?.loadedAt ? new Date(state.data.loadedAt).toLocaleString(state.lang) : t.unknown),
    );
  $("helpDialog").showModal();
}
$("help").onclick = openHelp;
$("overviewHelp").onclick = openHelp;
window.addEventListener("hashchange", setRoute);
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || $("helpDialog").open) return;
  if (document.body.classList.contains("sidebar-open")) {
    sidebar(false);
    return;
  }
  // Escape in the search box only leaves it; a second Escape closes the record.
  if (ev.target.closest?.("input, select")) {
    ev.target.blur();
    return;
  }
  if (state.route.selectedId && (state.route.presentation !== "page" || isMobile())) closeDetail();
});
for (const [id, icon] of [
  ["openNav", Menu],
  ["closeNav", X],
  ["refresh", RotateCw],
  ["help", CircleHelp],
  ["closeHelp", X],
])
  $(id).replaceChildren(createElement(icon, { width: 16, height: 16, "aria-hidden": "true" }));
state.route = parseRoute();
previousRouteWasList = state.route.view !== "overview" && !state.route.selectedId;
$("search").value = state.route.query;
draw();
load();
