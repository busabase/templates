import {
  channelBadge,
  date,
  detailMode,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  feedbackItems,
  filteredRows,
  isMobileLayout,
  isPartial,
  loadState,
  pageCount,
  planLabel,
  preview,
  productName,
  proposals,
  recordById,
  recordUrl,
  relativeTime,
  render,
  requestLink,
  requests,
  requestTitle,
  sentimentBadge,
  shortDate,
  sourceName,
  state,
  statusBadge,
  t,
  toast,
  trendArrow,
  triageBadge,
  VIEW_BASE,
  VIEW_FILTERS,
} from "../app.js";
import { statusForProposalAction, triageForFeedbackAction } from "./feedback-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const byId = (id) => document.getElementById(id);
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers neither the nav (per-view totals) nor the sidebar attention
// block (decisions waiting / new / needs info) already shows. They are
// computed from the loaded feedback page, and say so when more exist.
function metricsBand() {
  const items = feedbackItems();
  const negative = items.filter((item) => item.sentiment === "negative").length;
  const paying = items.filter((item) => item.user?.plan && item.user.plan !== "free").length;
  const linked = items.filter((item) => item.request_id).length;
  const scope = isPartial("feedback") ? ` · ${t("ofLoaded").replace("{n}", items.length)}` : "";
  return [
    [t("negativeShare"), percent(negative, items.length)],
    [t("payingShare"), percent(paying, items.length)],
    [t("linkedShare"), percent(linked, items.length)],
  ]
    .map(
      ([label, value]) =>
        `<div title="${escapeHtml(label + scope)}"><span>${escapeHtml(label + scope)}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  // The per-view totals are next to the nav items; the hero only says how
  // fresh the picture is.
  byId("overviewSummary").textContent = generated ? `${t("generated")} ${generated}` : "";
  byId("overviewMetrics").innerHTML = metricsBand();
  const failures = state.settings?.side_read_failures || [];
  byId("overviewBody").innerHTML = `
    ${failures.length ? `<div class="notice-banner">${escapeHtml(t("sideReadFailed").replace("{names}", failures.join(", ")))}</div>` : ""}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("inflowThisWeek")}</h2>
        ${inflowPanel()}
      </div>
      <div class="card overview-panel">
        <h2>${t("sentimentSplit")}</h2>
        ${sentimentPanel()}
      </div>
      <div class="card overview-panel">
        <h2>${t("topClusters")}</h2>
        ${topClustersPanel()}
      </div>
      <div class="card overview-panel">
        <h2>${t("freshnessBySource")}</h2>
        ${freshnessPanel()}
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("currentRoadmap")}</h2>
        ${roadmapBoard()}
      </div>
    </section>
  `;
}

function inflowPanel() {
  const inflow = state.snapshot?.metrics?.week_inflow || {};
  const entries = Object.entries(inflow).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-inline">${t("empty")}</div>`;
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return entries
    .map(
      ([channel, count]) => `
    <div class="inflow-row">
      ${channelBadge(channel)}
      <span class="inflow-bar"><span style="width:${Math.round((count / max) * 100)}%"></span></span>
      <strong class="num">${count}</strong>
    </div>
  `,
    )
    .join("");
}

function sentimentPanel() {
  const sentiment = state.snapshot?.metrics?.sentiment || {};
  const rows = ["positive", "neutral", "negative"].map((key) => [key, sentiment[key] || 0]);
  const max = Math.max(...rows.map(([, count]) => count), 1);
  return rows
    .map(
      ([key, count]) => `
    <div class="inflow-row sentiment-row">
      <span class="sentiment-label">${escapeHtml(enumLabel(key, "sentiment"))}</span>
      <span class="inflow-bar sentiment-bar ${key}"><span style="width:${Math.max(2, Math.round((count / max) * 100))}%"></span></span>
      <strong class="num">${count}</strong>
    </div>
  `,
    )
    .join("");
}

function topClustersPanel() {
  const trendRank = { up: 2, flat: 1, down: 0 };
  const top = [...requests()]
    .sort((a, b) => trendRank[b.trend] - trendRank[a.trend] || b.weighted_score - a.weighted_score)
    .slice(0, 5);
  if (!top.length) return `<div class="empty-inline">${t("empty")}</div>`;
  return top
    .map(
      (request) => `
    <a class="cluster-row" href="${detailUrl(request.request_id, "requests")}">
      <span class="cluster-copy">
        <strong>${escapeHtml(request.title)}</strong>
        <small>${escapeHtml(productName(request.product))} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}</small>
      </span>
      ${trendArrow(request.trend)}
      ${statusBadge(request.status)}
    </a>
  `,
    )
    .join("");
}

function freshnessPanel() {
  const sources = state.snapshot?.sources || [];
  if (!sources.length) return `<div class="empty-inline">${t("setupNeeded")}</div>`;
  return sources
    .map(
      (source) => `
    <div class="freshness-row">
      ${channelBadge(source.channel)}
      <span class="cluster-copy">
        <strong>${escapeHtml(source.name)}</strong>
        <small>${escapeHtml(source.collection || "")}</small>
      </span>
      <span class="muted">${escapeHtml(relativeTime(source.last_ingest_at))}</span>
      <strong class="num">${source.item_count ?? 0}</strong>
    </div>
  `,
    )
    .join("");
}

// Read-only lanes; they change only through approved proposals.
function roadmapBoard() {
  const roadmap = state.snapshot?.roadmap || { now: [], next: [], later: [] };
  const loaded = ["now", "next", "later"].reduce((sum, lane) => sum + (roadmap[lane] || []).length, 0);
  return `
    ${isPartial("roadmap") ? `<p class="muted">${escapeHtml(t("roadmapPartial").replace("{n}", loaded))}</p>` : ""}
    <div class="roadmap-columns">
      ${["now", "next", "later"]
        .map(
          (laneKey) => `
        <div class="roadmap-column">
          <h3>${escapeHtml(enumLabel(laneKey, "lane"))}</h3>
          ${
            (roadmap[laneKey] || [])
              .map(
                (item) => `
            <div class="roadmap-card">
              <strong>${escapeHtml(item.title)}</strong>
              ${item.note ? `<p class="muted">${escapeHtml(item.note)}</p>` : ""}
              ${item.request_id ? `<div>${requestLink(item.request_id)}</div>` : ""}
            </div>
          `,
              )
              .join("") || `<div class="muted roadmap-empty">${t("notAvailable")}</div>`
          }
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { inbox: "inboxHint", requests: "requestsHint", roadmap: "roadmapHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""} title="${escapeHtml(label)}">${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function feedbackTable(items) {
  const sorted = [...items].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
  return `
    <table class="ws-table feedback-table">
      ${tableHead([
        [t("feedback")],
        [t("user")],
        [t("channel")],
        [t("sentiment")],
        [t("clusterLink")],
        [t("triage")],
        [t("received")],
      ])}
      <tbody>
        ${sorted
          .map((item) => {
            const who = [item.user?.handle, productName(item.product), planLabel(item.user?.plan)].filter(Boolean);
            return `${rowOpen(item.feedback_id)}
              ${cell(`<span class="row-text">${escapeHtml(item.text)}</span>`, preview(item.text, 280))}
              ${cell(escapeHtml(item.user?.handle || ""), who.join(" · "))}
              ${cell(channelBadge(item.channel))}
              ${cell(sentimentBadge(item.sentiment))}
              ${cell(requestLink(item.request_id), requestTitle(item.request_id))}
              ${cell(triageBadge(item.triage))}
              ${cell(escapeHtml(shortDate(item.received_at)), date(item.received_at), "ws-col-narrow")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function linkedCount(requestId) {
  return feedbackItems().filter((item) => item.request_id === requestId).length;
}

function requestsTable(items) {
  const sorted = [...items].sort((a, b) => b.weighted_score - a.weighted_score);
  return `
    <table class="ws-table requests-table">
      ${tableHead([
        [t("requests")],
        [t("product")],
        [t("frequency"), "ws-col-num"],
        [t("weightedScore"), "ws-col-num"],
        [t("trend")],
        [t("status")],
        [t("linkedColumn"), "ws-col-num"],
        [t("updated")],
      ])}
      <tbody>
        ${sorted
          .map(
            (request) => `${rowOpen(request.request_id)}
              ${cell(`<span class="strong">${escapeHtml(request.title)}</span>`, `${request.title}\n${request.problem_statement || ""}`.trim())}
              ${cell(escapeHtml(productName(request.product)), productName(request.product))}
              ${cell(String(request.frequency), "", "ws-col-num")}
              ${cell(`<span class="strong">${request.weighted_score}</span>`, "", "ws-col-num")}
              ${cell(trendArrow(request.trend))}
              ${cell(statusBadge(request.status))}
              ${cell(String(linkedCount(request.request_id)), "", "ws-col-num")}
              ${cell(escapeHtml(date(request.updated_at)))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function proposalsTable(items) {
  const sorted = [...items].sort((a, b) => a.ref - b.ref);
  return `
    <table class="ws-table proposals-table">
      ${tableHead([[t("proposal")], [t("status")]])}
      <tbody>
        ${sorted
          .map(
            (proposal) => `${rowOpen(proposal.proposal_id)}
              ${cell(`<span class="row-ref">#${proposal.ref}</span> <span class="strong">${escapeHtml(proposal.title)}</span>`, proposal.title)}
              ${cell(statusBadge(proposal.status))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total, when known, comes from records.count.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  return `
    <nav class="pager" aria-label="${escapeHtml(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      ${total == null ? "" : `<span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>`}
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

function renderFilters(view) {
  const filter = VIEW_FILTERS[view];
  const rows = state.snapshot?.[VIEW_BASE[view]] || [];
  const options = ["all", ...filter.values].map((value) => ({
    value,
    label: value === "all" ? t("all") : enumLabel(value, filter.group),
    count: value === "all" ? rows.length : rows.filter((item) => item[filter.field] === value).length,
  }));
  els.viewFilters.innerHTML = options
    .map(
      (option) =>
        `<button type="button" class="segment ${state.route.status === option.value ? "active" : ""}" data-status="${option.value}">${escapeHtml(option.label)} <b>${option.count}</b></button>`,
    )
    .join("");
  els.statusSelect.innerHTML = options
    .map(
      (option) =>
        `<option value="${option.value}"${state.route.status === option.value ? " selected" : ""}>${escapeHtml(option.label)} (${option.count})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  const key = VIEW_BASE[view];
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredRows(view);
  els.viewCount.textContent = `${items.length}${isPartial(key) ? "+" : ""}`;
  renderFilters(view);
  const table = view === "inbox" ? feedbackTable(items) : view === "requests" ? requestsTable(items) : proposalsTable(items);
  const narrowed = Boolean(state.route.query || state.route.status !== "all");
  const empty = emptyState(narrowed ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const key = VIEW_BASE[view];
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = detailMode(view) === "split" ? emptyState(t("selectProposal")) : "";
    return;
  }
  const item = recordById(key, selectedId);
  if (!item) {
    const pending = state.extra[key]?.has(selectedId) && state.extra[key].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "inbox" ? feedbackDetail(item) : view === "requests" ? requestDetail(item) : proposalDetail(item);
}

// ── Detail: one markup for page, drawer and split ─────────────────────────
function feedbackDetail(item) {
  const assignValue = state.edits.assign[item.feedback_id] ?? item.request_id ?? "";
  return `
    <article class="feedback-detail" data-feedback="${escapeHtml(item.feedback_id)}">
      <header class="detail-head">
        <h2>${escapeHtml(item.user?.handle || t("feedbackDetail"))}</h2>
        <p class="muted">${escapeHtml([enumLabel(item.channel, "channel"), productName(item.product), date(item.received_at)].filter(Boolean).join(" · "))}</p>
      </header>
      <section class="detail">
        <div class="detail-main">
          <div>
            <h3>${t("fullText")}</h3>
            <blockquote class="feedback-text">${escapeHtml(item.text)}</blockquote>
            ${item.agent_note ? `<p class="agent-note"><strong>${t("agentNote")}</strong> ${escapeHtml(item.agent_note)}</p>` : ""}
          </div>
          <div class="triage-panel">
            <h3>${t("triage")}</h3>
            <div class="triage-actions">
              <select data-field="assign" aria-label="${escapeHtml(t("assignToRequest"))}">
                <option value="">${escapeHtml(t("noRequest"))}</option>
                ${requests()
                  .map(
                    (request) =>
                      `<option value="${escapeHtml(request.request_id)}" ${request.request_id === assignValue ? "selected" : ""}>${escapeHtml(request.title)}</option>`,
                  )
                  .join("")}
              </select>
              <button type="button" data-feedback-action="assign">${t("assignToRequest")}</button>
              <button type="button" data-feedback-action="ignore">${t("ignore")}</button>
              <button type="button" data-feedback-action="insight">${t("markInsight")}</button>
            </div>
          </div>
        </div>
        <aside class="detail-side">
          <h3>${t("userContext")}</h3>
          <dl>
            <dt>${t("user")}</dt><dd>${escapeHtml(item.user?.handle || "")}</dd>
            <dt>${t("plan")}</dt><dd>${escapeHtml(planLabel(item.user?.plan))}</dd>
            <dt>${t("tenure")}</dt><dd>${item.user?.tenure_months ?? 0} ${t("months")}</dd>
            <dt>${t("weight")}</dt><dd>${item.user?.weight ?? 1}</dd>
            <dt>${t("channel")}</dt><dd>${channelBadge(item.channel)}</dd>
            <dt>${t("source")}</dt><dd>${escapeHtml(sourceName(item.source_id))}</dd>
            <dt>${t("sentiment")}</dt><dd>${sentimentBadge(item.sentiment)}</dd>
            <dt>${t("triage")}</dt><dd>${triageBadge(item.triage)}</dd>
            <dt>${t("clusterLink")}</dt><dd>${requestLink(item.request_id)}</dd>
            <dt>${t("permalink")}</dt><dd>${item.permalink ? `<a href="${escapeHtml(item.permalink)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.permalink)}</a>` : t("notAvailable")}</dd>
          </dl>
        </aside>
      </section>
    </article>
  `;
}

function requestDetail(request) {
  const linked = feedbackItems()
    .filter((item) => item.request_id === request.request_id)
    .sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
  const quoteItems = (request.representative_feedback_ids || [])
    .map((id) => feedbackItems().find((item) => item.feedback_id === id))
    .filter(Boolean);
  const effortValue = state.edits.effort[request.request_id] ?? request.effort_estimate ?? "";
  return `
    <article class="request-detail" data-request="${escapeHtml(request.request_id)}">
      <header class="detail-head">
        <h2>${escapeHtml(request.title)}</h2>
        <p class="muted">${escapeHtml(`${productName(request.product)} · ${enumLabel(request.status)} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}`)}</p>
      </header>
      <section class="detail">
        <div class="detail-main">
          <div class="card overview-panel">
            <h3>${t("problemStatement")}</h3>
            <p>${escapeHtml(request.problem_statement || "")}</p>
            <h3>${t("specSummary")}</h3>
            <p>${escapeHtml(request.spec_summary || "")}</p>
          </div>
          ${
            quoteItems.length
              ? `
            <div class="card overview-panel">
              <h3>${t("quotes")}</h3>
              ${quoteItems
                .map(
                  (item) => `
                <blockquote class="quote">
                  <p>${escapeHtml(item.text)}</p>
                  <footer>${escapeHtml(item.user?.handle || "")} · ${channelBadge(item.channel)} · ${date(item.received_at)}</footer>
                </blockquote>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
          <div class="card overview-panel linked-panel">
            <h3>${t("allLinkedFeedback")} (${linked.length})</h3>
            ${
              linked
                .map(
                  (item) => `
              <a class="linked-row" href="${recordUrl(item.feedback_id, "inbox")}">
                <span class="linked-who">${escapeHtml(item.user?.handle || "")}</span>
                <span class="linked-text">${escapeHtml(item.text)}</span>
                ${channelBadge(item.channel)}
                ${sentimentBadge(item.sentiment)}
                <span class="muted">${escapeHtml(shortDate(item.received_at))}</span>
              </a>
            `,
                )
                .join("") || `<div class="empty-inline">${t("empty")}</div>`
            }
          </div>
        </div>
        <aside class="card detail-side">
          <dl>
            <dt>${t("product")}</dt><dd>${escapeHtml(productName(request.product))}</dd>
            <dt>${t("status")}</dt><dd>${statusBadge(request.status)}</dd>
            <dt>${t("frequency")}</dt><dd>${request.frequency}</dd>
            <dt>${t("weightedScore")}</dt><dd>${request.weighted_score}</dd>
            <dt>${t("trend")}</dt><dd>${trendArrow(request.trend)}</dd>
            <dt>${t("created")}</dt><dd>${date(request.created_at)}</dd>
            <dt>${t("updated")}</dt><dd>${date(request.updated_at)}</dd>
          </dl>
          <div class="effort-field">
            <label for="effortInput">${t("effortEstimate")}</label>
            <input id="effortInput" type="text" data-field="effort" value="${escapeHtml(effortValue)}">
            <button type="button" data-effort-save>${t("save")}</button>
          </div>
          <h3>${t("decisionHistory")}</h3>
          <div class="history">
            ${
              (request.decision_history || [])
                .map(
                  (entry) => `
              <div class="history-row">
                <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
                <span>${escapeHtml(entry.actor || "")} · ${date(entry.at)}</span>
                ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
              </div>
            `,
                )
                .join("") || `<div class="muted">${t("notAvailable")}</div>`
            }
          </div>
        </aside>
      </section>
    </article>
  `;
}

function proposalDetail(proposal) {
  const decided = ["approved", "done", "blocked"].includes(proposal.status);
  const draftValue = state.edits.draft[proposal.proposal_id] ?? proposal.draft ?? "";
  const noteValue = state.edits.note[proposal.proposal_id] ?? proposal.review_note ?? "";
  const showDraft = Boolean(proposal.draft || proposal.draft_kind);
  const extraRequests = (proposal.request_ids || []).length > 1 ? ` + ${proposal.request_ids.length - 1}` : "";
  return `
    <article class="proposal-detail" data-proposal="${escapeHtml(proposal.proposal_id)}">
      <header class="proposal-header">
        <span class="proposal-ref">${t("proposal")} #${proposal.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(proposal.type, "type"))}</span>
        ${proposal.target_lane ? `<span class="badge">${t("targetLane")}: ${escapeHtml(enumLabel(proposal.target_lane, "lane"))}</span>` : ""}
        ${statusBadge(proposal.status)}
      </header>
      <h2 class="proposal-title">${escapeHtml(proposal.title)}</h2>
      <p class="proposal-reason"><strong>${t("reason")}</strong> ${escapeHtml(proposal.reason)}</p>
      ${proposal.evidence ? `<p class="proposal-evidence"><strong>${t("evidence")}</strong> ${escapeHtml(proposal.evidence)}</p>` : ""}
      ${proposal.request_id ? `<p class="proposal-request">${requestLink(proposal.request_id)}${extraRequests}</p>` : ""}
      ${
        showDraft
          ? `
        <label class="field-label" for="draft-${escapeHtml(proposal.proposal_id)}">${t("draft")}${proposal.draft_kind ? ` · ${escapeHtml(enumLabel(proposal.draft_kind, "draftKind"))}` : ""}</label>
        <textarea id="draft-${escapeHtml(proposal.proposal_id)}" class="proposal-draft" data-field="draft" rows="6" ${decided ? "disabled" : ""}>${escapeHtml(draftValue)}</textarea>
      `
          : ""
      }
      <label class="field-label" for="note-${escapeHtml(proposal.proposal_id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(proposal.proposal_id)}" class="proposal-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}">${escapeHtml(noteValue)}</textarea>
      <footer class="proposal-actions">
        <button type="button" data-verdict="approve" class="primary" ${decided ? "disabled" : ""}>${t("approve")}</button>
        <button type="button" data-verdict="request_changes" ${proposal.status === "done" ? "disabled" : ""}>${t("requestChanges")}</button>
        <button type="button" data-verdict="block" ${decided ? "disabled" : ""}>${t("block")}</button>
        ${proposal.decided_at ? `<span class="muted decided-at">${t("decided")} ${date(proposal.decided_at)}</span>` : ""}
      </footer>
    </article>
  `;
}

// Delegated once on the detail body, so re-rendering never stacks listeners.
export function bindDetailEvents() {
  els.detailBody.addEventListener("input", (event) => {
    const field = event.target.closest("[data-field]");
    if (!field) return;
    const request = field.closest("[data-request]")?.dataset.request;
    const proposal = field.closest("[data-proposal]")?.dataset.proposal;
    if (field.dataset.field === "effort" && request) state.edits.effort[request] = field.value;
    if (field.dataset.field === "draft" && proposal) state.edits.draft[proposal] = field.value;
    if (field.dataset.field === "note" && proposal) state.edits.note[proposal] = field.value;
  });
  els.detailBody.addEventListener("change", (event) => {
    const select = event.target.closest('select[data-field="assign"]');
    const feedback = select?.closest("[data-feedback]")?.dataset.feedback;
    if (feedback) state.edits.assign[feedback] = select.value;
  });
  els.detailBody.addEventListener("click", (event) => {
    const feedbackButton = event.target.closest("[data-feedback-action]");
    if (feedbackButton) {
      const id = feedbackButton.closest("[data-feedback]").dataset.feedback;
      const action = feedbackButton.dataset.feedbackAction;
      const item = recordById("feedback", id);
      decideFeedbackAction(id, action, action === "assign" ? (state.edits.assign[id] ?? item?.request_id ?? "") : "");
      return;
    }
    if (event.target.closest("[data-effort-save]")) {
      const id = event.target.closest("[data-request]").dataset.request;
      const request = recordById("requests", id);
      saveEffortAction(id, state.edits.effort[id] ?? request?.effort_estimate ?? "");
      return;
    }
    const verdict = event.target.closest("[data-verdict]");
    if (verdict) {
      const id = verdict.closest("[data-proposal]").dataset.proposal;
      decideProposalAction(id, verdict.dataset.verdict, state.edits.note[id] ?? "", state.edits.draft[id]);
    }
  });
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const scoring = summary.scoring || {};
  const planWeights = Object.entries(scoring.plan_weights || {});
  const syncLog = [...(state.snapshot?.sync_log || [])].reverse().slice(0, 8);
  byId("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("roadmapLanes")}</dt><dd>${(summary.roadmap_lanes || []).map((laneKey) => escapeHtml(enumLabel(laneKey, "lane"))).join(" · ")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("products")}</h2>
        ${
          (summary.products || [])
            .map(
              (product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.display_name)}</strong>
            <span>${escapeHtml(product.product_id)}</span>
            <span class="muted">${escapeHtml(product.tagline || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("sources")}</h2>
        ${
          (summary.sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${channelBadge(source.channel)} ${escapeHtml(source.collection || "")}</span>
            <span class="${source.secrets_ready ? "positive" : "negative"}">${source.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("scoringWeights")}</h2>
        <dl>
          ${planWeights.map(([plan, weight]) => `<dt>${t("planWeights")} · ${escapeHtml(planLabel(plan))}</dt><dd>${escapeHtml(String(weight))}</dd>`).join("")}
          <dt>${t("defaultWeight")}</dt><dd>${escapeHtml(String(scoring.default_weight ?? 1))}</dd>
          <dt>${t("recencyHalfLife")}</dt><dd>${escapeHtml(String(scoring.recency_half_life_days ?? 30))}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("syncLog")}</h2>
        ${
          syncLog
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
            <span class="muted">${date(entry.at)}</span>
            <span>${escapeHtml(entry.detail || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </section>
    </div>
  `;
}

// ── Decisions ──────────────────────────────────────────────────────────────
async function decideFeedbackAction(feedbackId, action, requestId) {
  if (state.settings?.demo) {
    const item = recordById("feedback", feedbackId);
    if (item) {
      item.triage = triageForFeedbackAction(action, item.triage);
      if (action === "assign") item.request_id = requestId || item.request_id;
    }
    delete state.edits.assign[feedbackId];
    toast(t("demoNotPersisted"));
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideFeedback({ feedback_id: feedbackId, action, request_id: requestId });
  } catch (error) {
    toast(error.message);
    return;
  }
  delete state.edits.assign[feedbackId];
  // Without write access the change is a ChangeRequest and the record keeps its
  // old value until someone who has it approves: say that, not "saved".
  toast(result?.pending ? t("savedForReview") : t("decisionSaved"));
  await loadState();
}

async function saveEffortAction(requestId, effortEstimate) {
  if (state.settings?.demo) {
    const request = recordById("requests", requestId);
    if (request) request.effort_estimate = effortEstimate;
    delete state.edits.effort[requestId];
    toast(t("demoNotPersisted"));
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.saveRequestEffort({ request_id: requestId, effort_estimate: effortEstimate });
  } catch (error) {
    toast(error.message);
    return;
  }
  delete state.edits.effort[requestId];
  // Without write access the change is a ChangeRequest and the record keeps its
  // old value until someone who has it approves: say that, not "saved".
  toast(result?.pending ? t("savedForReview") : t("decisionSaved"));
  await loadState();
}

async function decideProposalAction(proposalId, action, reviewNote, draft) {
  if (state.settings?.demo) {
    const proposal = recordById("proposals", proposalId);
    if (proposal) {
      proposal.status = statusForProposalAction(action, proposal.status);
      if (reviewNote) proposal.review_note = reviewNote;
      if (typeof draft === "string") proposal.draft = draft;
      if (action !== "revise") proposal.decided_at = new Date().toISOString();
    }
    delete state.edits.draft[proposalId];
    delete state.edits.note[proposalId];
    toast(t("demoNotPersisted"));
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideProposal({ proposal_id: proposalId, action, review_note: reviewNote, draft });
  } catch (error) {
    toast(error.message);
    return;
  }
  delete state.edits.draft[proposalId];
  delete state.edits.note[proposalId];
  // Without write access the change is a ChangeRequest and the record keeps its
  // old value until someone who has it approves: say that, not "saved".
  toast(result?.pending ? t("savedForReview") : t("decisionSaved"));
  await loadState();
}
