import {
  DETAIL_MODES,
  STATUS_ROUTES,
  activeLang,
  baseForView,
  checks,
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

const isPartial = (key) => Boolean(state.pagination[key]);

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Similarity is stored as 0–1 (0.86) or, from older imports, 0–100 (86).
function similarityPct(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, Math.round(number > 1 ? number : number * 100)));
}

const pctText = (value) => {
  const pct = similarityPct(value);
  return pct === null ? "—" : `${pct}%`;
};

const countText = (value) => {
  const number = numberOrNull(value);
  return number === null ? "—" : String(number);
};

// One bar per pack: its best-matching internal case. No similarity → no bar
// (the previous version drew a made-up 78%).
function matchMeter(item, href) {
  const pct = similarityPct(field(item, "top_similarity", ""));
  const jurisdiction = field(item, "jurisdiction", "");
  return `<a class="match-meter" href="${href}">
    <span class="match-copy"><strong>${escapeHtml(field(item, "query", "") || item.title)}</strong><small>${escapeHtml(
      [jurisdiction, item.title].filter(Boolean).join(" · "),
    )}</small></span>
    <span class="meter">${pct === null ? "" : `<span style="width:${pct}%"></span>`}</span>
    <b class="num">${pct === null ? "—" : `${pct}%`}</b>
  </a>`;
}

function noticeBanner() {
  return state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : "";
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries needs-review,
// approved and blocked). The pinned SDK has no records.groupBy, so the
// high-match sum is exact only when every research pack is loaded; otherwise
// it shows "—" rather than a partial sum dressed as a total.
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const loaded = items();
  const partial = isPartial("items");
  const total = state.totalCount.items ?? (partial ? `${loaded.length}+` : loaded.length);
  const high =
    metrics.high_matches ??
    (partial ? "—" : loaded.reduce((sum, item) => sum + (numberOrNull(field(item, "high_match_count", "")) || 0), 0));
  const checksTotal = state.totalCount.checks ?? checks().length;
  const passing = metrics.checks_pass ?? checks().filter((check) => check.status === "pass").length;
  const checksPartial = state.totalCount.checks == null && isPartial("checks");
  return [
    [t("researchPacks"), total, ""],
    [t("highMatches"), high, high === "—" ? t("exactNeedsAll") : ""],
    [t("citationChecks"), `${passing}/${checksTotal}${checksPartial ? "+" : ""}`, t("citationChecksHint")],
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

  const loaded = items();
  const queue = loaded.filter((item) => item.status === "needs_review");
  const patterns = loaded.filter((item) => field(item, "court_pattern", "")).slice(0, 4);
  const activity = (state.snapshot.activity_log || []).slice(0, 5);
  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}
    <div class="overview-grid">
      <section class="card overview-panel research-panel">
        <div class="panel-head">
          <h2>${escapeHtml(t("researchLab"))}</h2>
          <a href="#/items">${escapeHtml(t("allItems"))}</a>
        </div>
        <div class="match-head"><span>${escapeHtml(t("researchQuestion"))}</span><span>${escapeHtml(t("topSimilarity"))}</span></div>
        ${
          loaded
            .slice(0, 6)
            .map((item) => matchMeter(item, detailUrl(item.id, "items")))
            .join("") || emptyState(t("empty"))
        }
      </section>
      <div class="overview-side">
        <section class="card overview-panel">
          <div class="panel-head"><h2>${escapeHtml(t("reviewQueue"))}</h2><a href="#/review">${escapeHtml(t("needsReview"))}</a></div>
          ${
            queue
              .slice(0, 5)
              .map(
                (item) => `<a class="queue-row" href="${recordUrl(item.id, "review")}">
              <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.ref, item.owner].filter(Boolean).join(" · "))}</small></span>
              <small class="num">${escapeHtml(pctText(field(item, "top_similarity", "")))}</small>
            </a>`,
              )
              .join("") || `<div class="empty-inline">${escapeHtml(t("queueEmpty"))}</div>`
          }
        </section>
        <section class="card overview-panel">
          <h2>${escapeHtml(t("courtPattern"))}</h2>
          ${
            patterns
              .map(
                (item) =>
                  `<div class="pattern-note"><b>${escapeHtml(field(item, "jurisdiction", "") || item.category || "—")}</b><span>${escapeHtml(field(item, "court_pattern", ""))}</span></div>`,
              )
              .join("") || `<div class="empty-inline">${escapeHtml(t("empty"))}</div>`
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
    [t("pack")],
    ...(withStatus ? [[t("status"), "ws-col-narrow status-col"]] : []),
    [t("jurisdiction"), "jurisdiction-col"],
    [t("category")],
    [t("matches"), "ws-col-num"],
    [t("topSimilarity"), "ws-col-num"],
    [t("citations"), "ws-col-num"],
    [t("owner"), "ws-col-narrow"],
  ];
  return `<table class="ws-table pack-table">
    ${tableHead(columns)}
    <tbody>${rows
      .map((item) => {
        const jurisdiction = field(item, "jurisdiction", "");
        return `${rowOpen(item.id)}
        ${cell(`<span class="strong">${escapeHtml(item.title)}</span>${item.ref ? ` ${muted(item.ref)}` : ""}`, { title: item.title })}
        ${withStatus ? cell(statusBadge(item.status), { className: "status-col" }) : ""}
        ${cell(escapeHtml(jurisdiction || "—"), { title: jurisdiction })}
        ${cell(escapeHtml(item.category || ""), { title: item.category })}
        ${cell(escapeHtml(countText(field(item, "match_count", ""))), { className: "ws-col-num" })}
        ${cell(escapeHtml(pctText(field(item, "top_similarity", ""))), { className: "ws-col-num" })}
        ${cell(escapeHtml(countText(field(item, "citation_count", ""))), { className: "ws-col-num" })}
        ${cell(escapeHtml(item.owner || ""), { title: item.owner })}
      </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

// A check names its research pack by business id; show the pack's title, or
// say it is not loaded — never the id.
function packLink(itemId) {
  if (!itemId) return "";
  const pack = recordById("items", itemId);
  return pack ? `<a href="${detailUrl(pack.id, "items")}">${escapeHtml(pack.title)}</a>` : muted(t("notLoaded"));
}

function checksTable(rows) {
  return `<table class="ws-table">
    ${tableHead([
      [t("check")],
      [t("status"), "ws-col-narrow"],
      [t("severity"), "ws-col-narrow"],
      [t("researchPack"), "ws-col-wide"],
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

function entitiesTable(rows) {
  return `<table class="ws-table">
    ${tableHead([
      [t("cluster")],
      [t("status"), "ws-col-narrow"],
      [t("meta"), "ws-col-wide"],
      [t("owner"), "ws-col-narrow"],
      [t("caseCount"), "ws-col-num"],
      [t("avgSimilarity"), "ws-col-num"],
      [t("citations"), "ws-col-num"],
    ])}
    <tbody>${rows
      .map(
        (entity) => `${rowOpen(entity.id)}
        ${cell(`<span class="strong">${escapeHtml(entity.title)}</span>`, { title: entity.title })}
        ${cell(statusBadge(entity.status))}
        ${cell(escapeHtml(entity.meta || ""), { title: entity.meta })}
        ${cell(escapeHtml(entity.owner || ""), { title: entity.owner })}
        ${cell(escapeHtml(countText(entity.metrics?.case_count)), { className: "ws-col-num" })}
        ${cell(escapeHtml(pctText(entity.metrics?.avg_similarity)), { className: "ws-col-num" })}
        ${cell(escapeHtml(countText(entity.metrics?.citation_count)), { className: "ws-col-num" })}
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
  const table =
    view === "checks" ? checksTable(rows) : view === "entities" ? entitiesTable(rows) : itemsTable(rows, view);
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectPack")) : "";
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
  const decision = item.decision_action
    ? `${statusLabel(
        { approve: "approved", request_changes: "changes_requested", block: "blocked", revise: "needs_review" }[
          item.decision_action
        ],
      )}${item.decided_at ? ` · ${dateTime(item.decided_at)}` : ""}`
    : "";
  const matchCount = numberOrNull(field(item, "match_count", ""));
  const highCount = numberOrNull(field(item, "high_match_count", ""));
  const matchesText =
    matchCount === null ? "—" : highCount === null ? String(matchCount) : t("matchesOfHigh").replace("{n}", matchCount).replace("{high}", highCount);
  const evidence = listValue(item.evidence);
  const related = checks().filter((check) => check.item_id === item.id);
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
      <dt>${escapeHtml(t("researchQuestion"))}</dt><dd>${escapeHtml(field(item, "query", "") || "—")}</dd>
      <dt>${escapeHtml(t("jurisdiction"))}</dt><dd>${escapeHtml(field(item, "jurisdiction", "") || "—")}</dd>
      <dt>${escapeHtml(t("matches"))}</dt><dd class="num">${escapeHtml(matchesText)}</dd>
      <dt>${escapeHtml(t("similarity"))}</dt><dd class="num">${escapeHtml(
        t("similarityPair")
          .replace("{top}", pctText(field(item, "top_similarity", "")))
          .replace("{avg}", pctText(field(item, "avg_similarity", ""))),
      )}</dd>
      <dt>${escapeHtml(t("citations"))}</dt><dd class="num">${escapeHtml(countText(field(item, "citation_count", "")))}</dd>
      <dt>${escapeHtml(t("risk"))}</dt><dd>${riskBadges(item.risk) || "—"}</dd>
      ${item.proposed_action ? `<dt>${escapeHtml(t("proposedAction"))}</dt><dd>${escapeHtml(enumLabel("enumAction", item.proposed_action))}</dd>` : ""}
      ${decision ? `<dt>${escapeHtml(t("decision"))}</dt><dd>${escapeHtml(decision)}</dd>` : ""}
    </dl>
    ${section(t("context"), item.body)}
    ${section(t("courtPattern"), field(item, "court_pattern", ""))}
    ${section(t("recommendation"), item.recommendation)}
    ${evidence.length ? `<section class="detail-section"><h3>${escapeHtml(t("citedCases"))}</h3><ul class="citation-list">${evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : ""}
    ${
      related.length
        ? `<section class="detail-section"><h3>${escapeHtml(t("checks"))}</h3>${related
            .map(
              (check) =>
                `<a class="queue-row" href="${recordUrl(check.id, "checks")}"><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail || "")}</small></span>${statusBadge(check.status)}</a>`,
            )
            .join("")}</section>`
        : ""
    }
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
      <dt>${escapeHtml(t("researchPack"))}</dt><dd>${packLink(check.item_id) || "—"}</dd>
      ${pack ? `<dt>${escapeHtml(t("status"))}</dt><dd>${statusBadge(pack.status)}</dd>` : ""}
      ${pack ? `<dt>${escapeHtml(t("jurisdiction"))}</dt><dd>${escapeHtml(field(pack, "jurisdiction", "") || "—")}</dd>` : ""}
      ${pack ? `<dt>${escapeHtml(t("topSimilarity"))}</dt><dd class="num">${escapeHtml(pctText(field(pack, "top_similarity", "")))}</dd>` : ""}
    </dl>
  </article>`;
}

function metricLabel(key) {
  const known = { case_count: "caseCount", avg_similarity: "avgSimilarity", citation_count: "citations" };
  return known[key] ? t(known[key]) : key.replaceAll("_", " ");
}

function metricDisplay(key, value) {
  return key.includes("similarity") ? pctText(value) : String(value ?? "—");
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
      ${metrics.map(([key, value]) => `<dt>${escapeHtml(metricLabel(key))}</dt><dd class="num">${escapeHtml(metricDisplay(key, value))}</dd>`).join("")}
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
