// Page renderers for Busa Retail Intel. State, routing and data loading live
// in ../app.js; this module only turns that state into markup.
import {
  DETAIL_MODES,
  dateTime,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  hasMore,
  isConnected,
  isMobileLayout,
  itemsForView,
  recordById,
  recordTotal,
  recordUrl,
  state,
  t,
  VIEW_KINDS,
  viewLabel,
} from "../app.js";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const muted = (text) => `<span class="muted">${escapeHtml(text)}</span>`;

export function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function priorityBadge(priority) {
  return priority ? `<span class="badge ${escapeHtml(priority)}">${escapeHtml(enumLabel(priority, "priority"))}</span>` : "";
}

function riskBadges(risk = []) {
  return risk.map((entry) => `<span class="badge risk">${escapeHtml(enumLabel(entry, "risk"))}</span>`).join(" ");
}

function itemLabel(item) {
  return item.title || item.channel || item.label || t("untitled");
}

function itemSummary(item) {
  return item.summary || item.effective_body || item.body || item.coverage || "";
}

// Linked ids are business ids (`signal-3`, `action-1`). Resolve them to the
// target's title; when the target is not on the loaded page, say so — never
// print the id.
function linkTo(view, id) {
  if (!id) return "";
  const target = recordById(view, id);
  return target
    ? `<a href="${recordUrl(id, view)}">${escapeHtml(itemLabel(target))}</a>`
    : muted(t("notLoaded"));
}

function linkText(view, id) {
  if (!id) return "";
  const target = recordById(view, id);
  return target ? itemLabel(target) : t("notLoaded");
}

function noticeBanner(id) {
  const notice = state.notice;
  if (!notice || (notice.id && notice.id !== id)) return "";
  return `<div class="decision-feedback ${escapeHtml(notice.tone)}" role="status">${escapeHtml(notice.text)}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not show: how big today's batch is per kind.
// Exact (records.count) when available; a loaded-page count says `+`.
function metricsBand() {
  return [
    ["signals", t("signals")],
    ["actions", t("actions")],
    ["drafts", t("drafts")],
  ]
    .map(([key, label]) => `<a href="#/${key}"><span>${escapeHtml(label)}</span><strong>${recordTotal(key)}</strong></a>`)
    .join("");
}

function overviewRow(view, item) {
  return `
    <a class="overview-row" href="${recordUrl(item.id, view)}">
      <span class="overview-row-ref">#${escapeHtml(item.ref)}</span>
      <span class="overview-row-title" title="${escapeHtml(itemSummary(item))}">${escapeHtml(itemLabel(item))}</span>
      ${statusBadge(item.status)}
    </a>
  `;
}

export function renderOverview() {
  const b = state.batch || {};
  const summary = byIdOrNull("overviewSummary");
  summary.textContent = [
    b.buyer ? `${t("buyer")}: ${b.buyer}` : "",
    b.generated_at ? `${t("generated")} ${dateTime(b.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  summary.title = b.offer || "";
  byIdOrNull("overviewBanner").innerHTML = state.bootstrap?.demo
    ? `<div class="demo-banner"><strong>${t("demoModeTitle")}</strong><span>${t("demoModeBody")}</span></div>`
    : "";
  const metrics = byIdOrNull("overviewMetrics");
  const body = byIdOrNull("overviewBody");
  if (!isConnected()) {
    metrics.hidden = true;
    body.innerHTML = emptyState(t("setupNeeded"));
    return;
  }
  metrics.hidden = false;
  metrics.innerHTML = metricsBand();
  const topSignals = (b.signals || []).slice(0, 4);
  const readyActions = (b.actions || []).filter((item) => item.status === "approved").slice(0, 4);
  const actionsToShow = readyActions.length ? readyActions : (b.actions || []).slice(0, 4);
  body.innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("topSignals")}</h2>
        ${topSignals.map((item) => overviewRow("signals", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
      <div class="card overview-panel">
        <h2>${t("readyActions")}</h2>
        ${actionsToShow.map((item) => overviewRow("actions", item)).join("") || `<div class="empty-inline">${t("empty")}</div>`}
      </div>
    </section>
  `;
}

function byIdOrNull(id) {
  return document.getElementById(id);
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { signals: "signalsHint", actions: "actionsHint", drafts: "draftsHint", sources: "sourcesHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const strong = (text) => `<span class="strong">${escapeHtml(text)}</span>`;

// The split queue shows the first two columns (title + status); the rest are
// there for the full-width page/phone fallbacks.
function signalsTable(items) {
  return `
    <table class="ws-table retail-table signals-table">
      ${tableHead([[t("signal")], [t("status")], [t("confidence"), "ws-col-num"], [t("source")], [t("detected")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemSummary(item))}
              ${cell(statusBadge(item.status))}
              ${cell(percent(item.confidence), "", "ws-col-num")}
              ${cell(escapeHtml(item.source?.name || ""), item.source?.name)}
              ${cell(escapeHtml(dateTime(item.detected_at)))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function actionsTable(items) {
  return `
    <table class="ws-table retail-table actions-table">
      ${tableHead([[t("action")], [t("status")], [t("priority")], [t("owner")], [t("linkedSignals")], [t("nextStep")]])}
      <tbody>
        ${items
          .map((item) => {
            const linked = (item.linked_signal_ids || []).map((id) => linkText("signals", id)).join(", ");
            return `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemSummary(item))}
              ${cell(statusBadge(item.status))}
              ${cell(priorityBadge(item.priority))}
              ${cell(escapeHtml(item.owner || ""), item.owner)}
              ${cell(escapeHtml(linked), linked)}
              ${cell(escapeHtml(item.next_step || ""), item.next_step)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table retail-table drafts-table">
      ${tableHead([[t("draft")], [t("status")], [t("channel")], [t("linkedAction")], [t("body")]])}
      <tbody>
        ${items
          .map((item) => {
            const action = linkText("actions", item.linked_action_id);
            return `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), itemLabel(item))}
              ${cell(`${statusBadge(item.status)} ${riskBadges(item.risk)}`)}
              ${cell(escapeHtml(item.channel || ""), item.channel)}
              ${cell(escapeHtml(action), action)}
              ${cell(muted(item.effective_body || ""), item.effective_body)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function sourcesTable(items) {
  return `
    <table class="ws-table retail-table sources-table">
      ${tableHead([[t("source")], [t("status")], [t("freshness")], [t("coverage")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(strong(itemLabel(item)), item.label)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.freshness || ""), item.freshness)}
              ${cell(muted(item.coverage || ""), item.coverage)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

const TABLES = { signals: signalsTable, actions: actionsTable, drafts: draftsTable, sources: sourcesTable };

function filteredItems(view) {
  const query = state.route.query.trim().toLowerCase();
  const items = itemsForView(view);
  if (!query) return items;
  return items.filter((item) =>
    [itemLabel(item), itemSummary(item), enumLabel(item.status), item.channel, item.owner, item.source?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function loadMoreControl(view) {
  if (!hasMore(view)) return "";
  const loading = Boolean(state.loadingMore[view]);
  const loaded = itemsForView(view).length;
  return `
    <div class="list-more">
      <button type="button" class="button" data-load-more="${view}" ${loading ? "disabled" : ""}>${loading ? t("loading") : t("loadMore")}</button>
      <span class="muted">${escapeHtml(t("loadedOf").replace("{loaded}", loaded).replace("{total}", recordTotal(view)))}</span>
    </div>
  `;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredItems(view);
  // The nav item already names the view; the count shows only while a search
  // narrows it (base-ui hides it otherwise, except on phones).
  els.viewCount.textContent = state.route.query ? `${items.length}${hasMore(view) ? "+" : ""}` : recordTotal(view);
  els.viewCount.title = state.route.query && hasMore(view) ? t("matchesLoaded") : "";
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? TABLES[view](items) : empty}${loadMoreControl(view)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectSignal")}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = view === "sources" ? sourceDetail(item) : reviewDetail(view, item);
}

function signalFields(item) {
  return `
    <dt>${t("confidence")}</dt><dd>${percent(item.confidence)}</dd>
    <dt>${t("detected")}</dt><dd>${escapeHtml(dateTime(item.detected_at))}</dd>
    ${
      item.source?.url
        ? `<dt>${t("evidence")}</dt><dd><a href="${escapeHtml(item.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.source.name || item.source.url)}</a></dd>`
        : item.source?.name
          ? `<dt>${t("source")}</dt><dd>${escapeHtml(item.source.name)}</dd>`
          : ""
    }
    ${item.suggested_action_id ? `<dt>${t("suggestedAction")}</dt><dd>${linkTo("actions", item.suggested_action_id)}</dd>` : ""}
  `;
}

function signalNotes(item) {
  return `
    ${item.why_it_matters ? `<section class="detail-note"><h3>${t("why")}</h3><p>${escapeHtml(item.why_it_matters)}</p></section>` : ""}
    ${item.buyer_intent ? `<section class="detail-note"><h3>${t("buyerIntent")}</h3><p>${escapeHtml(item.buyer_intent)}</p></section>` : ""}
  `;
}

function actionFields(item) {
  const linked = item.linked_signal_ids || [];
  return `
    <dt>${t("priority")}</dt><dd>${priorityBadge(item.priority) || "—"}</dd>
    <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "—")}</dd>
    ${linked.length ? `<dt>${t("linkedSignals")}</dt><dd>${linked.map((id) => linkTo("signals", id)).join("<br>")}</dd>` : ""}
  `;
}

function actionNotes(item) {
  return `
    ${item.reason ? `<section class="detail-note"><h3>${t("reason")}</h3><p>${escapeHtml(item.reason)}</p></section>` : ""}
    ${item.next_step ? `<section class="detail-note"><h3>${t("nextStep")}</h3><p>${escapeHtml(item.next_step)}</p></section>` : ""}
  `;
}

function draftFields(item) {
  return `
    <dt>${t("channel")}</dt><dd>${escapeHtml(item.channel || "—")}</dd>
    ${item.linked_action_id ? `<dt>${t("linkedAction")}</dt><dd>${linkTo("actions", item.linked_action_id)}</dd>` : ""}
  `;
}

function draftEditor(item) {
  const body = state.edits[item.id]?.body ?? (item.edited_body || item.body || "");
  return `
    <label class="detail-label" for="body-${escapeHtml(item.id)}">${t("editedDraft")}</label>
    <textarea id="body-${escapeHtml(item.id)}" class="detail-draft" data-field="body" rows="8">${escapeHtml(body)}</textarea>
  `;
}

function decisionButtons(kind) {
  const disabled = state.saving ? "disabled" : "";
  return [
    `<button type="button" class="button primary" data-action="approve" ${disabled}>${t("approve")}</button>`,
    `<button type="button" class="button" data-action="request_changes" ${disabled}>${t("requestChanges")}</button>`,
    `<button type="button" class="button danger" data-action="block" ${disabled}>${t("block")}</button>`,
    kind === "draft" ? `<button type="button" class="button" data-action="revise" ${disabled}>${t("revise")}</button>` : "",
  ].join("");
}

function reviewDetail(view, item) {
  const kind = VIEW_KINDS[view];
  const fields = kind === "signal" ? signalFields(item) : kind === "action" ? actionFields(item) : draftFields(item);
  const notes = kind === "signal" ? signalNotes(item) : kind === "action" ? actionNotes(item) : "";
  const note = state.edits[item.id]?.note ?? item.decision?.comment ?? "";
  const decided = item.decision
    ? `<span class="muted">${t("decision")}: ${escapeHtml(enumLabel(item.decision.action, "action"))}${item.decision.decided_at ? ` · ${escapeHtml(dateTime(item.decision.decided_at))}` : ""}</span>`
    : "";
  return `
    <article class="record-detail" data-record="${escapeHtml(item.id)}">
      <header class="detail-head">
        <div class="detail-badges">${statusBadge(item.status)} ${riskBadges(item.risk)}<span class="muted">#${escapeHtml(item.ref)}</span></div>
        <h2>${escapeHtml(itemLabel(item))}</h2>
        ${item.summary && item.summary !== item.title ? `<p>${escapeHtml(item.summary)}</p>` : ""}
      </header>
      <dl class="detail-fields">${fields}</dl>
      ${notes}
      ${kind === "draft" ? draftEditor(item) : ""}
      <label class="detail-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="detail-note-input" data-field="note" rows="3">${escapeHtml(note)}</textarea>
      <div class="actions-bar">${decisionButtons(kind)}${decided}</div>
      ${noticeBanner(item.id)}
    </article>
  `;
}

function sourceDetail(item) {
  return `
    <article class="record-detail">
      <header class="detail-head">
        <div class="detail-badges">${statusBadge(item.status)}</div>
        <h2>${escapeHtml(itemLabel(item))}</h2>
      </header>
      <dl class="detail-fields">
        <dt>${t("freshness")}</dt><dd>${escapeHtml(item.freshness || "—")}</dd>
      </dl>
      ${item.coverage ? `<section class="detail-note"><h3>${t("coverage")}</h3><p>${escapeHtml(item.coverage)}</p></section>` : ""}
    </article>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const b = state.batch || {};
  const container = byIdOrNull("settingsContent");
  // The accent picker (accent-theme.js) mounts itself into this container;
  // keep it across re-renders.
  let section = container.querySelector("section.settings-config");
  if (!section) {
    section = document.createElement("section");
    section.className = "card settings-config";
    container.prepend(section);
  }
  section.innerHTML = `
    <h2>${t("configuration")}</h2>
    <p class="muted">${t("settingsHelp")}</p>
    <dl>
      <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.bootstrap?.data_provider || "busabase")}</dd>
      <dt>${t("batchId")}</dt><dd>${escapeHtml(b.batch_id || "—")}</dd>
      <dt>${t("vertical")}</dt><dd>${escapeHtml(b.vertical || "—")}</dd>
      <dt>${t("buyer")}</dt><dd>${escapeHtml(b.buyer || "—")}</dd>
      <dt>${t("offer")}</dt><dd>${escapeHtml(b.offer || "—")}</dd>
    </dl>
  `;
}
