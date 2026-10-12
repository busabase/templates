import {
  DETAIL_MODES,
  STATUS_ROUTES,
  activeLang,
  baseForView,
  detailUrl,
  els,
  enumLabel,
  escapeAttr,
  escapeHtml,
  items,
  lockBanner,
  recordById,
  recordUrl,
  rowsForRoute,
  state,
  t,
  viewLabel,
} from "../app.js";

const NEAR_DEADLINE_DAYS = 14;
const OPEN_STATUSES = new Set(["needs_review", "changes_requested", "approved"]);
const VIEW_HINT = {
  items: "allItemsHint",
  review: "reviewHint",
  approved: "approvedHint",
  done: "doneHint",
  blocked: "blockedHint",
  checks: "checksHint",
  entities: "entitiesHint",
};

// ── Small helpers ──────────────────────────────────────────────────────────
export function field(item, key, fallback = "") {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : item?.metrics;
  return fields?.[key] ?? item?.[key] ?? fallback;
}

export function listValue(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(String);
  if (typeof value === "string" && value.trim()) return value.split(/\s*[;；]\s*/).filter(Boolean);
  return [];
}

const cell = (html, { title = "", className = "" } = {}) =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeAttr(title)}"` : ""}>${html}</td>`;

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeAttr(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

const muted = (text) => `<span class="muted">${escapeHtml(text)}</span>`;

export function statusLabel(status) {
  const labels = {
    needs_review: t("needsReview"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
    pass: t("pass"),
    warn: t("warn"),
    fail: t("fail"),
  };
  return labels[status] || enumLabel("enumStatus", status);
}

const STATUS_TONE = {
  needs_review: "warning",
  changes_requested: "active",
  approved: "positive",
  done: "positive",
  blocked: "danger",
  pass: "positive",
  warn: "warning",
  fail: "danger",
};

export function statusBadge(status) {
  if (!status) return "";
  return `<span class="badge ${STATUS_TONE[status] || ""}">${escapeHtml(statusLabel(status))}</span>`;
}

const riskBadges = (risks) =>
  listValue(risks)
    .map((risk) => `<span class="badge">${escapeHtml(enumLabel("enumRisk", risk))}</span>`)
    .join(" ");

function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

const gapCount = (item) => {
  const value = field(item, "evidence_gap_count", undefined);
  if (value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  return listValue(field(item, "evidence_gaps_list", [])).length;
};

const isPartial = (key) => Boolean(state.pagination[key]);

function nearDeadline(item, now = Date.now()) {
  const deadline = Date.parse(field(item, "deadline", ""));
  if (!Number.isFinite(deadline) || !OPEN_STATUSES.has(item.status)) return false;
  return deadline - now <= NEAR_DEADLINE_DAYS * 86_400_000;
}

function issueColumn(title, values) {
  const list = listValue(values);
  return `<div class="issue-column"><h3>${escapeHtml(title)}</h3>${(list.length ? list : ["—"])
    .slice(0, 5)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("")}</div>`;
}

// Renders an issue tree: nested {label, children} nodes become an indented hierarchy;
// a flat string array falls back to a simple list.
function issueTree(title, values) {
  const raw = Array.isArray(values) ? values : listValue(values);
  const nodes = raw.length ? raw : ["—"];
  return `<div class="issue-column issue-tree"><h3>${escapeHtml(title)}</h3><ul class="tree">${nodes
    .slice(0, 6)
    .map((node) => {
      if (node && typeof node === "object") {
        const label = node.label || node.issue || node.title || "";
        const children = listValue(node.children || node.subs || node.sub_issues);
        return `<li><span class="tree-node">${escapeHtml(label)}</span>${
          children.length ? `<ul>${children.map((child) => `<li>${escapeHtml(child)}</li>`).join("")}</ul>` : ""
        }</li>`;
      }
      return `<li><span class="tree-node">${escapeHtml(node)}</span></li>`;
    })
    .join("")}</ul></div>`;
}

const strategyBoard = (item) => `<div class="issue-board">
    ${issueTree(t("issueTree"), field(item, "issue_tree", []))}
    ${issueColumn(t("evidenceGaps"), field(item, "evidence_gaps_list", []))}
    ${issueColumn(t("negotiationOptions"), field(item, "negotiation_options", []))}
  </div>`;

function noticeBanner() {
  return state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : "";
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries needs-review,
// ready-to-draft and blocked). The pinned SDK has no records.groupBy, so the
// evidence-gap sum is exact only when every strategy pack is loaded; otherwise
// it shows "—" rather than a partial sum dressed as a total.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const loaded = items();
  const partial = isPartial("items");
  const total = state.totalCount.items ?? (partial ? `${loaded.length}+` : loaded.length);
  const gaps = metrics.evidence_gaps ?? (partial ? "—" : loaded.reduce((sum, item) => sum + gapCount(item), 0));
  const soon = metrics.deadlines_soon ?? loaded.filter((item) => nearDeadline(item)).length;
  const scope = partial && metrics.deadlines_soon == null ? ` · ${t("loadedScope").replace("{n}", loaded.length)}` : "";
  return [
    [t("activeMatters"), total, ""],
    [t("evidenceGaps"), gaps, gaps === "—" ? t("exactNeedsAll") : ""],
    [t("nearDeadlines") + scope, soon, ""],
  ]
    .map(
      ([label, value, title]) =>
        `<div${title ? ` title="${escapeAttr(title)}"` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const workspace = state.snapshot.workspace || {};
  document.getElementById("overviewTitle").textContent = t("overview");
  document.getElementById("overviewSummary").textContent = [
    t("overviewLead"),
    workspace.firm,
    workspace.jurisdiction,
    state.snapshot.generated_at ? `${t("generated")} ${dateTime(state.snapshot.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const queue = items().filter((item) => item.status === "needs_review");
  const focus = queue[0] || items()[0];
  const activity = (state.snapshot.activity_log || []).slice(0, 5);
  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}
    <div class="overview-grid">
      <section class="card overview-panel strategy-panel">
        <div class="panel-head">
          <h2>${escapeHtml(t("strategyMap"))}</h2>
          ${focus ? `<a href="${detailUrl(focus.id, "items")}">${escapeHtml(focus.title)}</a>` : ""}
        </div>
        ${
          focus
            ? `${strategyBoard(focus)}
        <div class="deadline-band">
          <span>${escapeHtml(t("nextDeadline"))}</span>
          <strong>${escapeHtml(field(focus, "deadline", "") || "—")}</strong>
          <p>${escapeHtml(field(focus, "posture", "") || focus.recommendation || "")}</p>
        </div>`
            : emptyState(t("empty"))
        }
      </section>
      <div class="overview-side">
        <section class="card overview-panel">
          <div class="panel-head"><h2>${escapeHtml(t("partnerQueue"))}</h2><a href="#/review">${escapeHtml(t("needsReview"))}</a></div>
          ${
            queue
              .slice(0, 5)
              .map(
                (item) => `<a class="queue-row" href="${recordUrl(item.id, "review")}">
              <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.ref, item.owner].filter(Boolean).join(" · "))}</small></span>
              <small class="num">${escapeHtml(field(item, "deadline", ""))}</small>
            </a>`,
              )
              .join("") || `<div class="empty-inline">${escapeHtml(t("queueEmpty"))}</div>`
          }
        </section>
      </div>
      <section class="card overview-panel overview-wide">
        <h2>${escapeHtml(t("activity"))}</h2>
        <div class="activity-list">${
          activity
            .map(
              (entry) =>
                `<div><b>${escapeHtml(enumLabel("enumActivity", entry.action))}</b><span>${escapeHtml(entry.detail || "")}</span><small class="muted">${escapeHtml(dateTime(entry.at))}</small></div>`,
            )
            .join("") || `<div class="empty-inline">${escapeHtml(t("empty"))}</div>`
        }</div>
      </section>
    </div>`;
}

// ── Record views ───────────────────────────────────────────────────────────
function itemsTable(rows, view) {
  // A status view already filters to one status; the column would repeat it.
  const withStatus = !STATUS_ROUTES.has(view) && view !== "review";
  const columns = [
    [t("strategy")],
    ...(withStatus ? [[t("status"), "col-status"]] : []),
    [t("deadline"), "col-date"],
    [t("category")],
    [t("stage"), "ws-col-narrow"],
    [t("owner"), "ws-col-narrow"],
    [t("evidenceGaps"), "ws-col-num"],
  ];
  return `<table class="ws-table">
    ${tableHead(columns)}
    <tbody>${rows
      .map((item) => {
        const stage = field(item, "matter_stage", "");
        return `${rowOpen(item.id)}
        ${cell(`<span class="strong">${escapeHtml(item.title)}</span>${item.ref ? ` ${muted(item.ref)}` : ""}`, { title: item.title })}
        ${withStatus ? cell(statusBadge(item.status)) : ""}
        ${cell(escapeHtml(field(item, "deadline", "") || "—"), { className: "num" })}
        ${cell(escapeHtml(item.category || ""), { title: item.category })}
        ${cell(escapeHtml(stage), { title: stage })}
        ${cell(escapeHtml(item.owner || ""), { title: item.owner })}
        ${cell(escapeHtml(gapCount(item)), { className: "ws-col-num" })}
      </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

// A check names its strategy pack by business id; show the pack's title, or
// say it is not loaded — never the id.
function packLink(itemId) {
  if (!itemId) return "";
  const pack = recordById("items", itemId);
  return pack
    ? `<a href="${detailUrl(pack.id, "items")}">${escapeHtml(pack.title)}</a>`
    : muted(t("notLoaded"));
}

function checksTable(rows) {
  return `<table class="ws-table">
    ${tableHead([
      [t("check")],
      [t("status"), "col-status"],
      [t("severity"), "ws-col-narrow"],
      [t("strategyPack"), "ws-col-wide"],
      [t("detail")],
    ])}
    <tbody>${rows
      .map(
        (check) => `${rowOpen(check.id)}
        ${cell(`<span class="strong">${escapeHtml(check.label)}</span>`, { title: check.label })}
        ${cell(statusBadge(check.status))}
        ${cell(escapeHtml(enumLabel("enumSeverity", check.severity)))}
        ${cell(packLink(check.item_id), { title: recordById("items", check.item_id)?.title || "" })}
        ${cell(escapeHtml(check.detail || ""), { title: check.detail })}
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

const metricValue = (entity, key) => {
  const value = entity.metrics?.[key];
  return value === undefined || value === null || value === "" ? "—" : value;
};

function entitiesTable(rows) {
  return `<table class="ws-table">
    ${tableHead([
      [t("matter")],
      [t("status"), "col-status"],
      [t("meta"), "ws-col-wide"],
      [t("owner"), "ws-col-narrow"],
      [t("evidenceGaps"), "ws-col-num"],
      [t("issueCount"), "ws-col-num"],
      [t("optionCount"), "ws-col-num"],
    ])}
    <tbody>${rows
      .map(
        (entity) => `${rowOpen(entity.id)}
        ${cell(`<span class="strong">${escapeHtml(entity.title)}</span>`, { title: entity.title })}
        ${cell(statusBadge(entity.status))}
        ${cell(escapeHtml(entity.meta || ""), { title: entity.meta })}
        ${cell(escapeHtml(entity.owner || ""), { title: entity.owner })}
        ${cell(escapeHtml(metricValue(entity, "evidence_gaps")), { className: "ws-col-num" })}
        ${cell(escapeHtml(metricValue(entity, "issue_count")), { className: "ws-col-num" })}
        ${cell(escapeHtml(metricValue(entity, "option_count")), { className: "ws-col-num" })}
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function loadMoreControl(key) {
  if (!state.pagination[key]) return "";
  return `<div class="load-more"><button type="button" class="button" data-load-more="${escapeAttr(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${escapeHtml(state.loadingMore[key] ? t("loadingMore") : t("loadMore"))}</button>${state.loadMoreError[key] ? `<span role="alert">${escapeHtml(t("loadMoreFailed"))}</span>` : ""}</div>`;
}

export function renderRecordView() {
  const { view } = state.route;
  const key = baseForView(view);
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const rows = rowsForRoute();
  els.viewCount.textContent = `${rows.length}${isPartial(key) ? "+" : ""}`;
  if (els.search.value !== state.route.query) els.search.value = state.route.query;
  const sideError = state.settings?.sideErrors?.[key];
  const table = view === "checks" ? checksTable(rows) : view === "entities" ? entitiesTable(rows) : itemsTable(rows, view);
  els.listPanel.innerHTML = sideError
    ? emptyState(t("sideReadFailed"), sideError)
    : `${rows.length ? table : emptyState(state.route.query ? t("noMatches") : t("empty"))}${loadMoreControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectStrategy")) : "";
    return;
  }
  const key = baseForView(view);
  const record = recordById(key, selectedId);
  if (!record) {
    const pending = state.extra[key]?.has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${escapeHtml(t("loading"))}</div>`
      : emptyState(t("recordMissing"));
    return;
  }
  els.detailBody.innerHTML =
    key === "checks" ? checkDetail(record) : key === "entities" ? entityDetail(record) : itemDetail(record);
}

const section = (title, body) =>
  body ? `<section class="detail-section"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></section>` : "";

function itemDetail(item) {
  const noteValue = state.edits.note[item.id] ?? item.review_note ?? "";
  const draftValue = state.edits.draft[item.id] ?? item.draft ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const stage = field(item, "matter_stage", "");
  const decision = item.decision_action
    ? `${statusLabel(
        { approve: "approved", request_changes: "changes_requested", block: "blocked", revise: "needs_review" }[
          item.decision_action
        ],
      )}${item.decided_at ? ` · ${dateTime(item.decided_at)}` : ""}`
    : "";
  const evidence = listValue(item.evidence);
  return `<article class="pack-detail">
    <header class="detail-head">
      <h2>${escapeHtml(item.title)}</h2>
      <div class="detail-sub">${statusBadge(item.status)}${escapeHtml([item.ref, item.owner, item.category].filter(Boolean).join(" · "))}</div>
    </header>
    ${lockBanner()}
    ${noticeBanner()}
    <div class="detail-actions">
      <button type="button" class="button primary" data-action="approve" data-id="${escapeAttr(item.id)}" ${disabled}>${escapeHtml(t("approve"))}</button>
      <button type="button" class="button" data-action="request_changes" data-id="${escapeAttr(item.id)}" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
      <button type="button" class="button danger" data-action="block" data-id="${escapeAttr(item.id)}" ${disabled}>${escapeHtml(t("block"))}</button>
    </div>
    ${item.summary ? `<p class="detail-summary">${escapeHtml(item.summary)}</p>` : ""}
    <dl class="detail-fields">
      <dt>${escapeHtml(t("stage"))}</dt><dd>${escapeHtml(stage || "—")}</dd>
      <dt>${escapeHtml(t("deadline"))}</dt><dd>${escapeHtml(field(item, "deadline", "") || "—")}</dd>
      <dt>${escapeHtml(t("evidenceGaps"))}</dt><dd>${escapeHtml(gapCount(item))}</dd>
      <dt>${escapeHtml(t("risk"))}</dt><dd>${riskBadges(item.risk) || "—"}</dd>
      ${decision ? `<dt>${escapeHtml(t("decision"))}</dt><dd>${escapeHtml(decision)}</dd>` : ""}
    </dl>
    ${section(t("context"), item.body)}
    ${section(t("recommendation"), item.recommendation)}
    ${section(t("posture"), field(item, "posture", ""))}
    <section class="detail-section">
      <h3>${escapeHtml(t("strategyStructure"))}</h3>
      ${strategyBoard(item)}
    </section>
    ${section(t("pleadingOutline"), field(item, "pleading_outline", ""))}
    ${evidence.length ? `<section class="detail-section"><h3>${escapeHtml(t("evidence"))}</h3><ul>${evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : ""}
    <label class="field"><span>${escapeHtml(t("editableDraft"))}</span><textarea data-draft="${escapeAttr(item.id)}" rows="6" ${disabled}>${escapeHtml(draftValue)}</textarea></label>
    <label class="field"><span>${escapeHtml(t("reviewNote"))}</span><textarea data-note="${escapeAttr(item.id)}" rows="3" ${disabled}>${escapeHtml(noteValue)}</textarea></label>
    <div class="detail-actions">
      <button class="button" type="button" data-action="revise" data-id="${escapeAttr(item.id)}" ${disabled}>${escapeHtml(t("saveRevision"))}</button>
    </div>
  </article>`;
}

function checkDetail(check) {
  const pack = recordById("items", check.item_id);
  return `<article class="pack-detail">
    <header class="detail-head">
      <h2>${escapeHtml(check.label)}</h2>
      <div class="detail-sub">${statusBadge(check.status)}${escapeHtml(enumLabel("enumSeverity", check.severity))}</div>
    </header>
    ${check.detail ? `<p class="detail-summary">${escapeHtml(check.detail)}</p>` : ""}
    <dl class="detail-fields">
      <dt>${escapeHtml(t("strategyPack"))}</dt><dd>${packLink(check.item_id) || "—"}</dd>
      ${pack ? `<dt>${escapeHtml(t("status"))}</dt><dd>${statusBadge(pack.status)}</dd>` : ""}
      ${pack ? `<dt>${escapeHtml(t("deadline"))}</dt><dd>${escapeHtml(field(pack, "deadline", "") || "—")}</dd>` : ""}
    </dl>
  </article>`;
}

function metricLabel(key) {
  const known = { evidence_gaps: "evidenceGaps", issue_count: "issueCount", option_count: "optionCount" };
  return known[key] ? t(known[key]) : key.replaceAll("_", " ");
}

function entityDetail(entity) {
  const metrics = Object.entries(entity.metrics || {});
  return `<article class="pack-detail">
    <header class="detail-head">
      <h2>${escapeHtml(entity.title)}</h2>
      <div class="detail-sub">${statusBadge(entity.status)}${escapeHtml(entity.meta || "")}</div>
    </header>
    ${entity.summary ? `<p class="detail-summary">${escapeHtml(entity.summary)}</p>` : ""}
    <dl class="detail-fields">
      <dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(entity.owner || "—")}</dd>
      ${metrics.map(([key, value]) => `<dt>${escapeHtml(metricLabel(key))}</dt><dd class="num">${escapeHtml(value)}</dd>`).join("")}
      <dt>${escapeHtml(t("tags"))}</dt><dd>${(entity.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join(" ") || "—"}</dd>
    </dl>
  </article>`;
}

// ── Settings ───────────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("settingsHint");
  const config = state.settings?.config_summary || {};
  const sideErrors = Object.entries(state.settings?.sideErrors || {});
  document.getElementById("settingsContent").innerHTML = `
    <div class="settings">
      ${sideErrors.length ? `<div class="notice-banner">${sideErrors.map(([key, message]) => `${escapeHtml(t("sideReadFailed"))} (${escapeHtml(key)}): ${escapeHtml(message)}`).join("<br>")}</div>` : ""}
      <section class="card"><h2>${escapeHtml(t("config"))}</h2>${jsonBlock(config)}</section>
      <section class="card"><h2>${escapeHtml(t("onboarding"))}</h2>${jsonBlock(state.settings?.onboarding || {})}</section>
      <section class="card"><h2>${escapeHtml(t("executionReport"))}</h2>${jsonBlock(state.settings?.execution_report || {})}</section>
    </div>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}
