import {
	deltaHtml,
	displayPath,
	els,
	enumLabel,
	escapeHtml,
	filteredOpportunities,
	filteredSites,
	loadState,
	n,
	noticeBanner,
	opportunities,
	pct,
	pos1,
	recordMissingMarkup,
	recordTotal,
	render,
	siteName,
	state,
	statusBadge,
	t,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

export function decisionStatus(action) {
	if (action === "approve") return "approved";
	if (action === "request_changes") return "changes_requested";
	if (action === "block") return "blocked";
	return "needs_review";
}

export function cssEscape(value) {
	return typeof CSS !== "undefined" && CSS.escape
		? CSS.escape(value)
		: String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// ── Opportunities: compact review-queue table + full-card detail ──────────
// `split` mode: the queue stays beside whichever draft is being reviewed.
function opportunitiesTable(items) {
	if (!items.length) return `<div class="empty">${t("noOpportunities")}</div>`;
	return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("opportunity")}</th>
          <th class="ws-col-narrow ws-split-keep">${t("status")}</th>
          <th class="ws-col-wide">${t("target")}</th>
          <th class="ws-col-narrow">${t("site")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
					.map(
						(item) => `
          <tr data-id="${escapeHtml(item.id)}"${item.id === state.route.selectedId ? ' class="ws-selected"' : ""}>
            <td><span class="strong">#${escapeHtml(String(item.ref))} · ${escapeHtml(item.title)}</span></td>
            <td class="ws-split-keep">${statusBadge(item.status)}</td>
            <td class="ws-col-wide">${escapeHtml(item.target_query || displayPath(item.target_page || "") || "—")}</td>
            <td>${escapeHtml(siteName(item.site_id))}</td>
          </tr>
        `,
					)
					.join("")}
      </tbody>
    </table>
  `;
}

export function renderOpportunityList() {
	const items = filteredOpportunities();
	els.viewCount.textContent = `${recordTotal("opportunities", items.length)}`;
	els.listPanel.innerHTML = opportunitiesTable(items);
}

function opportunityDetailMarkup(item, locked) {
	const disabled = locked ? "disabled" : "";
	const targetBits = [
		item.target_page
			? `<a class="external" href="${escapeHtml(item.target_page)}" target="_blank" rel="noreferrer">${escapeHtml(displayPath(item.target_page))}</a>`
			: "",
		item.target_query
			? `<span class="badge">${escapeHtml(item.target_query)}</span>`
			: "",
	]
		.filter(Boolean)
		.join(" · ");
	return `
    <article class="opp-card" data-opp-id="${escapeHtml(item.id)}">
      <header class="detail-head opp-head">
        <span class="opp-ref">${t("opportunity")} #${item.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
        ${statusBadge(item.status)}
        <span class="muted opp-site">${escapeHtml(siteName(item.site_id))}</span>
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      ${targetBits ? `<div class="opp-target"><span class="muted">${t("target")}:</span> ${targetBits}</div>` : ""}
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      <p class="opp-impact"><span class="muted">${t("expectedImpact")}:</span> ${escapeHtml(item.expected_impact)}</p>
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      <label class="opp-label" for="draft-${escapeHtml(item.id)}">${t("draft")}</label>
      <textarea id="draft-${escapeHtml(item.id)}" class="opp-draft" rows="6" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
      ${
				item.decision
					? `
        <div class="opp-decision">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(decisionStatus(item.decision.action)))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
					: ""
			}
      ${
				item.execution
					? `
        <div class="opp-execution">
          <strong>${t("execution")}: ${escapeHtml(enumLabel(item.execution.operation, "operation"))} · ${escapeHtml(enumLabel(item.execution.status))}</strong>
          ${item.execution.detail ? `<span>${escapeHtml(item.execution.detail)}</span>` : ""}
        </div>
      `
					: ""
			}
      <label class="opp-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      <div class="opp-actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(item.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(item.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(item.id)}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(item.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
    </article>
  `;
}

export function renderOpportunityDetail() {
	const item = opportunities().find(
		(entry) => entry.id === state.route.selectedId,
	);
	if (!item) {
		els.detailBody.innerHTML = recordMissingMarkup();
		return;
	}
	const locked = Boolean(state.settings?.lock);
	els.detailBody.innerHTML = `
    ${state.settings?.lock ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    ${noticeBanner()}
    ${opportunityDetailMarkup(item, locked)}
  `;
}

export async function submitDecision(id, action) {
	const note = document.querySelector(`#note-${cssEscape(id)}`)?.value || "";
	const draft = document.querySelector(`#draft-${cssEscape(id)}`)?.value;
	if (state.demo) {
		state.demoDecisions[id] = {
			action,
			note,
			draft: draft ?? null,
			decided_at: new Date().toISOString(),
		};
		render();
		return;
	}
	let result;
	state.notice = "";
	try {
		const provider = await getProvider();
		result = await provider.decideOpportunity({
			opportunity_id: id,
			action,
			note,
			draft,
		});
	} catch (error) {
		els.viewTitle.title = error?.message || `Decision failed: ${action}`;
		return;
	}
	await loadState();
	// Without write access the decision is a ChangeRequest and the opportunity
	// keeps its old status until someone who has it approves: say so.
	if (result?.pending) {
		state.notice = t("savedForReview");
		render();
	}
}

// ── Sites: drawer detail over a compact table ──────────────────────────────
function sitesTable(items) {
	if (!items.length) return `<div class="empty">${t("setupNeeded")}</div>`;
	return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("property")}</th>
          <th class="ws-col-narrow">${t("status")}</th>
          <th class="ws-col-num">${t("clicks")}</th>
          <th class="ws-col-num">${t("avgPosition")}</th>
          <th class="ws-col-wide">${t("lastSync")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
					.map(
						(site) => `
          <tr data-id="${escapeHtml(site.site_id)}"${site.site_id === state.route.selectedId ? ' class="ws-selected"' : ""}>
            <td><span class="strong">${escapeHtml(site.property_url)}</span></td>
            <td><span class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</span></td>
            <td class="ws-col-num">${n(site.totals?.clicks)} ${deltaHtml(site.totals?.clicks, site.previous?.clicks)}</td>
            <td class="ws-col-num">${pos1(site.totals?.position)} ${deltaHtml(site.totals?.position, site.previous?.position, { kind: "pos", invert: true })}</td>
            <td class="ws-col-wide muted">${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</td>
          </tr>
        `,
					)
					.join("")}
      </tbody>
    </table>
  `;
}

export function renderSiteList() {
	const items = filteredSites();
	els.viewCount.textContent = `${recordTotal("sites", items.length)}`;
	els.listPanel.innerHTML = sitesTable(items);
}

export function renderSiteDetail() {
	const site = (state.snapshot?.sites || []).find(
		(item) => item.site_id === state.route.selectedId,
	);
	if (!site) {
		els.detailBody.innerHTML = recordMissingMarkup();
		return;
	}
	els.detailBody.innerHTML = `
    <header class="detail-head">
      <h2>${escapeHtml(site.property_url)}</h2>
      <p class="muted">${escapeHtml(enumLabel(site.verification_type, "verification"))} · ${t("permission")}: ${escapeHtml(site.permission_level || "unknown")}</p>
    </header>
    <dl>
      <dt>${t("status")}</dt><dd><span class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</span></dd>
      <dt>${t("lastSync")}</dt><dd>${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</dd>
      <dt>${t("clicks")}</dt><dd>${n(site.totals?.clicks)} ${deltaHtml(site.totals?.clicks, site.previous?.clicks)}</dd>
      <dt>${t("impressions")}</dt><dd>${n(site.totals?.impressions)} ${deltaHtml(site.totals?.impressions, site.previous?.impressions)}</dd>
      <dt>${t("ctr")}</dt><dd>${pct(site.totals?.ctr)}</dd>
      <dt>${t("avgPosition")}</dt><dd>${pos1(site.totals?.position)} ${deltaHtml(site.totals?.position, site.previous?.position, { kind: "pos", invert: true })}</dd>
    </dl>
    <a class="button" href="#/overview">${t("overview")} →</a>
  `;
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
	els.settingsTitle.textContent = t("settings");
	els.settingsTitle.title = t("localFilesOnly");
	const summary = state.settings?.config_summary || {};
	const auth = summary.auth || {};
	const sync = summary.sync || {};
	els.settingsBody.innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("syncWindow")}</dt><dd>${escapeHtml(String(sync.window_days ?? 28))} ${t("days")} · row limit ${escapeHtml(String(sync.row_limit ?? 250))}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("authMethod")}</h2>
        <dl>
          <dt>${t("authMethod")}</dt><dd>${escapeHtml(auth.method || "service_account")}</dd>
          <dt><code>${escapeHtml(auth.service_account_file_env || "")}</code></dt><dd>${auth.service_account_ready ? t("envReady") : t("envMissing")}</dd>
          <dt><code>${escapeHtml(auth.access_token_env || "")}</code></dt><dd>${auth.access_token_ready ? t("envReady") : t("envMissing")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("sites")}</h2>
        ${
					(summary.sites || [])
						.map(
							(site) => `
          <div class="settings-account">
            <strong>${escapeHtml(site.property_url)}</strong>
            <span>${escapeHtml(site.site_id)}</span>
            <span>${escapeHtml(enumLabel(site.verification_type, "verification"))}</span>
          </div>
        `,
						)
						.join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
				}
      </section>
    </div>
  `;
}
