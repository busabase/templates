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
import { getRuntime } from "./runtime.js";
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import {
  attentionReason,
  isActive,
  caseTimeline,
  verifiedAmounts,
  mergePage,
} from "./model.js";
const $ = (id) => document.getElementById(id),
  e = (x) =>
    String(x ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
const params = new URLSearchParams(location.search);
let lang = params.get("lang") === "zh-CN" ? "zh-CN" : "en",
  route = location.hash.slice(2) || "overview",
  data = { records: [], pageInfo: {}, totalCount: {} },
  provider,
  runtime,
  selected = null,
  query = "",
  status = "",
  busy = false;
const T = () => copy[lang],
  label = (b) => (lang === "zh-CN" ? b.labelZh : b.name),
  today = () => new Date().toLocaleDateString("en-CA"),
  base = (k) => C.bases.find((b) => b.key === k),
  text = (x) => {
    if (x === null || x === undefined || x === "") return T().unknown;
    const s = String(x);
    return /^(rec|bse|bsf|nod|cmt|crq)[a-z0-9]{15,}$/.test(s) ? T().unknown : s;
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
const statusText = (x) => labels[x]?.[lang === "zh-CN" ? 1 : 0] || text(x);
const reason = (r) => attentionReason(r, today());
const navLabel = (k) =>
  k === "overview"
    ? T().overview
    : k === "attention"
      ? T().attention
      : label(base(k));
function rows() {
  let a =
    route === "attention"
      ? data.records.filter(reason)
      : route === "overview"
        ? data.records.filter((r) => r.baseKey === C.ui.primary)
        : data.records.filter((r) => r.baseKey === route);
  if (query)
    a = a.filter((r) =>
      Object.values(r.fields).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    );
  if (status) a = a.filter((r) => r.fields.status === status);
  return a;
}
function draw() {
  const t = T();
  document.documentElement.lang = lang;
  document.title = lang === "zh-CN" ? C.appNameZh : C.appName;
  $("language").value = lang;
  $("languageLabel").textContent = t.language;
  $("statusLabel").textContent = t.status;
  $("search").setAttribute("aria-label", t.search);
  for (const [id, title] of [
    ["openNav", t.openNav], ["closeNav", t.closeNav], ["scrim", t.closeNav],
    ["refresh", t.refresh], ["help", t.help], ["closeHelp", t.close],
  ]) {
    $(id).title = title;
    $(id).setAttribute("aria-label", title);
  }
  $("brand").textContent = lang === "zh-CN" ? C.appNameZh : C.appName;
  $("brandSub").textContent =
    lang === "zh-CN" ? "业务工作台" : "Operations workspace";
  $("mobileBrand").textContent = $("brand").textContent;
  $("title").textContent =
    route === "overview" ? $("brand").textContent : navLabel(route);
  $("eyebrow").textContent =
    route === "overview" ? t.overview : $("brand").textContent;
  $("summary").textContent = lang === "zh-CN" ? C.descriptionZh : C.description;
  $("attentionLabel").textContent = t.attention;
  $("attentionCount").textContent = data.records.filter(reason).length;
  $("attentionScope").textContent = t.loaded;
  $("nav").innerHTML = ["overview", ...C.bases.map((b) => b.key), "attention"]
    .map(
      (k) =>
        '<button type="button" class="nav-item ' +
        (k === route ? "active" : "") +
        '" data-route="' +
        k +
        '"><span>' +
        e(navLabel(k)) +
        "</span><span>" +
        (base(k)
          ? (data.totalCount[k] ??
            data.records.filter((r) => r.baseKey === k).length +
              (data.pageInfo[k]?.nextCursor ? "+" : ""))
          : "") +
        "</span></button>",
    )
    .join("");
  $("metrics").innerHTML = [
    [t.active, data.records.filter(isActive).length],
    [
      t.reviewMetric,
      data.records.filter((r) => ["review", "incomplete"].includes(reason(r)))
        .length,
    ],
    [
      t.overdueMetric,
      data.records.filter((r) => reason(r) === "overdue").length,
    ],
  ]
    .map(
      ([l, v]) =>
        '<div class="metric"><span>' +
        e(l) +
        "</span><strong>" +
        v +
        "</strong></div>",
    )
    .join("");
  $("search").placeholder = t.search;
  $("scope").textContent = t.loaded;
  const statuses = [
    ...new Set(data.records.map((r) => r.fields.status).filter(Boolean)),
  ];
  $("status").innerHTML =
    '<option value="">' +
    e(t.all) +
    "</option>" +
    statuses
      .map(
        (s) =>
          '<option value="' +
          e(s) +
          '" ' +
          (s === status ? "selected" : "") +
          ">" +
          e(statusText(s)) +
          "</option>",
      )
      .join("");
  const items = rows();
  $("resultCount").textContent =
    items.length +
    (route !== "attention" &&
    data.pageInfo[route === "overview" ? C.ui.primary : route]?.nextCursor
      ? "+"
      : "");
  $("listTitle").textContent =
    route === "overview" ? label(base(C.ui.primary)) : navLabel(route);
  $("more").textContent = t.more;
  $("more").hidden =
    route === "attention" ||
    Boolean(query || status) ||
    !data.pageInfo[route === "overview" ? C.ui.primary : route]?.nextCursor;
  $("back").textContent = t.back;
  $("recordList").innerHTML = items.length
    ? items
        .map(
          (r) =>
            '<button class="record-row ' +
            (r.id === selected ? "selected" : "") +
            '" data-record="' +
            e(r.id) +
            '"><span class="row-main"><strong>' +
            e(text(r.fields.name)) +
            '</strong><span class="badge">' +
            e(statusText(r.fields.status)) +
            "</span></span><span>" +
            e(route === "attention" ? label(base(r.baseKey)) + " · " : "") +
            e(text(r.fields.owner)) +
            " · " +
            e(text(r.fields.due)) +
            "</span>" +
            (r.fields.next ? "<span>" + e(r.fields.next) + "</span>" : "") +
            (reason(r)
              ? '<span class="reason">' + e(t[reason(r)]) + "</span>"
              : "") +
            "</button>",
        )
        .join("")
    : '<div class="empty-list">' + e(t.empty) + "</div>";
  const r = data.records.find((x) => x.id === selected);
  $("detail").hidden = !r;
  $("detailEmpty").hidden = !!r;
  $("detailEmpty").textContent = t.select;
  if (r) {
    const b = base(r.baseKey);
    $("detail").innerHTML =
      '<span class="eyebrow">' +
      e(label(b)) +
      "</span><h2>" +
      e(text(r.fields.name)) +
      '</h2><div class="detail-fields">' +
      b.fields
        .filter((f) => f.slug !== "name")
        .map(
          (f) =>
            '<div class="field-row"><span>' +
            e(lang === "zh-CN" ? f.labelZh : f.name) +
            "</span><strong>" +
            e(
              f.slug === "status" || f.slug === "kind"
                ? statusText(r.fields[f.slug])
                : text(r.fields[f.slug]),
            ) +
            "</strong></div>",
        )
        .join("") +
      related(r) +
      "</div>";
  }
}
function related(r) {
  const t = T(),
    f = r.fields;
  if (typeof f.code !== "string" || !f.code.trim()) return "";
  let relatedRows = [];
  if (r.baseKey === "cases")
    relatedRows = data.records.filter(
      (x) => x.fields.case === f.code && x.baseKey !== "updates",
    );
  if (r.baseKey === "applicants")
    relatedRows = data.records.filter((x) => x.fields.candidate === f.code);
  let out = relatedRows.length
    ? "<h3>" +
      e(t.related) +
      "</h3>" +
      relatedRows
        .map(
          (x) =>
            '<div class="timeline-row"><strong>' +
            e(x.fields.name) +
            "</strong><p>" +
            e(statusText(x.fields.status)) +
            " · " +
            e(text(x.fields.due)) +
            "</p></div>",
        )
        .join("")
    : "";
  if (r.baseKey === "cases") {
    const timeline = caseTimeline(data.records, f.code);
    out +=
      "<h3>" +
      e(t.timeline) +
      "</h3>" +
      timeline
        .map(
          (x) =>
            '<div class="timeline-row"><strong>' +
            e(text(x.fields.due)) +
            " · " +
            e(x.fields.name) +
            "</strong><p>" +
            e(x.fields.notes) +
            "</p></div>",
        )
        .join("");
    const amounts = verifiedAmounts(
      data.records.filter((x) => x.fields.case === f.code),
    );
    out +=
      "<h3>" +
      e(t.money) +
      "</h3>" +
      Object.entries(amounts)
        .map(
          ([currency, a]) =>
            '<div class="field-row"><span>' +
            currency +
            "</span><strong>" +
            e(statusText("recovery")) +
            " " +
            a.recovery.toLocaleString() +
            " / " +
            e(statusText("cost")) +
            " " +
            a.cost.toLocaleString() +
            "</strong></div>",
        )
        .join("");
  }
  return out;
}
function sidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("scrim").hidden = !open;
}
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
    runtime = await getRuntime();
    if (params.get("demo") !== "1" && runtime.runtime === "unknown")
      throw new Error("BRIDGE_UNAVAILABLE: runtime probe did not answer");
    if (!(await gate.pass({ onReady: load }))) return;
    provider = await getProvider();
    data = await provider.getState();
    selected = null;
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
$("nav").onclick = (ev) => {
  const b = ev.target.closest("[data-route]");
  if (!b) return;
  location.hash = "/" + b.dataset.route;
  sidebar(false);
};
window.addEventListener("hashchange", () => {
  route = location.hash.slice(2) || "overview";
  if (!["overview", "attention", ...C.bases.map((b) => b.key)].includes(route))
    route = "overview";
  selected = null;
  query = "";
  status = "";
  $("search").value = "";
  document.body.classList.remove("mobile-detail-open");
  draw();
});
$("recordList").onclick = (ev) => {
  const b = ev.target.closest("[data-record]");
  if (!b) return;
  selected = b.dataset.record;
  document.body.classList.add("mobile-detail-open");
  draw();
};
$("search").oninput = (ev) => {
  query = ev.target.value;
  draw();
};
$("status").onchange = (ev) => {
  status = ev.target.value;
  draw();
};
$("language").onchange = (ev) => {
  lang = ev.target.value;
  draw();
};
$("openNav").onclick = () => sidebar(true);
$("closeNav").onclick = () => sidebar(false);
$("scrim").onclick = () => sidebar(false);
$("back").onclick = () => {
  selected = null;
  document.body.classList.remove("mobile-detail-open");
  draw();
};
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
$("more").onclick = async () => {
  if (busy) return;
  const key = route === "overview" ? C.ui.primary : route,
    cursor = data.pageInfo[key]?.nextCursor;
  if (!cursor) return;
  busy = true;
  $("more").disabled = true;
  try {
    const page = await provider.loadMore(key, cursor);
    data.records = mergePage(data.records, page.records);
    data.pageInfo[key].nextCursor = page.nextCursor;
    draw();
  } catch {
    $("error").hidden = false;
    $("error").textContent = T().error;
  } finally {
    busy = false;
    $("more").disabled = false;
  }
};
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
