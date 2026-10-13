import {
  BASE_FOR_VIEW,
  count,
  DETAIL_MODES,
  dateTime,
  decisionFor,
  deliverabilityBadge,
  detailUrl,
  effectiveStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredCampaigns,
  filteredSuppression,
  filterUrl,
  isPartial,
  loadState,
  lockBanner,
  matchesQuery,
  noticeBanner,
  PHASES,
  pageCount,
  pct,
  phaseBadge,
  recordById,
  recordUrl,
  render,
  riskBadges,
  SEND_STATES,
  segmentName,
  sends,
  state,
  statusBadge,
  statusCount,
  suppressionEntries,
  suppressionId,
  suppressionNote,
  t,
  typeBadge,
  verdictBadge,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const check = (pass) => `<span class="${pass ? "ok" : "warn"}">${pass ? "✓" : "✗"}</span>`;
const readError = (key) => state.settings?.read_errors?.[key] || "";

// ── Overview ───────────────────────────────────────────────────────────────
// Three list-health numbers. The review / scheduled / at-risk counts already
// sit in the sidebar's attention block, so they are not repeated here.
function metricsBand() {
  const health = state.snapshot?.list_health || {};
  return [
    [t("subscribers"), count(health.subscriber_count)],
    [t("avgOpen"), pct(health.avg_open_rate)],
    [t("bounceRate"), pct(health.bounce_rate)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString(document.documentElement.lang) : "";
  document.getElementById("overviewSummary").textContent = [
    `${count(statusCount("all"))} ${t("sendsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const health = state.snapshot?.list_health || {};
  const upcoming = sends()
    .filter((item) => ["needs_review", "changes_requested", "approved"].includes(effectiveStatus(item)))
    .slice()
    .sort((a, b) => String(a.send_at).localeCompare(String(b.send_at)))
    .slice(0, 6);
  const phaseCounts = Object.fromEntries(PHASES.map((phase) => [phase, sends().filter((item) => item.phase === phase).length]));
  const partial = isPartial("sends") ? ` <small class="muted">${t("loadedPage")}</small>` : "";
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("nextSends")}</h2>
        ${
          upcoming
            .map(
              (item) => `
            <a class="due-row" href="${recordUrl(item.send_id, "campaigns")}">
              <span><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(segmentName(item.segment_id))} · ${count(item.audience_size)} ${t("audience")}</small></span>
              <span class="due-meta">${statusBadge(effectiveStatus(item))}<small>${dateTime(item.send_at)}</small></span>
            </a>
          `,
            )
            .join("") || `<div class="empty-inline">${t("noSends")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("listHealth")}</h2>
        <dl class="health-dl">
          <dt>${t("avgClick")}</dt><dd>${pct(health.avg_click_rate)}</dd>
          <dt>${t("complaintRate")}</dt><dd>${pct(health.complaint_rate)}</dd>
          <dt>${t("churnRate")}</dt><dd>${pct(health.churn_rate)}</dd>
        </dl>
      </div>
      <div class="card overview-panel">
        <h2>${t("phase")}${partial}</h2>
        <div class="phase-grid">
          ${PHASES.map(
            (phase) => `
            <a href="#/campaigns${filterUrl("campaigns", { phase })}" class="phase-tile phase-${phase}">
              <strong>${phaseCounts[phase]}</strong>
              <span>${escapeHtml(enumLabel(phase, "phase"))}</span>
            </a>
          `,
          ).join("")}
        </div>
      </div>
      ${suppressionPanel()}
    </section>
  `;
}

// Read-only consent/suppression summary: the human-visible side of the
// pre-send guard. The full list is its own view.
function suppressionPanel() {
  const entries = suppressionEntries();
  const error = readError("suppression");
  const total = state.totals?.suppression ?? entries.length;
  return `
    <div class="card overview-panel">
      <h2><a href="#/suppression">${t("suppression")}</a> <small class="muted">${error ? "—" : count(total)}</small></h2>
      ${
        error
          ? `<div class="empty-inline error-inline">${escapeHtml(t("readFailed"))}: ${escapeHtml(error)}</div>`
          : entries.length
            ? `<ul class="suppression-list">${entries
                .slice(0, 5)
                .map(
                  (entry) => `<li>
                  <a class="suppression-scope" href="${recordUrl(suppressionId(entry), "suppression")}">${suppressionScope(entry)}</a>
                  <span class="risk-badge">${escapeHtml(enumLabel(entry.reason, "suppressionReason"))}</span>
                  <small class="muted">${dateTime(entry.suppressed_at)}</small>
                </li>`,
                )
                .join("")}</ul>`
            : `<div class="empty-inline">${t("suppressionEmpty")}</div>`
      }
    </div>
  `;
}

function suppressionScope(entry) {
  return entry.address
    ? escapeHtml(entry.address)
    : `${escapeHtml(segmentName(entry.segment_id))} <span class="muted">(${t("segment")})</span>`;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  campaigns: "campaignsHint",
  deliverability: "deliverabilityHint",
  performance: "performanceHint",
  suppression: "suppressionHint",
};

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const subjectCell = (item) => cell(`<span class="strong">${escapeHtml(item.subject)}</span>`, item.subject);

// The queue sits beside the record, so it shows only what decides the order
// of work: the subject, its status, and when it goes out.
function campaignsTable(items) {
  return `
    <table class="ws-table campaigns-table">
      ${tableHead([[t("subject")], [t("status")], [t("sendAt"), "ws-split-keep"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.send_id)}
              ${subjectCell(item)}
              ${cell(statusBadge(effectiveStatus(item)))}
              ${cell(dateTime(item.send_at), "", "ws-split-keep muted-cell")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function deliverabilityTable(items) {
  return `
    <table class="ws-table deliverability-table">
      ${tableHead([
        [t("subject")],
        [t("type")],
        [t("spf"), "ws-col-narrow"],
        [t("dkim"), "ws-col-narrow"],
        [t("dmarc"), "ws-col-narrow"],
        [t("spamScore"), "ws-col-num"],
        [t("inboxReadiness"), "ws-col-num"],
        [t("verdict")],
        [t("deliverability")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const d = item.deliverability || {};
            return `${rowOpen(item.send_id)}
              ${subjectCell(item)}
              ${cell(typeBadge(item.type))}
              ${cell(check(d.spf_pass), "", "ws-col-narrow")}
              ${cell(check(d.dkim_pass), "", "ws-col-narrow")}
              ${cell(check(d.dmarc_pass), "", "ws-col-narrow")}
              ${cell(escapeHtml(String(d.spam_score ?? "")), "", "ws-col-num")}
              ${cell(pct(d.inbox_readiness), "", "ws-col-num")}
              ${cell(item.quality_gate ? verdictBadge(item.quality_gate.verdict) : `<span class="muted">—</span>`)}
              ${cell(deliverabilityBadge(d))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function performanceTable(items) {
  return `
    <table class="ws-table performance-table">
      ${tableHead([
        [t("subject")],
        [t("type")],
        [t("delivered"), "ws-col-num"],
        [t("openRate"), "ws-col-num"],
        [t("clickRate"), "ws-col-num"],
        [t("unsubRate"), "ws-col-num"],
        [t("bounceRate"), "ws-col-num"],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const p = item.performance || {};
            return `${rowOpen(item.send_id)}
              ${subjectCell(item)}
              ${cell(typeBadge(item.type))}
              ${cell(count(p.delivered), "", "ws-col-num")}
              ${cell(pct(p.open_rate), "", "ws-col-num")}
              ${cell(pct(p.click_rate), "", "ws-col-num")}
              ${cell(pct(p.unsub_rate), "", "ws-col-num")}
              ${cell(pct(p.bounce_rate), "", "ws-col-num")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function suppressionTable(items) {
  return `
    <table class="ws-table suppression-table">
      ${tableHead([[t("scope")], [t("suppressionReason")], [t("source")], [t("suppressedAt")]])}
      <tbody>
        ${items
          .map(
            (entry) => `${rowOpen(suppressionId(entry))}
              ${cell(`<span class="strong">${suppressionScope(entry)}</span>`, entry.address || segmentName(entry.segment_id))}
              ${cell(`<span class="risk-badge">${escapeHtml(enumLabel(entry.reason, "suppressionReason"))}</span>`)}
              ${cell(escapeHtml(enumLabel(entry.source, "source")), enumLabel(entry.source, "source"))}
              ${cell(dateTime(entry.suppressed_at))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${
        total == null ? t("pageN").replace("{current}", current) : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))
      }</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function statusFilters() {
  return SEND_STATES.map((value) => {
    const label = value === "all" ? t("all") : enumLabel(value);
    return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${count(statusCount(value))}</b></button>`;
  }).join("");
}

function syncToolbarFilters(view) {
  const isQueue = view === "campaigns";
  els.viewFilters.hidden = !isQueue;
  els.viewFilters.innerHTML = isQueue ? statusFilters() : "";
  els.statusSelect.hidden = !isQueue;
  els.phaseSelect.hidden = !isQueue;
  if (!isQueue) return;
  els.statusSelect.innerHTML = SEND_STATES.map(
    (value) =>
      `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("allStatuses") : enumLabel(value))} (${count(statusCount(value))})</option>`,
  ).join("");
  els.phaseSelect.innerHTML = ["all", ...PHASES]
    .map((value) => {
      const n = value === "all" ? sends().length : sends().filter((item) => item.phase === value).length;
      const label = value === "all" ? t("allPhases") : enumLabel(value, "phase");
      return `<option value="${value}"${state.route.phase === value ? " selected" : ""}>${escapeHtml(label)} (${n})</option>`;
    })
    .join("");
}

function viewItems(view) {
  if (view === "campaigns") return filteredCampaigns();
  if (view === "deliverability") return sends().filter(matchesQuery);
  if (view === "performance") return sends().filter((item) => item.performance).filter(matchesQuery);
  return filteredSuppression();
}

function viewTable(view, items) {
  if (view === "campaigns") return campaignsTable(items);
  if (view === "deliverability") return deliverabilityTable(items);
  if (view === "performance") return performanceTable(items);
  return suppressionTable(items);
}

export function renderRecordView() {
  const { view } = state.route;
  const key = BASE_FOR_VIEW[view];
  els.viewTitle.textContent = t(view === "suppression" ? "suppressionNav" : view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = viewItems(view);
  els.viewCount.textContent = `${count(items.length)}${isPartial(key) ? "+" : ""}`;
  syncToolbarFilters(view);
  const error = key === "suppression" ? readError("suppression") : "";
  const empty = error
    ? emptyState(t("readFailed"), error)
    : state.route.query
      ? emptyState(t("noMatches"))
      : emptyState(view === "suppression" ? t("suppressionEmpty") : t("noSends"));
  els.listPanel.innerHTML = `${state.notice && !state.route.selectedId ? noticeBanner() : ""}${items.length ? viewTable(view, items) : empty}${pagerControl(key)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectSend")) : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const extra = state.extra[BASE_FOR_VIEW[view]];
    const pending = extra?.has(selectedId) && extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = view === "suppression" ? suppressionDetail(item) : sendDetail(item);
}

// One detail for a send, whichever view opened it and whichever mode shows it
// (split queue, drawer, or full page): the review form is always here.
function sendDetail(item) {
  const status = effectiveStatus(item);
  const deliverability = item.deliverability || {};
  const decision = decisionFor(item.send_id);
  const edits = state.edits[item.send_id] || {};
  const body = edits.body ?? decision?.body ?? item.body ?? "";
  const note = edits.note ?? decision?.comment ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const performance = item.performance;
  return `
    <article class="send-detail status-${escapeHtml(status)}" data-send="${escapeHtml(item.send_id)}">
      <header class="detail-head">
        <div class="queue-head">
          <span class="queue-ref">${t("sendRef")} #${escapeHtml(String(item.ref))}</span>
          ${statusBadge(status)} ${typeBadge(item.type)} ${phaseBadge(item.phase)}
          ${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : ""} ${riskBadges(item.risk)}
        </div>
        <h2>${escapeHtml(item.subject)}</h2>
        <p class="queue-meta">${escapeHtml(segmentName(item.segment_id))} · ${count(item.audience_size)} ${t("audience")} · ${deliverabilityBadge(deliverability)}</p>
      </header>
      ${lockBanner()}
      ${warnings((warning) => warning.send_id === item.send_id)}
      <section class="detail">
        <div class="detail-main">
          ${item.reason ? `<p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>` : ""}
          ${suppressionNote(item)}
          ${qualityGatePanel(item.quality_gate)}
          <div class="review-form">
            ${variantPicker(item, disabled)}
            <label class="queue-label" for="body-${escapeHtml(item.send_id)}">${t("body")}</label>
            <textarea id="body-${escapeHtml(item.send_id)}" class="queue-draft" data-field="body" rows="10" ${disabled}>${escapeHtml(body)}</textarea>
            <label class="queue-label" for="note-${escapeHtml(item.send_id)}">${t("reviewNote")}</label>
            <textarea id="note-${escapeHtml(item.send_id)}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            ${noticeBanner()}
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString(document.documentElement.lang) : "")}</span>` : ""}
            </div>
          </div>
          ${
            performance
              ? `
            <div class="card overview-panel">
              <h3>${t("performance")}</h3>
              <dl class="health-dl">
                <dt>${t("delivered")}</dt><dd>${count(performance.delivered)}</dd>
                <dt>${t("openRate")}</dt><dd>${pct(performance.open_rate)}</dd>
                <dt>${t("clickRate")}</dt><dd>${pct(performance.click_rate)}</dd>
                <dt>${t("unsubRate")}</dt><dd>${pct(performance.unsub_rate)}</dd>
                <dt>${t("bounceRate")}</dt><dd>${pct(performance.bounce_rate)}</dd>
              </dl>
            </div>
          `
              : ""
          }
        </div>
        <aside class="card detail-side">
          <dl>
            <dt>${t("sendAt")}</dt><dd>${dateTime(item.send_at)}</dd>
            <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "action"))}</dd>
            <dt>${t("previewText")}</dt><dd>${escapeHtml(item.preview_text || "")}</dd>
            <dt>${t("spf")}</dt><dd>${check(deliverability.spf_pass)}</dd>
            <dt>${t("dkim")}</dt><dd>${check(deliverability.dkim_pass)}</dd>
            <dt>${t("dmarc")}</dt><dd>${check(deliverability.dmarc_pass)}</dd>
            <dt>${t("spamScore")}</dt><dd>${escapeHtml(String(deliverability.spam_score ?? ""))}</dd>
            <dt>${t("inboxReadiness")}</dt><dd>${pct(deliverability.inbox_readiness)}</dd>
          </dl>
        </aside>
      </section>
    </article>
  `;
}

function suppressionDetail(entry) {
  const id = suppressionId(entry);
  // Loaded sends whose pre-send check matched this entry.
  const affected = sends().filter((send) => (send.suppression?.matched || []).some((match) => suppressionId(match) === id));
  return `
    <header class="detail-head">
      <h2>${suppressionScope(entry)}</h2>
      <p class="muted">${escapeHtml(enumLabel(entry.reason, "suppressionReason"))} · ${dateTime(entry.suppressed_at)}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("scope")}</dt><dd>${entry.address ? t("addressScope") : t("segmentScope")}</dd>
        <dt>${t("source")}</dt><dd>${escapeHtml(enumLabel(entry.source, "source"))}</dd>
        <dt>${t("note")}</dt><dd>${escapeHtml(entry.note || "—")}</dd>
      </dl>
      <section>
        <h3>${t("affectedSends")}${isPartial("sends") ? ` <small class="muted">${t("loadedPage")}</small>` : ""}</h3>
        ${
          affected
            .map(
              (send) => `
          <a class="due-row" href="${recordUrl(send.send_id, "campaigns")}">
            <span><strong>${escapeHtml(send.subject)}</strong><small>${escapeHtml(segmentName(send.segment_id))}</small></span>
            <span class="due-meta">${statusBadge(effectiveStatus(send))}<small>${dateTime(send.send_at)}</small></span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noAffectedSends")}</div>`
        }
      </section>
    </div>
  `;
}

export function qualityGatePanel(gate) {
  if (!gate) return "";
  return `
    <div class="gate-panel gate-${escapeHtml(gate.verdict)}">
      <div class="gate-head">
        <h3>${t("qualityGate")}</h3>
        ${verdictBadge(gate.verdict)}
        <span class="gate-eqs">${t("eqs")}: <strong>${escapeHtml(String(gate.eqs))}</strong></span>
      </div>
      <p class="gate-summary">${escapeHtml(gate.summary || "")}</p>
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (item) => `
          <li class="${item.pass ? "pass" : "fail"}">
            <span class="gate-key">${escapeHtml(item.key)}</span>
            <span class="gate-label">${escapeHtml(item.label)}</span>
            <span class="gate-note">${escapeHtml(item.note || "")}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function variantPicker(send, disabled) {
  const variants = send.subject_variants || [];
  if (variants.length < 2) return "";
  const decision = decisionFor(send.send_id);
  const chosen = state.edits[send.send_id]?.chosen_variant ?? decision?.chosen_variant ?? "";
  return `
    <span class="queue-label">${t("chooseVariant")}</span>
    <div class="variant-list">
      ${variants
        .map(
          (variant) => `
        <label class="variant-option ${chosen === variant.id ? "chosen" : ""}">
          <input type="radio" name="variant-${escapeHtml(send.send_id)}" value="${escapeHtml(variant.id)}" ${chosen === variant.id ? "checked" : ""} ${disabled}>
          <span class="variant-id">${escapeHtml(String(variant.id).toUpperCase())}</span>
          <span class="variant-subject">${escapeHtml(variant.subject)}</span>
        </label>
      `,
        )
        .join("")}
    </div>
  `;
}

export async function submitDecision(sendId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = card.querySelector('[data-field="body"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  const chosenVariant = card.querySelector('input[type="radio"]:checked')?.value;
  try {
    const provider = await getProvider();
    await provider.applyDecision(sendId, { action, comment: note, body, chosen_variant: chosenVariant });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[sendId];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const brand = summary.brand || {};
  const esp = summary.esp || {};
  const policy = summary.sending_policy || {};
  const errors = Object.entries(state.settings?.read_errors || {});
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      ${
        errors.length
          ? `<section class="card"><h2>${t("readFailed")}</h2><dl>${errors.map(([key, message]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(message)}</dd>`).join("")}</dl></section>`
          : ""
      }
      <section class="card">
        <h2>${t("configuration")}</h2>
        <p class="muted">${t("localFilesOnly")}</p>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("operator")}</h2>
        <dl>
          <dt>${t("name")}</dt><dd>${escapeHtml(operator.name || "")}</dd>
          <dt>${t("role")}</dt><dd>${escapeHtml(operator.role || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(operator.company || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(operator.timezone || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("brand")} · ${t("esp")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("unsubUrl")}</dt><dd>${escapeHtml(brand.unsubscribe_url || "")}</dd>
          <dt>${t("esp")}</dt><dd>${escapeHtml(esp.display_name || "")}</dd>
          <dt>${t("provider")}</dt><dd>${escapeHtml(esp.provider || "")}</dd>
          <dt>${t("secretsReady")}</dt><dd class="${esp.secrets_ready ? "ok" : "warn"}">${esp.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("sendingPolicy")}</h2>
        <dl>
          <dt>${t("dailyCap")}</dt><dd>${count(policy.daily_send_cap)}</dd>
          <dt>${t("hourlyCap")}</dt><dd>${count(policy.hourly_send_cap)}</dd>
          <dt>${t("minInboxReadiness")}</dt><dd>${pct(policy.min_inbox_readiness)}</dd>
          <dt>${t("maxSpamScore")}</dt><dd>${escapeHtml(String(policy.max_spam_score ?? ""))}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("fromIdentities")}</h2>
        ${
          (summary.from_identities || [])
            .map(
              (identity) => `
          <div class="settings-channel">
            <strong>${escapeHtml(identity.from_name || "")}</strong>
            <span>${escapeHtml(identity.from_email || "")}</span>
            <span class="muted">${(identity.use_when || []).map((v) => escapeHtml(enumLabel(v, "type"))).join(", ")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("segments")}</h2>
        ${
          (summary.segments || [])
            .map(
              (segment) => `
          <div class="settings-channel">
            <strong>${escapeHtml(segment.name || "")}</strong>
            <span class="muted">${escapeHtml(segment.description || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
