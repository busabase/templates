import {
  actionChip,
  activeLang,
  barsSvg,
  breachingTickets,
  categoryChip,
  channelBadge,
  countryCell,
  csatStars,
  csatTrendSvg,
  customerLabel,
  dateTime,
  els,
  emptyState,
  enumLabel,
  escapeHtml,
  flashNotice,
  gateBadge,
  isLocked,
  kbById,
  knowledge,
  loadState,
  matchesQuery,
  pagerControl,
  priorityChip,
  recordTotal,
  recordUrl,
  referenceNow,
  render,
  slaCountdown,
  state,
  statusChip,
  t,
  ticketById,
  tickets,
  warningsHtml,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { recomputeMetrics, runQualityGate } from "./support-model.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar's attention block does not already show
// (needs-review, breaching-SLA and gate-blocked are already there).
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const week = metrics.tickets_this_week || { total: 0 };
  return [
    [t("open"), metrics.open_count || 0],
    [t("ticketsThisWeek"), week.total || 0],
    [t("csatAverage"), `${metrics.csat_average || 0} / 5`],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

export function renderOverview() {
  document.getElementById("overviewSummary").textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  els.overviewMetrics.innerHTML = metricsBand();

  const metrics = state.snapshot?.metrics || {};
  const week = metrics.tickets_this_week || { total: 0, by_channel: {} };
  const zh = activeLang() === "zh";
  const frMedian =
    metrics.first_response_median_minutes >= 60
      ? `${Math.round(metrics.first_response_median_minutes / 6) / 10}${zh ? " 小时" : "h"}`
      : `${metrics.first_response_median_minutes || 0}${zh ? " 分钟" : "m"}`;
  const channelBits = Object.entries(week.by_channel || {})
    .map(([channel, count]) => `${channelBadge(channel)} <strong class="channel-count">${count}</strong>`)
    .join(" ");
  els.overviewBody.innerHTML = `
    ${warningsHtml()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("volumeByChannel")}</h2>
        <p class="muted">${escapeHtml(t("ticketsThisWeek"))}: ${channelBits || "—"}</p>
        ${barsSvg(
          Object.entries(week.by_channel || {}).map(([ch, n]) => [enumLabel(ch, "channel"), n]),
          { colorFor: () => "#4b6bfb" },
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("byCategory")}</h2>
        ${barsSvg(
          Object.entries(metrics.by_category || {}).map(([cat, n]) => [enumLabel(cat, "category"), n]),
          { colorFor: () => "#7c5cfc" },
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("csatTrend")}</h2>
        ${csatTrendSvg(metrics.csat_trend)}
      </div>
      <div class="overview-panel">
        <h2>${t("firstResponse")} · ${t("resolved")}</h2>
        <p class="muted">${t("firstResponse")}: <strong>${escapeHtml(frMedian)}</strong></p>
        <p class="muted">${t("resolved")}: <strong>${metrics.resolved_count || 0}</strong></p>
      </div>
    </section>
  `;
}

// ── Tickets (split: the review queue, worked top to bottom) ────────────────
function filteredTickets() {
  const filter = state.route.status;
  return tickets()
    .filter((item) => (filter === "all" ? true : item.status === filter))
    .filter((item) =>
      matchesQuery([
        item.customer?.name,
        item.customer?.company,
        item.subject,
        item.category,
        item.channel,
        item.priority,
        item.status,
        `#${item.ref}`,
        ...(item.messages || []).slice(-3).map((m) => m.text),
      ]),
    );
}

function ticketsTable(items) {
  return `
    <table class="ws-table tickets-table">
      ${tableHead([[t("subjectBody")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const label = [`#${item.ref}`, item.customer?.name, item.subject].filter(Boolean).join(" — ");
            return `${rowOpen(item.ticket_id)}
              ${cell(`<span class="strong">#${item.ref} ${escapeHtml(item.customer?.name || "")}</span>${item.sla?.breached ? ' <span class="overdue">●</span>' : ""}`, label)}
              ${cell(statusChip(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

export function renderTickets() {
  const list = filteredTickets();
  els.viewCount.textContent = `${recordTotal("tickets", list.length)}`;
  els.listPanel.innerHTML = `${
    list.length ? ticketsTable(list) : emptyState(state.route.query ? t("noMatches") : t("noTickets"))
  }${pagerControl("tickets")}`;
}

function gateHtml(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "ship";
  return `
    <div class="gate-panel ${escapeHtml(verdict)}">
      <div class="gate-head">
        <strong>⛩ support-qa</strong>
        ${gateBadge(gate)}
      </div>
      <div class="gate-summary">${escapeHtml(gate.summary || "")}</div>
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) =>
              `<li class="${check.ok ? "ok" : "fail"}"><span aria-hidden="true">${check.ok ? "✓" : "✗"}</span> ${escapeHtml(check.message)}</li>`,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export function renderTicketDetail(ticketId) {
  const ticket = ticketById(ticketId);
  if (!ticket) {
    els.detailBody.innerHTML = emptyState(t("notLoaded"));
    return;
  }
  const locked = isLocked();
  const editable = ticket.status !== "done" && ticket.status !== "blocked";
  const draft = state.drafts[ticket.ticket_id];
  const replyValue = draft !== undefined ? draft : ticket.suggested_reply || "";
  const kbRefs = (ticket.kb_refs || []).map((id) => kbById(id)).filter(Boolean);
  const danglingRefs = (ticket.kb_refs || []).filter((id) => !kbById(id));
  const slaValue =
    state.slas[ticket.ticket_id] !== undefined ? state.slas[ticket.ticket_id] : toLocalDatetime(ticket.sla?.due_by);
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>#${ticket.ref} ${escapeHtml(ticket.subject || ticket.ticket_id)}</h2>
      <p class="muted">${escapeHtml(
        [customerLabel(ticket.customer), enumLabel(ticket.channel, "channel"), enumLabel(ticket.category, "category"), enumLabel(ticket.status)]
          .filter(Boolean)
          .join(" · "),
      )}</p>
    </header>
    <section class="detail">
      <div class="detail-main conv-detail">
        <div class="transcript">
          ${(ticket.messages || [])
            .map(
              (message) => `
            <div class="bubble-row ${message.direction === "outgoing" ? "out" : "in"}">
              <div class="bubble">
                <div class="bubble-meta"><strong>${escapeHtml(message.sender)}</strong><span>${dateTime(message.sent_at)}</span></div>
                <div class="bubble-text">${escapeHtml(message.text)}</div>
                ${message.attachment ? `<div class="bubble-attachment">${escapeHtml(message.attachment)}</div>` : ""}
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        ${ticket.reason ? `<div class="approval-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(ticket.reason)}</div>` : ""}
        ${gateHtml(ticket.quality_gate)}
        <div class="composer">
          ${editable ? `<div class="composer-hint">${t("agentSuggestedReply")}</div>` : ""}
          ${
            editable
              ? `<textarea id="composer-text" rows="5" placeholder="${escapeHtml(t("agentSuggestedReply"))}" ${locked ? "disabled" : ""}>${escapeHtml(replyValue)}</textarea>`
              : `<div class="approval-sent-text">${escapeHtml(ticket.suggested_reply || "—")}</div>`
          }
          ${
            kbRefs.length || danglingRefs.length
              ? `<div class="kb-ref-row"><span class="muted">${t("kbRefs")}:</span> ${kbRefs
                  .map((a) => `<a class="badge" href="${recordUrl(a.article_id, "knowledge")}">${escapeHtml(a.title)}</a>`)
                  .join(
                    " ",
                  )} ${danglingRefs.map((id) => `<span class="badge bad">${escapeHtml(id)} ✗</span>`).join(" ")}</div>`
              : `<div class="kb-ref-row muted">${t("noKbRefs")}</div>`
          }
          ${
            editable
              ? `
            <input id="composer-note" type="text" placeholder="${escapeHtml(t("notePlaceholder"))}" value="${escapeHtml(state.notes[ticket.ticket_id] || "")}" ${locked ? "disabled" : ""}>
            <div class="composer-actions">
              <input type="text" id="decision-comment" placeholder="${escapeHtml(t("commentPlaceholder"))}" ${locked ? "disabled" : ""}>
              <div class="approval-buttons">
                <button type="button" data-action="save-reply" data-ticket="${escapeHtml(ticket.ticket_id)}" ${locked ? "disabled" : ""}>${t("queueReply")}</button>
                <button type="button" class="primary" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="approve" ${locked ? "disabled" : ""}>${t("approve")}</button>
                <button type="button" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="request_changes" ${locked ? "disabled" : ""}>${t("requestChanges")}</button>
                <button type="button" class="danger" data-action="decide" data-ticket="${escapeHtml(ticket.ticket_id)}" data-decision="block" ${locked ? "disabled" : ""}>${t("block")}</button>
              </div>
            </div>
          `
              : ""
          }
          ${ticket.status === "approved" ? `<div class="approval-waiting">${t("waitingForSend")}</div>` : ""}
          ${ticket.decision?.comment ? `<div class="approval-reason"><span class="muted">${t("comment")}:</span> ${escapeHtml(ticket.decision.comment)} <small class="muted">(${t("decidedAt")} ${dateTime(ticket.decision.decided_at)})</small></div>` : ""}
          ${ticket.execution && ticket.execution.status === "executed" ? `<div class="approval-execution">${t("sentVia")} ${escapeHtml(enumLabel(ticket.execution.connector, "connector"))} · ${escapeHtml(ticket.execution.target || "")} ${ticket.execution.executed_at ? `· ${dateTime(ticket.execution.executed_at)}` : ""}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("customer")}</h2>
        <dl>
          <dt>${t("company")}</dt><dd>${escapeHtml(ticket.customer?.company || "—")}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(ticket.customer?.email || ticket.customer?.handle || "—")}</dd>
          <dt>${t("plan")}</dt><dd>${escapeHtml(ticket.customer?.plan || "—")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(ticket.channel)}</dd>
          <dt>${t("category")}</dt><dd>${categoryChip(ticket.category)}</dd>
          <dt>${t("priority")}</dt><dd>${priorityChip(ticket.priority)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${actionChip(ticket.proposed_action)}</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(ticket.owner || "")}</dd>
          <dt>${t("source")} (${t("channel")})</dt><dd>${countryCell(ticket.customer?.country)}</dd>
        </dl>
        <h2>SLA</h2>
        <dl>
          <dt>${t("dueBy")}</dt><dd class="${ticket.sla?.breached ? "overdue" : ""}">${ticket.sla?.due_by ? `${dateTime(ticket.sla.due_by)}${ticket.sla?.breached ? ` · ${t("slaBreached")}` : ""}` : "—"}</dd>
        </dl>
        ${
          editable
            ? `
          <div class="sla-field">
            <input id="sla-due" type="datetime-local" value="${escapeHtml(slaValue)}" ${locked ? "disabled" : ""}>
            <button type="button" data-action="save-sla" data-ticket="${escapeHtml(ticket.ticket_id)}" ${locked ? "disabled" : ""}>${t("saveSla")}</button>
          </div>
        `
            : ""
        }
        ${ticket.csat ? `<h2>${t("csat")}</h2><div class="csat-side">${csatStars(ticket.csat.score)} ${ticket.csat.comment ? `<p class="side-text">"${escapeHtml(ticket.csat.comment)}"</p>` : ""}</div>` : ""}
      </aside>
    </section>
  `;
  const composer = els.detailBody.querySelector("#composer-text");
  composer?.addEventListener("input", () => {
    state.drafts[ticket.ticket_id] = composer.value;
  });
  const note = els.detailBody.querySelector("#composer-note");
  note?.addEventListener("input", () => {
    state.notes[ticket.ticket_id] = note.value;
  });
  const sla = els.detailBody.querySelector("#sla-due");
  sla?.addEventListener("input", () => {
    state.slas[ticket.ticket_id] = sla.value;
  });
}

// ── Knowledge (drawer: a fact you scan many of and return from) ────────────
function filteredKnowledge() {
  return knowledge().filter((article) =>
    matchesQuery([article.title, article.body, article.category, ...(article.tags || [])]),
  );
}

export function renderKnowledge() {
  const list = filteredKnowledge();
  els.viewCount.textContent = `${recordTotal("knowledge-base", list.length)}`;
  els.listPanel.innerHTML = list.length
    ? `
    <div class="kb-grid">
      ${list
        .map(
          (article) => `
        <a class="kb-card ${article.kind === "macro" ? "macro" : ""} ${article.article_id === state.route.selectedId ? "ws-selected" : ""}" href="${recordUrl(article.article_id, "knowledge")}">
          <div class="row between">
            <strong>${escapeHtml(article.title)}</strong>
            <span class="badge">${article.kind === "macro" ? t("macro") : escapeHtml(article.category || "")}</span>
          </div>
          <p class="kb-body">${escapeHtml(article.body)}</p>
          <div class="kb-tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </a>
      `,
        )
        .join("")}
    </div>
    ${pagerControl("knowledge")}
  `
    : emptyState(state.route.query ? t("noMatches") : t("empty"));
}

export function renderKbDetail(articleId) {
  const article = kbById(articleId);
  if (!article) {
    els.detailBody.innerHTML = emptyState(t("notLoaded"));
    return;
  }
  const citedBy = tickets().filter((ticket) => (ticket.kb_refs || []).includes(article.article_id));
  els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>${escapeHtml(article.title)}</h2>
      <p class="muted">${escapeHtml(article.kind === "macro" ? t("macro") : article.category || "")}</p>
    </header>
    <div class="detail-stack">
      <div class="overview-panel kb-article">
        <p class="kb-article-body">${escapeHtml(article.body)}</p>
        <div class="kb-tags">${(article.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <section>
        <h3>${t("tickets")}</h3>
        ${
          citedBy.length
            ? citedBy
                .map(
                  (ticket) => `
          <a class="side-row" href="${recordUrl(ticket.ticket_id, "tickets")}">
            <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
            <span class="muted">${escapeHtml(ticket.subject || "")}</span>
          </a>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </section>
    </div>
  `;
}

// ── SLA & CSAT (a cross-ticket board, not a record view) ───────────────────
export function renderSla() {
  const metrics = state.snapshot?.metrics || {};
  const open = tickets().filter((item) => item.status !== "done" && item.status !== "blocked" && item.sla?.due_by);
  const withCountdown = open
    .map((ticket) => ({ ticket, sla: slaCountdown(ticket.sla.due_by) }))
    .sort((a, b) => new Date(a.ticket.sla.due_by).getTime() - new Date(b.ticket.sla.due_by).getTime());
  const rated = tickets()
    .filter((item) => item.csat)
    .sort((a, b) => String(b.csat?.rated_at).localeCompare(String(a.csat?.rated_at)));
  els.slaBody.innerHTML = `
    <p class="muted">${breachingTickets().length} ${t("slaBreached")} · ${t("csatAverage")} ${metrics.csat_average || 0}/5</p>
    <section class="overview-grid two">
      <div class="overview-panel">
        <h2>${t("slaBoard")}</h2>
        ${
          withCountdown.length
            ? `<div class="sla-list">${withCountdown
                .map(
                  ({ ticket, sla }) => `
            <a class="sla-row ${sla.overdue ? "breached" : ""}" href="${recordUrl(ticket.ticket_id, "tickets")}">
              <span class="sla-copy">
                <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
                <span class="muted">${escapeHtml(ticket.subject || "")}</span>
              </span>
              <span class="sla-meta">
                ${priorityChip(ticket.priority)}
                <span class="${sla.overdue ? "overdue" : "muted"}">${escapeHtml(sla.text)}</span>
              </span>
            </a>
          `,
                )
                .join("")}</div>`
            : `<div class="empty-inline">—</div>`
        }
      </div>
      <div class="overview-panel">
        <h2>${t("csatTrend")}</h2>
        ${csatTrendSvg(metrics.csat_trend)}
        <div class="csat-list">
          ${
            rated.length
              ? rated
                  .map(
                    (ticket) => `
            <a class="csat-row" href="${recordUrl(ticket.ticket_id, "tickets")}">
              <span class="sla-copy">
                <strong>#${ticket.ref} ${escapeHtml(ticket.customer?.name || "")}</strong>
                ${ticket.csat?.comment ? `<span class="muted">"${escapeHtml(ticket.csat.comment)}"</span>` : ""}
              </span>
              ${csatStars(ticket.csat?.score)}
            </a>
          `,
                  )
                  .join("")
              : `<div class="empty-inline">—</div>`
          }
        </div>
      </div>
    </section>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const syncLog = state.snapshot?.sync_log || [];
  const report = state.settings?.execution_report;
  const risk = summary.risk_policy || {};
  els.settingsBody.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("knowledgeBase")}</dt><dd>${escapeHtml(summary.knowledge_base?.source_path || "—")}</dd>
          ${summary.reply_style ? `<dt>${t("replyStyle")}</dt><dd>${escapeHtml(summary.reply_style.tone || "")}</dd>` : ""}
        </dl>
      </section>
      <section>
        <h2>${t("riskPolicy")}</h2>
        <dl>
          <dt>Refund approval</dt><dd>${risk.refund_requires_approval === false ? t("off") || "off" : "required"}</dd>
          <dt>Max auto-refund</dt><dd>${risk.max_auto_refund ?? "—"}</dd>
          <dt>Block ungrounded</dt><dd>${risk.block_ungrounded_replies === false ? "no" : "yes"}</dd>
          <dt>Block commitments</dt><dd>${risk.block_commitments_without_approval === false ? "no" : "yes"}</dd>
        </dl>
      </section>
      ${
        summary.sla_policy
          ? `
      <section>
        <h2>${t("slaPolicy")}</h2>
        <dl>
          ${Object.entries(summary.sla_policy.first_response_hours || {})
            .map(
              ([severity, hours]) =>
                `<dt>${escapeHtml(enumLabel(severity, "severity"))}</dt><dd>${t("firstResponse")}: ${escapeHtml(hours)}h</dd>`,
            )
            .join("")}
          ${summary.sla_policy.business_hours ? `<dt>Business hours</dt><dd>${escapeHtml(summary.sla_policy.business_hours)}</dd>` : ""}
        </dl>
      </section>
      `
          : ""
      }
      <section>
        <h2>${t("accounts")}</h2>
        ${
          (summary.accounts || [])
            .map(
              (account) => `
          <div class="settings-account">
            <strong>${escapeHtml(account.display_name)}</strong>
            <span>${escapeHtml(enumLabel(account.channel, "channel"))} · ${escapeHtml(enumLabel(account.connector, "connector"))} ${account.handle ? `· ${escapeHtml(account.handle)}` : ""}</span>
            <span>${account.secret_envs.length ? (account.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog.length
            ? syncLog
                .slice(-8)
                .reverse()
                .map(
                  (entry) => `
          <div class="settings-account">
            <strong>${escapeHtml(entry.account_id)}</strong>
            <span>${escapeHtml(enumLabel(entry.method, "connector"))} · ${dateTime(entry.at)}</span>
            <span>${escapeHtml(entry.message || "")}</span>
          </div>
        `,
                )
                .join("")
            : `<div class="empty-inline">—</div>`
        }
      </section>
      ${
        report
          ? `
        <section>
          <h2>${t("executionReport")}</h2>
          ${(report.results || [])
            .map(
              (result) => `
            <div class="settings-account">
              <strong>#${result.ref} ${escapeHtml(result.ticket_id || "")}</strong>
              <span>${escapeHtml(enumLabel(result.status))} · ${escapeHtml(enumLabel(result.operation, "action"))}</span>
              <span>${escapeHtml(result.detail || result.target || "")}</span>
            </div>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
    </div>
  `;
}

/* ----- actions ----- */

function currentReplyText(ticketId) {
  return String(
    state.drafts[ticketId] !== undefined
      ? state.drafts[ticketId]
      : els.detailBody.querySelector("#composer-text")?.value || "",
  );
}

function applyGateDemo(ticket) {
  // The real support-qa gate — demo edits reflect verdicts live using the
  // exact same function the Busabase provider runs, not a mirror of it.
  const risk = state.settings?.config_summary?.risk_policy || {};
  ticket.quality_gate = runQualityGate(ticket, knowledge(), risk);
}

export async function saveReplyAction(ticketId) {
  const text = currentReplyText(ticketId).trim();
  const note = String(state.notes[ticketId] || "").trim();
  if (!text) return;
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (ticket) {
      ticket.suggested_reply = text;
      if (note) ticket.reason = note;
      if (ticket.status !== "done") ticket.status = "needs_review";
      ticket.decision = null;
      applyGateDemo(ticket);
      recomputeMetrics(state.snapshot);
    }
    delete state.drafts[ticketId];
    delete state.notes[ticketId];
    flashNotice(`${t("queueReply")} · ${t("demoNotice")}`);
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.saveReply({ ticket_id: ticketId, text, note });
  } catch (error) {
    flashNotice(error.message || "Save failed");
    return;
  }
  delete state.drafts[ticketId];
  delete state.notes[ticketId];
  flashNotice(t("queueReply"));
  await loadState();
}

export async function decideAction(ticketId, action) {
  const comment = String(els.detailBody.querySelector("#decision-comment")?.value || "").trim();
  const text = currentReplyText(ticketId).trim() || undefined;
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (!ticket) return;
    if (typeof text === "string" && text) ticket.suggested_reply = text;
    applyGateDemo(ticket);
    if (action === "approve" && ticket.quality_gate?.verdict === "block") {
      flashNotice(ticket.quality_gate.summary);
      render();
      return;
    }
    if (action === "approve") ticket.status = "approved";
    else if (action === "request_changes") ticket.status = "changes_requested";
    else if (action === "block") ticket.status = "blocked";
    ticket.decision = { action, comment, decided_at: new Date().toISOString() };
    recomputeMetrics(state.snapshot);
    delete state.drafts[ticketId];
    flashNotice(t("demoNotice"));
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.decideApproval({ ticket_id: ticketId, action, comment, text });
  } catch (error) {
    flashNotice(error.message || "Decision failed");
    return;
  }
  delete state.drafts[ticketId];
  await loadState();
}

export async function saveSlaAction(ticketId) {
  const raw = String(els.detailBody.querySelector("#sla-due")?.value || "");
  const dueBy = raw ? new Date(raw).toISOString() : "";
  if (state.settings?.demo) {
    const ticket = ticketById(ticketId);
    if (ticket) {
      ticket.sla = ticket.sla || { policy: "custom", due_by: "", breached: false };
      ticket.sla.due_by = dueBy;
      ticket.sla.breached =
        dueBy &&
        ticket.status !== "done" &&
        ticket.status !== "blocked" &&
        !ticket.sla.first_response_at &&
        new Date(dueBy).getTime() < referenceNow();
      recomputeMetrics(state.snapshot);
    }
    delete state.slas[ticketId];
    flashNotice(`${t("saveSla")} · ${t("demoNotice")}`);
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.saveSla({ ticket_id: ticketId, due_by: dueBy });
  } catch (error) {
    flashNotice(error.message || "Save failed");
    return;
  }
  delete state.slas[ticketId];
  flashNotice(t("saveSla"));
  await loadState();
}

export function toLocalDatetime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
