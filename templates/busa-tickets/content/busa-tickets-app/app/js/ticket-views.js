import {
  BOARD_STATUSES,
  CATEGORIES,
  DETAIL_MODES,
  DISPATCH_STATUSES,
  URGENCIES,
  categoryBadge,
  channelBadge,
  crewName,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredIntake,
  filteredProposals,
  filteredTickets,
  formatAge,
  intakeItems,
  isPartial,
  loadState,
  noticeBanner,
  pageCount,
  proposals,
  recordById,
  recordUrl,
  render,
  slaBadge,
  state,
  statusBadge,
  t,
  tickets,
  urgencyBadge,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar's attention block does not already show (that
// block covers proposals-to-approve / unclassified intake / SLA at risk).
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  return [
    [t("openTickets"), String(metrics.open_tickets ?? 0)],
    [t("avgResolution"), `${metrics.avg_resolution_hours ?? 0}${t("hours")}`],
    [t("weekIntake"), String(metrics.intake_count ?? 0)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function categoryDistributionSvg() {
  const counts = new Map();
  for (const ticket of tickets()) {
    counts.set(ticket.category, (counts.get(ticket.category) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-inline">${t("empty")}</div>`;
  const max = entries[0][1];
  const rowHeight = 26;
  const labelWidth = 96;
  const barSpan = 190;
  const rows = entries
    .map(([category, count], index) => {
      const y = index * rowHeight;
      const width = Math.max(4, Math.round((count / max) * barSpan));
      return `
      <text x="${labelWidth - 8}" y="${y + 16}" text-anchor="end" class="svg-label">${escapeHtml(enumLabel(category, "category"))}</text>
      <rect x="${labelWidth}" y="${y + 6}" width="${barSpan}" height="12" rx="3" class="svg-track"></rect>
      <rect x="${labelWidth}" y="${y + 6}" width="${width}" height="12" rx="3" class="svg-bar"></rect>
      <text x="${labelWidth + barSpan + 8}" y="${y + 16}" class="svg-count">${count}</text>
    `;
    })
    .join("");
  return `
    <svg viewBox="0 0 320 ${entries.length * rowHeight}" role="img" aria-label="${t("categoryDistribution")}" class="category-svg" preserveAspectRatio="xMinYMin meet">
      ${rows}
    </svg>
  `;
}

function crewLoadPanel() {
  const openByCrew = new Map();
  for (const ticket of tickets()) {
    if (ticket.status === "resolved" || !ticket.crew_id) continue;
    openByCrew.set(ticket.crew_id, (openByCrew.get(ticket.crew_id) || 0) + 1);
  }
  const crewList = state.snapshot?.crews || [];
  const max = Math.max(1, ...openByCrew.values());
  return (
    crewList
      .map((crew) => {
        const count = openByCrew.get(crew.crew_id) || 0;
        return `
      <div class="crew-row">
        <span class="crew-name"><strong>${escapeHtml(crew.name)}</strong><small>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</small></span>
        <span class="crew-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
        <span class="crew-count">${count}</span>
      </div>
    `;
      })
      .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
  );
}

function syncLogRows() {
  return (
    (state.snapshot?.sync_log || [])
      .slice(-6)
      .reverse()
      .map(
        (entry) => `
    <div class="log-row">
      <span class="badge">${escapeHtml(entry.source)}</span>
      <span class="log-detail">${escapeHtml(entry.detail || entry.action || "")}</span>
      <span class="muted">${date(entry.at)}</span>
    </div>
  `,
      )
      .join("") || `<div class="empty-inline">${t("empty")}</div>`
  );
}

export function renderOverview() {
  document.getElementById("overviewSummary").textContent = state.snapshot?.generated_at
    ? `${state.snapshot?.property?.name || ""} · ${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("categoryDistribution")}</h2>
        ${categoryDistributionSvg()}
      </div>
      <div class="overview-panel">
        <h2>${t("crewLoad")}</h2>
        ${crewLoadPanel()}
      </div>
      <div class="overview-panel wide">
        <h2>${t("syncLog")}</h2>
        ${syncLogRows()}
      </div>
    </section>
  `;
}

// ── Record views ─────────────────────────────────────────────────────────
const VIEW_HINT = { intake: "intakeItems", dispatch: "dispatchQueue", board: "tickets" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

function intakeTable(items) {
  return `
    <table class="ws-table intake-table">
      ${tableHead([
        [t("channel"), "ws-col-narrow"],
        [t("received"), "ws-col-narrow"],
        [t("reporter")],
        [`${t("unit")} / ${t("location")}`],
        [t("text")],
        [t("urgency"), "ws-col-narrow"],
        [t("triageState"), "ws-col-narrow"],
        [t("ticket"), "ws-col-narrow"],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const unitLocation = [item.unit, item.location].filter(Boolean).join(" · ");
            return `${rowOpen(item.id)}
              ${cell(channelBadge(item.channel))}
              ${cell(date(item.received_at), item.received_at)}
              ${cell(escapeHtml(item.reporter), item.reporter)}
              ${cell(escapeHtml(unitLocation), unitLocation)}
              ${cell(`<span class="strong">${escapeHtml(item.text)}</span>`, item.text, "cell-text")}
              ${cell(urgencyBadge(item.urgency_guess))}
              ${cell(statusBadge(item.triage_state, "triage"))}
              ${cell(item.ticket_id ? `<a class="ticket-link" href="${recordUrl(item.ticket_id, "board")}">${escapeHtml(item.ticket_id)}</a>` : "")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function ticketsTable(items) {
  return `
    <table class="ws-table tickets-table">
      ${tableHead([
        [t("ticket")],
        [t("status"), "ws-col-narrow"],
        [t("category")],
        [`${t("unit")} / ${t("location")}`],
        [t("crew")],
        [t("age"), "ws-col-narrow"],
        [t("sla"), "ws-col-narrow"],
      ])}
      <tbody>
        ${items
          .map((ticket) => {
            const unitLocation = [ticket.unit, ticket.location].filter(Boolean).join(" · ");
            return `${rowOpen(ticket.id)}
              ${cell(`<span class="ticket-link">${escapeHtml(ticket.id)}</span> <span class="strong">${escapeHtml(ticket.title)}</span>`, ticket.title, "cell-text")}
              ${cell(statusBadge(ticket.status, "ticket_status"))}
              ${cell(categoryBadge(ticket.category), enumLabel(ticket.category, "category"))}
              ${cell(escapeHtml(unitLocation), unitLocation)}
              ${cell(escapeHtml(crewName(ticket.crew_id)) || "—", crewName(ticket.crew_id))}
              ${cell(formatAge(ticket.created_at), "", "ws-col-num")}
              ${cell(slaBadge(ticket))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function proposalsTable(items) {
  return `
    <table class="ws-table proposals-table">
      ${tableHead([[t("dispatchQueue")], [t("status"), "ws-col-narrow ws-split-keep"]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title, "cell-text")}
              ${cell(statusBadge(item.status, "proposal_status"))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function statusFilters(view) {
  const statuses = view === "dispatch" ? DISPATCH_STATUSES : BOARD_STATUSES;
  const all = view === "dispatch" ? proposals() : tickets();
  const group = view === "dispatch" ? "proposal_status" : "ticket_status";
  const chip = (key, count) => `
    <button type="button" class="chip ${state.route.status === key ? "active" : ""}" data-status="${key}">
      ${key === "all" ? t("all") : escapeHtml(enumLabel(key, group))} <span>${count}</span>
    </button>
  `;
  return `
    ${chip("all", all.length)}
    ${statuses.map((status) => chip(status, all.filter((item) => item.status === status).length)).join("")}
  `;
}

// Prev/Next only — see app.js's goToPage()/pageCount() comment for why.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${total ? t("pageOf").replace("{current}", current).replace("{total}", total) : ""}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "intake" ? filteredIntake() : view === "dispatch" ? filteredProposals() : filteredTickets();
  const baseKey = view === "intake" ? "intake" : view === "dispatch" ? "proposals" : "tickets";
  els.viewCount.textContent = `${items.length}${isPartial(baseKey) ? "+" : ""}`;
  els.viewFilters.hidden = view === "intake";
  els.viewFilters.innerHTML = view === "intake" ? "" : statusFilters(view);

  const table = view === "intake" ? intakeTable(items) : view === "dispatch" ? proposalsTable(items) : ticketsTable(items);
  const empty = emptyState(state.route.query ? t("noMatches") || t("empty") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(baseKey)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectProposal")) : "";
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
  els.detailBody.innerHTML =
    view === "intake" ? intakeDetail(item) : view === "dispatch" ? proposalDetail(item) : ticketDetail(item);
}

function classificationEditor(item) {
  const done = item.triage_state === "ticketed" || item.triage_state === "ignored";
  const disabled = done ? "disabled" : "";
  return `
    <div class="editor-panel">
      <h3>${t("classification")}</h3>
      <div class="editor-grid">
        <label>${t("category")}
          <select data-field="category" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${CATEGORIES.map((category) => `<option value="${category}" ${category === item.category_guess ? "selected" : ""}>${escapeHtml(enumLabel(category, "category"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("urgency")}
          <select data-field="urgency" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${URGENCIES.map((urgency) => `<option value="${urgency}" ${urgency === item.urgency_guess ? "selected" : ""}>${escapeHtml(enumLabel(urgency, "urgency"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("unit")}
          <input type="text" data-field="unit" data-for="${escapeHtml(item.id)}" value="${escapeHtml(item.unit || "")}" ${disabled}>
        </label>
      </div>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(item.id)}" rows="2" ${disabled}></textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="convert_to_ticket" data-id="${escapeHtml(item.id)}" ${disabled}>${t("convertToTicket")}</button>
        <button type="button" class="danger" data-decision="ignore" data-id="${escapeHtml(item.id)}" ${disabled}>${t("ignore")}</button>
      </div>
      ${
        item.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(item.decision.action, "action"))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")} · ${t("agentQueued")}</small>
        </div>
      `
          : ""
      }
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
      ${noticeBanner()}
    </div>
  `;
}

function intakeDetail(item) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.reporter)}</h2>
      <p class="muted">${channelBadge(item.channel)} ${urgencyBadge(item.urgency_guess)} ${statusBadge(item.triage_state, "triage")}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="text-panel">
          <p class="full-text">${escapeHtml(item.text)}</p>
          ${item.attachments_note ? `<p class="muted">${t("attachments")}: ${escapeHtml(item.attachments_note)}</p>` : ""}
        </div>
        ${classificationEditor(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("intakeDetail")}</h2>
        <dl>
          <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel"))} ${item.external_id ? `· ${escapeHtml(item.external_id)}` : ""}</dd>
          <dt>${t("received")}</dt><dd>${date(item.received_at)}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(item.contact_masked || "")}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(item.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(item.location || "")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(enumLabel(item.category_guess, "category"))}</dd>
          <dt>${t("linkedTicket")}</dt><dd>${item.ticket_id ? `<a class="ticket-link" href="${recordUrl(item.ticket_id, "board")}">${escapeHtml(item.ticket_id)}</a>` : "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function proposalDetail(proposal) {
  const ticket = recordById("board", proposal.ticket_id);
  const terminal = proposal.status === "done";
  const disabled = terminal ? "disabled" : "";
  return `
    <article class="proposal-card status-edge-${escapeHtml(proposal.status)}" data-proposal="${escapeHtml(proposal.id)}">
      <header class="proposal-head">
        <span class="ref">Dispatch #${proposal.ref}</span>
        ${statusBadge(proposal.status, "proposal_status")}
        <span class="badge priority-${escapeHtml(proposal.priority)}">${escapeHtml(proposal.priority)}</span>
        ${ticket ? slaBadge({ sla_state: ticket.sla_state, sla_due_at: proposal.sla_due_at }) : ""}
      </header>
      <h3>${escapeHtml(proposal.title)}</h3>
      <p class="muted">
        <a class="ticket-link" href="${recordUrl(proposal.ticket_id, "board")}">${escapeHtml(proposal.ticket_id)}</a>
        ${escapeHtml(proposal.summary)}
      </p>
      <dl class="proposal-meta">
        <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(proposal.proposed_crew_id))}${proposal.proposed_assignee ? ` · ${escapeHtml(proposal.proposed_assignee)}` : ""}</dd>
        <dt>${t("priority")}</dt><dd>${escapeHtml(proposal.priority)}</dd>
        <dt>${t("slaTarget")}</dt><dd>${date(proposal.sla_due_at)} (${proposal.sla_hours}${t("hours")})</dd>
      </dl>
      <div class="reason"><span>${t("reason")}</span>${escapeHtml(proposal.reason)}</div>
      <label class="note-label">${t("noteToCrew")}
        <textarea data-draft-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.note_to_crew || "")}</textarea>
      </label>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.decision?.note || "")}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(proposal.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(proposal.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(proposal.id)}" title="${t("saveNote")}" ${disabled}>${t("saveNote")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(proposal.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
      ${
        proposal.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(proposal.decision.action, "action"))}</strong>
          ${proposal.decision.note ? `<span>${escapeHtml(proposal.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(proposal.decision.decided_at ? new Date(proposal.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        proposal.execution
          ? `
        <div class="execution-info">
          ${(proposal.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(op.target || "")} ${escapeHtml(op.detail || "")}</div>`).join("")}
          <small>${escapeHtml(proposal.execution.detail || "")}</small>
        </div>
      `
          : ""
      }
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
      ${noticeBanner()}
    </article>
  `;
}

function ticketDetail(ticket) {
  const relatedIntake = intakeItems().filter((item) => (ticket.intake_ids || []).includes(item.id));
  return `
    <header class="detail-head">
      <h2>${escapeHtml(ticket.id)} · ${escapeHtml(ticket.title)}</h2>
      <p class="muted">${statusBadge(ticket.status, "ticket_status")} ${categoryBadge(ticket.category)} ${urgencyBadge(ticket.urgency)}</p>
    </header>
    ${warnings((warning) => warning.ticket_id === ticket.id)}
    <section class="detail">
      <div class="detail-main">
        <div class="timeline-panel">
          <h3>${t("timeline")}</h3>
          <ol class="timeline">
            ${(ticket.history || [])
              .map(
                (event) => `
              <li class="timeline-item event-${escapeHtml(event.event)}">
                <div class="timeline-head">
                  <strong>${escapeHtml(enumLabel(event.event, "event"))}</strong>
                  <span class="muted">${escapeHtml(event.actor || "")} · ${date(event.at)}</span>
                </div>
                ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
              </li>
            `,
              )
              .join("")}
          </ol>
        </div>
        <div class="editor-panel">
          <label class="note-label">${t("resolutionNote")}
            <textarea data-note-for="${escapeHtml(ticket.id)}" rows="3">${escapeHtml(ticket.resolution_note || "")}</textarea>
          </label>
          <div class="actions">
            <button type="button" class="primary" data-decision="revise" data-id="${escapeHtml(ticket.id)}" title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
          ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
          ${noticeBanner()}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("ticketDetail")}</h2>
        <dl>
          <dt>${t("unit")}</dt><dd>${escapeHtml(ticket.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(ticket.location || "")}</dd>
          <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(ticket.crew_id)) || "—"}</dd>
          <dt>${t("assignee")}</dt><dd>${escapeHtml(ticket.assignee || "")}</dd>
          <dt>${t("created")}</dt><dd>${date(ticket.created_at)}</dd>
          <dt>${t("updated")}</dt><dd>${date(ticket.updated_at)}</dd>
          <dt>${t("slaTarget")}</dt><dd>${slaBadge(ticket)}</dd>
          <dt>${t("reporter")}</dt><dd>${escapeHtml(ticket.reporter || "")}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(ticket.contact_masked || "")}</dd>
          <dt>${t("intake")}</dt><dd>${relatedIntake.map((item) => `<a href="${recordUrl(item.id, "intake")}">${escapeHtml(item.id)}</a>`).join(", ") || "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("property")}</dt><dd>${escapeHtml(summary.property?.name || "")} · ${summary.property?.buildings || 0} ${t("buildings")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(summary.property?.timezone || "")}</dd>
          <dt>${t("channels")}</dt><dd>${(summary.channels || []).map((channel) => channelBadge(channel)).join(" ")}</dd>
          <dt>${t("categories")}</dt><dd>${(summary.categories || []).map((category) => categoryBadge(category)).join(" ")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("crews")}</h2>
        ${
          (summary.crews || [])
            .map(
              (crew) => `
          <div class="settings-account">
            <strong>${escapeHtml(crew.name)}</strong>
            <span>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</span>
            <span><code>${escapeHtml(crew.contact_env || "")}</code></span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("slaRules")}</h2>
        ${
          (summary.sla_rules || [])
            .map(
              (rule) => `
          <div class="settings-account">
            <strong>${escapeHtml(rule.category === "*" ? "*" : enumLabel(rule.category, "category"))}</strong>
            <span>${escapeHtml(enumLabel(rule.urgency, "urgency"))}</span>
            <span>${rule.hours}${t("hours")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
        <p class="muted">${t("defaultSla")}: ${summary.sla_default_hours || 72}${t("hours")}</p>
      </section>
    </div>
  `;
}

// Dispatches a decision to whichever entity id belongs to (a dispatch
// proposal, an intake item, or a ticket resolution note). Demo mode is
// short-circuited into in-memory state (never touches Busabase), matching
// the ?demo=1 contract used across Busa App-in-Skills.
export async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  const fields = {};
  document.querySelectorAll(`[data-field][data-for="${cssAttr(id)}"]`).forEach((input) => {
    fields[input.dataset.field] = input.value;
  });
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      fields: Object.keys(fields).length ? fields : null,
      decided_at: new Date().toISOString(),
    };
    render();
    return;
  }
  const proposal = proposals().find((item) => item.id === id);
  const intakeItem = proposal ? null : intakeItems().find((item) => item.id === id);
  const ticket = proposal || intakeItem ? null : tickets().find((item) => item.id === id);
  let result;
  try {
    const provider = await getProvider();
    if (proposal) {
      result = await provider.decideProposal({ proposal_id: id, action, note, draft });
    } else if (intakeItem) {
      result = await provider.decideIntake({
        intake_id: id,
        action,
        note,
        fields: Object.keys(fields).length ? fields : null,
      });
    } else if (ticket) {
      result = await provider.reviseTicket({ ticket_id: id, note });
    } else {
      state.notice = `Unknown item id: ${id}`;
      render();
      return;
    }
  } catch (error) {
    state.notice = error instanceof Error ? error.message : String(error);
    render();
    return;
  }
  await loadState();
  // Without write access the decision is a ChangeRequest and the item keeps its
  // old status until someone who has it approves: say that, not "Saved".
  state.notice = (result?.pending ? t("savedForReview") : t("saved")) || "";
  render();
}

function cssAttr(value) {
  return String(value).replaceAll('"', '\\"');
}
