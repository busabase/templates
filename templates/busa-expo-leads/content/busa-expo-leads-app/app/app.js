import { messages } from "./i18n/messages.js";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { renderFollowups, renderLeads, renderSettings } from "./js/expo-leads-views.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

export const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  batchFilter: "all",
  followupFilter: "all",
  edits: {},
  notice: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("busa-expo-leads-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-expo-leads.sidebarCollapsed";

export const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  reviewCount: document.querySelector("#count-review"),
  redCount: document.querySelector("#count-red"),
  leadCount: document.querySelector("#count-leads"),
  language: document.querySelector("#language"),
};

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
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
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
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
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
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

export function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = "";
  render();
}

export async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.snapshot = data.snapshot;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("busa-expo-leads:state", { detail: data }));
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const route = scenario === "leads" ? "#/leads" : scenario === "followups" ? "#/followups" : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

export function leads() {
  return state.snapshot?.leads || [];
}

export function batches() {
  return state.snapshot?.batches || [];
}

export function followups() {
  return state.snapshot?.followups || [];
}

export function batchById(batchId) {
  return batches().find((item) => item.batch_id === batchId) || null;
}

export function leadById(leadId) {
  return leads().find((item) => item.lead_id === leadId) || null;
}

export function followupById(followupId) {
  return followups().find((item) => item.followup_id === followupId) || null;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const reviewCount = followups().filter((item) => item.status === "needs_review").length;
  const redCount = snapshot?.sla_buckets?.red?.length ?? 0;
  const leadCount = snapshot?.metrics?.lead_count ?? leads().length;
  els.syncStatus.textContent = leads().length ? `${redCount} ${t("slaRed")}` : t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.redCount) els.redCount.textContent = redCount;
  if (els.leadCount) els.leadCount.textContent = leadCount;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount ? `${reviewCount} ${t("needReview")}` : `${leadCount} ${t("leadsLower")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "leads") return t("leads");
  if (view === "followups") return t("followups");
  if (view === "settings") return t("settings");
  return t("overview");
}

export function statusBadge(status) {
  return `<span class="status-badge ${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

export function stageBadge(stage) {
  return `<span class="stage-badge stage-${escapeHtml(stage)}">${escapeHtml(enumLabel(stage, "stage"))}</span>`;
}

export function slaBadge(slaState) {
  const labelKey = { green: "slaGreen", amber: "slaAmber", red: "slaRed" }[slaState] || "slaRed";
  return `<span class="sla-badge sla-${escapeHtml(slaState)}">${escapeHtml(t(labelKey))}</span>`;
}

export function channelBadge(channel) {
  return `<span class="badge">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

export function noticeBanner() {
  if (!state.notice) return "";
  return `<div class="notice-banner">${escapeHtml(state.notice)}</div>`;
}

export function warnings() {
  const items = state.snapshot?.warnings || [];
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

export function metricCards() {
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = followups().filter((item) => item.status === "needs_review").length;
  return `
    <div class="metrics">
      <div class="metric"><span>${t("totalLeads")}</span><strong>${metrics.lead_count ?? leads().length}</strong></div>
      <div class="metric"><span>${t("slaGreen")}</span><strong>${metrics.sla_green_count ?? 0}</strong></div>
      <div class="metric"><span>${t("slaAmber")}</span><strong>${metrics.sla_amber_count ?? 0}</strong></div>
      <div class="metric"><span>${t("slaRed")}</span><strong>${metrics.sla_red_count ?? 0}</strong></div>
      <div class="metric"><span>${t("toReview")}</span><strong>${reviewCount}</strong></div>
    </div>
  `;
}

export function filteredLeads() {
  const query = state.query.trim().toLowerCase();
  let items = leads();
  if (state.batchFilter !== "all") items = items.filter((item) => item.batch_id === state.batchFilter);
  if (!query) return items;
  return items.filter((item) =>
    [item.name, item.company, item.country, item.product_interest, item.batch_name, item.contact_handle]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function filteredFollowups() {
  const query = state.query.trim().toLowerCase();
  return followups().filter((item) => {
    if (state.followupFilter !== "all" && item.status !== state.followupFilter) return false;
    if (!query) return true;
    const lead = leadById(item.lead_id);
    return [item.draft_text, item.language, item.channel, lead?.name, lead?.company]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
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
              const followup = item.latest_followup_id ? followupById(item.latest_followup_id) : null;
              return `
            <a class="due-row" href="${followup ? "#/followups" : "#/leads"}">
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.company)} · ${escapeHtml(item.country)}</small></span>
              <span class="due-meta">${stageBadge(item.stage)}<small>${date(item.met_at)}</small></span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("empty")}</div>`
        }
      </div>
    `;
  };
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <h2 class="section-title">${t("slaBoard")}</h2>
    <section class="overview-grid sla-grid">
      ${bucketSection("green", "slaGreenDesc")}
      ${bucketSection("amber", "slaAmberDesc")}
      ${bucketSection("red", "slaRedDesc")}
    </section>
  `;
}

export function render() {
  renderShell();
  if (state.route.view === "leads") renderLeads();
  else if (state.route.view === "followups") renderFollowups();
  else if (state.route.view === "settings") renderSettings();
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

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("busa-expo-leads-language", state.lang);
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
    els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

syncResponsiveShell();
boot();
