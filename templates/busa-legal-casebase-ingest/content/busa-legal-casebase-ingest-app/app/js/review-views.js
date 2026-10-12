import {
  DETAIL_MODES,
  ITEM_VIEW_STATUS,
  VIEW_BASE,
  activeLang,
  checks,
  detailUrl,
  els,
  entities,
  enumLabel,
  escapeAttr,
  escapeHtml,
  filteredChecks,
  filteredEntities,
  filteredItems,
  items,
  itemsForView,
  loadedCount,
  lockBanner,
  noticeBanner,
  recordById,
  recordUrl,
  state,
  t,
  unavailableBanner,
  viewLabel,
} from "../app.js";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeAttr(title)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeAttr(id)}" tabindex="0"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const muted = (text) => `<span class="muted">${escapeHtml(text)}</span>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (needs review / ready /
// blocked sit in the attention block, per-view totals next to each nav item).
function duplicateCandidates() {
  const metric = state.snapshot.metrics?.duplicate_candidates;
  if (metric != null) return metric;
  const flagged = items().filter((item) => {
    const score = Number(field(item, "duplicate_score", ""));
    return Number.isFinite(score) && (score > 1 ? score / 100 : score) >= 0.5;
  }).length;
  return state.pagination.items ? `${flagged}+` : flagged;
}

function metricsBand() {
  const metrics = state.snapshot.metrics || {};
  const alerts =
    metrics.pii_warnings ??
    (metrics.checks_failed != null && metrics.checks_warn != null
      ? metrics.checks_failed + metrics.checks_warn
      : loadedFlagged(checks(), "checks", (check) => check.status === "fail" || check.status === "warn"));
  const changes =
    state.workflowCount?.changes_requested ??
    loadedFlagged(items(), "items", (item) => item.status === "changes_requested");
  return [
    [t("redactionAlerts"), alerts],
    [t("changesRequestedMetric"), changes],
    [t("possibleDupes"), duplicateCandidates()],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function loadedFlagged(rows, key, predicate) {
  const count = rows.filter(predicate).length;
  return state.pagination[key] ? `${count}+` : count;
}

export function renderOverview() {
  const workspace = state.snapshot.workspace || {};
  const zh = activeLang() === "zh";
  document.getElementById("overviewTitle").textContent = (zh ? workspace.title_zh : workspace.title) || t("appTitle");
  const generated = dateTime(state.snapshot.generated_at);
  document.getElementById("overviewContext").textContent = [
    workspace.firm,
    workspace.jurisdiction,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewSummary").textContent = t("overviewLead");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const review = filteredItems("needs_review");
  const spotlight = review[0] || items()[0];
  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}${unavailableBanner()}
    <div class="overview-grid">
      <section class="card overview-panel">
        <div class="panel-head"><h2>${escapeHtml(t("intakeLine"))}</h2><a href="#/items">${escapeHtml(t("allItems"))}</a></div>
        ${spotlight ? spotlightHtml(spotlight) : emptyState(t("empty"))}
      </section>
      <div class="overview-side">
      <section class="card overview-panel">
        <div class="panel-head"><h2>${escapeHtml(t("manualQueue"))}</h2><a href="#/review">${escapeHtml(t("openQueue"))}</a></div>
        ${
          review
            .slice(0, 5)
            .map(
              (item) => `<a class="queue-row" href="${recordUrl(item.id, "review")}">
                <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.ref, field(item, "cause", item.category)].filter(Boolean).join(" · "))}</small></span>
                ${riskBadges(item.risk)}
              </a>`,
            )
            .join("") || `<div class="empty-inline">${escapeHtml(t("noReviewItems"))}</div>`
        }
      </section>
      <section class="card overview-panel">
        <div class="panel-head"><h2>${escapeHtml(t("activity"))}</h2></div>
        ${
          (state.snapshot.activity_log || [])
            .slice(0, 6)
            .map(
              (entry) => `<div class="activity-row">
                <span class="badge">${escapeHtml(enumLabel(entry.action, "activity"))}</span>
                <span>${escapeHtml(entry.detail || "")}</span>
                <span class="muted">${escapeHtml(dateTime(entry.at))}</span>
              </div>`,
            )
            .join("") || `<div class="empty-inline">${escapeHtml(t("empty"))}</div>`
        }
      </section>
      </div>
    </div>`;
}

function spotlightHtml(item) {
  const paragraphs = listValue(field(item, "paragraphs"));
  return `<a class="document-sheet" href="${recordUrl(item.id, item.status === "needs_review" ? "review" : "items")}">
      <div class="sheet-spine">${escapeHtml(field(item, "court", "") || "—")}</div>
      <div class="sheet-body">
        ${field(item, "procedure", "") ? `<span class="badge">${escapeHtml(field(item, "procedure"))}</span>` : ""}
        <h3>${escapeHtml(item.title || "")}</h3>
        <p>${escapeHtml(item.summary || "")}</p>
        <div class="field-grid">
          ${fieldTile(t("cause"), field(item, "cause", item.category))}
          ${fieldTile(t("outcome"), field(item, "outcome", ""))}
          ${fieldTile(t("sourceRefs"), paragraphs.join(", "))}
          ${fieldTile(t("extractionConfidence"), percentText(field(item, "extraction_confidence", "")))}
          ${fieldTile(t("duplicateScore"), field(item, "duplicate_score", ""))}
          ${fieldTile(t("casebaseBucket"), field(item, "ingest_bucket", ""))}
        </div>
      </div>
    </a>
    ${redactionRail(item, [
      [t("identities"), field(item, "pii_cleared", "")],
      [t("contactData"), field(item, "contacts_redacted", "")],
      [t("businessSecrets"), !listValue(item.risk).includes("business_secret")],
      [t("taxonomy"), Boolean(field(item, "cause", ""))],
    ])}`;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  items: "itemsHint",
  review: "reviewHint",
  approved: "approvedHint",
  done: "doneHint",
  blocked: "blockedHint",
  checks: "checksHint",
  entities: "entitiesHint",
};

function itemCount(list) {
  if (state.route.query) return loadedCount(list, "items");
  const status = ITEM_VIEW_STATUS[state.route.view];
  return (status ? state.workflowCount?.[status] : state.totalCount.items) ?? loadedCount(list, "items");
}

// Case first. Status only on "All case records" — every other item view is
// one status already named by its title. The queue's second column is the
// risk a reviewer triages by (the split pane shows only the first two).
function itemsTable(list) {
  const showStatus = state.route.view === "items";
  const columns = [
    [t("caseCol"), "", (item) => cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)],
    showStatus ? [t("status"), "col-status", (item) => cell(statusBadge(item.status))] : null,
    [t("risk"), "col-risk", (item) => cell(riskBadges(item.risk), (item.risk || []).map((risk) => enumLabel(risk, "risk")).join(", "))],
    [t("refCol"), "col-ref", (item) => cell(escapeHtml(item.ref || ""), item.ref)],
    [t("causeCol"), "", (item) => cell(escapeHtml(field(item, "cause", item.category)), field(item, "cause", item.category))],
    [t("courtCol"), "col-court", (item) => cell(escapeHtml(field(item, "court", "")), field(item, "court", ""))],
    [t("owner"), "col-owner", (item) => cell(escapeHtml(item.owner || ""), item.owner)],
    [t("updatedCol"), "col-date", (item) => cell(escapeHtml(shortDate(item.updated_at)))],
  ].filter(Boolean);
  return `<table class="ws-table casebase-table items-table">
    ${tableHead(columns.map(([label, className]) => [label, className]))}
    <tbody>${list.map((item) => `${rowOpen(item.id)}${columns.map(([, , render]) => render(item)).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

function checksTable(list) {
  return `<table class="ws-table casebase-table">
    ${tableHead([[t("checkCol")], [t("status"), "col-status"], [t("severity"), "col-owner"], [t("caseRecord"), "ws-col-wide"], [t("detail")]])}
    <tbody>${list
      .map((check) => {
        const caseTitle = caseTitleFor(check.item_id);
        return `${rowOpen(check.id)}
          ${cell(`<span class="strong">${escapeHtml(check.label)}</span>`, check.label)}
          ${cell(checkBadge(check.status))}
          ${cell(escapeHtml(enumLabel(check.severity, "severity")))}
          ${cell(caseTitle ? escapeHtml(caseTitle) : check.item_id ? muted(t("notLoaded")) : "", caseTitle)}
          ${cell(escapeHtml(check.detail || ""), check.detail)}
        </tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function entitiesTable(list) {
  return `<table class="ws-table casebase-table">
    ${tableHead([[t("group")], [t("status"), "col-status"], [t("meta"), "ws-col-wide"], [t("owner"), "col-owner"], [t("cases"), "ws-col-num"], [t("tags")]])}
    <tbody>${list
      .map(
        (entity) => `${rowOpen(entity.id)}
          ${cell(`<span class="strong">${escapeHtml(entity.title)}</span>`, entity.title)}
          ${cell(entity.status ? statusBadge(entity.status) : "")}
          ${cell(escapeHtml(entity.meta || ""), entity.meta)}
          ${cell(escapeHtml(entity.owner || ""), entity.owner)}
          ${cell(escapeHtml(entity.metrics?.case_count ?? ""), "", "ws-col-num")}
          ${cell((entity.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join(""), (entity.tags || []).join(", "))}
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
  const key = VIEW_BASE[view];
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  let list;
  let table;
  if (key === "checks") {
    list = filteredChecks();
    table = checksTable(list);
    els.viewCount.textContent = state.route.query ? loadedCount(list, "checks") : (state.totalCount.checks ?? loadedCount(list, "checks"));
  } else if (key === "entities") {
    list = filteredEntities();
    table = entitiesTable(list);
    els.viewCount.textContent = state.route.query
      ? loadedCount(list, "entities")
      : (state.totalCount.entities ?? loadedCount(list, "entities"));
  } else {
    list = itemsForView(view);
    table = itemsTable(list);
    els.viewCount.textContent = itemCount(list);
  }
  const empty = emptyState(state.route.query ? t("noMatches") : view === "review" ? t("noReviewItems") : t("empty"));
  els.listPanel.innerHTML = `${(state.settings?.unavailable || []).includes(key) ? unavailableBanner() : ""}${list.length ? table : empty}${loadMoreControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const key = VIEW_BASE[view];
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectInQueue"))}</div>` : "";
    return;
  }
  const record = recordById(key, selectedId);
  if (!record) {
    const pending = state.extra[key]?.has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${escapeHtml(t("loading"))}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = key === "checks" ? checkDetail(record) : key === "entities" ? entityDetail(record) : itemDetail(record);
}

function itemDetail(item) {
  const noteValue = state.edits.note[item.id] ?? item.review_note ?? "";
  const draftValue = state.edits.draft[item.id] ?? item.draft ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const relatedChecks = checks().filter((check) => check.item_id === item.id);
  return `
    <article class="record-detail">
      <header class="detail-head">
        <h2>${escapeHtml(item.title)}</h2>
        <div class="detail-meta">${[escapeHtml(item.ref || ""), statusBadge(item.status), riskBadges(item.risk)].filter(Boolean).join(" ")}</div>
      </header>
      ${lockBanner()}
      ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ""}
      <dl class="meta">
        <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(item.owner || "—")}</dd></div>
        <div><dt>${escapeHtml(t("category"))}</dt><dd>${escapeHtml(item.category || "—")}</dd></div>
        <div><dt>${escapeHtml(t("decision"))}</dt><dd>${item.decided_at ? `${escapeHtml(statusLabel(item.status))} · ${escapeHtml(dateTime(item.decided_at))}` : "—"}</dd></div>
      </dl>
      <section class="business-detail">
        <h3>${escapeHtml(t("redactionTitle"))}</h3>
        <div class="field-grid">
          ${fieldTile(t("court"), field(item, "court", ""))}
          ${fieldTile(t("cause"), field(item, "cause", item.category))}
          ${fieldTile(t("procedure"), field(item, "procedure", ""))}
          ${fieldTile(t("outcome"), field(item, "outcome", ""))}
          ${fieldTile(t("extractionConfidence"), percentText(field(item, "extraction_confidence", "")))}
          ${fieldTile(t("duplicateScore"), field(item, "duplicate_score", ""))}
          ${fieldTile(t("sourceRefs"), listValue(field(item, "paragraphs")).join(", "))}
          ${fieldTile(t("casebaseBucket"), field(item, "ingest_bucket", ""))}
        </div>
        ${redactionRail(item, [
          [t("parties"), field(item, "parties_redacted", "")],
          [t("contactData"), field(item, "contacts_redacted", "")],
          [t("businessSecrets"), !listValue(item.risk).includes("business_secret")],
        ])}
      </section>
      ${item.body ? `<section><h3>${escapeHtml(t("context"))}</h3><p>${escapeHtml(item.body)}</p></section>` : ""}
      ${item.recommendation ? `<section><h3>${escapeHtml(t("recommendation"))}</h3><p>${escapeHtml(item.recommendation)}</p></section>` : ""}
      ${(item.evidence || []).length ? `<section><h3>${escapeHtml(t("evidence"))}</h3><ul>${item.evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : ""}
      ${
        relatedChecks.length
          ? `<section><h3>${escapeHtml(t("checks"))}</h3>${relatedChecks
              .map(
                (check) =>
                  `<a class="queue-row" href="${recordUrl(check.id, "checks")}"><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail || "")}</small></span>${checkBadge(check.status)}</a>`,
              )
              .join("")}</section>`
          : ""
      }
      <label class="field"><span>${escapeHtml(t("editableDraft"))}</span><textarea data-draft="${escapeAttr(item.id)}" rows="5" ${disabled}>${escapeHtml(draftValue)}</textarea></label>
      <label class="field"><span>${escapeHtml(t("reviewNote"))}</span><textarea data-note="${escapeAttr(item.id)}" rows="2" ${disabled}>${escapeHtml(noteValue)}</textarea></label>
      ${noticeBanner()}
      <div class="detail-actions">
        <button type="button" class="button primary" data-action="approve" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("approve"))}" ${disabled}>${escapeHtml(t("approve"))}</button>
        <button type="button" class="button" data-action="request_changes" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("requestChanges"))}" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
        <button type="button" class="button" data-action="revise" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("saveRevision"))}" ${disabled}>${escapeHtml(t("saveRevision"))}</button>
        <button type="button" class="button danger" data-action="block" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("block"))}" ${disabled}>${escapeHtml(t("block"))}</button>
      </div>
    </article>`;
}

function checkDetail(check) {
  const caseTitle = caseTitleFor(check.item_id);
  return `
    <article class="record-detail">
      <header class="detail-head">
        <h2>${escapeHtml(check.label)}</h2>
        <div class="detail-meta">${checkBadge(check.status)} ${check.severity ? `<span class="badge">${escapeHtml(enumLabel(check.severity, "severity"))}</span>` : ""}</div>
      </header>
      ${check.detail ? `<p class="summary">${escapeHtml(check.detail)}</p>` : ""}
      <dl class="meta">
        <div><dt>${escapeHtml(t("caseRecord"))}</dt><dd>${
          caseTitle
            ? `<a href="${detailUrl(check.item_id, "items")}">${escapeHtml(caseTitle)}</a>`
            : check.item_id
              ? muted(t("notLoaded"))
              : "—"
        }</dd></div>
      </dl>
    </article>`;
}

function entityDetail(entity) {
  const metrics = Object.entries(entity.metrics || {});
  return `
    <article class="record-detail">
      <header class="detail-head">
        <h2>${escapeHtml(entity.title)}</h2>
        <div class="detail-meta">${[entity.meta ? muted(entity.meta) : "", entity.status ? statusBadge(entity.status) : ""].filter(Boolean).join(" ")}</div>
      </header>
      ${entity.summary ? `<p class="summary">${escapeHtml(entity.summary)}</p>` : ""}
      <dl class="meta">
        <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(entity.owner || "—")}</dd></div>
      </dl>
      ${
        metrics.length
          ? `<div class="field-grid">${metrics.map(([name, value]) => fieldTile(enumLabel(name, "metric"), value)).join("")}</div>`
          : ""
      }
      ${(entity.tags || []).length ? `<section><h3>${escapeHtml(t("tags"))}</h3><div class="badges">${entity.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div></section>` : ""}
    </article>`;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("configHint");
  const config = state.settings?.config_summary || {};
  document.getElementById("settingsBody").innerHTML = `
    <div id="settingsContent" class="settings-stack">
      ${unavailableBanner()}
      <section class="card settings-card">
        <h2>${escapeHtml(t("dataProvider"))}</h2>
        <p>${escapeHtml(state.settings?.demo ? t("demoData") : t("liveData"))}</p>
      </section>
      <section class="card settings-card"><h2>${escapeHtml(t("config"))}</h2>${jsonBlock(config)}</section>
      <section class="card settings-card"><h2>${escapeHtml(t("onboarding"))}</h2>${jsonBlock(state.settings?.onboarding || {})}</section>
      <section class="card settings-card"><h2>${escapeHtml(t("executionReport"))}</h2>${jsonBlock(state.settings?.execution_report || {})}</section>
    </div>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// A check names its case record by business id; show the record's title, or
// say it is not loaded — never the id.
function caseTitleFor(itemId) {
  return itemId ? recordById("items", itemId)?.title || "" : "";
}

function statusLabel(status) {
  const labels = {
    needs_review: t("needsReview"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
  };
  return labels[status] || enumLabel(status, "status");
}

function statusBadge(status) {
  return `<span class="badge status ${escapeAttr(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

function checkBadge(status) {
  return `<span class="badge status check-${escapeAttr(status)}">${escapeHtml(t(status))}</span>`;
}

function riskBadges(risks = []) {
  return (risks || []).map((risk) => `<span class="badge risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
}

function redactionRail(item, steps) {
  return `<div class="redaction-rail">${steps
    .map(([label, passed]) => {
      const known = passed !== "" && passed !== undefined && passed !== null;
      return `<div class="redaction-step ${!known ? "unknown" : passed ? "pass" : "warn"}"><span></span><strong>${escapeHtml(label)}</strong></div>`;
    })
    .join("")}</div>`;
}

export function field(item, key, fallback = "") {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : item?.metrics;
  const value = fields?.[key] ?? item?.[key];
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function listValue(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(String);
  if (typeof value === "string" && value.trim()) return value.split(/\s*[;；]\s*/).filter(Boolean);
  return [];
}

export function percentText(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${Math.round((number > 1 ? number : number * 100) * 10) / 10}%`;
}

export function fieldTile(label, value) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  return `<div class="field-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display === "" || display == null ? "—" : display)}</strong></div>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

export function dateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function shortDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { month: "short", day: "numeric" }).format(parsed);
}
