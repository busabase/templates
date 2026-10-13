import {
  companyName,
  contactById,
  DETAIL_MODES,
  date,
  dealById,
  deals,
  decisionFor,
  detailUrl,
  effectiveStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredContacts,
  filteredDeals,
  filteredFollowups,
  followupStates,
  followups,
  interactions,
  isPartial,
  loadState,
  lockBanner,
  money,
  noticeBanner,
  pageCount,
  recordById,
  recordUrl,
  relationshipBadge,
  render,
  riskBadges,
  stageBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const percent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not already show. Sums have no server aggregate
// in this SDK, so they are computed from the loaded deals and say so when more
// deals exist than are loaded.
function metricsBand() {
  const loaded = deals();
  const openDeals = loaded.filter((item) => item.status === "open");
  const pipelineValue = openDeals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const weighted = Math.round(
    openDeals.reduce((sum, item) => sum + Number(item.amount || 0) * Number(item.probability || 0), 0),
  );
  const won = loaded.filter((item) => item.status === "won").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const scope = isPartial("deals") ? ` · ${t("loadedDeals").replace("{n}", loaded.length)}` : "";
  return [
    [t("pipelineValue"), money(pipelineValue)],
    [t("weightedPipeline"), money(weighted)],
    [t("wonValue"), money(won)],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label + scope)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = [
    `${metrics.company_count ?? state.snapshot?.companies?.length ?? 0} ${t("companies")}`,
    `${metrics.deal_count ?? deals().length} ${t("dealsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const stages = state.snapshot?.pipeline_stages || [];
  const stageValue = (stage) =>
    deals()
      .filter((item) => item.stage === stage)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const maxStageValue = Math.max(1, ...stages.map(stageValue));
  const dueFollowups = followups()
    .filter((item) => ["needs_review", "changes_requested", "approved"].includes(effectiveStatus(item)))
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
    .slice(0, 5);
  const recent = interactions()
    .slice()
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
    .slice(0, 6);
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("pipelineByStage")}</h2>
        ${stages
          .map((stage) => {
            const count = deals().filter((item) => item.stage === stage).length;
            const value = stageValue(stage);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${stageBadge(stage)}<small>${count}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((value / maxStageValue) * 100)}%"></span></span>
              <span class="num">${money(value)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="card overview-panel">
        <h2>${t("followupsDue")}</h2>
        ${
          dueFollowups
            .map((item) => {
              const contact = contactById(item.contact_id);
              const who = [contact?.name, contact ? companyName(contact.company_id) : ""].filter(Boolean).join(" · ");
              return `
            <a class="due-row" href="${recordUrl(item.followup_id, "followups")}">
              <span><strong>${escapeHtml(item.subject || item.reason)}</strong><small>${escapeHtml(who)}</small></span>
              <span class="due-meta">${statusBadge(effectiveStatus(item))}<small>${date(item.due_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noFollowups")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("recentActivity")}</h2>
        ${
          recent
            .map((item) => {
              const contact = contactById(item.contact_id);
              return `
            <div class="activity-row">
              <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
              <span><strong>${escapeHtml(contact?.name || t("notLoaded"))}</strong><small>${escapeHtml(item.summary)}</small></span>
              <span class="muted">${date(item.occurred_at)}</span>
            </div>
          `;
            })
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { deals: "dealsHint", contacts: "contactsHint", followups: "followupsHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function dealsTable(items) {
  return `
    <table class="ws-table crm-table deals-table">
      ${tableHead([
        [t("deal")],
        [t("stage")],
        [t("company")],
        [t("contact")],
        [t("amount"), "num"],
        [t("probability"), "num"],
        [t("nextStep")],
        [t("status")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const contact = contactById(item.primary_contact_id);
            const company = companyName(item.company_id);
            return `${rowOpen(item.deal_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(stageBadge(item.stage))}
              ${cell(escapeHtml(company), company)}
              ${cell(
                contact
                  ? `<a href="${recordUrl(contact.contact_id, "contacts")}">${escapeHtml(contact.name)}</a>`
                  : item.primary_contact_id
                    ? `<span class="muted">${t("notLoaded")}</span>`
                    : "",
              )}
              ${cell(money(item.amount, item.currency), "", "num")}
              ${cell(percent(item.probability), "", "num")}
              ${cell(escapeHtml(item.next_step || ""), item.next_step)}
              ${cell(statusBadge(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function contactsTable(items) {
  return `
    <table class="ws-table crm-table contacts-table">
      ${tableHead([
        [t("name")],
        [t("company")],
        [t("role")],
        [t("relationship")],
        [t("email")],
        [t("lastTouch")],
        [t("nextFollowup")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const company = companyName(item.company_id);
            return `${rowOpen(item.contact_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(escapeHtml(company), company)}
              ${cell(escapeHtml(item.role || ""), item.role)}
              ${cell(relationshipBadge(item.relationship))}
              ${cell(escapeHtml(item.email || ""), item.email)}
              ${cell(date(item.last_touch_at))}
              ${cell(item.next_followup_at ? date(item.next_followup_at) : `<span class="muted">—</span>`)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function followupsTable(items) {
  return `
    <table class="ws-table crm-table followups-table">
      ${tableHead([[t("subject")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const subject = item.subject || item.reason;
            return `${rowOpen(item.followup_id)}
              ${cell(`<span class="strong">${escapeHtml(subject)}</span>`, subject)}
              ${cell(statusBadge(effectiveStatus(item)))}
            </tr>`;
          })
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
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function followupFilters() {
  return followupStates()
    .map((value) => {
      const count =
        value === "all" ? followups().length : followups().filter((item) => effectiveStatus(item) === value).length;
      const label = value === "all" ? t("all") : enumLabel(value);
      return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${count}</b></button>`;
    })
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "deals" ? filteredDeals() : view === "contacts" ? filteredContacts() : filteredFollowups();
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  els.viewFilters.hidden = view !== "followups";
  els.viewFilters.innerHTML = view === "followups" ? followupFilters() : "";
  const select = document.getElementById("statusSelect");
  select.hidden = view !== "followups";
  if (view === "followups") {
    select.innerHTML = followupStates()
      .map((value) => {
        const count =
          value === "all" ? followups().length : followups().filter((item) => effectiveStatus(item) === value).length;
        return `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("all") : enumLabel(value))} (${count})</option>`;
      })
      .join("");
  }

  const table = view === "deals" ? dealsTable(items) : view === "contacts" ? contactsTable(items) : followupsTable(items);
  const empty =
    view === "followups"
      ? emptyState(t("noFollowups"))
      : emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${view === "followups" ? "" : pagerControl(view)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectFollowup")) : "";
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
    view === "deals" ? dealDetail(item) : view === "contacts" ? contactDetail(item) : followupDetail(item);
}

function timelineRows(entries, { withContact = false } = {}) {
  return (
    entries
      .map(
        (entry) => `
    <div class="timeline-row">
      <span class="badge">${escapeHtml(enumLabel(entry.type, "type"))}</span>
      <span><strong>${escapeHtml(withContact ? contactById(entry.contact_id)?.name || t("notLoaded") : enumLabel(entry.direction, "direction"))}</strong> <small class="muted">${withContact ? `${escapeHtml(enumLabel(entry.direction, "direction"))} · ` : ""}${date(entry.occurred_at)}</small><small>${escapeHtml(entry.summary)}</small></span>
    </div>
  `,
      )
      .join("") || `<div class="empty-inline">${t("empty")}</div>`
  );
}

function dealDetail(item) {
  const linked = (item.contact_ids?.length ? item.contact_ids : [item.primary_contact_id]).filter(Boolean);
  const timeline = interactions()
    .filter((entry) => entry.deal_id === item.deal_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const related = followups().filter((entry) => entry.deal_id === item.deal_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.name)}</h2>
      <p class="muted">${escapeHtml([companyName(item.company_id), enumLabel(item.stage, "stage"), money(item.amount, item.currency)].filter(Boolean).join(" · "))}</p>
    </header>
    ${warnings((warning) => warning.deal_id === item.deal_id)}
    <section class="detail">
      <div class="detail-main">
        <div class="agent-panel">
          <h3>${t("agentNextAction")}</h3>
          <p>${escapeHtml(item.agent_next_action || item.next_step || "")}</p>
        </div>
        ${item.notes ? `<div class="card overview-panel"><h3>${t("notes")}</h3><p>${escapeHtml(item.notes)}</p></div>` : ""}
        <div class="card overview-panel">
          <h3>${t("timeline")}</h3>
          ${timelineRows(timeline, { withContact: true })}
        </div>
        ${
          related.length
            ? `
          <div class="card overview-panel">
            <h3>${t("relatedFollowups")}</h3>
            ${related
              .map(
                (entry) => `
              <a class="due-row" href="${recordUrl(entry.followup_id, "followups")}">
                <span><strong>${t("followupRef")} #${entry.ref}</strong><small>${escapeHtml(entry.subject || entry.reason)}</small></span>
                <span class="due-meta">${statusBadge(effectiveStatus(entry))}<small>${date(entry.due_at)}</small></span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="card detail-side">
        <dl>
          <dt>${t("stage")}</dt><dd>${stageBadge(item.stage)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(item.status)}</dd>
          <dt>${t("amount")}</dt><dd>${money(item.amount, item.currency)} ${escapeHtml(item.currency)}</dd>
          <dt>${t("probability")}</dt><dd>${percent(item.probability)}</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "")}</dd>
          <dt>${t("expectedClose")}</dt><dd>${date(item.expected_close)}</dd>
          <dt>${t("lastActivity")}</dt><dd>${date(item.last_activity_at)}</dd>
          <dt>${t("nextStep")}</dt><dd>${escapeHtml(item.next_step || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(companyName(item.company_id))}</dd>
          <dt>${t("linkedContacts")}</dt><dd>${linked
            .map((id) => {
              const contact = contactById(id);
              return contact
                ? `<a href="${recordUrl(contact.contact_id, "contacts")}">${escapeHtml(contact.name)}</a>`
                : `<span class="muted">${t("notLoaded")}</span>`;
            })
            .join("<br>")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function contactDetail(item) {
  const timeline = interactions()
    .filter((entry) => entry.contact_id === item.contact_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const openDeals = deals().filter(
    (entry) => (entry.contact_ids || [entry.primary_contact_id]).includes(item.contact_id) && entry.status === "open",
  );
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.name)}</h2>
      <p class="muted">${escapeHtml([item.role, companyName(item.company_id)].filter(Boolean).join(" · "))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("email")}</dt><dd>${escapeHtml(item.email || "")}</dd>
        <dt>${t("relationship")}</dt><dd>${relationshipBadge(item.relationship)}</dd>
        <dt>${t("tags")}</dt><dd>${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</dd>
        <dt>${t("lastTouch")}</dt><dd>${date(item.last_touch_at)}</dd>
        <dt>${t("nextFollowup")}</dt><dd>${item.next_followup_at ? date(item.next_followup_at) : "—"}</dd>
      </dl>
      ${item.agent_notes ? `<div class="agent-panel"><h3>${t("agentNotes")}</h3><p>${escapeHtml(item.agent_notes)}</p></div>` : ""}
      ${
        openDeals.length
          ? `
        <section>
          <h3>${t("openDealsFor")}</h3>
          ${openDeals
            .map(
              (entry) => `
            <a class="due-row" href="${detailUrl(entry.deal_id, "deals")}">
              <span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.next_step || "")}</small></span>
              <span class="due-meta">${stageBadge(entry.stage)}<small class="num">${money(entry.amount, entry.currency)}</small></span>
            </a>
          `,
            )
            .join("")}
        </section>
      `
          : ""
      }
      <section>
        <h3>${t("timeline")}</h3>
        ${timelineRows(timeline)}
      </section>
    </div>
  `;
}

function followupDetail(item) {
  const status = effectiveStatus(item);
  const contact = contactById(item.contact_id);
  const deal = dealById(item.deal_id);
  const decision = decisionFor(item.followup_id);
  const edits = state.edits[item.followup_id] || {};
  const draft = edits.draft ?? decision?.draft ?? item.suggested_reply ?? "";
  const note = edits.note ?? decision?.comment ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const meta = [
    contact
      ? `<a href="${recordUrl(contact.contact_id, "contacts")}">${escapeHtml(contact.name)}</a> · ${escapeHtml(companyName(contact.company_id))}`
      : item.contact_id
        ? `<span>${t("notLoaded")}</span>`
        : "",
    deal ? `<a href="${detailUrl(deal.deal_id, "deals")}">${escapeHtml(deal.name)}</a>` : "",
    `<span class="badge">${escapeHtml(enumLabel(item.channel_type, "type"))}</span>`,
  ].filter(Boolean);
  return `
    <article class="followup-detail status-${escapeHtml(status)}" data-followup="${escapeHtml(item.followup_id)}">
      <header class="queue-head">
        <span class="queue-ref">${t("followupRef")} #${item.ref}</span>
        ${statusBadge(status)}
        ${riskBadges(item.risk)}
        <span class="queue-due muted">${t("due")} ${date(item.due_at)}</span>
      </header>
      ${item.subject ? `<h2 class="queue-subject">${escapeHtml(item.subject)}</h2>` : ""}
      <div class="queue-meta">${meta.join(" · ")}</div>
      ${warnings((warning) => warning.deal_id && warning.deal_id === item.deal_id)}
      <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
      ${lockBanner()}
      <label class="queue-label" for="draft-${escapeHtml(item.followup_id)}">${t("draft")}</label>
      <textarea id="draft-${escapeHtml(item.followup_id)}" class="queue-draft" data-field="draft" rows="9" ${disabled}>${escapeHtml(draft)}</textarea>
      <label class="queue-label" for="note-${escapeHtml(item.followup_id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.followup_id)}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
      </div>
    </article>
  `;
}

export async function submitDecision(followupId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  try {
    const provider = await getProvider();
    await provider.applyDecision({ followup_id: followupId, action, comment: note, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[followupId];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
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
        <h2>${t("stages")}</h2>
        <div class="stage-list">${(summary.pipeline_stages || []).map((stage) => stageBadge(stage)).join(" ")}</div>
        <dl>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("channels")}</h2>
        ${
          (summary.channels || [])
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(channel.display_name)}</strong>
            <span>${escapeHtml(enumLabel(channel.type, "type"))}${channel.handoff_skill ? ` · ${escapeHtml(channel.handoff_skill)}` : ""}</span>
            <span class="${channel.secrets_ready ? "ok" : "warn"}">${channel.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
