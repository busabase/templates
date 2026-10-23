import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import {
	closeConnectGate,
	passConnectGate,
	renderSetupRequired,
} from "./js/connect-gate.js?v=0.1.0";
import {
	geoOpportunities,
	renderEntity,
	renderGeo,
	renderGeoDetail,
	renderGeoList,
	submitEntitySignal,
	submitGeoDecision,
} from "./js/geo-views.js";
import { createPagination } from "./js/pagination.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
	renderSettings,
	renderSiteDetail,
	renderSiteList,
	renderOpportunityDetail,
	renderOpportunityList,
	submitDecision,
} from "./js/seo-ops-views.js";
export { cssEscape, decisionStatus } from "./js/seo-ops-views.js";

// Where a record opens, per route view. The queue/table Bases each declare
// their mode once in config.js `ui.detail_modes`; `geo` and `entity` are not
// browsed one record at a time (see config.js for why) so they have no mode.
const VIEW_BASE_KEY = {
	sites: "sites",
	queries: "queries",
	pages: "pages",
	opportunities: "opportunities",
	optimize: "geo-opportunities",
};
const RECORD_VIEWS = Object.keys(VIEW_BASE_KEY);
const ALL_VIEWS = [...RECORD_VIEWS, "overview", "geo", "entity", "settings"];

export function detailModeFor(view) {
	const baseKey = VIEW_BASE_KEY[view];
	return baseKey ? appConfig.ui.detail_modes[baseKey] : null;
}

export const state = {
	snapshot: null,
	settings: null,
	route: parseRoute(),
	query: "",
	site: localStorage.getItem("busa-seo-site") || "",
	oppFilter: "all",
	geoFilter: "all",
	lang: normalizeLang(
		new URLSearchParams(location.search).get("lang") ||
			localStorage.getItem("busa-seo-language") ||
			"auto",
	),
	demo: new URLSearchParams(location.search).get("demo") || "",
	demoDecisions: {},
	geoDecisions: {},
	entityOverrides: {},
	// Set after a write the server queued as a ChangeRequest (no write access),
	// shown on the view that made it, and cleared on the next write or route.
	notice: "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-seo.sidebarCollapsed";

const byId = (id) => document.getElementById(id);
export const els = {
	loadState: byId("loadState"),
	overviewPage: byId("overviewPage"),
	overviewTitle: byId("overviewTitle"),
	overviewSummary: byId("overviewSummary"),
	overviewMetrics: byId("overviewMetrics"),
	overviewBody: byId("overviewBody"),
	viewPage: byId("viewPage"),
	viewTitle: byId("viewTitle"),
	viewCount: byId("viewCount"),
	viewFilters: byId("viewFilters"),
	listPanel: byId("listPanel"),
	detailPanel: byId("detailPanel"),
	detailBody: byId("detailBody"),
	detailBack: byId("detailBack"),
	detailExpand: byId("detailExpand"),
	geoPage: byId("geoPage"),
	geoTitle: byId("geoTitle"),
	geoBody: byId("geoBody"),
	entityPage: byId("entityPage"),
	entityTitle: byId("entityTitle"),
	entityBody: byId("entityBody"),
	settingsPage: byId("settingsPage"),
	settingsTitle: byId("settingsTitle"),
	settingsBody: byId("settingsBody"),
	search: byId("search"),
	refresh: byId("refresh"),
	mobileRefresh: byId("mobileRefresh"),
	sidebarToggle: byId("sidebarToggle"),
	mobileSidebarToggle: byId("mobileSidebarToggle"),
	sidebarScrim: byId("sidebarScrim"),
	mobileViewTitle: byId("mobileViewTitle"),
	mobileViewMeta: byId("mobileViewMeta"),
	syncStatus: byId("sync-status"),
	reviewCount: byId("count-review"),
	approvedCount: byId("count-approved"),
	blockedCount: byId("count-blocked"),
	site: byId("site"),
	language: byId("language"),
};

const pagination = createPagination({
	getProvider,
	pageSizes: Object.fromEntries(
		appConfig.bases.map((base) => [base.key, base.readLimit]),
	),
	applyPage: (key, rows) => {
		state.snapshot[key === "geo-opportunities" ? "geo_opportunities" : key] =
			rows;
	},
	render: () => render(),
	label: (key) => t(key),
	onError: (error) => {
		state.pageError = error instanceof Error ? error.message : String(error);
	},
});

export function recordTotal(key, fallback = 0) {
	return pagination.total(key, fallback);
}

export function pagerControl(key) {
	return pagination.control(key);
}

function isMobileLayout() {
	return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
	const collapsed = document.body.classList.contains("sidebar-collapsed");
	els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
	document.body.classList.toggle("sidebar-collapsed", collapsed);
	syncSidebarState();
	if (persist)
		localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
	document.body.classList.toggle("sidebar-open", Boolean(open));
	if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
	if (isMobileLayout()) {
		setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
		return;
	}
	setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
	if (isMobileLayout()) {
		document.body.classList.remove("sidebar-collapsed");
		setMobileSidebarOpen(false);
	} else {
		setMobileSidebarOpen(false);
		setSidebarCollapsed(
			localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1",
			{ persist: false },
		);
	}
}

function activeLang() {
	if (state.lang !== "auto") return state.lang;
	return navigator.languages?.some((lang) =>
		lang.toLowerCase().startsWith("zh"),
	)
		? "zh"
		: "en";
}

function normalizeLang(lang) {
	return String(lang || "auto")
		.toLowerCase()
		.startsWith("zh")
		? "zh"
		: lang || "auto";
}

export function t(key) {
	return messages[activeLang()]?.[key] || messages.en[key] || key;
}

export function enumLabel(value, group = "status") {
	if (!value) return "";
	const key = String(value);
	return (
		messages[activeLang()]?.enum?.[group]?.[key] ||
		messages.en.enum?.[group]?.[key] ||
		key.replaceAll("_", " ")
	);
}

function locale() {
	return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

export function n(value) {
	return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(
		Number(value || 0),
	);
}

export function pct(value) {
	return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function pos1(value) {
	return Number(value || 0).toFixed(1);
}

export function date(value) {
	if (!value) return "";
	return new Intl.DateTimeFormat(locale(), {
		month: "short",
		day: "2-digit",
		year: "numeric",
	}).format(new Date(value));
}

export function deltaHtml(
	current,
	previous,
	{ kind = "int", invert = false } = {},
) {
	const diff = Number(current || 0) - Number(previous || 0);
	if (
		!Number.isFinite(diff) ||
		Math.abs(diff) < (kind === "int" ? 0.5 : 0.0005)
	) {
		return `<span class="delta flat">±0</span>`;
	}
	const good = invert ? diff < 0 : diff > 0;
	const arrow = diff > 0 ? "▲" : "▼";
	let text;
	if (kind === "pct") text = `${Math.abs(diff * 100).toFixed(1)}pp`;
	else if (kind === "pos") text = Math.abs(diff).toFixed(1);
	else text = n(Math.abs(diff));
	return `<span class="delta ${good ? "positive" : "negative"}">${arrow} ${text}</span>`;
}

// ── Routing ──────────────────────────────────────────────────────────────
// `#/<view>[/<record>][?peek=<record>]`. A `page`-mode Base always uses the
// record path; a `drawer`/`split` Base uses `?peek=` so the list stays
// mounted behind it. Refresh and shared links land on the same record.
function parseRoute() {
	const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
	const [path, query = ""] = raw.split("?");
	const parts = path.split("/").filter(Boolean);
	const params = new URLSearchParams(query);
	let view = parts[0] || "overview";
	if (!ALL_VIEWS.includes(view)) view = "overview";
	let id = "";
	try {
		id = parts[1] ? decodeURIComponent(parts[1]) : "";
	} catch {
		id = "";
	}
	const mode = detailModeFor(view);
	const peek = mode && mode !== "page" && !id ? params.get("peek") || "" : "";
	return {
		view,
		id,
		peek,
		selectedId: mode ? id || peek : "",
		presentation: !mode ? null : id ? "page" : mode === "page" ? null : mode,
	};
}

export const listUrl = (view = state.route.view) => `#/${view}`;
// Always the full page, whatever the view's declared mode.
export const detailUrl = (id, view = state.route.view) =>
	`#/${view}/${encodeURIComponent(id)}`;
// What a row click (or a cross-link) opens: the page for a `page` view, else `?peek=`.
export const recordUrl = (id, view = state.route.view) => {
	if (detailModeFor(view) === "page") return detailUrl(id, view);
	return `#/${view}?peek=${encodeURIComponent(id)}`;
};

export function closeDetail() {
	if (history.state?.fromList) history.back();
	else location.hash = listUrl();
}

let previousRouteWasList = false;

function setRoute() {
	const previous = state.route;
	state.route = parseRoute();
	state.notice = "";
	// A detail opened from its list replaces the entry, so Back/Close/Escape
	// step to that exact list instead of pushing a new history entry.
	if (
		state.route.selectedId &&
		previousRouteWasList &&
		previous.view === state.route.view
	) {
		history.replaceState({ fromList: true }, "");
	}
	previousRouteWasList =
		RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
	setMobileSidebarOpen(false);
	render();
}

export async function loadState() {
	const provider = await getProvider();
	const data = await provider.getState();
	pagination.reset(data.pagination, data.totals);
	closeConnectGate();
	state.snapshot = data.snapshot;
	state.settings = data;
	applyDemoRoute();
	populateSiteSelect();
	window.dispatchEvent(new CustomEvent("busa-seo:state", { detail: data }));
	render();
}

function applyDemoRoute() {
	if (!state.settings?.demo || location.hash) return;
	const scenario = state.settings.demo_scenario || "overview";
	const detailQuery =
		state.snapshot?.queries?.find((query) =>
			query.badges?.includes("striking_distance"),
		) || state.snapshot?.queries?.[0];
	const routeByScenario = {
		queries: "#/queries",
		pages: "#/pages",
		opportunities: "#/opportunities",
		geo: "#/geo",
		optimize: "#/optimize",
		entity: "#/entity",
		detail: `#/queries/${encodeURIComponent(detailQuery?.query_id || "")}`,
	};
	const route = routeByScenario[scenario] || "#/overview";
	history.replaceState(
		null,
		"",
		`${location.pathname}${location.search}${route}`,
	);
	state.route = parseRoute();
	previousRouteWasList =
		RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
}

function populateSiteSelect() {
	if (!els.site) return;
	const sites = state.snapshot?.sites || [];
	const current = state.site;
	els.site.innerHTML = [
		`<option value="">${escapeHtml(t("allSites"))}</option>`,
	]
		.concat(
			sites.map(
				(site) =>
					`<option value="${escapeHtml(site.site_id)}">${escapeHtml(site.property_url)}</option>`,
			),
		)
		.join("");
	els.site.value = sites.some((site) => site.site_id === current)
		? current
		: "";
	state.site = els.site.value;
}

function applyI18n() {
	document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
	document.querySelectorAll("[data-i18n]").forEach((node) => {
		node.textContent = t(node.dataset.i18n);
	});
	const languageLabels =
		activeLang() === "zh"
			? { auto: "自动", en: "English", zh: "中文" }
			: { auto: "Auto", en: "English", zh: "中文" };
	for (const option of els.language.options) {
		option.textContent = languageLabels[option.value] || option.textContent;
	}
	els.search.placeholder = t("search");
	els.refresh.textContent = t("refresh");
	if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
	els.detailExpand.textContent = t("openFullPage");
}

export function opportunities() {
	const list = state.snapshot?.opportunities || [];
	if (!state.demo) return list;
	return list.map((opportunity) => {
		const local = state.demoDecisions[opportunity.id];
		if (!local) return opportunity;
		let status = opportunity.status;
		if (local.action === "approve") status = "approved";
		if (local.action === "request_changes") status = "changes_requested";
		if (local.action === "block") status = "blocked";
		return {
			...opportunity,
			status,
			decision: local,
			draft: local.draft ?? opportunity.draft,
		};
	});
}

function reviewCounts() {
	const opps = opportunities();
	return {
		review: opps.filter((item) => item.status === "needs_review").length,
		approved: opps.filter((item) => item.status === "approved").length,
		blocked: opps.filter((item) => item.status === "blocked").length,
	};
}

function renderShell() {
	applyI18n();
	const snapshot = state.snapshot;
	const counts = reviewCounts();
	const queryCount = pagination.total(
		"queries",
		snapshot?.queries?.length || 0,
	);
	els.syncStatus.textContent =
		snapshot && queryCount
			? `${queryCount} ${t("queries").toLowerCase()}`
			: t("empty");
	if (els.reviewCount) els.reviewCount.textContent = counts.review;
	if (els.approvedCount) els.approvedCount.textContent = counts.approved;
	if (els.blockedCount) els.blockedCount.textContent = counts.blocked;
	if (els.mobileViewTitle)
		els.mobileViewTitle.textContent = viewLabel(state.route.view);
	if (els.mobileViewMeta) {
		els.mobileViewMeta.textContent = counts.review
			? `${counts.review} ${t("needsReview")}`
			: `${n(snapshot?.metrics?.clicks || 0)} ${t("clicks").toLowerCase()}`;
	}
	document.querySelectorAll("[data-route]").forEach((link) => {
		link.classList.toggle("active", link.dataset.route === state.route.view);
	});
}

export function viewLabel(view) {
	if (view === "queries") return t("queries");
	if (view === "pages") return t("pages");
	if (view === "opportunities") return t("opportunities");
	if (view === "geo") return t("aiVisibility");
	if (view === "optimize") return t("geoOptimizer");
	if (view === "entity") return t("entityReadiness");
	if (view === "sites") return t("sites");
	if (view === "settings") return t("settings");
	return t("overview");
}

export function sitesInScope() {
	const sites = state.snapshot?.sites || [];
	return state.site
		? sites.filter((site) => site.site_id === state.site)
		: sites;
}

function scopedTotals() {
	const sites = sitesInScope();
	return {
		current: aggregateTotals(sites.map((site) => site.totals)),
		previous: aggregateTotals(sites.map((site) => site.previous)),
	};
}

function aggregateTotals(list) {
	const clicks = list.reduce((sum, item) => sum + Number(item?.clicks || 0), 0);
	const impressions = list.reduce(
		(sum, item) => sum + Number(item?.impressions || 0),
		0,
	);
	const weighted = list.reduce(
		(sum, item) =>
			sum + Number(item?.position || 0) * Number(item?.impressions || 0),
		0,
	);
	return {
		clicks,
		impressions,
		ctr: impressions ? clicks / impressions : 0,
		position: impressions ? weighted / impressions : 0,
	};
}

function dailyInScope() {
	const daily = state.snapshot?.daily || [];
	const scoped = state.site
		? daily.filter((point) => point.site_id === state.site)
		: daily;
	const byDate = new Map();
	for (const point of scoped) {
		const entry = byDate.get(point.date) || {
			date: point.date,
			clicks: 0,
			impressions: 0,
		};
		entry.clicks += Number(point.clicks || 0);
		entry.impressions += Number(point.impressions || 0);
		byDate.set(point.date, entry);
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function currentWindowDaily() {
	const start = state.snapshot?.range?.current?.start || "";
	return dailyInScope().filter((point) => !start || point.date >= start);
}

export function filteredQueries() {
	const query = state.query.trim().toLowerCase();
	return (state.snapshot?.queries || []).filter((item) => {
		if (state.site && item.site_id !== state.site) return false;
		if (!query) return true;
		return [item.query, item.site_id, ...(item.badges || [])].some((value) =>
			String(value).toLowerCase().includes(query),
		);
	});
}

export function filteredPages() {
	const query = state.query.trim().toLowerCase();
	return (state.snapshot?.pages || []).filter((item) => {
		if (state.site && item.site_id !== state.site) return false;
		if (!query) return true;
		return [item.url, item.site_id, ...(item.issues || [])].some((value) =>
			String(value).toLowerCase().includes(query),
		);
	});
}

export function filteredOpportunities() {
	const query = state.query.trim().toLowerCase();
	return opportunities().filter((item) => {
		if (state.oppFilter !== "all" && item.status !== state.oppFilter)
			return false;
		if (!query) return true;
		return [
			item.title,
			item.target_page,
			item.target_query,
			item.type,
			item.reason,
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(query));
	});
}

export function filteredSites() {
	const query = state.query.trim().toLowerCase();
	const sites = state.snapshot?.sites || [];
	if (!query) return sites;
	return sites.filter((site) =>
		[site.property_url, site.site_id].some((value) =>
			String(value).toLowerCase().includes(query),
		),
	);
}

// ── Metrics band (Overview only) ───────────────────────────────────────────
// Three numbers, none of them already visible elsewhere on the screen: the
// per-base totals sit next to each nav item, and the needs-review count is
// already in the sidebar's attention block. CTR is left out — it is already
// a column on every Queries/Pages row and is derivable from the other two.
function metricsBand(current, previous) {
	const cell = (label, value, delta) =>
		`<div><span>${escapeHtml(label)}</span><strong>${value} ${delta}</strong></div>`;
	return [
		cell(
			t("clicks"),
			n(current.clicks),
			deltaHtml(current.clicks, previous.clicks),
		),
		cell(
			t("impressions"),
			n(current.impressions),
			deltaHtml(current.impressions, previous.impressions),
		),
		cell(
			t("avgPosition"),
			pos1(current.position),
			deltaHtml(current.position, previous.position, {
				kind: "pos",
				invert: true,
			}),
		),
	].join("");
}

function trendChart(points) {
	if (!points.length) return `<div class="empty">${t("noTrend")}</div>`;
	const step = 14;
	const width = points.length * step;
	const height = 120;
	const maxClicks = Math.max(...points.map((point) => point.clicks), 1);
	const maxImpressions = Math.max(
		...points.map((point) => point.impressions),
		1,
	);
	const bars = points
		.map((point, index) => {
			const x = index * step;
			const impH = Math.max(
				Math.round((point.impressions / maxImpressions) * (height - 8)),
				2,
			);
			const clickH = Math.max(
				Math.round((point.clicks / maxClicks) * (height - 34)),
				2,
			);
			return `
      <g>
        <title>${point.date}: ${n(point.clicks)} ${t("clicks").toLowerCase()} / ${n(point.impressions)} ${t("impressions").toLowerCase()}</title>
        <rect x="${x + 1}" y="${height - impH}" width="${step - 2}" height="${impH}" rx="2" class="bar-impressions"></rect>
        <rect x="${x + 4}" y="${height - clickH}" width="${step - 8}" height="${clickH}" rx="2" class="bar-clicks"></rect>
      </g>
    `;
		})
		.join("");
	const first = points[0]?.date || "";
	const last = points[points.length - 1]?.date || "";
	return `
    <div class="trend">
      <div class="trend-legend">
        <span><i class="dot dot-clicks"></i>${t("clicks")}</span>
        <span><i class="dot dot-impressions"></i>${t("impressions")}</span>
        <span class="muted">${date(first)} – ${date(last)}</span>
      </div>
      <div class="trend-scroll">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${t("clicksTrend")}">${bars}</svg>
      </div>
    </div>
  `;
}

export function badgeList(badges, group = "badge") {
	if (!badges?.length) return "";
	return badges
		.map(
			(badge) =>
				`<span class="badge badge-${escapeHtml(badge)}">${escapeHtml(enumLabel(badge, group))}</span>`,
		)
		.join(" ");
}

// The pending-write notice, in the same banner the lock uses.
export function noticeBanner() {
	return state.notice
		? `<div class="warnings" role="status"><div class="warning"><strong>${escapeHtml(state.notice)}</strong></div></div>`
		: "";
}

export function statusBadge(status) {
	return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function warningsPanel(siteId = "") {
	const items = (state.snapshot?.warnings || []).filter(
		(item) => !siteId || !item.site_id || item.site_id === siteId,
	);
	if (!items.length) return "";
	return `<div class="warnings">${items
		.map(
			(item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `,
		)
		.join("")}</div>`;
}

export function siteName(siteId) {
	const site = state.snapshot?.sites?.find((item) => item.site_id === siteId);
	if (site) return site.property_url;
	return siteId ? t("notLoaded") : "";
}

function renderOverview() {
	els.overviewTitle.textContent = t("overview");
	els.overviewSummary.textContent = state.snapshot?.generated_at
		? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
		: t("empty");
	const totals = scopedTotals();
	els.overviewMetrics.innerHTML = metricsBand(totals.current, totals.previous);
	const queries = filteredQueries();
	const movers = [...queries].sort(
		(a, b) =>
			b.clicks -
			(b.previous?.clicks || 0) -
			(a.clicks - (a.previous?.clicks || 0)),
	);
	const gainers = movers.slice(0, 5);
	const losers = movers
		.slice(-5)
		.reverse()
		.filter((item) => item.clicks - (item.previous?.clicks || 0) < 0);
	const reviewItems = opportunities().filter(
		(item) => item.status === "needs_review",
	);
	els.overviewBody.innerHTML = `
    ${warningsPanel(state.site)}
    <div class="overview-panel wide">
      <h2>${t("clicksTrend")}</h2>
      ${trendChart(currentWindowDaily())}
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("movers")}</h2>
        ${gainers.map((item) => moverRow(item)).join("") || `<div class="empty">${t("empty")}</div>`}
        ${losers.length ? `<h3 class="panel-subhead">${t("losers")}</h3>${losers.map((item) => moverRow(item)).join("")}` : ""}
      </div>
      <div class="overview-panel">
        <h2>${t("siteFreshness")}</h2>
        ${sitesInScope()
					.map(
						(site) => `
          <a class="health-row" href="#/sites">
            <span><strong>${escapeHtml(site.property_url)}</strong><small>${t("lastSync")} ${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</small></span>
            <span class="num">${n(site.totals?.clicks)} ${t("clicks").toLowerCase()}</span>
            <span class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</span>
          </a>
        `,
					)
					.join("")}
      </div>
      <div class="overview-panel wide">
        <div class="row between">
          <h2>${t("opportunityQueue")}</h2>
          <a class="muted" href="#/opportunities">${t("viewAll")} →</a>
        </div>
        ${
					reviewItems
						.slice(0, 4)
						.map(
							(item) => `
          <a class="health-row" href="${recordUrl(item.id, "opportunities")}">
            <span><strong>${t("opportunity")} #${item.ref} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(enumLabel(item.type, "type"))} · ${escapeHtml(item.target_query || item.target_page || "")}</small></span>
            <span class="num">${escapeHtml(item.expected_impact.split(".")[0])}</span>
            ${statusBadge(item.status)}
          </a>
        `,
						)
						.join("") || `<div class="empty">${t("noOpportunities")}</div>`
				}
      </div>
    </section>
  `;
}

function moverRow(item) {
	const diff = item.clicks - (item.previous?.clicks || 0);
	return `
    <a class="movement-row" href="${recordUrl(item.query_id, "queries")}">
      <span><strong>${escapeHtml(item.query)}</strong><small>${n(item.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.position)}</small></span>
      <span class="num ${diff < 0 ? "negative" : "positive"}">${diff >= 0 ? "+" : "−"}${n(Math.abs(diff))}</span>
    </a>
  `;
}

// ── Record views: queries ───────────────────────────────────────────────────
function queriesTable(items) {
	if (!items.length) return `<div class="empty">${t("empty")}</div>`;
	return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("query")}</th><th class="ws-col-num">${t("clicks")}</th><th class="ws-col-num">${t("impressions")}</th><th class="ws-col-num">${t("ctr")}</th><th class="ws-col-num">${t("position")}</th><th class="ws-col-wide">${t("badges")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
					.map(
						(item) => `
          <tr data-id="${escapeHtml(item.query_id)}"${item.query_id === state.route.selectedId ? ' class="ws-selected"' : ""}>
            <td><span class="strong">${escapeHtml(item.query)}</span> <span class="muted">${escapeHtml(siteName(item.site_id))}</span></td>
            <td class="ws-col-num">${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</td>
            <td class="ws-col-num">${n(item.impressions)} ${deltaHtml(item.impressions, item.previous?.impressions)}</td>
            <td class="ws-col-num">${pct(item.ctr)}</td>
            <td class="ws-col-num">${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</td>
            <td class="ws-col-wide">${badgeList(item.badges)}</td>
          </tr>
        `,
					)
					.join("")}
      </tbody>
    </table>
  `;
}

function renderQueriesList() {
	const items = filteredQueries().sort((a, b) => b.clicks - a.clicks);
	els.viewCount.textContent = `${pagination.total("queries", items.length)}`;
	els.listPanel.innerHTML = `${queriesTable(items)}${pagerControl("queries")}`;
}

function queryMetaDl(item) {
	return `
    <dl>
      <dt>${t("site")}</dt><dd>${escapeHtml(siteName(item.site_id))}</dd>
      <dt>${t("badges")}</dt><dd>${badgeList(item.badges) || "—"}</dd>
      <dt>${t("clicks")}</dt><dd>${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</dd>
      <dt>${t("impressions")}</dt><dd>${n(item.impressions)} ${deltaHtml(item.impressions, item.previous?.impressions)}</dd>
      <dt>${t("ctr")}</dt><dd>${pct(item.ctr)}</dd>
      <dt>${t("position")}</dt><dd>${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</dd>
      <dt>${t("prevPeriod")}</dt><dd>${n(item.previous?.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.previous?.position)}</dd>
    </dl>
  `;
}

function queryDetailMarkup(item) {
	return `
    <header class="detail-head">
      <h2>${escapeHtml(item.query)}</h2>
      <p class="muted">${escapeHtml(siteName(item.site_id))} · ${t("position")} ${pos1(item.position)}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="overview-panel wide">
          <h2>${t("clicksTrend")}</h2>
          ${trendChart(item.trend || [])}
        </div>
        <div class="overview-panel wide">
          <h2>${t("topPages")}</h2>
          ${miniTable(item.top_pages || [], "url")}
        </div>
        ${item.agent_notes ? `<div class="overview-panel"><h2>${t("agentNotes")}</h2><p class="agent-notes">${escapeHtml(item.agent_notes)}</p></div>` : ""}
      </div>
      <aside class="card detail-side">
        ${queryMetaDl(item)}
      </aside>
    </section>
  `;
}

export function recordMissingMarkup() {
	return `<div class="empty"><strong>${t("recordMissing")}</strong><p>${t("recordMissingDetail")}</p></div>`;
}

function renderQueryDetail() {
	const item = (state.snapshot?.queries || []).find(
		(query) => query.query_id === state.route.selectedId,
	);
	els.detailBody.innerHTML = item
		? queryDetailMarkup(item)
		: recordMissingMarkup();
}

// ── Record views: pages ──────────────────────────────────────────────────────
export function displayPath(url) {
	try {
		const parsed = new URL(url);
		return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
	} catch {
		return url;
	}
}

function pagesTable(items) {
	if (!items.length) return `<div class="empty">${t("empty")}</div>`;
	return `
    <table class="ws-table">
      <thead>
        <tr>
          <th>${t("page")}</th><th class="ws-col-num">${t("clicks")}</th><th class="ws-col-num">${t("impressions")}</th><th class="ws-col-num">${t("ctr")}</th><th class="ws-col-num">${t("position")}</th><th class="ws-col-wide">${t("issues")}</th>
        </tr>
      </thead>
      <tbody>
        ${items
					.map(
						(item) => `
          <tr data-id="${escapeHtml(item.page_id)}"${item.page_id === state.route.selectedId ? ' class="ws-selected"' : ""}>
            <td><span class="strong">${escapeHtml(displayPath(item.url))}</span> <span class="muted">${escapeHtml(siteName(item.site_id))}</span></td>
            <td class="ws-col-num">${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</td>
            <td class="ws-col-num">${n(item.impressions)} ${deltaHtml(item.impressions, item.previous?.impressions)}</td>
            <td class="ws-col-num">${pct(item.ctr)}</td>
            <td class="ws-col-num">${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</td>
            <td class="ws-col-wide">${badgeList(item.issues)}</td>
          </tr>
        `,
					)
					.join("")}
      </tbody>
    </table>
  `;
}

function renderPagesList() {
	const items = filteredPages().sort((a, b) => b.clicks - a.clicks);
	els.viewCount.textContent = `${pagination.total("pages", items.length)}`;
	els.listPanel.innerHTML = `${pagesTable(items)}${pagerControl("pages")}`;
}

function pageDetailMarkup(item) {
	return `
    <header class="detail-head">
      <h2>${escapeHtml(displayPath(item.url))}</h2>
      <p class="muted">${escapeHtml(siteName(item.site_id))} · ${t("position")} ${pos1(item.position)}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="overview-panel wide">
          <h2>${t("clicksTrend")}</h2>
          ${trendChart(item.trend || [])}
        </div>
        <div class="overview-panel wide">
          <h2>${t("topQueries")}</h2>
          ${miniTable(item.top_queries || [], "query")}
        </div>
        ${item.agent_notes ? `<div class="overview-panel"><h2>${t("agentNotes")}</h2><p class="agent-notes">${escapeHtml(item.agent_notes)}</p></div>` : ""}
      </div>
      <aside class="card detail-side">
        <dl>
          <dt>URL</dt><dd><a class="external" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></dd>
          <dt>${t("site")}</dt><dd>${escapeHtml(siteName(item.site_id))}</dd>
          <dt>${t("issues")}</dt><dd>${badgeList(item.issues) || "—"}</dd>
          <dt>${t("clicks")}</dt><dd>${n(item.clicks)} ${deltaHtml(item.clicks, item.previous?.clicks)}</dd>
          <dt>${t("ctr")}</dt><dd>${pct(item.ctr)}</dd>
          <dt>${t("position")}</dt><dd>${pos1(item.position)} ${deltaHtml(item.position, item.previous?.position, { kind: "pos", invert: true })}</dd>
          <dt>${t("prevPeriod")}</dt><dd>${n(item.previous?.clicks)} ${t("clicks").toLowerCase()} · ${t("position")} ${pos1(item.previous?.position)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function renderPageDetail() {
	const item = (state.snapshot?.pages || []).find(
		(page) => page.page_id === state.route.selectedId,
	);
	els.detailBody.innerHTML = item
		? pageDetailMarkup(item)
		: recordMissingMarkup();
}

function miniTable(rows, keyField) {
	if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
	return `
    <div class="table-wrap flush">
      <table class="mini">
        <thead>
          <tr><th>${keyField === "url" ? t("page") : t("query")}</th><th class="num">${t("clicks")}</th><th class="num">${t("impressions")}</th><th class="num">${t("position")}</th></tr>
        </thead>
        <tbody>
          ${rows
						.map(
							(row) => `
            <tr>
              <td class="strong">${escapeHtml(keyField === "url" ? displayPath(row.url) : row.query)}</td>
              <td class="num">${n(row.clicks)}</td>
              <td class="num">${n(row.impressions)}</td>
              <td class="num">${pos1(row.position)}</td>
            </tr>
          `,
						)
						.join("")}
        </tbody>
      </table>
    </div>
  `;
}

export const OPP_FILTERS = [
	"all",
	"needs_review",
	"changes_requested",
	"approved",
	"done",
	"blocked",
];

// ── Shared record-view shell (queries / pages / sites / opportunities / optimize) ──
function filterChips(filterList, activeFilter, counts, attr) {
	return filterList
		.map((filter) => {
			const count = filter === "all" ? counts.all : counts[filter] || 0;
			const label = filter === "all" ? t("viewAll") : enumLabel(filter);
			return `<button type="button" class="chip ${activeFilter === filter ? "active" : ""}" data-${attr}="${filter}" title="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`;
		})
		.join("");
}

function renderDetail() {
	const { view, selectedId, presentation } = state.route;
	const phone = isMobileLayout();
	els.detailBack.textContent =
		presentation === "page" || phone ? t("backToList") : t("close");
	els.detailExpand.hidden = !selectedId || presentation === "page";
	if (selectedId) els.detailExpand.href = detailUrl(selectedId, view);
	const bar = els.detailPanel.querySelector(".ws-detail-bar");
	if (bar) bar.hidden = !selectedId;

	if (!selectedId) {
		els.detailBody.innerHTML =
			presentation === "split"
				? `<div class="ws-detail-empty">${t("selectItem")}</div>`
				: "";
		return;
	}
	if (view === "queries") renderQueryDetail();
	else if (view === "pages") renderPageDetail();
	else if (view === "sites") renderSiteDetail();
	else if (view === "opportunities") renderOpportunityDetail();
	else if (view === "optimize") renderGeoDetail();
}

export function renderRecordView() {
	const { view } = state.route;
	els.viewTitle.textContent = viewLabel(view);
	const showsFilters = view === "opportunities" || view === "optimize";
	els.viewFilters.hidden = !showsFilters;
	if (view === "queries") renderQueriesList();
	else if (view === "pages") renderPagesList();
	else if (view === "sites") renderSiteList();
	else if (view === "opportunities") {
		const all = opportunities();
		const counts = { all: all.length };
		for (const filter of OPP_FILTERS)
			if (filter !== "all")
				counts[filter] = all.filter((item) => item.status === filter).length;
		els.viewFilters.innerHTML = filterChips(
			OPP_FILTERS,
			state.oppFilter,
			counts,
			"opp-filter",
		);
		renderOpportunityList();
	} else if (view === "optimize") {
		const all = geoOpportunities();
		const counts = { all: all.length };
		for (const filter of OPP_FILTERS)
			if (filter !== "all")
				counts[filter] = all.filter((item) => item.status === filter).length;
		els.viewFilters.innerHTML = filterChips(
			OPP_FILTERS,
			state.geoFilter,
			counts,
			"geo-filter",
		);
		renderGeoList();
	}
	renderDetail();
}

export function render() {
	renderShell();
	const ready = Boolean(state.snapshot);
	const { view, selectedId, presentation } = state.route;
	const onRecordView = ready && RECORD_VIEWS.includes(view);
	const body = document.body.classList;
	body.toggle("ws-detail-open", onRecordView && Boolean(selectedId));
	body.toggle(
		"ws-detail-page",
		onRecordView && presentation === "page" && Boolean(selectedId),
	);
	body.toggle("ws-detail-drawer", onRecordView && presentation === "drawer");
	body.toggle(
		"ws-layout-split",
		onRecordView && detailModeFor(view) === "split" && presentation !== "page",
	);
	body.toggle("ws-searching", onRecordView && Boolean(state.query));
	els.loadState.hidden = ready;
	els.overviewPage.hidden = !ready || view !== "overview";
	els.viewPage.hidden = !onRecordView;
	els.geoPage.hidden = !ready || view !== "geo";
	els.entityPage.hidden = !ready || view !== "entity";
	els.settingsPage.hidden = !ready || view !== "settings";
	if (!ready) return;
	if (onRecordView) renderRecordView();
	else if (view === "geo") renderGeo();
	else if (view === "entity") renderEntity();
	else if (view === "settings") renderSettings();
	else renderOverview();
}

export function escapeHtml(value) {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char],
	);
}

// ── Events ───────────────────────────────────────────────────────────────
pagination.bind(els.listPanel);
els.listPanel.addEventListener("click", (event) => {
	if (event.target.closest("a, button, [data-goto-page]")) return;
	const row = event.target.closest("tr[data-id], [data-id]");
	if (!row) return;
	const url = recordUrl(row.dataset.id, state.route.view);
	if (state.route.peek) {
		history.replaceState(history.state, "", url);
		setRoute();
	} else {
		location.hash = url;
	}
});
els.viewFilters.addEventListener("click", (event) => {
	const oppChip = event.target.closest("[data-opp-filter]");
	if (oppChip) {
		state.oppFilter = oppChip.dataset.oppFilter;
		render();
		return;
	}
	const geoChip = event.target.closest("[data-geo-filter]");
	if (geoChip) {
		state.geoFilter = geoChip.dataset.geoFilter;
		render();
	}
});
els.detailBack.addEventListener("click", closeDetail);
els.detailBody.addEventListener("click", (event) => {
	const button = event.target.closest("[data-decision]");
	if (button && !button.disabled) {
		submitDecision(button.dataset.id, button.dataset.decision);
		return;
	}
	const geoButton = event.target.closest("[data-geo-decision]");
	if (geoButton && !geoButton.disabled) {
		submitGeoDecision(geoButton.dataset.id, geoButton.dataset.geoDecision);
	}
});
els.entityBody.addEventListener("click", (event) => {
	const entityButton = event.target.closest("[data-entity-status]");
	if (entityButton && !entityButton.disabled) {
		submitEntitySignal(
			entityButton.dataset.id,
			entityButton.dataset.entityStatus,
		);
	}
});
document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	if (event.target.closest?.("textarea, input")) {
		event.target.blur();
		return;
	}
	if (
		state.route.selectedId &&
		state.route.presentation &&
		state.route.presentation !== "page"
	)
		closeDetail();
});
window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () =>
	setMobileSidebarOpen(true),
);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
	state.query = els.search.value;
	render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.site?.addEventListener("change", () => {
	state.site = els.site.value;
	localStorage.setItem("busa-seo-site", state.site);
	render();
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
	state.lang = normalizeLang(els.language.value);
	localStorage.setItem("busa-seo-language", state.lang);
	if (state.demo) {
		loadState().catch(() => render());
		return;
	}
	populateSiteSelect();
	render();
});

async function boot() {
	const ready = await passConnectGate({ onReady: boot });
	if (!ready) return;
	try {
		await loadState();
	} catch (error) {
		if (String(error?.message || error).startsWith("SETUP_")) {
			renderSetupRequired(error, boot);
			return;
		}
		els.loadState.hidden = false;
		els.loadState.classList.add("error");
		els.loadState.textContent =
			error instanceof Error ? error.message : String(error);
	}
}

previousRouteWasList =
	RECORD_VIEWS.includes(state.route.view) && !state.route.selectedId;
syncResponsiveShell();
boot();
