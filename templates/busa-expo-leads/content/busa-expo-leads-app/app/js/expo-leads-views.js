import {
  batchById,
  batches,
  channelBadge,
  date,
  els,
  enumLabel,
  escapeHtml,
  filteredFollowups,
  filteredLeads,
  leadById,
  leads,
  loadState,
  noticeBanner,
  render,
  slaBadge,
  stageBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

function batchFilters() {
  const items = [
    { id: "all", name: t("all") },
    ...batches().map((batch) => ({ id: batch.batch_id, name: batch.name })),
  ];
  return `
    <div class="queue-filters">
      ${items
        .map((item) => {
          const count = item.id === "all" ? leads().length : leads().filter((lead) => lead.batch_id === item.id).length;
          return `<button type="button" class="queue-filter ${state.batchFilter === item.id ? "active" : ""}" data-batch-filter="${escapeHtml(item.id)}">${escapeHtml(item.name)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function renderLeads() {
  els.title.textContent = t("leads");
  const items = filteredLeads();
  els.subtitle.textContent = `${items.length} ${t("leadsLower")}`;
  els.content.innerHTML = `
    ${batchFilters()}
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("name")}</th><th>${t("company")}</th><th>${t("country")}</th><th>${t("language")}</th><th>${t("batch")}</th><th>${t("productInterest")}</th><th>${t("channel")}</th><th>${t("metAt")}</th><th>${t("stage")}</th><th>SLA</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
                <tr>
                  <td><span class="strong">${escapeHtml(item.name)}</span><div class="muted">${escapeHtml(item.contact_handle || "")}</div></td>
                  <td>${escapeHtml(item.company || "")}</td>
                  <td>${escapeHtml(item.country || "")}</td>
                  <td>${escapeHtml(enumLabel(item.language, "language"))}</td>
                  <td>${escapeHtml(item.batch_name || "")}</td>
                  <td>${escapeHtml(item.product_interest || "")}</td>
                  <td>${channelBadge(item.contact_channel)}</td>
                  <td>${date(item.met_at)}</td>
                  <td>${stageBadge(item.stage)}</td>
                  <td>${slaBadge(item.sla_state)}</td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("empty")}</div>`
    }
  `;
  bindLeadFilterEvents();
}

function bindLeadFilterEvents() {
  els.content.querySelectorAll("[data-batch-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.batchFilter = button.dataset.batchFilter;
      render();
    });
  });
}

function followupFilters() {
  const options = ["all", "needs_review", "approved", "sent"];
  return `
    <div class="queue-filters">
      ${options
        .map((value) => {
          const count =
            value === "all"
              ? state.snapshot?.followups?.length || 0
              : (state.snapshot?.followups || []).filter((item) => item.status === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.followupFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function renderFollowups() {
  els.title.textContent = t("followups");
  const items = filteredFollowups();
  const reviewCount = (state.snapshot?.followups || []).filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  els.content.innerHTML = `
    ${noticeBanner()}
    ${warnings()}
    ${followupFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const lead = leadById(item.lead_id);
            const batch = lead ? batchById(lead.batch_id) : null;
            const disabled = item.status === "sent" ? "disabled" : "";
            const edits = state.edits[item.followup_id] || {};
            const draft = edits.draft ?? item.draft_text ?? "";
            const note = edits.note ?? item.decision_comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(item.status)}" data-followup="${escapeHtml(item.followup_id)}" data-head-commit="${escapeHtml(item.__headCommitId || "")}">
            <header class="queue-head">
              ${statusBadge(item.status)}
              ${channelBadge(item.channel)}
              <span class="badge">${escapeHtml(enumLabel(item.language, "language") || item.language)}</span>
              <span class="queue-due muted">${t("generated")} ${date(item.created_at)}</span>
            </header>
            <div class="queue-meta">
              ${lead ? `<strong>${escapeHtml(lead.name)}</strong> · ${escapeHtml(lead.company)}` : ""}
              ${batch ? ` · ${escapeHtml(batch.name)}` : ""}
              ${lead ? ` · ${slaBadge(lead.sla_state)}` : ""}
            </div>
            <label class="queue-label">${t("draftText")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" dir="auto" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${item.decision_action ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(item.decision_action, "action"))} · ${escapeHtml(item.decided_at ? new Date(item.decided_at).toLocaleString() : "")}</span>` : ""}
              ${item.execution_status ? `<span class="queue-decision muted">${escapeHtml(item.execution_detail || item.execution_status)}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noFollowups")}</div>`
      }
    </div>
  `;
  bindFollowupEvents();
}

function bindFollowupEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.followupFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.followup;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.followup, card.dataset.headCommit, button.dataset.action, card);
    });
  });
}

async function submitDecision(followupId, headCommitId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  try {
    const provider = await getProvider();
    await provider.applyDecision({
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
  state.notice = t("saved");
  await loadState();
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const thresholds = summary.thresholds || { sla24Hours: 24, sla72Hours: 72 };
  const templates = summary.reply_templates || {};
  els.content.innerHTML = `
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
            : `<div class="empty">${t("empty")}</div>`
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
