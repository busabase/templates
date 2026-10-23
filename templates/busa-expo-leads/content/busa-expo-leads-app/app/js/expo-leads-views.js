import {
  batchName,
  batches,
  channelBadge,
  DETAIL_MODES,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredFollowups,
  filteredLeads,
  followups,
  followupStates,
  isPartial,
  leadById,
  leads,
  loadState,
  noticeBanner,
  recordById,
  recordUrl,
  render,
  shortDate,
  slaBadge,
  stageBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const notLoaded = () => `<span class="muted">${t("notLoaded")}</span>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers neither the nav nor the SLA board below already shows. They
// are subsets that take a join to know, counted from the loaded pages; the
// label says so when a Base holds more rows than were read.
function metricsBand() {
  const open = ["green", "amber", "red"].flatMap((key) => state.snapshot?.sla_buckets?.[key] || []);
  const noDraft = open.filter((item) => !item.latest_followup_id).length;
  const approved = followups().filter((item) => item.status === "approved").length;
  const qualified = leads().filter((item) => item.stage === "qualified").length;
  const scope = (view) => (isPartial(view) ? ` · ${t("loadedOnly")}` : "");
  return [
    [t("noDraftYet") + scope("leads"), noDraft, t("noDraftYetHint")],
    [t("approvedNotSent") + scope("followups"), approved, t("approvedNotSentHint")],
    [t("qualifiedLeads") + scope("leads"), qualified, t("qualifiedLeadsHint")],
  ]
    .map(
      ([label, value, hint]) =>
        `<div title="${escapeHtml(hint)}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`,
    )
    .join("");
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = [
    `${batches().length} ${t("showsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const buckets = state.snapshot?.sla_buckets || { green: [], amber: [], red: [] };
  const bucketSection = (key, descKey) => {
    const items = buckets[key] || [];
    return `
      <div class="overview-panel sla-panel sla-panel-${key}">
        <h2>${slaBadge(key)} <span class="sla-panel-count">${items.length}</span></h2>
        <p class="muted sla-panel-desc">${t(descKey)}</p>
        ${
          items
            .slice(0, 6)
            .map((item) => {
              // The lead's open draft is the next thing to act on; without one,
              // the lead itself is.
              const href = item.latest_followup_id
                ? recordUrl(item.latest_followup_id, "followups")
                : recordUrl(item.lead_id, "leads");
              return `
            <a class="due-row" href="${href}">
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([item.company, item.country].filter(Boolean).join(" · "))}</small></span>
              <span class="due-meta">${stageBadge(item.stage)}<small>${date(item.met_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("emptyBucket")}</div>`
        }
      </div>
    `;
  };
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <h2 class="section-title">${t("slaBoard")}</h2>
    <section class="sla-grid">
      ${bucketSection("green", "slaGreenDesc")}
      ${bucketSection("amber", "slaAmberDesc")}
      ${bucketSection("red", "slaRedDesc")}
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { leads: "leadsHint", followups: "followupsHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function leadsTable(items) {
  return `
    <table class="ws-table leads-table">
      ${tableHead([
        [t("name")],
        [t("company")],
        [t("country")],
        [t("productInterest")],
        [t("batch")],
        [t("metAt")],
        [t("stage")],
        ["SLA"],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const show = batchName(item.batch_id);
            return `${rowOpen(item.lead_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(escapeHtml(item.company), item.company)}
              ${cell(escapeHtml(item.country), item.country)}
              ${cell(escapeHtml(item.product_interest), item.product_interest)}
              ${cell(escapeHtml(show), show)}
              ${cell(shortDate(item.met_at), date(item.met_at))}
              ${cell(stageBadge(item.stage))}
              ${cell(slaBadge(item.sla_state))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function followupsTable(items) {
  return `
    <table class="ws-table followups-table">
      ${tableHead([[t("lead")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const lead = leadById(item.lead_id);
            const who = lead
              ? `<span class="strong">${escapeHtml(lead.name)}</span>${lead.company ? ` <span class="cell-sub">· ${escapeHtml(lead.company)}</span>` : ""}`
              : notLoaded();
            return `${rowOpen(item.followup_id)}
              ${cell(who, lead ? [lead.name, lead.company].filter(Boolean).join(" · ") : "")}
              ${cell(statusBadge(item.status))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// The filter options for the current view, each with its loaded count.
function filterOptions(view) {
  if (view === "leads") {
    return [
      { value: "all", label: t("all"), count: leads().length },
      ...batches().map((batch) => ({
        value: batch.batch_id,
        label: batch.name,
        count: leads().filter((lead) => lead.batch_id === batch.batch_id).length,
      })),
    ];
  }
  return followupStates().map((value) => ({
    value,
    label: value === "all" ? t("all") : enumLabel(value),
    count: value === "all" ? followups().length : followups().filter((item) => item.status === value).length,
  }));
}

function renderFilters(view) {
  const active = view === "leads" ? state.route.batch : state.route.status;
  const options = filterOptions(view);
  // A trade-show filter with a single show has nothing to choose between.
  const show = options.length > 2;
  els.viewFilters.hidden = !show;
  els.filterSelect.hidden = !show;
  if (!show) return;
  els.viewFilters.innerHTML = options
    .map(
      (option) =>
        `<button type="button" class="segment ${active === option.value ? "active" : ""}" data-filter="${escapeHtml(option.value)}" title="${escapeHtml(option.label)}">${escapeHtml(option.label)} <b>${option.count}</b></button>`,
    )
    .join("");
  els.filterSelect.setAttribute("aria-label", view === "leads" ? t("batch") : t("status"));
  els.filterSelect.innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${active === option.value ? " selected" : ""}>${escapeHtml(option.label)} (${option.count})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "leads" ? filteredLeads() : filteredFollowups();
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  renderFilters(view);
  const table = view === "leads" ? leadsTable(items) : followupsTable(items);
  const empty =
    view === "followups"
      ? emptyState(state.route.query ? t("noMatches") : t("noFollowups"))
      : emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = items.length ? table : empty;
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
  els.detailBody.innerHTML = view === "leads" ? leadDetail(item) : followupDetail(item);
}

function leadDetail(item) {
  const related = followups()
    .filter((entry) => entry.lead_id === item.lead_id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.name)}</h2>
      <p class="muted">${escapeHtml([item.company, item.country].filter(Boolean).join(" · "))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("stage")}</dt><dd>${stageBadge(item.stage)}</dd>
        <dt>SLA</dt><dd>${slaBadge(item.sla_state)}</dd>
        <dt>${t("metAt")}</dt><dd>${date(item.met_at) || "—"}</dd>
        <dt>${t("batch")}</dt><dd>${item.batch_id ? escapeHtml(batchName(item.batch_id)) : "—"}</dd>
        <dt>${t("productInterest")}</dt><dd>${escapeHtml(item.product_interest || "—")}</dd>
        <dt>${t("language")}</dt><dd>${escapeHtml(enumLabel(item.language, "language") || "—")}</dd>
        <dt>${t("contactChannel")}</dt><dd>${channelBadge(item.contact_channel)}</dd>
        <dt>${t("contactHandle")}</dt><dd>${escapeHtml(item.contact_handle || "—")}</dd>
      </dl>
      <section>
        <h3>${t("followups")}</h3>
        ${
          related
            .map(
              (entry) => `
            <a class="due-row" href="${recordUrl(entry.followup_id, "followups")}">
              <span><strong>${escapeHtml(enumLabel(entry.channel, "channel"))} · ${escapeHtml(enumLabel(entry.language, "language") || entry.language)}</strong><small dir="auto">${escapeHtml(entry.draft_text)}</small></span>
              <span class="due-meta">${statusBadge(entry.status)}<small>${date(entry.created_at)}</small></span>
            </a>
          `,
            )
            .join("") || `<div class="empty-inline">${t("noDraftForLead")}</div>`
        }
      </section>
    </div>
  `;
}

function followupDetail(item) {
  const lead = leadById(item.lead_id);
  const disabled = item.status === "sent" ? "disabled" : "";
  const edits = state.edits[item.followup_id] || {};
  const draft = edits.draft ?? item.draft_text ?? "";
  const note = edits.note ?? item.decision_comment ?? "";
  const meta = lead
    ? [
        lead.company ? escapeHtml(lead.company) : "",
        lead.batch_id ? escapeHtml(batchName(lead.batch_id)) : "",
        slaBadge(lead.sla_state),
        `<a href="${recordUrl(lead.lead_id, "leads")}">${t("openLead")}</a>`,
      ].filter(Boolean)
    : [];
  return `
    <article class="followup-detail status-${escapeHtml(item.status)}" data-followup="${escapeHtml(item.followup_id)}" data-head-commit="${escapeHtml(item.__headCommitId || "")}">
      <header class="queue-head">
        ${statusBadge(item.status)}
        ${channelBadge(item.channel)}
        <span class="badge">${escapeHtml(enumLabel(item.language, "language") || item.language || "—")}</span>
        <span class="queue-due muted">${t("generated")} ${date(item.created_at)}</span>
      </header>
      <h2 class="queue-subject">${lead ? escapeHtml(lead.name) : notLoaded()}</h2>
      ${meta.length ? `<div class="queue-meta">${meta.join("<span>·</span>")}</div>` : ""}
      <label class="queue-label" for="draft-${escapeHtml(item.followup_id)}">${t("draftText")}</label>
      <textarea id="draft-${escapeHtml(item.followup_id)}" class="queue-draft" data-field="draft" rows="9" dir="auto" ${disabled}>${escapeHtml(draft)}</textarea>
      <label class="queue-label" for="note-${escapeHtml(item.followup_id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.followup_id)}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${item.decision_action ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(item.decision_action, "action"))} · ${escapeHtml(item.decided_at ? new Date(item.decided_at).toLocaleString() : "")}</span>` : ""}
        ${item.execution_status ? `<span class="queue-decision muted">${escapeHtml(item.execution_detail || item.execution_status)}</span>` : ""}
      </div>
    </article>
  `;
}

export async function submitDecision(followupId, headCommitId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  let result;
  try {
    const provider = await getProvider();
    result = await provider.applyDecision({
      followup_id: followupId,
      head_commit_id: headCommitId,
      action,
      comment: note,
      draft,
    });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[followupId];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the follow-up
  // keeps its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const thresholds = summary.thresholds || { sla24Hours: 24, sla72Hours: 72 };
  const templates = summary.reply_templates || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>SLA</h2>
        <dl>
          <dt>${t("slaGreen")}</dt><dd>&lt; ${escapeHtml(thresholds.sla24Hours)}h</dd>
          <dt>${t("slaAmber")}</dt><dd>${escapeHtml(thresholds.sla24Hours)}h – ${escapeHtml(thresholds.sla72Hours)}h</dd>
          <dt>${t("slaRed")}</dt><dd>&gt; ${escapeHtml(thresholds.sla72Hours)}h</dd>
        </dl>
      </section>
      <section>
        <h2>${t("replyTemplates")}</h2>
        ${
          Object.keys(templates).length
            ? `<dl>${Object.entries(templates)
                .map(([lang, text]) => `<dt>${escapeHtml(enumLabel(lang, "language") || lang)}</dt><dd>${escapeHtml(text)}</dd>`)
                .join("")}</dl>`
            : `<div class="empty-inline">${t("empty")}</div>`
        }
      </section>
      <section>
        <h2>${t("channel")}</h2>
        <dl>
          <dt>${t("whatsappAccount")}</dt><dd>${escapeHtml(summary.whatsapp_account_env || "—")}</dd>
          <dt>${t("emailAccount")}</dt><dd>${escapeHtml(summary.email_account_env || "—")}</dd>
        </dl>
      </section>
    </div>
  `;
}
