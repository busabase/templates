import {
  actionBadge,
  assetItems,
  channelName,
  channels,
  DETAIL_MODES,
  date,
  dateTime,
  daysUntil,
  detailUrl,
  effectiveStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredAssets,
  filteredChecklist,
  filteredRunbook,
  isPartial,
  items,
  loadState,
  lockBanner,
  noticeBanner,
  pageCount,
  phaseBadge,
  readinessBadge,
  recordById,
  recordUrl,
  render,
  riskBadges,
  state,
  statusBadge,
  statusCount,
  statusStates,
  t,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const targetDate = () =>
  state.settings?.config_summary?.launch?.target_date || state.snapshot?.launch?.target_date || "";

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers nothing else on screen shows: the review/approved/blocked
// counts already sit in the sidebar's attention block. LQS and "done" are
// computed from the loaded Launch Items page and say so when more exist.
function metricsBand() {
  const days = daysUntil(targetDate(), state.snapshot?.generated_at);
  const readiness = state.snapshot?.readiness || {};
  const loaded = items();
  const done = statusCount(loaded, "done");
  const scope = isPartial("items") ? ` · ${t("loadedItems").replace("{n}", loaded.length)}` : "";
  return [
    [days !== null && days <= 0 ? t("launchedLabel") : t("daysToLaunch"), days === null ? "—" : String(Math.max(days, 0))],
    [t("lqs") + scope, loaded.length ? String(Number(readiness.lqs || 0)) : "—"],
    [t("tasksDone") + scope, `${done}/${loaded.length}`],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function readinessCard() {
  const readiness = state.snapshot?.readiness || {};
  const verdict = readiness.verdict || "BLOCK";
  const blockers = readiness.blockers || [];
  return `
    <div class="card overview-panel readiness-card verdict-${escapeHtml(verdict)}">
      <div class="readiness-head">
        <h2>${t("launchReadiness")}</h2>
        ${readinessBadge(verdict)}
      </div>
      <div class="readiness-breakdown">
        <span class="rb-ship">${readiness.ship || 0} ${t("ship")}</span>
        <span class="rb-fix">${readiness.fix || 0} ${t("fix")}</span>
        <span class="rb-block">${readiness.block || 0} ${t("block")}</span>
      </div>
      ${
        blockers.length
          ? `<div class="readiness-blockers">
              <div class="rb-title">${t("blockers")}</div>
              ${blockers
                .map(
                  (blocker) =>
                    `<a href="${recordUrl(blocker.item_id, "checklist")}" class="rb-item">${phaseBadge(blocker.phase)}<span>${escapeHtml(blocker.title)}</span></a>`,
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;
}

export function renderOverview() {
  const product = state.snapshot?.product || {};
  const target = targetDate();
  document.getElementById("overviewSummary").textContent = [
    product.name ? [product.name, product.tagline].filter(Boolean).join(" · ") : t("empty"),
    target ? `${t("targetDate")} ${date(`${target}T00:00:00Z`)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const phaseProgress = state.snapshot?.phase_progress || [];
  const reviewQueue = assetItems().filter((item) => effectiveStatus(item) === "needs_review");
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      ${readinessCard()}
      <div class="card overview-panel">
        <h2>${t("phaseProgress")}</h2>
        ${phaseProgress
          .map((entry) => {
            const pct = entry.total ? Math.round((entry.done / entry.total) * 100) : 0;
            return `
            <div class="stage-row">
              <span class="stage-row-head">${phaseBadge(entry.phase)}<small>${entry.done}/${entry.total}</small></span>
              <span class="stage-bar"><span style="width:${pct}%"></span></span>
              <span class="num">${pct}%</span>
            </div>
          `;
          })
          .join("")}
      </div>
      <div class="card overview-panel">
        <h2>${t("channelStatus")}</h2>
        ${
          channels()
            .map(
              (entry) => `
          <div class="channel-row">
            <span class="strong">${escapeHtml(entry.display_name || enumLabel(entry.channel_id, "channel"))}</span>
            <span class="muted">${escapeHtml(enumLabel(entry.type, "channel"))}</span>
            <span class="submission-badge sub-${escapeHtml(entry.submission_status)}">${escapeHtml(enumLabel(entry.submission_status, "submission"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("assetsToReview")}</h2>
        ${
          reviewQueue
            .slice(0, 5)
            .map(
              (item) => `
          <a class="due-row" href="${recordUrl(item.item_id, "assets", { status: "needs_review" })}">
            <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(channelName(item.channel_id))}</small></span>
            <span class="due-meta">${readinessBadge(item.readiness)}${phaseBadge(item.phase)}</span>
          </a>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noItems")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { checklist: "checklistHint", assets: "assetsHint", launchday: "launchdayHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const titleCell = (item) =>
  cell(`<span class="ref">#${escapeHtml(item.ref)}</span><span class="strong">${escapeHtml(item.title)}</span>`, item.title);

function checklistTable(list) {
  return `
    <table class="ws-table checklist-table">
      ${tableHead([[t("task")], [t("status")], [t("readiness")], [t("phase")], [t("channel")], [t("proposedAction")], [t("owner")]])}
      <tbody>
        ${list
          .map((item) => {
            const channel = channelName(item.channel_id);
            return `${rowOpen(item.item_id)}
              ${titleCell(item)}
              ${cell(statusBadge(effectiveStatus(item)))}
              ${cell(readinessBadge(item.readiness))}
              ${cell(phaseBadge(item.phase))}
              ${cell(channel ? escapeHtml(channel) : `<span class="muted">—</span>`, channel)}
              ${cell(actionBadge(item.proposed_action) || `<span class="muted">—</span>`)}
              ${cell(escapeHtml(item.owner || ""), item.owner)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function assetsTable(list) {
  return `
    <table class="ws-table assets-table">
      ${tableHead([[t("asset")], [t("status")]])}
      <tbody>
        ${list
          .map((item) => `${rowOpen(item.item_id)}${titleCell(item)}${cell(statusBadge(effectiveStatus(item)))}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;
}

function runbookTable(list) {
  return `
    <table class="ws-table runbook-table">
      ${tableHead([[t("step")], [t("time")], [t("owner")], [t("warRoomNote")]])}
      <tbody>
        ${list
          .map(
            (step) => `${rowOpen(step.step_id)}
              ${cell(`<span class="strong">${escapeHtml(step.title)}</span>`, step.title)}
              ${cell(`<span class="runbook-offset">${escapeHtml(step.offset || "")}</span>${step.at ? ` <span class="muted">${escapeHtml(step.at)}</span>` : ""}`)}
              ${cell(escapeHtml(step.owner || ""), step.owner)}
              ${cell(escapeHtml(step.note || ""), step.note)}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total (when known) comes from records.count.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null ? `${current}` : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <nav class="pager" aria-label="${escapeHtml(t("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${escapeHtml(summary)}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </nav>
  `;
}

function statusFilters(list) {
  els.viewFilters.innerHTML = statusStates()
    .map((value) => {
      const label = value === "all" ? t("all") : enumLabel(value);
      return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${statusCount(list, value)}</b></button>`;
    })
    .join("");
  els.statusSelect.innerHTML = statusStates()
    .map(
      (value) =>
        `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("all") : enumLabel(value))} (${statusCount(list, value)})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const list = view === "checklist" ? filteredChecklist() : view === "assets" ? filteredAssets() : filteredRunbook();
  const paged = view !== "launchday";
  els.viewCount.textContent = `${list.length}${paged && isPartial("items") ? "+" : ""}`;
  const filtered = view !== "launchday";
  els.viewFilters.hidden = !filtered;
  els.statusSelect.hidden = !filtered;
  if (filtered) statusFilters(view === "assets" ? assetItems() : items());
  const table = view === "checklist" ? checklistTable(list) : view === "assets" ? assetsTable(list) : runbookTable(list);
  const empty = emptyState(
    state.route.query ? t("noMatches") : view === "launchday" ? t("noRunbook") : state.route.status !== "all" ? t("noItems") : t("empty"),
  );
  els.listPanel.innerHTML = `${list.length ? table : empty}${paged ? pagerControl("items") : ""}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectAsset")) : "";
    return;
  }
  const record = recordById(view, selectedId);
  if (!record) {
    const extra = state.extra[view === "launchday" ? "runbook" : "items"];
    const pending = extra?.has(selectedId) && extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "checklist" ? checklistDetail(record) : view === "assets" ? assetDetail(record) : stepDetail(record);
}

function checklistDetail(item) {
  const status = effectiveStatus(item);
  const channel = channelName(item.channel_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(item.title)}</h2>
      <p class="muted">#${escapeHtml(item.ref)} · ${escapeHtml([enumLabel(item.phase, "phase"), channel].filter(Boolean).join(" · "))}</p>
    </header>
    <div class="detail-stack">
      <dl>
        <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
        <dt>${t("readiness")}</dt><dd>${readinessBadge(item.readiness)}</dd>
        <dt>${t("proposedAction")}</dt><dd>${actionBadge(item.proposed_action) || "—"}</dd>
        <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "—")}</dd>
        ${item.format ? `<dt>${t("format")}</dt><dd>${escapeHtml(item.format)}</dd>` : ""}
        ${item.risk?.length ? `<dt>${t("risk")}</dt><dd>${riskBadges(item.risk)}</dd>` : ""}
        ${item.decided_at ? `<dt>${t("decision")}</dt><dd>${escapeHtml(enumLabel(status))} · ${escapeHtml(dateTime(item.decided_at))}</dd>` : ""}
      </dl>
      ${item.reason ? `<section><h3>${t("reason")}</h3><p>${escapeHtml(item.reason)}</p></section>` : ""}
      ${item.decision_note ? `<section><h3>${t("reviewNote")}</h3><p>${escapeHtml(item.decision_note)}</p></section>` : ""}
      ${
        item.draft
          ? `<section>
              <h3>${t("draft")}</h3>
              <div class="draft-preview">${escapeHtml(item.draft)}</div>
              <p><a class="detail-link" href="${recordUrl(item.item_id, "assets")}">${t("reviewInAssets")}</a></p>
            </section>`
          : ""
      }
    </div>
  `;
}

function assetDetail(item) {
  const status = effectiveStatus(item);
  const edits = state.edits[item.item_id] || {};
  const draft = edits.draft ?? item.draft ?? "";
  const note = edits.note ?? item.decision_note ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const id = escapeHtml(item.item_id);
  return `
    <article class="asset-detail status-${escapeHtml(status)}" data-item="${id}">
      <header class="queue-head">
        <span class="queue-ref">#${escapeHtml(item.ref)}</span>
        ${phaseBadge(item.phase)}
        ${statusBadge(status)}
        ${readinessBadge(item.readiness)}
        ${riskBadges(item.risk)}
      </header>
      <h2 class="queue-subject">${escapeHtml(item.title)}</h2>
      <div class="queue-meta">
        ${item.channel_id ? `<span class="badge">${escapeHtml(channelName(item.channel_id))}</span>` : ""}
        ${actionBadge(item.proposed_action)}
        ${item.format ? `<span>${escapeHtml(item.format)}</span>` : ""}
        <a href="${recordUrl(item.item_id, "checklist")}">${t("openInChecklist")}</a>
      </div>
      <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
      ${lockBanner()}
      <label class="queue-label" for="draft-${id}">${t("draft")}</label>
      <textarea id="draft-${id}" class="queue-draft" data-field="draft" rows="9" ${disabled}>${escapeHtml(draft)}</textarea>
      <label class="queue-label" for="note-${id}">${t("reviewNote")}</label>
      <textarea id="note-${id}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${item.decided_at ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(status))} · ${escapeHtml(dateTime(item.decided_at))}</span>` : ""}
      </div>
    </article>
  `;
}

function stepDetail(step) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(step.title)}</h2>
      <p class="muted">${escapeHtml([step.offset, step.at].filter(Boolean).join(" · "))}</p>
    </header>
    <div class="detail-stack">
      <dl>
        <dt>${t("owner")}</dt><dd>${escapeHtml(step.owner || "—")}</dd>
      </dl>
      ${step.note ? `<section><h3>${t("warRoomNote")}</h3><p>${escapeHtml(step.note)}</p></section>` : ""}
    </div>
  `;
}

export async function submitDecision(itemId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  try {
    const provider = await getProvider();
    await provider.applyDecision(itemId, { action, comment: note, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[itemId];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const product = summary.product || {};
  const launch = summary.launch || {};
  const policy = summary.readiness_policy || {};
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
        <h2>${t("product")}</h2>
        <dl>
          <dt>${t("product")}</dt><dd>${escapeHtml(product.name || "")}</dd>
          <dt>${t("tagline")}</dt><dd>${escapeHtml(product.tagline || "")}</dd>
          <dt>${t("targetDate")}</dt><dd>${launch.target_date ? date(`${launch.target_date}T00:00:00Z`) : ""}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(launch.timezone || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("readinessPolicy")}</h2>
        <dl>
          <dt>${t("blockOn")}</dt><dd>${(policy.block_on || []).map((c) => `<span class="badge">${escapeHtml(enumLabel(c, "channel"))}</span>`).join(" ") || "—"}</dd>
          <dt>${t("minShipRatio")}</dt><dd>${policy.min_ship_ratio != null ? `${Math.round(policy.min_ship_ratio * 100)}%` : "—"}</dd>
          <dt>${t("pressLists")}</dt><dd><div class="stage-list">${(summary.press_lists || []).map((list) => `<span class="tag">${escapeHtml(list.display_name)}</span>`).join(" ") || "—"}</div></dd>
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
            <span>${escapeHtml(enumLabel(channel.type, "channel"))}${channel.handoff_skill ? ` · ${escapeHtml(channel.handoff_skill)}` : ""}</span>
            <span class="${channel.secrets_ready ? "ok" : "warn"}">${channel.secret_envs?.length ? (channel.secrets_ready ? t("secretsReady") : t("missingSecrets")) : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
