import {
  compactNumber,
  creatorSorts,
  creators,
  DETAIL_MODES,
  detailUrl,
  effectiveStatus,
  els,
  engagements,
  enumLabel,
  escapeHtml,
  filteredCreators,
  filteredOutreach,
  filteredRoi,
  fitBadge,
  gateBadge,
  isPartial,
  loadState,
  lockBanner,
  money,
  nicheBadge,
  noticeBanner,
  outreachStates,
  pageCount,
  phaseBadge,
  platformBadge,
  recordById,
  recordUrl,
  render,
  riskBadges,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
import { calcRoi, phaseForStage } from "./creators-model.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const percent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
const roiText = (item) => {
  const value = calcRoi(Number(item.spend || 0), Number(item.est_value || 0));
  return value === null ? "—" : `${value.toFixed(0)}%`;
};
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show. The pinned SDK has no
// server aggregate (records.groupBy), so the sums come from the loaded page
// and say so when the Base holds more engagements than are loaded.
function scopeLabel() {
  return isPartial() ? ` · ${t("loadedRows").replace("{n}", creators().length)}` : "";
}

function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const budgetTotal = Number(metrics.budget_total || 0);
  const left = budgetTotal ? money(budgetTotal - Number(metrics.budget_allocated || 0)) : "—";
  const scope = scopeLabel();
  return [
    [t("reach"), compactNumber(metrics.total_reach)],
    [t("estValue"), money(metrics.est_value)],
    [t("budgetRemaining"), left],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label + scope)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const metrics = state.snapshot?.metrics || {};
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  const creatorCount = `${metrics.creator_count ?? engagements().length}${isPartial() ? "+" : ""}`;
  document.getElementById("overviewSummary").textContent = [
    `${creatorCount} ${t("creatorsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const stages = state.snapshot?.pipeline_stages || [];
  const list = engagements();
  const maxStageCount = Math.max(1, ...stages.map((stage) => list.filter((item) => item.stage === stage).length));
  const budgetTotal = Number(metrics.budget_total || 0);
  const budgetAllocated = Number(metrics.budget_allocated || 0);
  const budgetPct = budgetTotal ? Math.min(100, Math.round((budgetAllocated / budgetTotal) * 100)) : 0;
  const top = list
    .slice()
    .sort((a, b) => Number(b.fit_score || 0) - Number(a.fit_score || 0))
    .slice(0, 5);
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("pipelineFunnel")}</h2>
        ${stages
          .map((stage) => {
            const stageItems = list.filter((item) => item.stage === stage);
            const reach = stageItems.reduce((sum, item) => sum + Number(item.followers || 0), 0);
            return `
            <div class="stage-row">
              <span class="stage-row-head">${phaseBadge(phaseForStage(stage))}<strong>${escapeHtml(enumLabel(stage, "stage"))}</strong><small>${stageItems.length}</small></span>
              <span class="stage-bar"><span style="width:${Math.round((stageItems.length / maxStageCount) * 100)}%"></span></span>
              <span class="num">${compactNumber(reach)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="card overview-panel">
        <h2>${t("topCreators")}</h2>
        ${
          top
            .map(
              (item) => `
            <a class="due-row" href="${recordUrl(item.creator_id, "creators")}">
              <span class="due-name"><strong>${escapeHtml(item.name)}</strong> <span class="muted">${escapeHtml(item.handle)}</span></span>
              <span class="due-meta">${platformBadge(item.platform)}${fitBadge(item.fit_score)}${statusBadge(effectiveStatus(item))}</span>
            </a>
          `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("budget")}</h2>
        <div class="budget-head">
          <strong>${money(budgetAllocated)}</strong>
          <span class="muted">${escapeHtml(t("budgetAllocated"))} / ${money(budgetTotal)} ${escapeHtml(t("budgetTotal"))}</span>
        </div>
        <span class="stage-bar budget-bar"><span style="width:${budgetPct}%"></span></span>
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { creators: "creatorsHint", outreach: "outreachHint", roi: "roiHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const nameCell = (item) =>
  cell(
    `<span class="strong">${escapeHtml(item.name)}</span> <span class="muted">${escapeHtml(item.handle)}</span>`,
    `${item.name} ${item.handle}`,
  );

function creatorsTable(items) {
  return `
    <table class="ws-table creators-table">
      ${tableHead([
        [t("creator")],
        [t("platform")],
        [t("niche")],
        [t("phase")],
        [t("followers"), "ws-col-num"],
        [t("engagementRate"), "ws-col-num"],
        [t("estRate"), "ws-col-num"],
        [t("fitScore"), "ws-col-num"],
        [t("status")],
      ])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.creator_id)}
              ${nameCell(item)}
              ${cell(platformBadge(item.platform))}
              ${cell(escapeHtml(enumLabel(item.niche, "niche")))}
              ${cell(escapeHtml(enumLabel(item.phase, "phase")))}
              ${cell(compactNumber(item.followers), "", "ws-col-num")}
              ${cell(percent(item.engagement_rate), "", "ws-col-num")}
              ${cell(money(item.est_rate), "", "ws-col-num")}
              ${cell(fitBadge(item.fit_score), "", "ws-col-num")}
              ${cell(
                `${statusBadge(effectiveStatus(item))} ${riskBadges(item.risk)}`,
                [enumLabel(effectiveStatus(item)), ...(item.risk || []).map((risk) => enumLabel(risk, "risk"))].join(" · "),
              )}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function outreachTable(items) {
  return `
    <table class="ws-table outreach-table">
      ${tableHead([[t("creator")], [t("status")]])}
      <tbody>
        ${items
          .map(
            (item) => `${rowOpen(item.creator_id)}
              ${cell(
                `<span class="queue-ref">#${escapeHtml(item.ref)}</span> <span class="strong">${escapeHtml(item.name)}</span>`,
                `#${item.ref} ${item.name} ${item.handle}`,
              )}
              ${cell(`${statusBadge(effectiveStatus(item))}${item.item_type === "quality_gate" ? ` ${gateBadge(item.gate_verdict)}` : ""}`)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function roiTable(items) {
  return `
    <table class="ws-table roi-table">
      ${tableHead([
        [t("creator")],
        [t("platform")],
        [t("niche")],
        [t("stage")],
        [t("spend"), "ws-col-num"],
        [t("estValue"), "ws-col-num"],
        [t("cpm"), "ws-col-num"],
        ["ROI", "ws-col-num"],
        [t("status")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const spend = Number(item.spend || 0);
            return `${rowOpen(item.creator_id)}
              ${nameCell(item)}
              ${cell(platformBadge(item.platform))}
              ${cell(escapeHtml(enumLabel(item.niche, "niche")))}
              ${cell(escapeHtml(enumLabel(item.stage, "stage")))}
              ${cell(spend ? money(spend) : "—", "", "ws-col-num")}
              ${cell(money(item.est_value), "", "ws-col-num")}
              ${cell(item.cpm ? money(item.cpm) : "—", "", "ws-col-num")}
              ${cell(roiText(item), "", "ws-col-num")}
              ${cell(statusBadge(effectiveStatus(item)))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the page total comes from records.count when allowed.
function pagerControl(key = "creators") {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null ? String(current) : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <nav class="pager" aria-label="${escapeHtml(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${escapeHtml(summary)}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

// The toolbar's one control besides search: the outreach status filter, or the
// creator sort. Segments on desktop, a native select on phones.
function toolbarFilter(view) {
  if (view === "outreach") {
    return outreachStates().map((value) => {
      const count =
        value === "all" ? creators().length : creators().filter((item) => effectiveStatus(item) === value).length;
      return { value, label: value === "all" ? t("all") : enumLabel(value), count, active: state.route.status === value };
    });
  }
  if (view === "creators") {
    const labels = { fit_score: t("fitScore"), followers: t("followers"), engagement_rate: t("engagementRate"), est_rate: t("estRate") };
    return creatorSorts().map((value) => ({ value, label: labels[value], active: state.route.sort === value }));
  }
  return null;
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "creators" ? filteredCreators() : view === "outreach" ? filteredOutreach() : filteredRoi();
  els.viewCount.textContent = `${items.length}${isPartial() ? "+" : ""}`;

  // A full-page record has nothing to sort or filter; the controls return with the list.
  const options = state.route.presentation === "page" ? null : toolbarFilter(view);
  els.viewFilters.hidden = !options;
  els.filterSelect.hidden = !options;
  els.viewFilters.setAttribute("aria-label", view === "creators" ? t("sortBy") : t("status"));
  els.filterSelect.setAttribute("aria-label", view === "creators" ? t("sortBy") : t("status"));
  els.viewFilters.innerHTML = (options || [])
    .map(
      (option) =>
        `<button type="button" class="segment ${option.active ? "active" : ""}" data-value="${option.value}">${escapeHtml(option.label)}${option.count == null ? "" : ` <b>${option.count}</b>`}</button>`,
    )
    .join("");
  els.filterSelect.innerHTML = (options || [])
    .map(
      (option) =>
        `<option value="${option.value}"${option.active ? " selected" : ""}>${escapeHtml(option.label)}${option.count == null ? "" : ` (${option.count})`}</option>`,
    )
    .join("");

  const table = view === "creators" ? creatorsTable(items) : view === "outreach" ? outreachTable(items) : roiTable(items);
  const empty =
    view === "outreach" && !state.route.query
      ? emptyState(t("noCreators"))
      : emptyState(state.route.query ? t("noMatches") : t("empty"));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl()}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectCreator")) : "";
    return;
  }
  const item = recordById(selectedId);
  if (!item) {
    const pending = state.extra.has(selectedId) && state.extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = creatorDetail(item);
}

// One detail markup for the page, the drawer and the split queue: what the
// agent proposes, the review form, the fit breakdown and the facts.
function creatorDetail(item) {
  const status = effectiveStatus(item);
  const isGate = item.item_type === "quality_gate";
  const fit = item.fit_breakdown || {};
  const fitKeys = ["content", "community", "credibility", "audience", "cost", "engagement"];
  const edits = state.edits[item.creator_id] || {};
  const draft = edits.draft ?? item.suggested_reply ?? "";
  const note = edits.note ?? item.decision_note ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const id = escapeHtml(item.creator_id);
  const spend = Number(item.spend || 0);
  return `
    <article class="creator-detail status-${escapeHtml(status)}" data-creator="${id}">
      <header class="detail-head">
        <h2>${escapeHtml(item.name)}</h2>
        <p class="muted">${escapeHtml([item.handle, enumLabel(item.platform, "platform"), enumLabel(item.niche, "niche")].filter(Boolean).join(" · "))}</p>
      </header>
      ${warnings((warning) => warning.creator_id === item.creator_id)}
      <section class="detail">
        <div class="detail-main">
          <div class="agent-panel">
            <h3>${t("reason")}</h3>
            <p>${escapeHtml(item.reason || "")}</p>
            ${item.audience_note ? `<p class="muted">${t("audience")}: ${escapeHtml(item.audience_note)}</p>` : ""}
          </div>
          ${isGate ? gatePanel(item) : ""}
          <div class="card review-panel">
            <header class="queue-head">
              <span class="queue-ref">#${escapeHtml(item.ref)}</span>
              ${statusBadge(status)}
              ${isGate ? gateBadge(item.gate_verdict) : phaseBadge(item.phase)}
              ${riskBadges(item.risk)}
              <span class="queue-due">${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</span>
            </header>
            ${lockBanner()}
            <label class="queue-label" for="draft-${id}">${t("draft")}</label>
            <textarea id="draft-${id}" class="queue-draft" data-field="draft" rows="8" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label" for="note-${id}">${t("reviewNote")}</label>
            <textarea id="note-${id}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            ${noticeBanner()}
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("gateFix")}" ${disabled}>${t("gateFix")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${item.decided_at ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(new Date(item.decided_at).toLocaleString())}</span>` : ""}
            </div>
          </div>
          <div class="card overview-panel">
            <h3>${t("fitBreakdown")}</h3>
            ${fitKeys
              .map((key) => {
                const value = Number(fit[key] || 0);
                return `
              <div class="stage-row fit-row">
                <span class="stage-row-head"><strong>${escapeHtml(enumLabel(key, "fit"))}</strong></span>
                <span class="stage-bar"><span style="width:${Math.min(100, value)}%"></span></span>
                <span class="num">${value}</span>
              </div>
            `;
              })
              .join("")}
          </div>
        </div>
        <aside class="card detail-side">
          <dl>
            <dt>${t("fitScore")}</dt><dd>${fitBadge(item.fit_score)}</dd>
            <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
            <dt>${t("stage")}</dt><dd>${escapeHtml(enumLabel(item.stage, "stage"))} ${phaseBadge(item.phase)}</dd>
            <dt>${t("platform")}</dt><dd>${platformBadge(item.platform)}</dd>
            <dt>${t("niche")}</dt><dd>${escapeHtml(enumLabel(item.niche, "niche"))}</dd>
            <dt>${t("followers")}</dt><dd class="tabular">${compactNumber(item.followers)}</dd>
            <dt>${t("engagementRate")}</dt><dd class="tabular">${percent(item.engagement_rate)}</dd>
            <dt>${t("estRate")}</dt><dd class="tabular">${money(item.est_rate)}</dd>
            <dt>${t("spend")}</dt><dd class="tabular">${spend ? money(spend) : "—"}</dd>
            <dt>${t("estValue")}</dt><dd class="tabular">${money(item.est_value)}</dd>
            <dt>${t("cpm")}</dt><dd class="tabular">${item.cpm ? money(item.cpm) : "—"}</dd>
            <dt>ROI</dt><dd class="tabular">${roiText(item)}</dd>
            <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</dd>
            <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel")) || "—"}</dd>
            ${item.risk?.length ? `<dt>${t("warnings")}</dt><dd>${riskBadges(item.risk)}</dd>` : ""}
          </dl>
        </aside>
      </section>
    </article>
  `;
}

function gatePanel(item) {
  const checks = item.gate_checks || [];
  return `
    <div class="card overview-panel gate-panel">
      <h3>${t("gate")} ${item.gate_verdict ? gateBadge(item.gate_verdict) : ""}</h3>
      <div class="gate-checks">
        ${checks
          .map(
            (check) => `
          <div class="gate-check-row">
            ${gateBadge(check.result)}
            <span><strong>${escapeHtml(enumLabel(check.check, "check"))}</strong><small>${escapeHtml(check.note || "")}</small></span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

export async function submitDecision(creatorId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  try {
    const provider = await getProvider();
    await provider.applyDecision(creatorId, { action, comment: note, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[creatorId];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const program = summary.program || {};
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
        <h2>${t("budget")}</h2>
        <dl>
          <dt>${t("budgetTotal")}</dt><dd>${money(program.budget_total, program.base_currency || "USD")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(program.base_currency || "USD")}</dd>
          <dt>${t("targetNiches")}</dt><dd class="stage-list">${(program.target_niches || []).map((niche) => nicheBadge(niche)).join(" ")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("brands")}</h2>
        ${
          (summary.brands || [])
            .map(
              (brand) => `
          <div class="settings-channel">
            <strong>${escapeHtml(brand.display_name)}</strong>
            <span>${escapeHtml(brand.positioning || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("platform")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-channel">
            <strong>${escapeHtml(platform.display_name)}</strong>
            <span>${escapeHtml(platform.type)}${platform.handoff_skill ? ` · ${escapeHtml(platform.handoff_skill)}` : ""}</span>
            <span class="${platform.secrets_ready ? "ok" : "warn"}">${platform.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
