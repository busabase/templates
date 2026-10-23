import {
  attentionCounts,
  baseKeyFor,
  briefById,
  DETAIL_MODES,
  date,
  dateTime,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  isLocked,
  isPartial,
  loadState,
  pagerControl,
  recordById,
  recordTotal,
  recordUrl,
  reportById,
  research,
  signals,
  state,
  t,
  targetName,
  trends,
  watchlist,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

// ── Small helpers ──────────────────────────────────────────────────────────
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}" tabindex="0"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const cssToken = (value) => String(value || "").replace(/[^a-z0-9_-]/gi, "");
const matches = (values, query) => values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));

// Badges take their dot, wash and ink from one `--dot` token (base-ui
// `.badge`). Classes are prefixed so a value like `search` never collides with
// an app class of the same name.
export const severityBadge = (severity) =>
  `<span class="badge sev-${cssToken(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
export const statusBadge = (status) =>
  `<span class="badge status-${cssToken(status)}">${escapeHtml(enumLabel(status))}</span>`;
export const kindBadge = (kind) =>
  `<span class="badge kind-${cssToken(kind)}">${escapeHtml(enumLabel(kind, "source_kind"))}</span>`;

function lockBanner() {
  if (!isLocked()) return "";
  const lock = state.settings.lock;
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml([lock.owner, lock.message].filter(Boolean).join(" · "))}</span></div></div>`;
}

function noticeBanner() {
  return state.notice ? `<div class="notice-banner" role="alert">${escapeHtml(state.notice)}</div>` : "";
}

export function sparkline(momentum = [], width = 96, height = 26) {
  if (!momentum.length) return "";
  const max = Math.max(...momentum);
  const min = Math.min(...momentum);
  const span = max - min || 1;
  const step = width / Math.max(momentum.length - 1, 1);
  const points = momentum
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(1)}`,
    )
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function deltaArrow(delta) {
  const value = Number(delta || 0);
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "→";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(value)}%</span>`;
}

// A signal's source_id names one of its watch target's sources. Show what it
// is (kind + host, linked), never the bare id.
function signalSource(item) {
  const target = recordById("watchlist", item.target_id);
  const source = (target?.sources || []).find((entry) => entry.source_id === item.source_id);
  if (!source) return escapeHtml(enumLabel(item.source_kind, "source_kind"));
  let host = source.url;
  try {
    host = new URL(source.url).host;
  } catch {
    host = source.url || "";
  }
  return `${kindBadge(source.kind)} <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(host)}</a>`;
}

const draftArea = (draftKey, saved, id = "review-note", placeholder = t("reviewNote")) =>
  `<textarea id="${id}" class="review-note" data-draft="${escapeHtml(draftKey)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(state.drafts[draftKey] ?? saved ?? "")}</textarea>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries triage, briefs
// and reports). Opportunities and high-severity triage are exact
// records.count results when the provider has them; follow-ups live inside
// each question's JSON, so they are counted from the loaded questions and say
// so when more questions exist than are loaded.
function metricsBand() {
  const counts = attentionCounts();
  const followupScope = isPartial("questions") ? ` · ${t("loadedOnly")}` : "";
  return [
    [t("highTriage"), counts.highTriage, "#/signals"],
    [t("opportunitiesToReview"), counts.opportunities, "#/trends?tab=opportunities"],
    [t("followupsRunning") + followupScope, counts.followups, "#/research"],
  ]
    .map(
      ([label, value, href]) =>
        `<a href="${href}"><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></a>`,
    )
    .join("");
}

function demoBanner() {
  return state.settings?.demo ? `<div class="demo-note">${t("demoNote")}</div>` : "";
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at;
  document.getElementById("overviewSummary").textContent = [
    `${recordTotal("signals", signals().length)} ${t("signals").toLowerCase()}`,
    `${recordTotal("watchlist", watchlist().length)} ${t("watchTargets")}`,
    generated && Date.parse(generated) > 0 ? `${t("generated")} ${dateTime(generated)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const topSignals = signals()
    .filter((item) => item.status === "needs_review" || item.severity === "high")
    .slice(0, 5);
  const movers = [...trends().movers].sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct)).slice(0, 5);
  const pipeline = ["brief_needs_review", "researching", "report_ready", "closed"];
  const questions = research().questions;
  document.getElementById("overviewBody").innerHTML = `
    ${demoBanner()}
    ${lockBanner()}
    ${noticeBanner()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("topSignals")}</h2>
        ${
          topSignals
            .map(
              (item) => `
          <a class="signal-row" href="${recordUrl(item.signal_id, "signals")}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.headline)}</strong>
              <small>${escapeHtml(targetName(item.target_id))} · ${date(item.detected_at)}</small>
            </span>
            ${severityBadge(item.severity)}
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("freshness")}</h2>
        ${
          watchlist()
            .slice(0, 6)
            .map(
              (item) => `
          <a class="signal-row" href="${recordUrl(item.target_id, "watchlist")}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.name)}</strong>
              <small>${escapeHtml(enumLabel(item.type, "target_type"))} · ${item.signals_7d} ${t("signalsWeek")}</small>
            </span>
            <span class="muted">${dateTime(item.last_check_at)}</span>
            ${statusBadge(item.status)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("topMovers")}</h2>
        ${
          movers
            .map(
              (item) => `
          <a class="signal-row" href="${recordUrl(item.mover_id, "trends", "movers")}">
            <span class="signal-row-main">
              <strong>${escapeHtml(item.keyword)}</strong>
              <small>${escapeHtml(enumLabel(item.source, "source_kind"))}</small>
            </span>
            <span class="spark-cell">${sparkline(item.momentum)}</span>
            ${deltaArrow(item.delta_pct)}
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("researchPipeline")}</h2>
        <div class="pipeline">
          ${pipeline
            .map(
              (stage) => `
            <div class="pipeline-stage">
              <strong>${questions.filter((question) => question.status === stage || (stage === "closed" && question.status === "annotated")).length}</strong>
              <span>${escapeHtml(enumLabel(stage))}</span>
            </div>
          `,
            )
            .join("")}
        </div>
        ${questions
          .filter((question) => question.status !== "closed")
          .slice(0, 3)
          .map(
            (question) => `
          <a class="signal-row" href="${recordUrl(question.question_id, "research")}">
            <span class="signal-row-main">
              <strong>${escapeHtml(question.question)}</strong>
              <small>${escapeHtml(enumLabel(question.depth, "depth"))} · ${date(question.asked_at)}</small>
            </span>
            ${statusBadge(question.status)}
          </a>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  signals: "signalsHint",
  watchlist: "watchlistHint",
  research: "researchHint",
  trends: "trendsHint",
};

function filteredItems() {
  const { view, tab } = state.route;
  const query = state.route.query.trim().toLowerCase();
  if (view === "signals") {
    return signals().filter(
      (item) =>
        !query ||
        matches(
          [item.headline, item.summary, item.source_kind, item.severity, item.status, targetName(item.target_id)],
          query,
        ),
    );
  }
  if (view === "watchlist") {
    return watchlist().filter((item) => !query || matches([item.name, item.type, item.status, item.notes], query));
  }
  if (view === "research") {
    return research().questions.filter(
      (item) => !query || matches([item.question, item.status, item.depth, item.cost_note], query),
    );
  }
  if (tab === "opportunities") {
    return trends().opportunities.filter(
      (item) => !query || matches([item.title, item.status, item.rationale, item.proposed_next_step?.summary], query),
    );
  }
  return trends().movers.filter((item) => !query || matches([item.keyword, item.source], query));
}

function signalsTable(items) {
  return `
    <table class="ws-table radar-table signals-table">
      ${tableHead([[t("headline")], [t("severity"), "col-sev"], [t("triage"), "ws-split-keep col-status"]])}
      <tbody>
        ${items
          .map((item) => {
            // The target is named in the headline and in the detail beside it.
            const title = `${item.headline} — ${targetName(item.target_id)}`;
            return `${rowOpen(item.signal_id)}
              ${cell(`<span class="strong">${escapeHtml(item.headline)}</span>`, title)}
              ${cell(severityBadge(item.severity), "", "col-sev")}
              ${cell(statusBadge(item.status), "", "ws-split-keep col-status")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function watchlistTable(items) {
  return `
    <table class="ws-table radar-table watchlist-table">
      ${tableHead([[t("target")], [t("status")], [t("notes"), "ws-col-wide"], [t("type")], [t("sourcesMonitored")], [t("lastCheck")], [t("signalsWeek"), "ws-col-num"]])}
      <tbody>
        ${items
          .map((item) => {
            const kinds = (item.sources || []).map((source) => enumLabel(source.kind, "source_kind")).join(" · ");
            return `${rowOpen(item.target_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(item.notes || ""), item.notes, "muted-cell")}
              ${cell(escapeHtml(enumLabel(item.type, "target_type")))}
              ${cell(escapeHtml(kinds), kinds)}
              ${cell(dateTime(item.last_check_at), "", "muted-cell")}
              ${cell(String(item.signals_7d ?? 0), "", "ws-col-num")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function researchTable(items) {
  return `
    <table class="ws-table radar-table research-table">
      ${tableHead([[t("question")], [t("status")], [t("depth")], [t("askedAt")], [t("costNote"), "ws-col-wide"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.question_id)}
              ${cell(`<span class="strong">${escapeHtml(item.question)}</span>`, item.question)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(enumLabel(item.depth, "depth")))}
              ${cell(date(item.asked_at), "", "muted-cell")}
              ${cell(escapeHtml(item.cost_note || ""), item.cost_note, "muted-cell")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// A mover links to its card either way round: its own opportunity_id, or the
// card's mover_ids listing it.
function opportunityFor(mover) {
  if (mover.opportunity_id) return recordById("opportunities", mover.opportunity_id);
  return trends().opportunities.find((item) => (item.mover_ids || []).includes(mover.mover_id)) || null;
}

function moversTable(items) {
  return `
    <table class="ws-table radar-table movers-table">
      ${tableHead([[t("keyword")], [t("opportunity")], [t("source")], [t("volume"), "ws-col-num"], [t("delta"), "ws-col-num"], [t("momentum")]])}
      <tbody>
        ${items
          .map((item) => {
            const opportunity = opportunityFor(item);
            const opportunityCell = opportunity
              ? statusBadge(opportunity.status)
              : `<span class="muted">${item.opportunity_id ? t("notLoaded") : t("noOpportunity")}</span>`;
            return `${rowOpen(item.mover_id)}
              ${cell(`<span class="strong">${escapeHtml(item.keyword)}</span>`, item.keyword)}
              ${cell(opportunityCell)}
              ${cell(kindBadge(item.source))}
              ${cell(Number(item.volume_proxy).toLocaleString(), "", "ws-col-num")}
              ${cell(deltaArrow(item.delta_pct), "", "ws-col-num")}
              ${cell(`<span class="spark-cell">${sparkline(item.momentum)}</span>`)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function moverKeywords(opportunity) {
  const ids = opportunity.mover_ids?.length
    ? opportunity.mover_ids
    : trends()
        .movers.filter((mover) => mover.opportunity_id === opportunity.opportunity_id)
        .map((mover) => mover.mover_id);
  return ids.map((id) => recordById("movers", id)?.keyword || t("notLoaded")).join(" · ");
}

function opportunitiesTable(items) {
  return `
    <table class="ws-table radar-table opportunities-table">
      ${tableHead([[t("opportunity")], [t("status")], [t("proposedNextStep"), "ws-col-wide"], [t("keyword")], [t("created")]])}
      <tbody>
        ${items
          .map((item) => {
            const step = enumLabel(item.proposed_next_step?.operation, "operation");
            const keywords = moverKeywords(item);
            return `${rowOpen(item.opportunity_id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(statusBadge(item.status))}
              ${cell(escapeHtml(step), item.proposed_next_step?.summary || step)}
              ${cell(escapeHtml(keywords), keywords)}
              ${cell(date(item.created_at), "", "muted-cell")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function trendTabs() {
  const counts = {
    movers: trends().movers.length,
    opportunities: recordTotal("opportunities", trends().opportunities.length),
  };
  return ["movers", "opportunities"]
    .map(
      (tab) =>
        `<button type="button" class="segment ${state.route.tab === tab ? "active" : ""}" data-tab="${tab}">${escapeHtml(t(tab === "movers" ? "moversTab" : "opportunitiesTab"))} <b>${escapeHtml(counts[tab])}</b></button>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view, tab } = state.route;
  const key = baseKeyFor(view, tab);
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = filteredItems();
  els.viewCount.textContent = `${items.length}${isPartial(key) ? "+" : ""}`;
  els.viewTabs.hidden = view !== "trends";
  els.viewTabs.innerHTML = view === "trends" ? trendTabs() : "";

  const table =
    view === "signals"
      ? signalsTable(items)
      : view === "watchlist"
        ? watchlistTable(items)
        : view === "research"
          ? researchTable(items)
          : tab === "opportunities"
            ? opportunitiesTable(items)
            : moversTable(items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(key)}`;
  renderDetail(key);
}

function renderDetail(key) {
  const { view, tab, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view, tab);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[key] === "split" ? emptyState(t("selectSignal")) : "";
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
  const renderers = {
    signals: signalDetail,
    watchlist: watchTargetDetail,
    questions: researchDetail,
    movers: moverDetail,
    opportunities: opportunityDetail,
  };
  els.detailBody.innerHTML = `${noticeBanner()}${renderers[key](item)}`;
}

// ── Details ────────────────────────────────────────────────────────────────
function diffPanel(diff) {
  if (!diff?.lines?.length) return "";
  return `
    <div class="diff-panel">
      <div class="diff-labels"><span>${escapeHtml(diff.before_label || "before")}</span><span>${escapeHtml(diff.after_label || "after")}</span></div>
      <div class="diff-lines">
        ${diff.lines.map((line) => `<div class="diff-line ${cssToken(line.type)}"><span class="diff-sign">${line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}</span>${escapeHtml(line.text)}</div>`).join("")}
      </div>
    </div>
  `;
}

const disabledAttr = () => (isLocked() || state.saving ? "disabled" : "");

function triageButtons(item) {
  const disabled = disabledAttr();
  const button = (action, label, hint, primary = false) =>
    `<button type="button" class="button action${primary ? " primary" : ""}" data-action="${action}" data-kind="signal" data-id="${escapeHtml(item.signal_id)}" ${disabled} title="${escapeHtml(`${label} — ${hint}`)}">${escapeHtml(label)}</button>`;
  return `
    <div class="action-row">
      ${button("approve", t("act"), t("actHint"), true)}
      ${button("watch", t("watch"), t("watchHint"))}
      ${button("ignore", t("ignore"), t("ignoreHint"))}
      ${button("block", t("needsInfo"), t("needsInfoHint"))}
    </div>
  `;
}

function signalDetail(item) {
  const target = recordById("watchlist", item.target_id);
  return `
    <header class="detail-header">
      <h2>${escapeHtml(item.headline)}</h2>
      <div class="detail-head">
        ${kindBadge(item.source_kind)}
        ${severityBadge(item.severity)}
        ${statusBadge(item.status)}
        <span class="muted">${t("detected")} ${dateTime(item.detected_at)}</span>
      </div>
    </header>
    <dl class="detail-facts">
      <dt>${t("target")}</dt><dd>${target ? `<a href="${recordUrl(target.target_id, "watchlist")}">${escapeHtml(target.name)}</a>` : escapeHtml(targetName(item.target_id))}</dd>
      <dt>${t("source")}</dt><dd>${signalSource(item)}</dd>
      ${item.triage?.decided_at ? `<dt>${t("decision")}</dt><dd>${escapeHtml(enumLabel(item.triage.action, "action"))} · ${dateTime(item.triage.decided_at)}</dd>` : ""}
    </dl>
    <section class="detail-section">
      <h3>${t("changeSummary")}</h3>
      <p>${escapeHtml(item.summary)}</p>
      ${diffPanel(item.diff)}
    </section>
    <section class="detail-section">
      <h3>${t("whyItMatters")}</h3>
      <p>${escapeHtml(item.why_it_matters || "")}</p>
      ${item.handoff ? `<div class="handoff-chip">${t("proposedNextStep")}: <strong>${escapeHtml(enumLabel(item.handoff.operation, "operation"))}</strong> · ${escapeHtml(item.handoff.summary || "")}</div>` : ""}
    </section>
    <section class="detail-section">
      <h3>${t("triage")}</h3>
      ${lockBanner()}
      ${triageButtons(item)}
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      ${draftArea(`signal:${item.signal_id}`, item.triage?.comment)}
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
    <section class="detail-section">
      <h3>${t("evidence")}</h3>
      <ul class="evidence-list">
        ${(item.evidence || []).map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(entry.title || entry.url)}</a></li>`).join("") || `<li class="muted">—</li>`}
      </ul>
    </section>
  `;
}

function watchTargetDetail(item) {
  const history = signals().filter((signal) => signal.target_id === item.target_id);
  return `
    <header class="detail-header">
      <h2>${escapeHtml(item.name)}</h2>
      <div class="detail-head">
        <span class="badge">${escapeHtml(enumLabel(item.type, "target_type"))}</span>
        ${statusBadge(item.status)}
        <span class="muted">${t("lastCheck")} ${dateTime(item.last_check_at)} · ${item.signals_7d ?? 0} ${t("signalsWeek")}</span>
      </div>
    </header>
    ${item.notes ? `<p class="detail-lead">${escapeHtml(item.notes)}</p>` : ""}
    <section class="detail-section">
      <h3>${t("sourcesMonitored")}</h3>
      <div class="inner-table-wrap">
        <table class="inner-table">
          <thead><tr><th>${t("source")}</th><th>${t("type")}</th><th>${t("method")}</th><th>${t("lastCheck")}</th><th>${t("lastChange")}</th></tr></thead>
          <tbody>
            ${
              (item.sources || [])
                .map(
                  (source) => `
              <tr>
                <td><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></td>
                <td>${kindBadge(source.kind)}</td>
                <td>${escapeHtml(enumLabel(source.method, "method"))}</td>
                <td class="muted">${dateTime(source.last_check_at)}</td>
                <td class="muted">${dateTime(source.last_change_at)}</td>
              </tr>
            `,
                )
                .join("") || `<tr><td colspan="5" class="muted">—</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
    <section class="detail-section">
      <h3>${t("recentSignals")}${isPartial("signals") ? ` <small class="muted">${t("loadedOnly")}</small>` : ""}</h3>
      ${
        history
          .map(
            (signal) => `
        <a class="signal-row" href="${recordUrl(signal.signal_id, "signals")}">
          <span class="signal-row-main">
            <strong>${escapeHtml(signal.headline)}</strong>
            <small>${escapeHtml(enumLabel(signal.source_kind, "source_kind"))} · ${dateTime(signal.detected_at)}</small>
          </span>
          ${severityBadge(signal.severity)}
          ${statusBadge(signal.status)}
        </a>
      `,
          )
          .join("") || `<div class="empty-inline">${t("noSignalsYet")}</div>`
      }
    </section>
  `;
}

function briefStagePanel(brief) {
  const disabled = disabledAttr();
  return `
    <section class="detail-section">
      <div class="detail-head">
        <h3>${t("briefFor")}</h3>
        ${statusBadge(brief.status)}
        <span class="muted">${escapeHtml(enumLabel(brief.depth, "depth"))} · ${dateTime(brief.drafted_at)}</span>
      </div>
      <h4>${t("scope")}</h4>
      <p>${escapeHtml(brief.scope)}</p>
      <h4>${t("plannedSources")}</h4>
      <ul>${(brief.planned_sources || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      <h4>${t("expectedDeliverable")}</h4>
      <p>${escapeHtml(brief.expected_deliverable || "")}</p>
      ${brief.notes ? `<p class="muted">${escapeHtml(brief.notes)}</p>` : ""}
    </section>
    <section class="detail-section">
      <h3>${t("triage")}</h3>
      ${lockBanner()}
      <div class="action-row">
        <button type="button" class="button action primary" data-action="approve" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("approveBrief")}</button>
        <button type="button" class="button action" data-action="request_changes" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="button action" data-action="block" data-kind="brief" data-id="${escapeHtml(brief.brief_id)}" ${disabled}>${t("block")}</button>
      </div>
      <label class="note-label" for="review-note">${t("reviewNote")}</label>
      ${draftArea(`brief:${brief.brief_id}`, brief.triage?.comment)}
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
  `;
}

function reportStagePanel(question, report) {
  const disabled = disabledAttr();
  const sourceIndex = new Map((report.sources || []).map((source, index) => [source.source_id, index + 1]));
  const confidence = Number(report.confidence || 0);
  return `
    <section class="detail-section">
      <div class="detail-head">
        <h3>${t("reportFor")}</h3>
        <span class="muted">${t("filedAt")} ${dateTime(report.filed_at)}</span>
      </div>
      <h4 class="report-title">${escapeHtml(report.title)}</h4>
      <p>${escapeHtml(report.summary)}</p>
      ${(report.sections || [])
        .map(
          (section) => `
        <section class="report-section">
          <h4>${escapeHtml(section.heading)}</h4>
          <p>${escapeHtml(section.body)}</p>
          <div class="citation-chips">
            ${(section.source_ids || [])
              .map((sourceId) => {
                const source = (report.sources || []).find((entry) => entry.source_id === sourceId);
                return source
                  ? `<a class="citation-chip" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(source.title)}">[${sourceIndex.get(sourceId)}] ${escapeHtml(source.title)}</a>`
                  : "";
              })
              .join("")}
          </div>
          ${(report.annotations || [])
            .filter((annotation) => annotation.section_id === section.section_id)
            .map(
              (annotation) =>
                `<div class="annotation"><strong>${escapeHtml(annotation.author)}</strong> · ${dateTime(annotation.at)}<p>${escapeHtml(annotation.text)}</p></div>`,
            )
            .join("")}
        </section>
      `,
        )
        .join("")}
      <h4>${t("sources")}</h4>
      <ol class="source-list">
        ${(report.sources || []).map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a></li>`).join("")}
      </ol>
    </section>
    <section class="detail-section">
      <h3>${t("rateConfidence")}</h3>
      ${lockBanner()}
      <div class="action-row confidence-row">
        ${[1, 2, 3, 4, 5]
          .map(
            (value) =>
              `<button type="button" class="button action confidence ${confidence >= value ? "filled" : ""}" data-action="approve" data-kind="report" data-id="${escapeHtml(report.report_id)}" data-confidence="${value}" ${disabled} title="${t("confidence")} ${value}/5">${value}</button>`,
          )
          .join("")}
        <span class="muted">${t("confidence")}: ${confidence || "—"}/5</span>
      </div>
      <label class="note-label" for="followup-input">${t("followups")}</label>
      ${draftArea(`followup:${question.question_id}`, "", "followup-input", t("followUpPlaceholder"))}
      <div class="action-row">
        <button type="button" class="button action primary" id="file-followup" data-question="${escapeHtml(question.question_id)}" ${disabled}>${t("askFollowup")}</button>
      </div>
      ${(question.followups || [])
        .map((fu) => `<div class="followup-row"><span>${escapeHtml(fu.question)}</span>${statusBadge(fu.status)}</div>`)
        .join("")}
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
  `;
}

function researchDetail(question) {
  const brief = briefById(question.brief_id);
  const report = reportById(question.report_id);
  const briefStage = question.status === "brief_needs_review" && brief;
  const missing = (id) => (id ? `<p class="muted">${t("notLoaded")}</p>` : "");
  return `
    <header class="detail-header">
      <h2>${escapeHtml(question.question)}</h2>
      <div class="detail-head">
        ${statusBadge(question.status)}
        <span class="muted">${escapeHtml(enumLabel(question.depth, "depth"))} · ${t("askedAt")} ${date(question.asked_at)}${question.confidence ? ` · ${t("confidence")} ${question.confidence}/5` : ""}</span>
      </div>
    </header>
    ${question.cost_note ? `<p class="detail-lead">${escapeHtml(question.cost_note)}</p>` : ""}
    ${briefStage ? briefStagePanel(brief) : ""}
    ${!briefStage && report ? reportStagePanel(question, report) : ""}
    ${
      !briefStage && !report
        ? `<section class="detail-section"><h3>${escapeHtml(enumLabel(question.status))}</h3>${brief ? `<p class="muted">${escapeHtml(brief.scope)}</p>` : missing(question.brief_id || question.report_id)}</section>`
        : ""
    }
    ${brief && !briefStage ? `<section class="detail-section"><h3>${t("briefFor")}</h3><p class="muted">${escapeHtml(brief.scope)}</p></section>` : ""}
  `;
}

// The opportunity on its own (drawer/page) leads with its title as the
// heading; under a mover it is one section of the mover's detail.
function opportunityCard(item, standalone = false) {
  const disabled = disabledAttr();
  const head = `
      <div class="detail-head">
        ${statusBadge(item.status)}
        <span class="muted">${t("created")} ${date(item.created_at)}</span>
      </div>`;
  return `
    ${standalone ? `<header class="detail-header"><h2>${escapeHtml(item.title)}</h2>${head}</header>` : ""}
    <section class="detail-section">
      ${standalone ? "" : `<h3>${t("opportunity")}: ${escapeHtml(item.title)}</h3>${head}`}
      <p class="muted">${escapeHtml(item.rationale)}</p>
      <div class="handoff-chip">${t("proposedNextStep")}: <strong>${escapeHtml(enumLabel(item.proposed_next_step?.operation, "operation"))}</strong><br>${escapeHtml(item.proposed_next_step?.summary || "")}</div>
      ${lockBanner()}
      <div class="action-row">
        ${
          item.status === "needs_review"
            ? `
          <button type="button" class="button action primary" data-action="approve" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("approve")}</button>
          <button type="button" class="button action" data-action="ignore" data-kind="opportunity" data-id="${escapeHtml(item.opportunity_id)}" ${disabled}>${t("ignore")}</button>
        `
            : `<span class="muted">${escapeHtml(item.triage?.comment || "")}</span>`
        }
      </div>
      <div id="decision-feedback" class="muted decision-feedback" role="status"></div>
    </section>
  `;
}

function moverDetail(item) {
  const opportunity = opportunityFor(item);
  return `
    <header class="detail-header">
      <h2>${escapeHtml(item.keyword)}</h2>
      <div class="detail-head">
        ${kindBadge(item.source)}
        ${deltaArrow(item.delta_pct)}
      </div>
    </header>
    <div class="mover-chart">${sparkline(item.momentum, 480, 72)}</div>
    <dl class="detail-facts">
      <dt>${t("volume")}</dt><dd class="num-inline">${Number(item.volume_proxy).toLocaleString()}</dd>
      <dt>${t("firstSeen")}</dt><dd>${date(item.first_seen)}</dd>
      <dt>${t("lastUpdated")}</dt><dd>${dateTime(item.last_updated)}</dd>
    </dl>
    ${
      opportunity
        ? opportunityCard(opportunity)
        : `<section class="detail-section"><h3>${t("opportunity")}</h3><p class="muted">${item.opportunity_id ? t("notLoaded") : t("noOpportunity")}</p></section>`
    }
  `;
}

function opportunityDetail(item) {
  const keywords = moverKeywords(item);
  return `
    ${opportunityCard(item, true)}
    ${keywords ? `<dl class="detail-facts"><dt>${t("keyword")}</dt><dd>${escapeHtml(keywords)}</dd></dl>` : ""}
  `;
}

// ── Settings ───────────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const defaults = summary.research_defaults || {};
  const container = document.getElementById("settingsContent");
  // Keep the accent picker that accent-theme.js appends after our markup.
  const picker = container.querySelector("[data-accent-settings]");
  container.innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("cadence")}</dt><dd>${escapeHtml(
            Object.entries(summary.cadence || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ") || "—",
          )}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("products")}</h2>
        ${
          (summary.profile?.products || [])
            .map(
              (product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.positioning)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("watchlist")}</h2>
        ${
          (summary.watchlist || [])
            .map(
              (target) => `
          <div class="settings-row">
            <strong>${escapeHtml(target.name)}</strong>
            <span>${escapeHtml(enumLabel(target.type, "target_type"))} · ${target.source_count} ${t("sources").toLowerCase()}</span>
            <span>${(target.methods || []).map((method) => escapeHtml(enumLabel(method, "method"))).join(", ")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("researchDefaults")}</h2>
        <dl>
          <dt>${t("depth")}</dt><dd>${escapeHtml(enumLabel(defaults.default_depth, "depth"))}</dd>
          <dt>${t("sourcePolicy")}</dt><dd>${escapeHtml(defaults.source_policy || "")}</dd>
          <dt>${t("requireCitations")}</dt><dd>${defaults.require_citations ? "✓" : "✗"}</dd>
          <dt>${t("maxSources")}</dt><dd>${defaults.max_sources || "—"}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("trendSources")}</h2>
        ${
          (summary.trend_sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${kindBadge(source.kind)}</span>
            <span>${escapeHtml(enumLabel(source.method, "method"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("envReadiness")}</h2>
        ${
          (summary.env_readiness || [])
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(entry.name)}</strong>
            <span class="${entry.ready ? "positive" : "negative"}">${entry.ready ? t("ready") : t("missing")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">—</div>`
        }
      </section>
      <section class="card">
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
  if (picker) container.append(picker);
}

// ── Decisions ──────────────────────────────────────────────────────────────
function showFeedback(message) {
  const node = els.detailBody.querySelector("#decision-feedback");
  if (node) node.textContent = message;
}

export async function submitDecision(payload) {
  if (state.saving) return;
  state.saving = true;
  try {
    const provider = await getProvider();
    const body = await provider.saveDecision(payload);
    if (!body.ok) throw new Error(body.error || "Decision failed");
    delete state.drafts[`${payload.kind}:${payload.id}`];
    state.saving = false;
    await loadState();
    // Without write access the decision is a ChangeRequest, and the item keeps
    // its old status until someone who has it approves: say so on the record.
    if (body.pending) showFeedback(t("savedForReview"));
  } catch (error) {
    state.saving = false;
    showFeedback(error instanceof Error ? error.message : String(error));
  }
}

export async function submitFollowup(questionId) {
  const question = els.detailBody.querySelector("#followup-input")?.value.trim();
  if (!question || state.saving) return;
  state.saving = true;
  try {
    const provider = await getProvider();
    const body = await provider.saveFollowup({ question_id: questionId, question });
    if (!body.ok) throw new Error(body.error || "Follow-up failed");
    delete state.drafts[`followup:${questionId}`];
    state.saving = false;
    await loadState();
    if (body.pending) showFeedback(t("savedForReview"));
  } catch (error) {
    state.saving = false;
    showFeedback(error instanceof Error ? error.message : String(error));
  }
}
