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
import { attentionReason, isActive, mergePage } from "./model.js";
const $ = (id) => document.getElementById(id),
  e = (x) =>
    String(x ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
const params = new URLSearchParams(location.search);
// Declared once, in config.js `ui.detail_modes`. A `/<record>` path is always
// the full page; `?peek=<record>` drives a drawer or split selection.
const DETAIL_MODES = C.ui.detail_modes;
const BASE_KEYS = C.bases.map((b) => b.key);
const VIEWS = ["overview", ...BASE_KEYS, "attention"];
let lang = params.get("lang") === "zh-CN" ? "zh-CN" : "en",
  data = { records: [], pageInfo: {}, totalCount: {} },
  loaded = false,
  provider,
  runtime,
  busy = false,
  route = parseRoute(),
  previousRouteWasList = false;
const T = () => copy[lang],
  label = (b) => (lang === "zh-CN" ? b.labelZh : b.name),
  describe = (b) => (lang === "zh-CN" ? b.descriptionZh : b.description),
  fieldLabel = (f) => (lang === "zh-CN" ? f.labelZh : f.name),
  today = () => new Date().toLocaleDateString("en-CA"),
  base = (k) => C.bases.find((b) => b.key === k),
  text = (x) => {
    if (x === null || x === undefined || x === "") return T().unknown;
    const s = String(x);
    return /^(rec|bse|bsf|nod|cmt|crq)[a-z0-9]{10,}$/.test(s) ? T().unknown : s;
  };
const labels = {
  open: ["Open", "进行中"],
  paused: ["Paused", "已暂停"],
  interview: ["Interview", "面试中"],
  screening: ["Screening", "初筛中"],
  offer_review: ["Offer review", "录用复核"],
  on_hold: ["On hold", "暂缓"],
  needs_review: ["Needs review", "待复核"],
  blocked: ["Blocked", "受阻"],
  accepted: ["Accepted", "已接受"],
  completed: ["Completed", "已完成"],
  hired: ["Hired", "已录用"],
  offered: ["Offered", "已发录用"],
  rejected: ["Rejected", "未通过"],
  withdrawn: ["Withdrawn", "已退出"],
  approved: ["Approved", "已批准"],
  sent: ["Sent", "已发送"],
  declined: ["Declined", "已拒绝"],
  feedback_missing: ["Feedback missing", "缺少反馈"],
  scheduled: ["Scheduled", "已安排"],
  closed: ["Closed", "已结案"],
  overdue: ["Overdue", "已逾期"],
};
// One tone per machine status, read by `.badge` through its `--dot` token.
const tones = {
  open: "active",
  interview: "active",
  screening: "active",
  scheduled: "active",
  offered: "active",
  sent: "active",
  offer_review: "warning",
  needs_review: "warning",
  feedback_missing: "warning",
  on_hold: "warning",
  paused: "warning",
  blocked: "danger",
  rejected: "danger",
  declined: "danger",
  withdrawn: "danger",
  hired: "positive",
  accepted: "positive",
  approved: "positive",
  completed: "positive",
};
const statusText = (x) => labels[x]?.[lang === "zh-CN" ? 1 : 0] || text(x);
const badge = (x) =>
  '<span class="badge ' +
  (tones[x] || "") +
  '">' +
  e(statusText(x)) +
  "</span>";
const reason = (r) => attentionReason(r, today());
const navLabel = (k) =>
  k === "overview"
    ? T().overview
    : k === "attention"
      ? T().attention
      : label(base(k));
const viewDescription = (k) =>
  k === "attention" ? T().attentionDescription : describe(base(k));

// ── Relations ──────────────────────────────────────────────────────────────
// Positions, applicants, interviews and offers link by business code
// (`JOB-…`, `CAN-…`). Resolve a code to the record it names; when that record
// is not among the loaded rows say so instead of guessing.
const byCode = (baseKey, code) =>
  typeof code === "string" && code.trim()
    ? data.records.find((r) => r.baseKey === baseKey && r.fields.code === code)
    : null;
const RELATIONS = { position: "positions", candidate: "applicants" };
function relationLabel(slug, code) {
  if (code === null || code === undefined || code === "") return T().unknown;
  const target = byCode(RELATIONS[slug], code);
  return target
    ? text(target.fields.name) + " · " + code
    : text(code) + " · " + T().notLoadedValue;
}
const money = (f) =>
  typeof f.amount === "number" && Number.isFinite(f.amount)
    ? f.amount.toLocaleString(lang) + (f.currency ? " " + f.currency : "")
    : T().unknown;

// ── Routing ────────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?q=…&status=…&peek=…]`. Search, the status filter and
// the peeked record live in the URL, so refresh, shared links and Back
// restore the same list context.
function parseRoute() {
  const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const q = new URLSearchParams(query);
  let view = parts[0] || "overview";
  if (!VIEWS.includes(view)) view = "overview";
  let id = "";
  try {
    id = parts[1] ? decodeURIComponent(parts[1]) : "";
  } catch {
    id = "";
  }
  const mode = DETAIL_MODES[view];
  if (!mode) id = "";
  const peek = mode && mode !== "page" && !id ? q.get("peek") || "" : "";
  return {
    view,
    id,
    peek,
    selectedId: id || peek,
    // `page` replaces the list; drawer/split keep it.
    presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
    query: q.get("q") || "",
    status: q.get("status") || "",
  };
}
function routeQuery(extra = {}, r = route) {
  const q = new URLSearchParams();
  if (r.query) q.set("q", r.query);
  if (r.status) q.set("status", r.status);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? "?" + s : "";
}
const listUrl = (r = route) => "#/" + r.view + routeQuery({}, r);
// Records are found by id across ledgers, so the attention queue can hand a
// record to its own view.
const recordById = (id) => data.records.find((x) => x.id === id);
const detailUrl = (id, view = route.view) =>
  "#/" +
  view +
  "/" +
  encodeURIComponent(id) +
  (view === route.view ? routeQuery() : "");
// What a row or a related link opens: the page for a `page` view, else `?peek=`.
function recordUrl(id, view = route.view) {
  if (DETAIL_MODES[view] === "page") return detailUrl(id, view);
  const r = view === route.view ? route : { view, query: "", status: "" };
  return "#/" + view + routeQuery({ peek: id }, r);
}
function setRoute() {
  const previous = route;
  route = parseRoute();
  // A record opened from its list steps back to that exact list entry.
  if (
    route.selectedId &&
    previousRouteWasList &&
    previous.view === route.view
  )
    history.replaceState({ fromList: true }, "");
  previousRouteWasList = route.view !== "overview" && !route.selectedId;
  $("search").value = route.query;
  sidebar(false);
  draw();
}
// Replace the entry without a hashchange: keystrokes and filter changes must
// not each become a Back step.
function replaceRoute(url) {
  history.replaceState(history.state, "", url);
  route = parseRoute();
  draw();
}
function closeDetail() {
  if (history.state?.fromList) history.back();
  else location.hash = listUrl();
}

// ── Rows ───────────────────────────────────────────────────────────────────
function viewRecords(view = route.view) {
  return view === "attention"
    ? data.records.filter(reason)
    : data.records.filter((r) => r.baseKey === view);
}
function rows() {
  let a = viewRecords();
  const q = route.query.toLowerCase();
  if (q)
    a = a.filter((r) =>
      Object.values(r.fields).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  if (route.status) a = a.filter((r) => r.fields.status === route.status);
  return a;
}
const hasMore = (k) => Boolean(data.pageInfo[k]?.nextCursor);
const navCount = (k) =>
  data.totalCount[k] ??
  data.records.filter((r) => r.baseKey === k).length + (hasMore(k) ? "+" : "");

// Columns per view. The first column names the record; the narrow split queue
// keeps the first two (name and state), so each view leads with those.
const COLUMNS = {
  positions: [
    ["name"],
    ["status", "col-stage"],
    ["department"],
    ["owner"],
    ["headcount", "ws-col-num"],
    ["due", "col-date"],
  ],
  applicants: [
    ["name"],
    ["status", "col-stage"],
    ["position"],
    ["next", "ws-col-wide"],
    ["due", "col-date"],
    ["owner"],
  ],
  interviews: [
    ["name"],
    ["status", "col-stage"],
    ["due", "col-date"],
    ["candidate"],
    ["owner"],
  ],
  offers: [
    ["name"],
    ["status", "col-stage"],
    ["due", "col-date"],
    ["candidate"],
    ["owner"],
    ["amount", "ws-col-num"],
  ],
  attention: [
    ["name"],
    ["reason", "col-stage"],
    ["due", "col-date"],
    ["ledger"],
    ["status", "col-stage"],
    ["owner"],
  ],
};
function columnLabel(view, slug) {
  const t = T();
  if (slug === "reason") return t.reason;
  if (slug === "ledger") return t.ledger;
  if (slug === "candidate") return t.candidate;
  if (slug === "position") return t.position;
  // The attention queue mixes ledgers, so it names columns generically.
  if (view === "attention")
    return { name: fieldLabel(base("positions").fields[0]),
      due: t.due, owner: t.owner, status: t.status }[slug] || slug;
  const f = base(view).fields.find((x) => x.slug === slug);
  return f ? fieldLabel(f) : slug;
}
function cell(r, slug) {
  const f = r.fields;
  if (slug === "status") return badge(f.status);
  if (slug === "reason") {
    const why = reason(r);
    return why
      ? '<span class="badge ' +
          (why === "overdue" ? "danger" : "warning") +
          '">' +
          e(T()[why + "Short"]) +
          "</span>"
      : "";
  }
  if (slug === "ledger") return e(label(base(r.baseKey)));
  if (slug === "position" || slug === "candidate")
    return e(relationLabel(slug, f[slug]));
  if (slug === "amount") return e(money(f));
  if (slug === "name") return "<strong>" + e(text(f.name)) + "</strong>";
  return e(text(f[slug]));
}
function cellTitle(r, slug) {
  if (slug === "reason") return reason(r) ? T()[reason(r)] : "";
  if (["status", "amount"].includes(slug)) return "";
  if (slug === "ledger") return label(base(r.baseKey));
  if (slug === "position" || slug === "candidate")
    return relationLabel(slug, r.fields[slug]);
  return text(r.fields[slug]);
}
function table(items) {
  const cols = COLUMNS[route.view];
  const head = cols
    .map(
      ([slug, cls]) =>
        "<th" +
        (cls ? ' class="' + cls + '"' : "") +
        ">" +
        e(columnLabel(route.view, slug)) +
        "</th>",
    )
    .join("");
  const body = items
    .map(
      (r) =>
        '<tr data-record="' +
        e(r.id) +
        '"' +
        (r.id === route.selectedId ? ' class="ws-selected"' : "") +
        ">" +
        cols
          .map(
            ([slug, cls]) =>
              "<td" +
              (cls ? ' class="' + cls + '"' : "") +
              ' title="' +
              e(cellTitle(r, slug)) +
              '">' +
              cell(r, slug) +
              "</td>",
          )
          .join("") +
        "</tr>",
    )
    .join("");
  return (
    '<table class="ws-table recruiting-table table-' +
    route.view +
    '"><thead><tr>' +
    head +
    "</tr></thead><tbody>" +
    body +
    "</tbody></table>"
  );
}

// ── Render ─────────────────────────────────────────────────────────────────
function drawShell() {
  const t = T();
  document.documentElement.lang = lang;
  document.title = lang === "zh-CN" ? C.appNameZh : C.appName;
  $("language").value = lang;
  $("languageLabel").textContent = t.language;
  $("statusLabel").textContent = t.status;
  $("search").setAttribute("aria-label", t.search);
  $("search").placeholder = t.search;
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
  const brand = lang === "zh-CN" ? C.appNameZh : C.appName;
  $("brand").textContent = brand;
  $("brandSub").textContent =
    lang === "zh-CN" ? "业务工作台" : "Operations workspace";
  $("mobileTitle").textContent =
    route.view === "overview" ? brand : navLabel(route.view);
  $("attentionLabel").textContent = t.attention;
  $("attentionCount").textContent = loaded
    ? data.records.filter(reason).length
    : "—";
  $("attentionScope").textContent = t.loaded;
  $("attentionLink").title = t.attentionHint;
  $("nav").innerHTML = VIEWS.map(
    (k) =>
      '<button type="button" class="nav-item ' +
      (k === route.view ? "active" : "") +
      '" data-route="' +
      k +
      '"><span>' +
      e(navLabel(k)) +
      "</span><span>" +
      (base(k) && loaded ? e(navCount(k)) : "") +
      "</span></button>",
  ).join("");
}
function draw() {
  drawShell();
  const { view, selectedId, presentation } = route;
  const onRecordView = loaded && view !== "overview";
  const body = document.body.classList;
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
  body.toggle("has-data", loaded);
  $("overviewPage").hidden = !loaded || view !== "overview";
  $("viewPage").hidden = !onRecordView;
  if (!loaded) return;
  if (onRecordView) drawRecordView();
  else drawOverview();
}
function drawOverview() {
  const t = T();
  $("overviewTitle").textContent = lang === "zh-CN" ? C.appNameZh : C.appName;
  $("overviewSummary").textContent =
    lang === "zh-CN" ? C.descriptionZh : C.description;
  const partial = (keys) =>
    keys.some(hasMore) || keys.some((k) => data.totalCount[k] == null)
      ? t.loadedSuffix
      : "";
  // Three numbers nobody can read off the nav: they each take a computation.
  const openHeadcount = data.records
    .filter((r) => r.baseKey === "positions" && r.fields.status === "open")
    .reduce(
      (sum, r) =>
        sum +
        (typeof r.fields.headcount === "number" &&
        Number.isFinite(r.fields.headcount)
          ? r.fields.headcount
          : 0),
      0,
    );
  const inProcess = data.records.filter(
    (r) => r.baseKey === "applicants" && isActive(r),
  ).length;
  const overdue = data.records.filter((r) => reason(r) === "overdue").length;
  $("metrics").innerHTML = [
    [t.openHeadcount + partial(["positions"]), openHeadcount],
    [t.inProcess + partial(["applicants"]), inProcess],
    [t.overdueFollowups + partial(BASE_KEYS), overdue],
  ]
    .map(
      ([l, v]) =>
        "<div><span title=\"" +
        e(l) +
        '">' +
        e(l) +
        "</span><strong>" +
        v +
        "</strong></div>",
    )
    .join("");
  const applicants = data.records.filter((r) => r.baseKey === "applicants");
  const stages = new Map();
  for (const r of applicants) {
    const s = r.fields.status || "";
    stages.set(s, (stages.get(s) || 0) + 1);
  }
  const attention = data.records.filter(reason);
  $("overviewBody").innerHTML =
    '<section class="card flush overview-card"><div class="card-heading"><div><h2>' +
    e(t.pipeline) +
    "</h2><p>" +
    e(t.pipelineHint) +
    '</p></div></div><div class="overview-list">' +
    (stages.size
      ? [...stages]
          .map(
            ([s, n]) =>
              '<a class="overview-row" href="#/applicants' +
              (s ? "?status=" + encodeURIComponent(s) : "") +
              '">' +
              badge(s) +
              '<span class="overview-num">' +
              n +
              "</span></a>",
          )
          .join("")
      : '<p class="overview-empty">' + e(t.noApplicants) + "</p>") +
    '</div></section><section class="card flush overview-card"><div class="card-heading"><div><h2>' +
    e(t.attention) +
    "</h2><p>" +
    e(t.attentionHint) +
    '</p></div><a class="button" href="#/attention">' +
    e(t.viewAll) +
    '</a></div><div class="overview-list">' +
    (attention.length
      ? attention
          .slice(0, 6)
          .map(
            (r) =>
              '<a class="overview-row" href="' +
              e(recordUrl(r.id, r.baseKey)) +
              '"><span class="overview-name"><strong>' +
              e(text(r.fields.name)) +
              "</strong><span>" +
              e(label(base(r.baseKey))) +
              " · " +
              e(text(r.fields.due)) +
              '</span></span><span class="reason">' +
              e(t[reason(r)]) +
              "</span></a>",
          )
          .join("")
      : '<p class="overview-empty">' + e(t.nothingNeedsAttention) + "</p>") +
    "</div></section>";
}
function drawRecordView() {
  const t = T();
  const view = route.view;
  $("viewTitle").textContent = navLabel(view);
  $("viewTitle").title = viewDescription(view);
  const items = rows();
  $("viewCount").textContent =
    items.length +
    (view !== "attention" && hasMore(view) && !route.query && !route.status
      ? "+"
      : "");
  // Only the states this view actually holds.
  const statuses = [
    ...new Set(
      viewRecords()
        .map((r) => r.fields.status)
        .filter(Boolean),
    ),
  ];
  if (route.status && !statuses.includes(route.status))
    statuses.push(route.status);
  $("status").innerHTML =
    '<option value="">' +
    e(t.all) +
    "</option>" +
    statuses
      .map(
        (s) =>
          '<option value="' +
          e(s) +
          '"' +
          (s === route.status ? " selected" : "") +
          ">" +
          e(statusText(s)) +
          "</option>",
      )
      .join("");
  if (document.activeElement !== $("search")) $("search").value = route.query;
  // List controls mean nothing while a full page replaces the list.
  document.querySelector(".ws-actions").hidden = route.presentation === "page";
  const more =
    view !== "attention" && !route.query && !route.status && hasMore(view);
  $("listPanel").innerHTML =
    (items.length
      ? table(items)
      : '<div class="empty-list">' + e(t.empty) + "</div>") +
    (more
      ? '<div class="list-footer"><button type="button" class="button" id="more">' +
        e(t.more) +
        "</button></div>"
      : "");
  drawDetail();
}
function drawDetail() {
  const t = T();
  const { selectedId, presentation } = route;
  const r = selectedId ? recordById(selectedId) : null;
  $("detailBar").hidden = !selectedId;
  $("back").textContent = presentation === "page" ? t.back : t.closeDetail;
  const expand = $("expand");
  expand.hidden = !r || presentation === "page";
  expand.textContent = t.openFull;
  if (r) expand.href = detailUrl(r.id, r.baseKey);
  if (!selectedId) {
    $("detail").innerHTML =
      '<div class="ws-detail-empty">' + e(t.select) + "</div>";
    return;
  }
  if (!r) {
    $("detail").innerHTML =
      '<div class="ws-detail-empty">' + e(t.notLoaded) + "</div>";
    return;
  }
  const b = base(r.baseKey);
  const why = reason(r);
  $("detail").innerHTML =
    '<header class="detail-head"><h2>' +
    e(text(r.fields.name)) +
    "</h2><div class=\"detail-meta\">" +
    badge(r.fields.status) +
    (route.view === "attention"
      ? '<span class="detail-ledger">' + e(label(b)) + "</span>"
      : "") +
    (why ? '<span class="reason">' + e(t[why]) + "</span>" : "") +
    '</div></header><div class="detail-fields">' +
    b.fields
      // Currency is shown with the amount it qualifies.
      .filter((f) => !["name", "status", "currency"].includes(f.slug))
      .map(
        (f) =>
          '<div class="field-row"><span>' +
          e(RELATIONS[f.slug] ? T()[f.slug] : fieldLabel(f)) +
          "</span><strong>" +
          (RELATIONS[f.slug]
            ? relatedLink(f.slug, r.fields[f.slug])
            : f.slug === "amount"
              ? e(money(r.fields))
              : e(text(r.fields[f.slug]))) +
          "</strong></div>",
      )
      .join("") +
    "</div>" +
    related(r);
}
// A relation field links to the record it names, opened in that record's view.
function relatedLink(slug, code) {
  const target = byCode(RELATIONS[slug], code);
  if (!target) return e(relationLabel(slug, code));
  return (
    '<a href="' +
    e(recordUrl(target.id, target.baseKey)) +
    '">' +
    e(relationLabel(slug, code)) +
    "</a>"
  );
}
function related(r) {
  const t = T(),
    f = r.fields;
  if (typeof f.code !== "string" || !f.code.trim()) return "";
  let title = "",
    list = [];
  if (r.baseKey === "positions") {
    title = t.applicantsFor;
    list = data.records.filter(
      (x) => x.baseKey === "applicants" && x.fields.position === f.code,
    );
  } else if (r.baseKey === "applicants") {
    title = t.related;
    list = data.records.filter((x) => x.fields.candidate === f.code);
  }
  if (!list.length) return "";
  return (
    '<section class="detail-related"><h3>' +
    e(title) +
    "</h3>" +
    list
      .map(
        (x) =>
          '<a class="timeline-row" href="' +
          e(recordUrl(x.id, x.baseKey)) +
          '"><strong>' +
          e(text(x.fields.name)) +
          "</strong>" +
          badge(x.fields.status) +
          "<span>" +
          e(label(base(x.baseKey))) +
          " · " +
          e(text(x.fields.due)) +
          "</span></a>",
      )
      .join("") +
    "</section>"
  );
}
function sidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("scrim").hidden = !open;
}

// ── Data ───────────────────────────────────────────────────────────────────
const gate = createAirAppConnectGate({
  appName: C.appName,
  demoHref: "?demo=1",
  shouldGate: () => params.get("demo") !== "1" && runtime?.hosted !== true,
  onProvision: () => {
    throw new Error("Install this template to create its declared resources.");
  },
});
async function load() {
  if (busy) return;
  busy = true;
  $("loading").textContent = T().loading;
  $("error").hidden = true;
  try {
    runtime = await detectAirAppRuntime();
    if (params.get("demo") !== "1" && runtime.runtime === "unknown")
      throw new Error("BRIDGE_UNAVAILABLE: runtime probe did not answer");
    if (!(await gate.pass({ onReady: load }))) return;
    provider = await getProvider();
    data = await provider.getState();
    loaded = true;
    draw();
    if (Date.now() - Date.parse(data.loadedAt) > 900000) {
      $("error").hidden = false;
      $("error").textContent = T().stale;
    }
    if (data.errors?.length) {
      $("error").hidden = false;
      $("error").textContent = T().partial;
    }
  } catch (err) {
    $("error").hidden = false;
    const permission =
      err?.code === "FORBIDDEN" ||
      /permission denied/i.test(err?.message || "");
    $("error").replaceChildren(
      document.createTextNode((permission ? T().permission : T().error) + " "),
    );
    const b = document.createElement("button");
    b.className = "button";
    b.textContent = T().retry;
    b.onclick = load;
    $("error").append(b);
    console.warn("Workflow provider unavailable", err?.code || "READ_FAILED");
  } finally {
    busy = false;
    $("loading").textContent = "";
  }
}
async function loadMore() {
  if (busy) return;
  const key = route.view,
    cursor = data.pageInfo[key]?.nextCursor;
  if (!cursor) return;
  busy = true;
  const button = $("more");
  if (button) button.disabled = true;
  try {
    const page = await provider.loadMore(key, cursor);
    data.records = mergePage(data.records, page.records);
    data.pageInfo[key].nextCursor = page.nextCursor;
  } catch {
    $("error").hidden = false;
    $("error").textContent = T().error;
  } finally {
    busy = false;
    draw();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
$("nav").onclick = (ev) => {
  const b = ev.target.closest("[data-route]");
  if (!b) return;
  location.hash = "/" + b.dataset.route;
  sidebar(false);
};
$("attentionLink").onclick = () => sidebar(false);
window.addEventListener("hashchange", setRoute);
$("listPanel").onclick = (ev) => {
  if (ev.target.closest("#more")) {
    loadMore();
    return;
  }
  const row = ev.target.closest("tr[data-record]");
  if (!row) return;
  const url = recordUrl(row.dataset.record);
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (route.peek) {
    history.replaceState(history.state, "", url);
    setRoute();
  } else location.hash = url;
};
$("search").oninput = (ev) => {
  replaceRoute(
    "#/" +
      route.view +
      routeQuery({ peek: route.peek }, { ...route, query: ev.target.value }),
  );
};
$("status").onchange = (ev) => {
  replaceRoute(
    "#/" +
      route.view +
      routeQuery({ peek: route.peek }, { ...route, status: ev.target.value }),
  );
};
$("language").onchange = (ev) => {
  lang = ev.target.value;
  draw();
};
$("openNav").onclick = () => sidebar(true);
$("closeNav").onclick = () => sidebar(false);
$("scrim").onclick = () => sidebar(false);
$("back").onclick = closeDetail;
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || $("helpDialog").open) return;
  if (ev.target.closest?.("input, select, textarea")) {
    ev.target.blur();
    return;
  }
  if (route.selectedId && route.presentation && route.presentation !== "page")
    closeDetail();
});
$("refresh").onclick = load;
$("help").onclick = () => {
  const t = T();
  $("helpTitle").textContent = t.help;
  $("helpBody").innerHTML =
    "<p>" +
    e(t.checklist) +
    "</p><p>" +
    e(t.proposal) +
    "</p><div class='field-row'><span>" +
    e(t.source) +
    "</span><strong>" +
    e(
      provider
        ? provider.name === "demo"
          ? t.example
          : t.workspace
        : t.unknown,
    ) +
    "</strong></div><div class='field-row'><span>" +
    e(t.refreshed) +
    "</span><strong>" +
    e(
      data.loadedAt ? new Date(data.loadedAt).toLocaleString(lang) : t.unknown,
    ) +
    "</strong></div>";
  $("helpDialog").showModal();
};
previousRouteWasList = route.view !== "overview" && !route.selectedId;
$("search").value = route.query;
draw();
for (const [id, icon] of [
  ["openNav", Menu],
  ["closeNav", X],
  ["refresh", RotateCw],
  ["help", CircleHelp],
  ["closeHelp", X],
])
  $(id).replaceChildren(
    createElement(icon, { width: 16, height: 16, "aria-hidden": "true" }),
  );
load();
