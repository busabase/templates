import {
  DETAIL_MODES,
  SOURCE_KINDS,
  candidateById,
  candidates,
  compactNumber,
  date,
  dateTime,
  deltaArrow,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  gradeBadge,
  isLocked,
  isMobileLayout,
  isPartial,
  loadState,
  lockBanner,
  money,
  pagerControl,
  pct,
  pickRef,
  platformName,
  proposalForCandidate,
  proposals,
  recordById,
  recordUrl,
  render,
  reviewBars,
  sourceBadge,
  sparkline,
  stageBadge,
  state,
  statusBadge,
  t,
  trendItems,
  verdictBadge,
} from "../app.js";
import { stageForCandidateAction, statusForProposalAction } from "./picks-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const VIEW_HINT = { candidates: "candidatesHint", trends: "trendsHint", decisions: "decisionsHint" };
const PAGE_KEY = { candidates: "candidates", trends: "trend-items", decisions: "proposals" };

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

const matches = (values, query) =>
  values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

/* ---------- Filters (over the loaded page) ---------- */

export function filteredCandidates() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return candidates();
  return candidates().filter((item) =>
    matches(
      [
        item.name,
        item.category,
        enumLabel(item.source, "source"),
        enumLabel(item.stage, "stage"),
        item.stage,
        item.competition_grade,
      ],
      query,
    ),
  );
}

function filteredTrendItems() {
  const query = state.route.query.trim().toLowerCase();
  return trendItems().filter((item) => {
    if (state.route.source && item.source !== state.route.source) return false;
    if (!query) return true;
    return matches([item.title, item.summary, enumLabel(item.source, "source"), item.metric_label], query);
  });
}

function filteredProposals() {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return proposals();
  return proposals().filter((item) =>
    matches(
      [item.title, item.reason, item.brief, enumLabel(item.status), enumLabel(item.verdict, "verdict")],
      query,
    ),
  );
}

/* ---------- Tables ---------- */

function candidatesTable(items) {
  return `
    <table class="ws-table picks-table candidates-table">
      ${tableHead([
        [t("name")],
        [t("category")],
        [t("source")],
        [t("momentum"), "ws-col-num"],
        [t("estPrice"), "ws-col-num"],
        [t("estMargin"), "ws-col-num"],
        [t("grade"), "ws-col-narrow"],
        [t("stage")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.candidate_id)}
              ${cell(`<a class="strong" href="${recordUrl(item.candidate_id, "candidates")}">${escapeHtml(item.name)}</a>`, item.why_it_matters || item.name)}
              ${cell(escapeHtml(item.category), item.category, "muted-cell")}
              ${cell(sourceBadge(item.source))}
              ${cell(deltaArrow(item.momentum_pct), "", "ws-col-num")}
              ${cell(money(item.est_price, item.currency), "", "ws-col-num")}
              ${cell(pct(item.margin_card?.margin_pct), "", `ws-col-num ${item.margin_card?.below_floor ? "negative" : "positive"}`)}
              ${cell(gradeBadge(item.competition_grade), "", "ws-col-narrow")}
              ${cell(stageBadge(item.stage))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function trendCandidateCell(item) {
  const linked = item.candidate_id ? candidateById(item.candidate_id) : null;
  if (linked) return `<a href="${recordUrl(linked.candidate_id, "candidates")}">${escapeHtml(linked.name)}</a>`;
  if (item.candidate_id) return `<span class="muted">${t("notLoaded")}</span>`;
  if (item.promotion) return `<span class="badge status-badge queued">${t("promoteQueued")}</span>`;
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `<button type="button" class="action small" data-action="promote" data-kind="trend" data-id="${escapeHtml(item.trend_id)}" ${disabled}>${t("promote")}</button>`;
}

function trendsTable(items) {
  return `
    <table class="ws-table picks-table trends-table">
      ${tableHead([
        [t("signal")],
        [t("source")],
        [t("metric")],
        [t("momentum")],
        [t("delta"), "ws-col-num"],
        [t("observed")],
        [t("candidate")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.trend_id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.summary || item.title)}
              ${cell(sourceBadge(item.source))}
              ${cell(`${escapeHtml(item.metric_label)} <span class="num">${compactNumber(item.metric_value)}</span>`, item.metric_label)}
              ${cell(sparkline(item.momentum, { width: 80, height: 22 }))}
              ${cell(deltaArrow(item.delta_pct), "", "ws-col-num")}
              ${cell(date(item.observed_at), dateTime(item.observed_at))}
              ${cell(trendCandidateCell(item))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function proposalsTable(items) {
  return `
    <table class="ws-table picks-table proposals-table">
      ${tableHead([[t("proposal")], [t("status")], [t("verdict"), "ws-split-keep"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.proposal_id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(statusBadge(item.status))}
              ${cell(verdictBadge(item.verdict), "", "ws-split-keep")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function sourceOptions() {
  const counts = (kind) => trendItems().filter((item) => item.source === kind).length;
  return [
    `<option value=""${state.route.source ? "" : " selected"}>${escapeHtml(t("allSources"))} (${trendItems().length})</option>`,
    ...SOURCE_KINDS.map(
      (kind) =>
        `<option value="${kind}"${state.route.source === kind ? " selected" : ""}>${escapeHtml(enumLabel(kind, "source"))} (${counts(kind)})</option>`,
    ),
  ].join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = view === "trends" ? t("trendFeed") : t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items =
    view === "candidates" ? filteredCandidates() : view === "trends" ? filteredTrendItems() : filteredProposals();
  els.viewCount.textContent = `${items.length}${isPartial(PAGE_KEY[view]) ? "+" : ""}`;
  els.sourceSelect.hidden = view !== "trends";
  els.sourceSelect.setAttribute("aria-label", t("source"));
  if (view === "trends") els.sourceSelect.innerHTML = sourceOptions();
  els.viewNotice.innerHTML = state.notice ? `<div class="notice-banner">${escapeHtml(state.notice)}</div>` : "";
  const table =
    view === "candidates" ? candidatesTable(items) : view === "trends" ? trendsTable(items) : proposalsTable(items);
  const empty = emptyState(state.route.query || state.route.source ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(PAGE_KEY[view])}`;
  renderDetail();
}

/* ---------- Detail (one markup for page, drawer and split) ---------- */

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectProposal"))}</div>` : "";
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
  if (view === "candidates") {
    els.detailBody.innerHTML = candidateDetail(item);
    bindMarginCard();
  } else if (view === "trends") {
    els.detailBody.innerHTML = trendDetail(item);
  } else {
    els.detailBody.innerHTML = proposalDetail(item);
  }
}

function marginCardPanel(item) {
  const card = item.margin_card || {};
  const inputRow = (key, label, value, suffix = "") => `
    <div class="mc-row">
      <label for="mc-${key}">${label}${suffix}</label>
      <input id="mc-${key}" class="mc-input" data-mc="${key}" type="number" step="0.01" inputmode="decimal" value="${Number(value || 0)}">
    </div>
  `;
  return `
    <div class="panel">
      <h2>${t("marginCard")}</h2>
      <p class="muted mc-hint">${t("marginCardHint")}</p>
      <div class="margin-card" id="margin-card" data-currency="${escapeHtml(item.currency || "USD")}">
        <div class="mc-inputs">
          ${inputRow("price", t("price"), card.price)}
          ${inputRow("cogs", t("cogs"), card.cogs)}
          ${inputRow("freight", t("freight"), card.freight)}
          ${inputRow("fee", t("platformFee"), card.platform_fee_pct, " %")}
          ${inputRow("ad", t("adCost"), card.ad_cost)}
        </div>
        <div class="mc-results">
          <div class="mc-result"><span>${t("platformFee")}</span><strong id="mc-out-fee">${money(card.platform_fee, item.currency)}</strong></div>
          <div class="mc-result"><span>${t("margin")}</span><strong id="mc-out-margin">${money(card.margin, item.currency)}</strong></div>
          <div class="mc-result"><span>${t("marginPct")}</span><strong id="mc-out-margin-pct" class="${card.below_floor ? "negative" : "positive"}">${pct(card.margin_pct)}</strong></div>
          <div class="mc-result"><span>${t("breakevenAcos")}</span><strong id="mc-out-acos">${pct(card.breakeven_acos_pct)}</strong></div>
        </div>
        <div id="mc-floor-note" class="mc-floor" ${card.below_floor ? "" : "hidden"}>${t("belowFloor")}</div>
      </div>
    </div>
  `;
}

function competitionPanel(item) {
  const comp = item.competition || {};
  return `
    <div class="panel">
      <h2>${t("competitionRead")} ${gradeBadge(item.competition_grade)}</h2>
      <h3>${t("topReviewCounts")}</h3>
      ${reviewBars(comp.top_review_counts || [])}
      <div class="comp-facts">
        <div><span class="muted">${t("headShare")}</span><strong>${pct(comp.head_share_pct)}</strong></div>
        <div><span class="muted">${t("newEntrants")}</span><strong>${comp.new_entrants_90d ?? "—"}</strong></div>
      </div>
      <h3>${t("dominance")}</h3>
      <p>${escapeHtml(comp.dominance_note || "—")}</p>
      <h3>${t("velocity")}</h3>
      <p>${escapeHtml(comp.velocity_note || "—")}</p>
    </div>
  `;
}

function verdictPanel(item) {
  const disabled = isLocked() || state.saving ? "disabled" : "";
  return `
    <div class="panel">
      <h2>${t("verdict")}</h2>
      <p class="muted">${t("verdictHint")}</p>
      <div class="action-row">
        <button type="button" class="action primary" data-action="develop" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("develop")}">${t("develop")}</button>
        <button type="button" class="action" data-action="watch" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("watch")}">${t("watch")}</button>
        <button type="button" class="action" data-action="drop" data-kind="candidate" data-id="${escapeHtml(item.candidate_id)}" ${disabled} title="${t("drop")}">${t("drop")}</button>
      </div>
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      <textarea id="review-note" class="review-note" data-note placeholder="${t("reviewNote")}">${escapeHtml(item.verdict?.comment || "")}</textarea>
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </div>
  `;
}

function candidateDetail(item) {
  const proposal = proposalForCandidate(item.candidate_id);
  const trend = trendItems().find((entry) => entry.trend_id === item.source_ref);
  return `
    ${lockBanner()}
    <section class="detail" data-record="${escapeHtml(item.candidate_id)}">
      <div class="detail-main">
        <header class="detail-title">
          <h2>${escapeHtml(item.name)}</h2>
          <div class="detail-head">
            ${sourceBadge(item.source)}
            ${gradeBadge(item.competition_grade)}
            ${stageBadge(item.stage)}
            ${deltaArrow(item.momentum_pct)}
            <span class="muted">${escapeHtml(item.category)}${item.first_seen ? ` · ${t("firstSeen")} ${date(item.first_seen)}` : ""}</span>
          </div>
        </header>
        <div class="panel why-panel">
          <h2>${t("whyItMatters")}</h2>
          <p>${escapeHtml(item.why_it_matters || "—")}</p>
          ${trend ? `<a class="handoff-chip block-link" href="${recordUrl(trend.trend_id, "trends")}">${escapeHtml(enumLabel(trend.source, "source"))}: ${escapeHtml(trend.title)} · ${escapeHtml(trend.metric_label)} ${compactNumber(trend.metric_value)}</a>` : ""}
        </div>
        ${marginCardPanel(item)}
        ${competitionPanel(item)}
        ${verdictPanel(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("evidence")}</h2>
        <ul class="evidence-list">
          ${(item.evidence || []).map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(entry.title)}</a></li>`).join("") || `<li class="muted">—</li>`}
        </ul>
        <h2>${t("candidate")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${escapeHtml(platformName(item.platform_id) || "—")}</dd>
          <dt>${t("estPrice")}</dt><dd>${money(item.est_price, item.currency)}</dd>
          ${item.verdict?.decided_at ? `<dt>${t("verdict")}</dt><dd>${escapeHtml(enumLabel(item.verdict.action, "verdict"))} · ${dateTime(item.verdict.decided_at)}</dd>` : ""}
        </dl>
        ${
          proposal
            ? `
          <h2>${t("reviewQueue")}</h2>
          <a class="handoff-chip block-link" href="${recordUrl(proposal.proposal_id, "decisions")}">${escapeHtml(pickRef(proposal.proposal_id))} · ${escapeHtml(proposal.title)} ${statusBadge(proposal.status)}</a>
        `
            : ""
        }
      </aside>
    </section>
  `;
}

function trendDetail(item) {
  const linked = item.candidate_id ? candidateById(item.candidate_id) : null;
  return `
    ${lockBanner()}
    <section class="detail-stack" data-record="${escapeHtml(item.trend_id)}">
      <header class="detail-title">
        <h2>${escapeHtml(item.title)}</h2>
        <div class="detail-head">
          ${sourceBadge(item.source)}
          ${deltaArrow(item.delta_pct)}
          <span class="muted">${t("observed")} ${dateTime(item.observed_at) || "—"}</span>
        </div>
      </header>
      <p class="detail-summary">${escapeHtml(item.summary || "—")}</p>
      <div class="trend-chart">
        <div><span class="muted">${escapeHtml(item.metric_label || t("metric"))}</span><strong>${compactNumber(item.metric_value)}</strong></div>
        ${sparkline(item.momentum, { width: 240, height: 56 })}
      </div>
      <dl>
        <dt>${t("source")}</dt><dd>${escapeHtml(enumLabel(item.source, "source") || "—")}</dd>
        <dt>${t("link")}</dt><dd>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.url)}</a>` : "—"}</dd>
        <dt>${t("candidate")}</dt><dd>${linked ? `<a href="${recordUrl(linked.candidate_id, "candidates")}">${escapeHtml(linked.name)}</a>` : item.candidate_id ? `<span class="muted">${t("notLoaded")}</span>` : `<span class="muted">${t("noCandidate")}</span>`}</dd>
      </dl>
      ${linked || item.candidate_id ? "" : `<div class="action-row">${trendCandidateCell(item)}</div>`}
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
  `;
}

function proposalDetail(item) {
  const candidateItem = candidateById(item.candidate_id);
  const open = ["needs_review", "changes_requested"].includes(item.status);
  const disabled = isLocked() || state.saving ? "disabled" : "";
  const id = escapeHtml(item.proposal_id);
  return `
    ${lockBanner()}
    <section class="detail-stack proposal-detail" data-record="${id}">
      <header class="detail-title">
        <h2>${escapeHtml(item.title)}</h2>
        <div class="detail-head">
          <span class="muted ref-cell">${escapeHtml(pickRef(item.proposal_id))}</span>
          ${verdictBadge(item.verdict)}
          ${statusBadge(item.status)}
          <span class="muted">${date(item.proposed_at)}</span>
        </div>
      </header>
      ${
        candidateItem
          ? `<a class="handoff-chip block-link" href="${recordUrl(candidateItem.candidate_id, "candidates")}">${t("viewCandidate")}: ${escapeHtml(candidateItem.name)} · ${pct(candidateItem.margin_card?.margin_pct)} · ${escapeHtml(candidateItem.competition_grade)}</a>`
          : item.candidate_id
            ? `<span class="muted">${t("viewCandidate")}: ${t("notLoaded")}</span>`
            : ""
      }
      <div>
        <h3>${t("reason")}</h3>
        <p class="proposal-reason">${escapeHtml(item.reason || "—")}</p>
      </div>
      <div>
        <label class="note-label" for="brief-${id}">${t("briefEditable")}</label>
        <textarea id="brief-${id}" class="review-note brief-text" data-brief ${open ? "" : "readonly"}>${escapeHtml(item.brief || "")}</textarea>
      </div>
      ${
        open
          ? `
        <div>
          <label class="note-label" for="note-${id}">${t("reviewNote")}</label>
          <textarea id="note-${id}" class="review-note note-text" data-note placeholder="${t("reviewNote")}">${escapeHtml(item.review?.comment || "")}</textarea>
          <div class="action-row">
            <button type="button" class="action primary" data-action="approve" data-kind="proposal" data-id="${id}" ${disabled}>${t("approve")}</button>
            <button type="button" class="action" data-action="request_changes" data-kind="proposal" data-id="${id}" ${disabled}>${t("requestChanges")}</button>
            <button type="button" class="action" data-action="revise" data-kind="proposal" data-id="${id}" ${disabled}>${t("saveBrief")}</button>
            <button type="button" class="action" data-action="block" data-kind="proposal" data-id="${id}" ${disabled}>${t("block")}</button>
          </div>
        </div>
      `
          : `${item.review?.comment ? `<p class="muted verdict-note">${escapeHtml(item.review.comment)}</p>` : ""}`
      }
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
  `;
}

function bindMarginCard() {
  const root = els.detailBody.querySelector("#margin-card");
  if (!root) return;
  const currency = root.dataset.currency || "USD";
  const read = (key) => Number(root.querySelector(`[data-mc="${key}"]`)?.value || 0);
  const recompute = () => {
    const price = read("price");
    const cogs = read("cogs");
    const freight = read("freight");
    const feePct = read("fee");
    const ad = read("ad");
    const feeAmount = price * (feePct / 100);
    const marginBeforeAds = price - cogs - freight - feeAmount;
    const margin = marginBeforeAds - ad;
    const marginPct = price > 0 ? (margin / price) * 100 : 0;
    const acos = price > 0 ? (marginBeforeAds / price) * 100 : 0;
    const floor = Number(state.settings?.config_summary?.seller_profile?.margin_floor_pct || 25);
    const set = (id, value) => {
      const node = root.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    set("mc-out-fee", money(feeAmount, currency));
    set("mc-out-margin", money(margin, currency));
    set("mc-out-margin-pct", pct(Math.round(marginPct * 10) / 10));
    set("mc-out-acos", pct(Math.round(acos * 10) / 10));
    const pctNode = root.querySelector("#mc-out-margin-pct");
    if (pctNode) pctNode.className = marginPct < floor ? "negative" : "positive";
    const floorNote = root.querySelector("#mc-floor-note");
    if (floorNote) floorNote.hidden = marginPct >= floor;
  };
  root.querySelectorAll(".mc-input").forEach((input) => input.addEventListener("input", recompute));
}

/* ---------- Settings ---------- */

export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const profile = summary.seller_profile || {};
  const freight = summary.freight || {};
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")} · ${t("localFilesOnly")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sellerProfile")}</h2>
        <dl>
          <dt>${t("storeName")}</dt><dd>${escapeHtml(profile.store_name || "—")}</dd>
          <dt>${t("category")}</dt><dd>${(profile.categories || []).map((entry) => escapeHtml(entry)).join(", ") || "—"}</dd>
          <dt>${t("targetPlatforms")}</dt><dd>${(profile.target_platforms || []).map((entry) => escapeHtml(platformName(entry))).join(", ") || "—"}</dd>
          <dt>${t("marginFloor")}</dt><dd>${pct(profile.margin_floor_pct)}</dd>
          <dt>${t("maxCogs")}</dt><dd>${money(profile.max_cogs)}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("feeTables")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-row">
            <strong>${escapeHtml(platform.name)}</strong>
            <span>${t("referralFee")} ${pct(platform.referral_fee_pct)} · ${t("fulfillmentFlat")} ${money(platform.fulfillment_flat, platform.currency)}</span>
            <span class="muted">${escapeHtml(platform.currency)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("freightRules")}</h2>
        <div class="settings-row">
          <strong>*</strong>
          <span>${money(freight.default_per_unit)} ${t("perUnit")}</span>
          <span></span>
        </div>
        ${(freight.rules || [])
          .map(
            (rule) => `
          <div class="settings-row">
            <strong>${escapeHtml(rule.category)}</strong>
            <span>${money(rule.per_unit)} ${t("perUnit")}</span>
            <span></span>
          </div>
        `,
          )
          .join("")}
      </section>
      <section>
        <h2>${t("sources")}</h2>
        ${
          (summary.sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${sourceBadge(source.kind)}</span>
            <span>${escapeHtml(enumLabel(source.method, "method"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          (state.snapshot?.sync_log || [])
            .slice(0, 8)
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.action)}</strong>
            <span>${escapeHtml(entry.detail)}</span>
            <span class="muted">${dateTime(entry.at)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">—</div>`
        }
      </section>
    </div>
  `;
}

/* ---------- Decisions plumbing ---------- */

export async function submitDecision(payload) {
  if (state.saving) return;
  state.saving = true;
  try {
    if (state.settings?.demo) {
      // Demo mode never reaches Busabase — mirror the write in memory only,
      // matching the read-only ?demo=1 contract used across Busa App-in-Skills.
      applyLocalDecision(payload);
      state.saving = false;
      render();
      return;
    }
    const provider = await getProvider();
    const body = await provider.saveDecision(payload);
    if (!body.ok) throw new Error(body.error || "Decision failed");
    state.saving = false;
    await loadState();
    // Without write access the decision is a ChangeRequest, and the item keeps
    // its old state until someone who has it approves: say so on the record.
    if (body.pending) showFeedback(t("savedForReview"));
  } catch (error) {
    state.saving = false;
    showFeedback(error instanceof Error ? error.message : String(error));
  } finally {
    state.saving = false;
  }
}

function applyLocalDecision({ kind, id, action, comment, brief }) {
  const decided_at = new Date().toISOString();
  if (kind === "candidate") {
    const item = candidateById(id);
    if (item) Object.assign(item, { stage: stageForCandidateAction(action), verdict: { action, comment, decided_at } });
  } else if (kind === "proposal") {
    const item = proposals().find((entry) => entry.proposal_id === id);
    if (item) {
      if (action !== "revise") {
        item.status = statusForProposalAction(action);
        item.review = { comment, decided_at };
      }
      if (typeof brief === "string" && brief) item.brief = brief;
    }
  } else if (kind === "trend") {
    const item = trendItems().find((entry) => entry.trend_id === id);
    if (item) item.promotion = { action, comment, decided_at };
  }
}

function showFeedback(message) {
  const node = document.querySelector("#detailBody #decision-feedback");
  if (node) node.textContent = message;
  else {
    state.notice = message;
    render();
  }
}
