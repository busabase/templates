import {
  DETAIL_MODES,
  STATUS_FILTERS,
  avatar,
  blockerAgeDays,
  blockersList,
  channelBadge,
  dateTimeLabel,
  dayBoard,
  dayLabel,
  days,
  detailUrl,
  digestPanel,
  els,
  enumLabel,
  escapeHtml,
  filteredBlockers,
  filteredHistory,
  filteredMembers,
  filteredReminders,
  itemList,
  latestDay,
  loadState,
  memberById,
  memberName,
  members,
  moodDot,
  pagerControl,
  participationBar,
  recordById,
  recordTotal,
  recordUrl,
  render,
  reminders,
  severityBadge,
  state,
  statusBadge,
  t,
  timeLabel,
  updateBlockerRows,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) => `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const emptyState = (title) => `<div class="empty">${escapeHtml(title)}</div>`;

// ── Overview: the only page with the hero + metrics band ────────────────────
// Three numbers the sidebar's "need attention" block does not already show
// (that block covers missing check-ins / open blockers / reminders to review).
function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  return [
    [t("submittedToday"), `${metrics.submitted_today ?? 0}/${metrics.expected_today ?? 0}`],
    [t("onLeaveToday"), metrics.on_leave_today ?? 0],
    [t("avgParticipation30d"), `${Math.round((metrics.avg_participation_30d || 0) * 100)}%`],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const day = latestDay();
  document.getElementById("overviewSummary").textContent = [state.snapshot?.team?.name || "", day ? dayLabel(day.date) : ""]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const body = document.getElementById("overviewBody");
  if (!day) {
    body.innerHTML = `${warnings()}<div class="empty">${t("empty")}</div>`;
    return;
  }
  body.innerHTML = `
    ${warnings()}
    ${digestPanel(day)}
    <div class="participation-row">
      <span class="participation-stat"><strong>${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</strong> ${t("submitted")}</span>
      ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
    </div>
    ${dayBoard(day, { withReminderLink: true })}
  `;
}

// ── Record views: one toolbar row over a full-bleed table ───────────────────

function membersTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("name")], [t("timezone")], [t("channel")], [t("streak"), "ws-col-narrow"], [t("participation30d"), "ws-col-num"], [t("openBlockersLabel"), "ws-col-num"], [t("lastSubmission")]])}
      <tbody>
        ${items
          .map((member) => {
            const openBlockersUrl = `#/blockers?status=open`;
            return `${rowOpen(member.member_id)}
              ${cell(
                `<a class="member-cell" href="${detailUrl(member.member_id, "members")}">${avatar(member)}<span><span class="strong">${escapeHtml(member.name)}</span><small class="muted"> ${escapeHtml(member.role || "")}</small></span></a>`,
                member.name,
              )}
              ${cell(escapeHtml(member.timezone || ""), member.timezone)}
              ${cell(channelBadge(member.channel || "slack"))}
              ${cell(`${member.streak ?? 0} ${t("days")}`, "", "ws-col-narrow")}
              ${cell(`${Math.round((member.participation_30d || 0) * 100)}%`, "", "ws-col-num")}
              ${cell(member.open_blockers ? `<a href="${openBlockersUrl}">${member.open_blockers}</a>` : "0", "", "ws-col-num")}
              ${cell(member.last_submitted_date ? escapeHtml(dayLabel(member.last_submitted_date)) : "—")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function blockersTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("target")], [t("severity"), "ws-col-narrow"], [t("status"), "ws-col-narrow"], [t("raised"), "ws-col-narrow"], [t("age"), "ws-col-num"], [t("blockerDetail"), "ws-col-wide"]])}
      <tbody>
        ${items
          .map((blocker) => {
            const owner = memberById(blocker.member_id);
            return `${rowOpen(blocker.blocker_id)}
              ${cell(
                `<a class="member-cell" href="${detailUrl(blocker.member_id, "members")}">${avatar(owner)}<span>${escapeHtml(memberName(blocker.member_id))}</span></a>`,
                memberName(blocker.member_id),
              )}
              ${cell(severityBadge(blocker.severity))}
              ${cell(statusBadge(blocker.status, "blocker_status"))}
              ${cell(escapeHtml(dayLabel(blocker.raised_date)))}
              ${cell(`${blockerAgeDays(blocker)} ${t("days")}`, "", "ws-col-num")}
              ${cell(escapeHtml(blocker.text), blocker.text, "ws-col-wide")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function remindersTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("messageDraft")], [t("status"), "ws-col-narrow"], [t("source")], [t("channel")], [t("target")]])}
      <tbody>
        ${items
          .map((reminder) => `${rowOpen(reminder.id)}
              ${cell(`<span class="strong">${escapeHtml(reminder.title)}</span>`, reminder.title)}
              ${cell(statusBadge(reminder.status, "reminder_status"))}
              ${cell(escapeHtml(enumLabel(reminder.type, "reminder_type")))}
              ${cell(channelBadge(reminder.channel))}
              ${cell(escapeHtml(memberName(reminder.member_id)))}
            </tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

function historyTable(items) {
  return `
    <table class="ws-table">
      ${tableHead([[t("history")], [t("submitted"), "ws-col-num"], [t("digest"), "ws-col-wide"]])}
      <tbody>
        ${items
          .map(
            (day) => `${rowOpen(day.date)}
              ${cell(`<span class="strong">${escapeHtml(dayLabel(day.date))}</span>`, dayLabel(day.date))}
              ${cell(`${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}`, "", "ws-col-num")}
              ${cell(escapeHtml(day.digest || ""), day.digest, "ws-col-wide")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function statusGroupFor(view) {
  return view === "blockers" ? "blocker_status" : "reminder_status";
}

function statusCount(view, value) {
  const rows = view === "blockers" ? blockersList() : reminders();
  return value === "all" ? rows.length : rows.filter((row) => row.status === value).length;
}

function renderStatusFilters(view) {
  const options = STATUS_FILTERS[view];
  els.viewFilters.hidden = !options;
  els.statusSelect.hidden = !options;
  if (!options) {
    els.viewFilters.innerHTML = "";
    els.statusSelect.innerHTML = "";
    return;
  }
  const label = (value) => (value === "all" ? t("all") : enumLabel(value, statusGroupFor(view)));
  els.viewFilters.innerHTML = options
    .map(
      (value) => `
    <button type="button" class="chip ${state.route.status === value ? "active" : ""}" data-status="${value}">
      ${escapeHtml(label(value))} <span>${statusCount(view, value)}</span>
    </button>
  `,
    )
    .join("");
  els.statusSelect.innerHTML = options
    .map(
      (value) =>
        `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(label(value))} (${statusCount(view, value)})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  renderStatusFilters(view);
  const items =
    view === "members"
      ? filteredMembers()
      : view === "blockers"
        ? filteredBlockers()
        : view === "reminders"
          ? filteredReminders()
          : filteredHistory();
  els.viewCount.textContent = String(state.route.query ? items.length : recordTotal(view, items.length));
  const table =
    view === "members"
      ? membersTable(items)
      : view === "blockers"
        ? blockersTable(items)
        : view === "reminders"
          ? remindersTable(items)
          : historyTable(items);
  const empty = emptyState(state.route.query ? t("noMatches") : t("empty"));
  const pager = view === "history" ? "" : pagerControl(view);
  els.listPanel.innerHTML = items.length ? `${table}${pager}` : empty;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("selectReminder"))}</div>` : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    els.detailBody.innerHTML = `<div class="ws-detail-empty"><strong>${escapeHtml(t("recordMissing"))}</strong><p>${escapeHtml(t("recordMissingDetail"))}</p></div>`;
    return;
  }
  els.detailBody.innerHTML =
    view === "members"
      ? memberDetail(item)
      : view === "blockers"
        ? blockerDetail(item)
        : view === "reminders"
          ? reminderDetail(item)
          : historyDetail(item);
}

function memberDetail(member) {
  const openBlockers = blockersList().filter((blocker) => blocker.member_id === member.member_id && blocker.status === "open");
  const timeline = days()
    .map((day) => ({ day, update: (day.updates || []).find((update) => update.member_id === member.member_id) }))
    .reverse()
    .slice(0, 10);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(member.name)}</h2>
      <p class="muted">${escapeHtml([member.role, member.timezone].filter(Boolean).join(" · "))}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        ${
          openBlockers.length
            ? `
          <div class="panel">
            <h2>${t("openBlockersLabel")}</h2>
            ${openBlockers
              .map(
                (blocker) => `
              <a class="blocker-row" href="${recordUrl(blocker.blocker_id, "blockers")}">
                ${severityBadge(blocker.severity)}
                <span class="blocker-text">${escapeHtml(blocker.text)}</span>
                <span class="muted">${escapeHtml(dayLabel(blocker.raised_date))} · ${blockerAgeDays(blocker)} ${t("days")}</span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="panel">
          <h2>${t("recentUpdates")}</h2>
          <ol class="timeline">
            ${timeline
              .map(
                ({ day, update }) => `
              <li class="timeline-item ${update ? "" : "missed"}">
                <div class="timeline-head">
                  <strong><a href="${detailUrl(day.date, "history")}">${escapeHtml(dayLabel(day.date))}</a></strong>
                  ${update ? `<span class="muted">${escapeHtml(timeLabel(update.submitted_at))} ${t("via")} ${escapeHtml(enumLabel(update.source, "source"))}</span> ${moodDot(update.mood)}` : `<span class="muted">${(day.on_leave || []).includes(member.member_id) ? t("onLeave") : t("notSubmitted")}</span>`}
                </div>
                ${
                  update
                    ? `
                  <div class="timeline-cols">
                    <div><h4>${t("yesterday")}</h4><ul>${itemList(update.yesterday)}</ul></div>
                    <div><h4>${t("todayPlan")}</h4><ul>${itemList(update.today)}</ul></div>
                  </div>
                  ${updateBlockerRows(update)}
                `
                    : ""
                }
              </li>
            `,
              )
              .join("")}
          </ol>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("memberDetail")}</h2>
        <dl>
          <dt>${t("role")}</dt><dd>${escapeHtml(member.role || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(member.timezone || "")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(member.channel || "slack")}</dd>
          <dt>${t("streak")}</dt><dd>${member.streak ?? 0} ${t("days")}</dd>
          <dt>${t("participation30d")}</dt><dd>${Math.round((member.participation_30d || 0) * 100)}%</dd>
          <dt>${t("openBlockersLabel")}</dt><dd>${member.open_blockers ?? 0}</dd>
          <dt>${t("lastSubmission")}</dt><dd>${member.last_submitted_date ? escapeHtml(dayLabel(member.last_submitted_date)) : "—"}</dd>
          <dt>${t("notes")}</dt><dd>${escapeHtml(member.notes || "—")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function blockerDetail(blocker) {
  const owner = memberById(blocker.member_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(t("blockerDetail"))}</h2>
      <p class="muted">${severityBadge(blocker.severity)} ${statusBadge(blocker.status, "blocker_status")}</p>
    </header>
    <p class="blocker-text">${escapeHtml(blocker.text)}</p>
    ${blocker.suggested_action ? `<div class="reason"><span>${t("suggestedAction")}</span>${escapeHtml(blocker.suggested_action)}</div>` : ""}
    <dl>
      <dt>${t("target")}</dt><dd><a class="member-cell inline" href="${detailUrl(blocker.member_id, "members")}">${avatar(owner)} <span>${escapeHtml(memberName(blocker.member_id))}</span></a></dd>
      <dt>${t("raised")}</dt><dd>${escapeHtml(dayLabel(blocker.raised_date))}</dd>
      <dt>${t("age")}</dt><dd>${blockerAgeDays(blocker)} ${t("days")}</dd>
      ${blocker.resolved_date ? `<dt>${t("resolved")}</dt><dd>${escapeHtml(dayLabel(blocker.resolved_date))}</dd>` : ""}
    </dl>
    <div class="blocker-foot">
      <a href="${detailUrl(blocker.raised_date, "history")}">${t("linkedUpdate")}: ${escapeHtml(dayLabel(blocker.raised_date))}</a>
    </div>
  `;
}

function reminderDetail(reminder) {
  const locked = Boolean(state.settings?.lock);
  const terminal = ["done"].includes(reminder.status);
  const disabled = locked || terminal ? "disabled" : "";
  const target = memberById(reminder.member_id);
  return `
    <article class="proposal-card status-edge-${escapeHtml(reminder.status)}" data-reminder="${escapeHtml(reminder.id)}">
      <header class="proposal-head">
        <span class="ref">Reminder #${reminder.ref}</span>
        ${statusBadge(reminder.status, "reminder_status")}
        <span class="badge type-badge">${escapeHtml(enumLabel(reminder.type, "reminder_type"))}</span>
        ${channelBadge(reminder.channel)}
      </header>
      <h3>${escapeHtml(reminder.title)}</h3>
      <p class="muted">
        ${t("target")}: <a class="member-cell inline" href="${detailUrl(reminder.member_id, "members")}">${avatar(target)} <span>${escapeHtml(memberName(reminder.member_id))}</span></a>
      </p>
      <div class="reason"><span>${t("reason")}</span>${escapeHtml(reminder.reason)}</div>
      <label class="note-label">${t("messageDraft")}
        <textarea data-draft-for="${escapeHtml(reminder.id)}" rows="3" ${disabled}>${escapeHtml(reminder.draft || "")}</textarea>
      </label>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(reminder.id)}" rows="2" ${disabled}>${escapeHtml(reminder.decision?.note || "")}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(reminder.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(reminder.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(reminder.id)}" title="${t("saveNote")}" ${disabled}>${t("saveNote")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(reminder.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
      ${
        reminder.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(reminder.decision.action, "action"))}</strong>
          ${reminder.decision.note ? `<span>${escapeHtml(reminder.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(reminder.decision.decided_at ? dateTimeLabel(reminder.decision.decided_at) : "")}${reminder.decision.action === "request_changes" ? ` · ${t("agentQueued")}` : ""}</small>
        </div>
      `
          : ""
      }
      ${
        reminder.execution
          ? `
        <div class="execution-info">
          ${(reminder.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(enumLabel(op.channel, "channel"))} · ${escapeHtml(memberName(op.target))}</div>`).join("")}
          <small>${escapeHtml(reminder.execution.detail || "")}</small>
        </div>
      `
          : ""
      }
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
      ${state.settings?.lock ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.settings.lock.message || "Agent lock present")}</strong></div></div>` : ""}
    </article>
  `;
}

function historyDetail(day) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(dayLabel(day.date))}</h2>
      <p class="muted">${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0} ${escapeHtml(t("submitted"))}</p>
    </header>
    ${digestPanel(day)}
    <div class="participation-row">
      <span class="participation-stat"><strong>${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</strong> ${t("submitted")}</span>
      ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
    </div>
    ${dayBoard(day)}
  `;
}

/* Decisions */

export async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      decided_at: new Date().toISOString(),
    };
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.saveDecision(id, { action, note, draft: typeof draft === "string" ? draft : null });
  } catch (error) {
    els.detailBody.insertAdjacentHTML(
      "afterbegin",
      `<div class="warnings"><div class="warning"><strong>${escapeHtml(error.message || "Decision failed")}</strong></div></div>`,
    );
    return;
  }
  await loadState();
}

function cssAttr(value) {
  return String(value).replaceAll('"', '\\"');
}

/* Help & Settings */

export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  document.getElementById("settingsContent").innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("team")}</dt><dd>${escapeHtml(summary.team?.name || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(summary.team?.timezone || "")}</dd>
          <dt>${t("workdays")}</dt><dd>${(summary.team?.workdays || []).map((day) => `<span class="badge">${escapeHtml(enumLabel(day, "workday"))}</span>`).join(" ")}</dd>
          <dt>${t("digestStyle")}</dt><dd>${escapeHtml(summary.digest_style || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("members")}</h2>
        ${
          (summary.members || [])
            .map(
              (member) => `
          <div class="settings-account">
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(member.role || "")}${member.timezone ? ` · ${escapeHtml(member.timezone)}` : ""} · ${escapeHtml(enumLabel(member.channel, "channel"))}</span>
            <span><code>${escapeHtml(member.contact_env || "")}</code> ${member.contact_ready ? t("contactReady") : t("contactMissing")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("standupQuestions")}</h2>
        ${
          (summary.standup_questions || [])
            .map(
              (question, index) => `
          <div class="settings-question"><span class="muted">${index + 1}.</span> ${escapeHtml(question)}</div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
