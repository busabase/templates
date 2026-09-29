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
const root = document.querySelector("#app");
let locale =
    new URLSearchParams(location.search).get("lang") === "zh-CN"
      ? "zh-CN"
      : "en",
  state = null,
  selected = null,
  query = "",
  status = "",
  drawer = false,
  loading = false,
  seq = 0;
const t = (k) => messages[locale][k] || k;
const name = (b) => b.nameI18n?.[locale] || b.name;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const route = () => location.hash.slice(2).split("/")[0] || "overview";
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
function badge(s) {
  const cls = ["blocked", "exception", "restricted"].includes(s)
    ? "bad"
    : ["paid", "accepted", "filed", "issued", "matched", "reconciled"].includes(
          s,
        )
      ? "good"
      : ["pending", "review", "approved", "preparing", "unmatched"].includes(s)
        ? "warn"
        : "";
  return '<span class="badge ' + cls + '">' + esc(t(s)) + "</span>";
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
function rowsFor(key) {
  let rs = state.records.filter((r) =>
    key === "attention"
      ? attentionReason(r, state.reviewTime)
      : r.baseKey === key,
  );
  if (query)
    rs = rs.filter((r) =>
      Object.entries(r.fields)
        .filter(
          ([k]) =>
            appConfig.bases
              .find((b) => b.key === r.baseKey)
              .fields.find((f) => f.slug === k)?.type !== "relation",
        )
        .some(([, v]) =>
          String(v ?? "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    );
  if (status) rs = rs.filter((r) => r.fields.status === status);
  return rs;
}
function detail() {
  const r = state.records.find((r) => r.id === selected);
  if (!r)
    return (
      '<div class="empty"><h2>' +
      t("none") +
      "</h2><p>" +
      t("select") +
      "</p></div>"
    );
  const base = appConfig.bases.find((b) => b.key === r.baseKey),
    reason = attentionReason(r, state.reviewTime);
  return (
    '<button class="back" id="back">← ' +
    t("back") +
    '</button><div class="subtle">' +
    esc(name(base)) +
    "</div><h2>" +
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
      .filter((f) => f.slug !== "title")
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
function table(rs, key) {
  const base = appConfig.bases.find((b) => b.key === key);
  const columns = base
    ? base.columns.filter((x) => x !== "currency").slice(0, 5)
    : ["title", "owner", "due", "status"];
  return (
    "<table><thead><tr>" +
    columns
      .map(
        (k) =>
          "<th>" +
          esc(
            base?.fields.find((f) => f.slug === k)?.nameI18n?.[locale] ||
              {
                title: locale === "en" ? "Record" : "事项",
                owner: locale === "en" ? "Owner" : "负责人",
                due: locale === "en" ? "Due / checked" : "截止 / 核查",
                status: locale === "en" ? "State" : "状态",
              }[k] ||
              k,
          ) +
          "</th>",
      )
      .join("") +
    "</tr></thead><tbody>" +
    rs
      .map(
        (r) =>
          '<tr class="' +
          (r.id === selected ? "selected" : "") +
          '" data-record="' +
          r.id +
          '">' +
          columns
            .map(
              (k, i) =>
                "<td>" +
                (i === 0
                  ? '<button class="row-button" data-record="' +
                    r.id +
                    '">' +
                    esc(r.fields.title) +
                    '</button><div class="row-meta">' +
                    esc(
                      key === "attention"
                        ? name(appConfig.bases.find((b) => b.key === r.baseKey))
                        : r.fields.entity || "",
                    ) +
                    "</div>"
                  : k === "status"
                    ? badge(r.fields.status)
                    : [
                          "amount",
                          "balance",
                          "bankBalance",
                          "revenue",
                          "cost",
                        ].includes(k)
                      ? esc(r.fields.currency) +
                        " " +
                        display({ type: "number" }, r.fields[k])
                      : display(
                          base?.fields.find((f) => f.slug === k) || {
                            slug: k,
                            type: "text",
                          },
                          r.fields[k] ||
                            (k === "due" ? r.fields.checkedAt : ""),
                        )) +
                "</td>",
            )
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}
function overview() {
  return (
    '<div class="workspace"><div class="toolbar"><strong>' +
    t("evidenceReview") +
    '</strong></div><div class="list">' +
    appConfig.bases
      .map((b) => {
        const rows = state.records.filter((r) => r.baseKey === b.key),
          count = rows.filter((r) =>
            attentionReason(r, state.reviewTime),
          ).length;
        return (
          '<div class="overview-item"><div><strong>' +
          esc(name(b)) +
          "</strong><p>" +
          count +
          " " +
          t("attention") +
          " · " +
          rows.length +
          " " +
          t("loaded") +
          '</p></div><a data-route="' +
          b.key +
          '" href="#/' +
          b.key +
          '">' +
          t("go") +
          " →</a></div>"
        );
      })
      .join("") +
    '<div class="toolbar"><strong>' +
    t("attention") +
    "</strong></div>" +
    rowsFor("attention")
      .slice(0, 5)
      .map(
        (r) =>
          '<div class="overview-item"><div><button class="row-button" data-open-attention="' +
          r.id +
          '">' +
          esc(r.fields.title) +
          "</button><p>" +
          esc(r.fields.owner) +
          " · " +
          esc(
            attentionReason(r, state.reviewTime) === "reason"
              ? r.fields.reason
              : t(attentionReason(r, state.reviewTime)),
          ) +
          "</p></div>" +
          badge(r.fields.status) +
          "</div>",
      )
      .join("") +
    '</div><div class="footer">' +
    t("scope") +
    "</div></div>"
  );
}
function render() {
  if (!state) return;
  document.documentElement.lang = locale;
  document.title = appConfig.appTitle[locale];
  const key = route(),
    base = appConfig.bases.find((b) => b.key === key),
    rs = rowsFor(key),
    att = state.records.filter((r) => attentionReason(r, state.reviewTime)),
    amounts = moneyByCurrency(
      base
        ? state.records.filter((r) => r.baseKey === key)
        : state.records.filter(
            (r) =>
              r.baseKey ===
              (appConfig.appId.endsWith("finance") ? "expenses" : "payments"),
          ),
    );
  const sums =
    Object.entries(amounts)
      .map(
        ([currency, amount]) => currency + " " + amount.toLocaleString(locale),
      )
      .join(" · ") || "—";
  root.innerHTML =
    '<div class="shell ' +
    (drawer ? "drawer" : "") +
    '"><button class="scrim" aria-label="Close menu" id="scrim"></button><aside class="sidebar"><div><div class="brand">' +
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
          '<a data-route="' +
          k +
          '" class="' +
          (key === k ? "active" : "") +
          '" href="#/' +
          k +
          '">' +
          icon(ic) +
          "<span>" +
          esc(label) +
          "</span>" +
          (appConfig.bases.some((b) => b.key === k)
            ? "<small>" +
              esc(
                state.totalCount[k] ??
                  state.records.filter((r) => r.baseKey === k).length + "+",
              ) +
              "</small>"
            : "") +
          "</a>",
      )
      .join("") +
    '</nav><div class="sidebar-bottom"><div class="subtle">' +
    t("asof") +
    "</div><strong>" +
    new Date(state.reviewTime).toISOString().slice(0, 10) +
    '</strong></div></aside><main class="main"><header class="header"><button class="menu" id="menu" aria-label="Open menu">' +
    icon("menu") +
    "</button><div><h1>" +
    esc(
      key === "overview"
        ? t("overview")
        : key === "attention"
          ? t("attention")
          : name(base || appConfig.bases[0]),
    ) +
    "</h1><p>" +
    esc(appConfig.appTitle[locale]) +
    " / " +
    t("readOnly") +
    '</p></div><div class="tools"><select id="locale" aria-label="' +
    t("language") +
    '"><option value="en" ' +
    (locale === "en" ? "selected" : "") +
    '>EN</option><option value="zh-CN" ' +
    (locale === "zh-CN" ? "selected" : "") +
    '>中文</option></select><button id="help" class="icon-button" title="' +
    t("help") +
    '" aria-label="' +
    t("help") +
    '">' +
    icon("help") +
    '</button><button id="settings" class="icon-button" title="' +
    t("settings") +
    '" aria-label="' +
    t("settings") +
    '">' +
    icon("settings") +
    '</button><button id="refresh" class="icon-button" title="' +
    t("refresh") +
    '" aria-label="' +
    t("refresh") +
    '">' +
    icon("refresh") +
    '</button></div></header><section class="metrics"><div class="metric"><label>' +
    t("watch") +
    "</label><strong>" +
    att.length +
    '</strong></div><div class="metric"><label>' +
    t(appConfig.appId.endsWith("cashier") ? "stale" : "paidMetric") +
    "</label><strong>" +
    state.records.filter((r) =>
      appConfig.appId.endsWith("cashier")
        ? isStaleBalance(r, state.reviewTime)
        : r.baseKey === "expenses" && r.fields.status === "paid",
    ).length +
    '</strong></div><div class="metric"><label>' +
    t(
      base
        ? "subtotal"
        : appConfig.appId.endsWith("finance")
          ? "expenseSubtotal"
          : "paymentSubtotal",
    ) +
    '</label><strong style="font-size:14px">' +
    esc(sums) +
    "</strong></div></section>" +
    (state.failures?.length
      ? '<div class="warning-banner">' +
        t("partialFailure") +
        ": " +
        state.failures
          .map(
            (f) =>
              esc(name(appConfig.bases.find((b) => b.key === f.key))) +
              " (" +
              esc(f.code) +
              ")",
          )
          .join(" · ") +
        "</div>"
      : "") +
    (key === "overview"
      ? overview()
      : '<section class="workspace ' +
        (selected ? "detail-open" : "") +
        '"><div class="toolbar"><input id="search" placeholder="' +
        t("search") +
        '" aria-label="' +
        t("search") +
        '" value="' +
        esc(query) +
        '"><select id="status" aria-label="' +
        t("all") +
        '"><option value="">' +
        t("all") +
        "</option>" +
        [
          ...new Set(
            state.records
              .filter((r) => key === "attention" || r.baseKey === key)
              .map((r) => r.fields.status),
          ),
        ]
          .map(
            (s) =>
              '<option value="' +
              esc(s) +
              '" ' +
              (status === s ? "selected" : "") +
              ">" +
              esc(t(s)) +
              "</option>",
          )
          .join("") +
        '</select><span class="count">' +
        rs.length +
        " " +
        t("loaded") +
        (base && state.totalCount[key] != null
          ? " / " + state.totalCount[key] + " " + t("records")
          : "") +
        '</span></div><div class="split"><div class="list">' +
        (rs.length
          ? table(rs, key)
          : '<div class="empty">' +
            t(state.failures?.some((f) => f.key === key) ? "error" : "empty") +
            "</div>") +
        '</div><aside class="detail">' +
        detail() +
        '</aside></div><footer class="footer"><span>' +
        t("scope") +
        "</span>" +
        (base
          ? '<button id="next" ' +
            (!state.pageInfo[key]?.nextCursor || loading ? "disabled" : "") +
            ">" +
            t("next") +
            "</button>"
          : "") +
        "</footer></section>") +
    "</main></div>";
  bind();
}
function bind() {
  document.querySelector("#locale").onchange = (e) => {
    locale = e.target.value;
    const url = new URL(location.href);
    url.searchParams.set("lang", locale);
    history.replaceState(null, "", url);
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
    drawer = true;
    render();
  };
  document.querySelector("#scrim").onclick = () => {
    drawer = false;
    render();
  };
  document.querySelectorAll("[data-route]").forEach(
    (a) =>
      (a.onclick = () => {
        drawer = false;
        selected = null;
        query = "";
        status = "";
      }),
  );
  document.querySelectorAll("[data-record]").forEach(
    (e) =>
      (e.onclick = () => {
        selected = e.dataset.record;
        render();
      }),
  );
  document.querySelectorAll("[data-open-attention]").forEach(
    (e) =>
      (e.onclick = () => {
        selected = e.dataset.openAttention;
        location.hash = "#/attention";
        render();
      }),
  );
  document.querySelector("#back")?.addEventListener("click", () => {
    selected = null;
    render();
  });
  document.querySelector("#status")?.addEventListener("change", (e) => {
    status = e.target.value;
    selected = null;
    render();
  });
  document.querySelector("#search")?.addEventListener("input", (e) => {
    const pos = e.target.selectionStart;
    query = e.target.value;
    selected = null;
    render();
    const el = document.querySelector("#search");
    el.focus();
    el.setSelectionRange(pos, pos);
  });
  document.querySelector("#next")?.addEventListener("click", next);
}
async function next() {
  if (loading) return;
  const key = route(),
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
    render();
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
    selected = null;
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
window.addEventListener("hashchange", () => {
  query = "";
  status = "";
  drawer = false;
  render();
});
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
