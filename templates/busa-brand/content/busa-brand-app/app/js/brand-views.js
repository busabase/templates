import {
  assetStates,
  channelName,
  DETAIL_MODES,
  date,
  dateTime,
  detailUrl,
  driftAlerts,
  els,
  enumLabel,
  escapeHtml,
  filteredDrift,
  filteredItems,
  isMobileLayout,
  isPartial,
  itemById,
  items,
  itemsOfType,
  loadState,
  recordById,
  recordUrl,
  render,
  state,
  t,
  VIEW_BASE,
  viewForItem,
  viewItems,
} from "../app.js";
import { overallGate } from "./brand-model.js?v=0.1.0";
import { appConfig } from "./config.js?v=0.1.0";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;

// ── Badges ─────────────────────────────────────────────────────────────────
export const statusBadge = (status) =>
  `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
const typeBadge = (type) =>
  `<span class="type-badge type-${escapeHtml(type)}">${escapeHtml(enumLabel(type, "type"))}</span>`;
const phaseBadge = (phase) =>
  phase ? `<span class="phase-badge phase-${escapeHtml(phase)}">${escapeHtml(enumLabel(phase, "phase"))}</span>` : "";
const gateBadge = (gate) =>
  gate ? `<span class="gate-badge gate-${escapeHtml(gate)}">${escapeHtml(enumLabel(gate, "gate"))}</span>` : "";
const severityBadge = (severity) =>
  severity
    ? `<span class="severity-badge sev-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`
    : "";
const riskBadges = (risks = []) =>
  risks.map((risk) => `<span class="risk-badge">${escapeHtml(enumLabel(risk, "risk"))}</span>`).join("");
const nqsChip = (nqs) =>
  nqs && typeof nqs.score === "number"
    ? `<span class="nqs-chip"><span class="nqs-label">${t("nqs")}</span><strong>${nqs.score}</strong>${gateBadge(nqs.gate)}</span>`
    : "";

function lockBanner() {
  if (!state.settings?.lock) return "";
  const message = state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : "";
  return `<div class="lock-banner">${t("lockedBanner")}${message}</div>`;
}

function noticeBanner() {
  return state.notice ? `<div class="notice-banner">${escapeHtml(state.notice)}</div>` : "";
}

function warnings(filter = () => true) {
  const list = (state.snapshot?.warnings || []).filter(filter);
  if (!list.length) return "";
  return `<div class="warnings">${list
    .map(
      (item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.code === "read_failed" ? t("readFailed").replace("{name}", item.name) : item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
    )
    .join("")}</div>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers neither the attention block (review / drift / canonical) nor
// the nav (per-view totals) already shows. records.groupBy / aggregates are not
// in the pinned SDK, so they are computed from the loaded page and say so when
// more items exist than are loaded.
function metricsBand() {
  const loaded = items();
  const scored = loaded.filter((item) => typeof item.nqs?.score === "number");
  const overall = scored.length
    ? Math.round(scored.reduce((sum, item) => sum + Number(item.nqs.score || 0), 0) / scored.length)
    : null;
  const blocked = loaded.filter((item) => item.nqs?.gate === "BLOCK").length;
  const pillars = itemsOfType("message_pillar");
  const adoptedPillars = pillars.filter((item) => item.status === "approved").length;
  const scope = isPartial("items") ? ` · ${t("loadedItems").replace("{n}", loaded.length)}` : "";
  return [
    [t("overallNqs"), overall == null ? "—" : `${overall} ${gateBadge(overallGate(overall))}`],
    [t("gateBlocked"), String(blocked)],
    [t("pillarsAdopted"), pillars.length ? `${adoptedPillars} / ${pillars.length}` : "—"],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label + scope)}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderOverview() {
  const snapshot = state.snapshot || {};
  const brand = state.settings?.config_summary?.brand?.name || snapshot.brand_name;
  document.getElementById("overviewSummary").textContent = [
    brand,
    `${t("framework")} ${state.settings?.config_summary?.brand?.framework || snapshot.framework || "TALE"}`,
    snapshot.generated_at ? `${t("generated")} ${dateTime(snapshot.generated_at)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const positioning = snapshot.positioning || {};
  const positioningItem = itemById(positioning.item_id);
  const pillars = itemsOfType("message_pillar");
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="house">
      <a class="card house-roof" ${positioningItem ? `href="${detailUrl(positioningItem.item_id, "narrative")}"` : ""}>
        <span class="house-roof-label">${t("positioningStatement")} ${positioningItem ? statusBadge(positioningItem.status) : ""}</span>
        <p class="house-statement">${escapeHtml(positioning.statement || t("empty"))}</p>
      </a>
      <div class="house-pillars">
        <h2>${t("messagePillars")}</h2>
        <div class="pillar-grid">
          ${
            pillars
              .map(
                (pillar) => `
            <a class="card pillar-card" href="${detailUrl(pillar.item_id, "narrative")}">
              <span class="pillar-head"><strong>${escapeHtml(pillar.title)}</strong>${statusBadge(pillar.status)}</span>
              <p>${escapeHtml(pillar.draft)}</p>
              <span class="pillar-foot">${nqsChip(pillar.nqs)}${phaseBadge(pillar.phase)}</span>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noItems")}</div>`
          }
        </div>
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { narrative: "narrativeHint", stories: "storiesHint", drift: "driftHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const nqsCell = (item) =>
  cell(typeof item.nqs?.score === "number" ? String(item.nqs.score) : `<span class="muted">—</span>`, "", "ws-col-num");

function narrativeTable(list) {
  return `
    <table class="ws-table brand-table narrative-table">
      ${tableHead([
        [t("asset")],
        [t("status")],
        [t("type")],
        [t("phase")],
        [t("subSkill")],
        [t("nqs"), "ws-col-num"],
        [t("gate")],
      ])}
      <tbody>
        ${list
          .map(
            (item) => `${rowOpen(item.item_id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(statusBadge(item.status))}
              ${cell(typeBadge(item.type))}
              ${cell(phaseBadge(item.phase))}
              ${cell(escapeHtml(item.sub_skill), item.sub_skill, "muted-cell")}
              ${nqsCell(item)}
              ${cell(gateBadge(item.nqs?.gate))}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function storiesTable(list) {
  return `
    <table class="ws-table brand-table stories-table">
      ${tableHead([
        [t("asset")],
        [t("status")],
        [t("type")],
        [t("evidence")],
        [t("nqs"), "ws-col-num"],
        [t("gate")],
      ])}
      <tbody>
        ${list
          .map((item) => {
            const evidence =
              item.type !== "proof_point"
                ? ""
                : item.evidence
                  ? [item.evidence.source, item.evidence.stat].filter(Boolean).join(" — ")
                  : "";
            return `${rowOpen(item.item_id)}
              ${cell(`<span class="strong">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(statusBadge(item.status))}
              ${cell(typeBadge(item.type))}
              ${cell(
                item.type === "proof_point" && !item.evidence
                  ? `<span class="ev-missing">${t("noSource")}</span>`
                  : escapeHtml(evidence),
                evidence,
              )}
              ${nqsCell(item)}
              ${cell(gateBadge(item.nqs?.gate))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function driftTable(list) {
  return `
    <table class="ws-table brand-table drift-table">
      ${tableHead([[t("alert")], [t("severity")], [t("status"), "ws-split-keep"]])}
      <tbody>
        ${list
          .map(
            (alert) => `${rowOpen(alert.alert_id)}
              ${cell(`<span class="strong">${escapeHtml(alert.title)}</span>`, `${alert.title} · ${channelName(alert.channel_id)}`)}
              ${cell(severityBadge(alert.severity))}
              ${cell(statusBadge(alert.status), "", "ws-split-keep")}
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count when available.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  const size = appConfigReadLimit(key);
  const total = state.totals?.[key];
  const pages = total == null ? null : Math.max(1, Math.ceil(total / size), current);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${
        pages == null ? t("pageN").replace("{current}", current) : t("pageOf").replace("{current}", current).replace("{total}", pages)
      }</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

const appConfigReadLimit = (key) => appConfig.bases.find((entry) => entry.key === key)?.readLimit || 50;

function statusCounts(view) {
  const list = viewItems(view);
  return Object.fromEntries(
    assetStates().map((value) => [
      value,
      value === "all" ? list.length : list.filter((item) => item.status === value).length,
    ]),
  );
}

function renderStatusFilters(view) {
  const show = view === "narrative" || view === "stories";
  els.viewFilters.hidden = !show;
  els.statusSelect.hidden = !show;
  if (!show) {
    els.viewFilters.innerHTML = "";
    els.statusSelect.innerHTML = "";
    return;
  }
  const counts = statusCounts(view);
  // Only states that hold something, plus the active one and "all".
  const states = assetStates().filter((value) => value === "all" || counts[value] || state.route.status === value);
  const label = (value) => (value === "all" ? t("all") : enumLabel(value));
  els.viewFilters.innerHTML = states
    .map(
      (value) =>
        `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label(value))} <b>${counts[value]}</b></button>`,
    )
    .join("");
  els.statusSelect.innerHTML = states
    .map(
      (value) =>
        `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(label(value))} (${counts[value]})</option>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  const key = VIEW_BASE[view];
  els.viewTitle.textContent = view === "drift" ? t("driftAlerts") : t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const list = view === "drift" ? filteredDrift() : filteredItems(view);
  els.viewCount.textContent = `${list.length}${isPartial(key) ? "+" : ""}`;
  renderStatusFilters(view);
  const table = view === "drift" ? driftTable(list) : view === "stories" ? storiesTable(list) : narrativeTable(list);
  const filtered = Boolean(state.route.query) || state.route.status !== "all";
  const empty = emptyState(
    filtered ? t("noMatches") : view === "drift" ? t("noDrift") : t("noItems"),
  );
  els.listPanel.innerHTML = `${list.length ? table : empty}${pagerControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectAlert")) : "";
    return;
  }
  const record = recordById(view, selectedId);
  if (!record) {
    const extra = state.extra[VIEW_BASE[view]];
    const pending = extra?.has(selectedId) && extra.get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML = view === "drift" ? driftDetail(record) : assetDetail(record);
}

function assetDetail(item) {
  const edits = state.edits[item.item_id] || {};
  const draft = edits.draft ?? item.draft ?? "";
  const note = edits.note ?? item.decision_note ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const id = escapeHtml(item.item_id);
  const citedBy = driftAlerts().filter((alert) => alert.guardrail_item_id === item.item_id);
  return `
    <article class="asset-detail" data-record="${id}">
      <header class="detail-head">
        <h2>${escapeHtml(item.title)}</h2>
        <p class="muted">${escapeHtml(
          [item.ref ? `#${item.ref}` : "", enumLabel(item.type, "type"), enumLabel(item.phase, "phase"), item.sub_skill]
            .filter(Boolean)
            .join(" · "),
        )}</p>
      </header>
      <div class="asset-meta">${statusBadge(item.status)}${nqsChip(item.nqs)}${riskBadges(item.risk)}</div>
      ${warnings((warning) => warning.item_id === item.item_id)}
      ${lockBanner()}
      <label class="asset-label" for="draft-${id}">${t("draft")}</label>
      <textarea id="draft-${id}" class="asset-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
      ${
        item.type === "proof_point"
          ? `<div class="asset-evidence">${
              item.evidence
                ? `<span class="ev-label">${t("evidence")}:</span> <strong>${escapeHtml(item.evidence.source || "")}</strong> — ${escapeHtml(item.evidence.stat || "")}${item.evidence.url ? ` <a href="${escapeHtml(item.evidence.url)}" target="_blank" rel="noopener">↗</a>` : ""}`
                : `<span class="ev-missing">${t("evidence")}: ${t("noSource")}</span>`
            }</div>`
          : ""
      }
      ${item.reason ? `<p class="asset-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>` : ""}
      <label class="asset-label" for="note-${id}">${t("reviewNote")}</label>
      <textarea id="note-${id}" class="asset-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="asset-actions">
        <button type="button" class="approve" data-action="approve" title="${t("adopt")}" ${disabled}>${t("adopt")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${item.decided_at ? `<span class="asset-decision muted">${t("decision")}: ${escapeHtml(dateTime(item.decided_at))}</span>` : ""}
      </div>
      ${
        citedBy.length
          ? `<section class="related">
        <h3>${t("citedByDrift")}</h3>
        ${citedBy
          .map(
            (alert) => `
          <a class="related-row" href="${recordUrl(alert.alert_id, "drift")}">
            <span><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(channelName(alert.channel_id))}</small></span>
            <span class="related-meta">${severityBadge(alert.severity)}${statusBadge(alert.status)}</span>
          </a>`,
          )
          .join("")}
      </section>`
          : ""
      }
    </article>
  `;
}

function driftDetail(alert) {
  const disabled = state.settings?.lock ? "disabled" : "";
  const guardrail = itemById(alert.guardrail_item_id);
  return `
    <article class="drift-detail" data-record="${escapeHtml(alert.alert_id)}">
      <header class="detail-head">
        <h2>${escapeHtml(alert.title)}</h2>
        <p class="muted">${escapeHtml([channelName(alert.channel_id), date(alert.detected_at)].filter(Boolean).join(" · "))}</p>
      </header>
      <div class="asset-meta">${severityBadge(alert.severity)}${statusBadge(alert.status)}</div>
      ${lockBanner()}
      <div class="drift-compare">
        <div class="drift-offending">
          <span class="drift-label">${t("offending")}</span>
          <p>${escapeHtml(alert.offending_usage)}</p>
        </div>
        <div class="drift-canonical">
          <span class="drift-label">${t("guidance")}</span>
          <p>${escapeHtml(alert.canonical_guidance)}</p>
          ${
            guardrail
              ? `<a class="drift-ref" href="${recordUrl(guardrail.item_id, viewForItem(guardrail))}">${escapeHtml(guardrail.title)} →</a>`
              : alert.guardrail_item_id
                ? `<span class="muted">${t("notLoaded")}</span>`
                : ""
          }
        </div>
      </div>
      ${noticeBanner()}
      <div class="asset-actions">
        <button type="button" class="approve" data-action="resolve_drift" title="${t("resolveFix")}" ${disabled}>${t("resolveFix")}</button>
        <button type="button" data-action="dismiss_drift" title="${t("dismissFix")}" ${disabled}>${t("dismissFix")}</button>
        ${alert.decided_at ? `<span class="asset-decision muted">${t("decision")}: ${escapeHtml(dateTime(alert.decided_at))}</span>` : ""}
      </div>
    </article>
  `;
}

export async function submitDecision(recordId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value;
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  let result;
  try {
    const provider = await getProvider();
    result = await provider.applyDecision(recordId, { action, comment: note, ...(draft === undefined ? {} : { draft }) });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${error}`;
    render();
    return;
  }
  delete state.edits[recordId];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the record
  // keeps its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const brand = summary.brand || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      ${warnings((warning) => !warning.item_id)}
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("brand")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(brand.category || "")}</dd>
          <dt>${t("audience")}</dt><dd>${escapeHtml(brand.audience || "")}</dd>
          <dt>${t("mission")}</dt><dd>${escapeHtml(brand.mission || "")}</dd>
          <dt>${t("framework")}</dt><dd>${escapeHtml(brand.framework || "TALE")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
          <dt>${t("readingLevel")}</dt><dd>${escapeHtml(summary.reading_level || "")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("guardrails")}</h2>
        <dl>
          <dt>${t("banned")}</dt><dd>${(summary.banned_phrases || []).map((phrase) => `<span class="tag">${escapeHtml(phrase)}</span>`).join(" ") || "—"}</dd>
          <dt>${t("regulated")}</dt><dd>${(summary.regulated_claims || []).map((phrase) => `<span class="tag">${escapeHtml(phrase)}</span>`).join(" ") || "—"}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("officialUrls")}</h2>
        <dl>
          ${(summary.official_urls || []).map((entry) => `<dt>${escapeHtml(entry.key)}</dt><dd>${escapeHtml(entry.url)}</dd>`).join("") || "<dd>—</dd>"}
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
            <span>${escapeHtml(enumLabel(channel.type, "channelType"))}${channel.monitored ? ` · ${t("monitored")}` : ""}</span>
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
