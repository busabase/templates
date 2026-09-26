import { messages } from "./i18n/messages.js";
import { appConfig } from "./js/config.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import {
  DECIDABLE_STATUSES,
  attentionList,
  checkDates,
  filterObservations,
  freshness,
  isUnsourced,
  positionGrid,
  rankCompetitors,
  reviewQueue,
  shareOfShelf,
} from "./js/shelf-model.js?v=0.1.0";

const LANGUAGE_STORAGE_KEY = "busa-agent-shelf-language";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-agent-shelf.sidebarCollapsed";
const BROWSED_KEYS = ["questions", "observations", "competitors", "fixes"];
const AGENT_NAMES = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  "meta-muse": "Meta Muse",
  "amazon-rufus": "Amazon Rufus",
  perplexity: "Perplexity",
  other: "Other",
};
const FIX_VIEWS = ["", "approved", "applied", "blocked", "all"];

const state = {
  data: null,
  route: parseRoute(),
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem(LANGUAGE_STORAGE_KEY) || appConfig.locale,
  ),
  notice: null,
  error: "",
  busyFix: "",
  loadingMore: {},
  pageError: "",
  drafts: {},
  noteErrors: {},
  answerFilter: { agent: "", question: "", query: "" },
};

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  countProposed: document.querySelector("#count-proposed"),
  countMissing: document.querySelector("#count-missing"),
  countHighRisk: document.querySelector("#count-high-risk"),
  countUnsourced: document.querySelector("#count-unsourced"),
  language: document.querySelector("#language"),
};

// ── shell ────────────────────────────────────────────────────────────────────

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
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

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

// ── i18n & formatting ───────────────────────────────────────────────────────

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key, vars = {}) {
  const template = messages[activeLang()]?.[key] ?? messages.en[key] ?? key;
  return Object.entries(vars).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), template);
}

function enumLabel(group, value) {
  if (!value) return "";
  return messages[activeLang()]?.enum?.[group]?.[value] || messages.en.enum?.[group]?.[value] || value;
}

const agentName = (agent) => AGENT_NAMES[agent] || agent || "";
const locale = () => (activeLang() === "zh" ? "zh-CN" : "en-US");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDay(day) {
  if (!day) return "";
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const percent = (share) => (share == null ? "—" : `${Math.round(share * 100)}%`);

function money(value) {
  if (value == null) return "";
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value);
}

/** Only http(s) links are rendered as links; anything else is shown as text. */
function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// ── data access helpers ─────────────────────────────────────────────────────

const rows = (key) => state.data?.rows?.[key] || [];
const settings = () => state.data?.settings || null;
const questionsById = () => new Map(rows("questions").map((row) => [row.id, row]));

/** A relation shows the target's question text, or says it is not loaded — never the id. */
function questionLabel(id, lookup = questionsById()) {
  if (!id) return "";
  return lookup.get(id)?.question || "";
}

function questionText(id, lookup) {
  const label = questionLabel(id, lookup);
  return label ? esc(label) : `<span class="muted">${esc(t("notLoaded"))}</span>`;
}

function loadedLabel(key) {
  const loaded = rows(key).length;
  const total = state.data?.totals?.[key];
  if (total != null) return t("loadedOf", { loaded, total });
  return state.data?.cursors?.[key] ? t("loadedPlus", { loaded }) : String(loaded);
}

function loadMoreControl(key) {
  if (!state.data?.cursors?.[key]) return "";
  const busy = Boolean(state.loadingMore[key]);
  return `<div class="load-more">
    <span class="muted">${esc(loadedLabel(key))}</span>
    <button type="button" class="button" data-load-more="${key}" ${busy ? "disabled" : ""}>${esc(busy ? t("loadingMore") : t("loadMore"))}</button>
    ${state.pageError ? `<span class="inline-error" role="alert">${esc(t("loadFailed", { error: state.pageError }))}</span>` : ""}
  </div>`;
}

async function loadMore(key) {
  const cursor = state.data?.cursors?.[key];
  if (!cursor || state.loadingMore[key]) return;
  state.loadingMore[key] = true;
  state.pageError = "";
  render();
  try {
    const provider = await getProvider();
    const page = await provider.fetchPage(key, cursor);
    const seen = new Set(rows(key).map((row) => row.id));
    state.data.rows[key] = [...rows(key), ...page.rows.filter((row) => !seen.has(row.id))];
    state.data.cursors[key] = page.nextCursor;
  } catch (error) {
    state.pageError = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore[key] = false;
    render();
  }
}

// ── routing & loading ───────────────────────────────────────────────────────

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  state.notice = null;
  setMobileSidebarOpen(false);
  render();
  els.content.scrollTop = 0;
}

let loadToken = 0;
async function loadState() {
  const token = ++loadToken;
  const provider = await getProvider();
  const data = await provider.getState();
  if (token !== loadToken) return;
  closeConnectGate();
  state.data = data;
  state.error = "";
  state.pageError = "";
  render();
}

// ── rendering primitives ────────────────────────────────────────────────────

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = activeLang() === "zh" ? { auto: "自动" } : { auto: "Auto" };
  for (const option of els.language.options) if (languageLabels[option.value]) option.textContent = languageLabels[option.value];
  els.refresh.textContent = t("refresh");
  els.mobileRefresh.title = t("refresh");
  els.mobileRefresh.setAttribute("aria-label", t("refresh"));
  els.sidebarToggle.title = t("toggleSidebar");
  els.sidebarToggle.setAttribute("aria-label", t("toggleSidebar"));
  els.mobileSidebarToggle.title = t("openSidebar");
  els.mobileSidebarToggle.setAttribute("aria-label", t("openSidebar"));
}

function renderShell() {
  applyI18n();
  const attention = attentionList({ questions: rows("questions"), observations: rows("observations"), fixes: rows("fixes") });
  els.countProposed.textContent = String(attention.counts.proposed);
  els.countMissing.textContent = String(attention.counts.missing);
  els.countHighRisk.textContent = String(attention.counts.highRisk);
  els.countUnsourced.textContent = String(attention.counts.unsourced);
  els.syncStatus.textContent = !state.data
    ? t("loading")
    : state.data.demo
      ? t("demoNote")
      : t("liveNote", { time: formatTime(state.data.loaded_at) });
  els.language.value = state.lang;
  document.querySelectorAll("nav [data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function setPage(title, subtitle = "") {
  els.title.textContent = title;
  els.subtitle.textContent = subtitle;
  els.mobileViewTitle.textContent = title;
  els.mobileViewMeta.textContent = subtitle;
  document.title = `${title} · ${t("appTitle")}`;
}

const badge = (label, tone = "") => `<span class="badge ${tone}">${esc(label)}</span>`;
const toneForRisk = (risk) => ({ high: "danger", medium: "warning", low: "positive" })[risk] || "";
const toneForStatus = (status) =>
  ({ proposed: "active", "changes-requested": "warning", approved: "positive", applied: "positive", blocked: "danger" })[
    status
  ] || "";
const toneForPriority = (priority) => ({ high: "danger", medium: "warning" })[priority] || "";

function emptyState(title, body, action = "") {
  return `<div class="empty-state">
    <div class="empty-state-icon" aria-hidden="true">○</div>
    <strong>${esc(title)}</strong>
    <p>${esc(body)}</p>
    ${action}
  </div>`;
}

function noticeBar() {
  if (!state.notice) return "";
  return `<div class="notice ${state.notice.tone || ""}" role="status">${esc(state.notice.text)}</div>`;
}

function positionChip(position) {
  if (position == null) return `<span class="position none" title="${esc(t("notChecked"))}">${esc(t("notCheckedShort"))}</span>`;
  if (position > 0) return `<span class="position shown">${esc(t("positionN", { n: position }))}</span>`;
  return `<span class="position missing">${esc(t("notShown"))}</span>`;
}

// ── screens ─────────────────────────────────────────────────────────────────

function renderOverview() {
  const brand = settings()?.brand;
  setPage(t("overview"), brand ? t("overviewSubtitle", { brand }) : t("overviewSubtitleNoBrand"));
  const observations = rows("observations");
  const share = shareOfShelf({ questions: rows("questions"), observations, settings: settings() });
  const attention = attentionList({ questions: rows("questions"), observations, fixes: rows("fixes") });
  const fresh = freshness({ latest: share.latest, cadence: settings()?.cadence });
  const lookup = questionsById();

  const shareCard = !share.latest
    ? `<section class="card">${emptyState(t("noChecks"), t("noChecksBody"))}</section>`
    : `<section class="card">
        <div class="card-heading">
          <div>
            <h2>${esc(t("shareTitle"))}</h2>
            <p>${esc(share.previous ? t("shareHint", { latest: formatDay(share.latest) }) : t("shareHintNoPrev", { latest: formatDay(share.latest) }))}</p>
          </div>
        </div>
        ${fresh.stale ? `<div class="notice warning">${esc(t("stale", { days: fresh.days, limit: fresh.limit }))}</div>` : ""}
        <div class="share-grid">
          ${share.agents
            .map((item) => {
              const delta = item.delta == null ? null : Math.round(item.delta * 100);
              const deltaLine =
                item.share == null
                  ? `<span class="muted">${esc(t("notChecked"))}</span>`
                  : delta == null
                    ? `<span class="muted">${esc(t("deltaNone"))}</span>`
                    : `<span class="metric-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}"><b>${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}</b> ${esc(t("pts"))} ${esc(t("deltaVs", { previous: formatDay(share.previous) }))}</span>`;
              return `<article class="share-cell">
                <div class="share-agent">${esc(agentName(item.agent))}</div>
                <div class="share-value">${esc(percent(item.share))}</div>
                <div class="share-meter" aria-hidden="true"><span style="width:${Math.round((item.share || 0) * 100)}%"></span></div>
                <div class="muted">${item.share == null ? "&nbsp;" : esc(t("shareOf", { shown: item.shown, total: item.total }))}</div>
                ${deltaLine}
              </article>`;
            })
            .join("")}
        </div>
        ${state.data?.cursors?.observations ? `<p class="footnote muted">${esc(t("loadedOnly", { count: observations.length }))}</p>` : ""}
      </section>`;

  const attentionItems = [
    ...attention.missing.map(
      (item) => `<li class="attention-item">
        <div class="attention-main">
          <a href="#/questions">${esc(item.question.question)}</a>
          <div class="muted">${esc(t("missingLine", { date: formatDay(item.checked_on) }))}${item.picked_instead ? ` · ${esc(t("pickedInstead"))}: ${esc(item.picked_instead)}` : ""}</div>
        </div>
        ${badge(enumLabel("priority", "high"), "danger")}
      </li>`,
    ),
    ...attention.fixes.map(
      (item) => `<li class="attention-item">
        <div class="attention-main">
          <a href="#/fixes/${item.fix.status === "proposed" || item.fix.status === "changes-requested" ? "" : "all"}">${esc(item.fix.title)}</a>
          <div class="muted">${esc(item.fix.product)} · ${esc(enumLabel("fixStatus", item.fix.status))}</div>
        </div>
        <div class="badge-row">${item.reasons.map((reason) => badge(t(`reason_${reason}`), reason === "proposed" ? "active" : reason === "high-risk" ? "danger" : "warning")).join("")}</div>
      </li>`,
    ),
  ];
  const waiting = reviewQueue(rows("fixes")).filter((fix) => fix.status === "proposed");

  els.content.innerHTML = `
    ${noticeBar()}
    ${shareCard}
    <div class="overview-columns">
      <section class="card">
        <div class="card-heading"><h2>${esc(t("attentionTitle"))}</h2></div>
        ${
          attentionItems.length
            ? `<ul class="attention-list">${attentionItems.join("")}</ul>`
            : emptyState(t("attentionEmpty"), t("attentionEmptyBody"))
        }
      </section>
      <section class="card">
        <div class="card-heading">
          <h2>${esc(t("fixesWaitingTitle"))}</h2>
          <a class="text-link" href="#/fixes">${esc(t("reviewAll"))}</a>
        </div>
        ${
          waiting.length
            ? `<ul class="waiting-list">${waiting
                .map(
                  (fix) => `<li>
                    <div class="attention-main">
                      <a href="#/fixes">${esc(fix.title)}</a>
                      <div class="muted">${esc(fix.product)} · ${esc(enumLabel("gap", fix.gap_type))}${fix.question ? ` · ${questionText(fix.question, lookup)}` : ""}</div>
                    </div>
                    ${badge(enumLabel("risk", fix.risk), toneForRisk(fix.risk))}
                  </li>`,
                )
                .join("")}</ul>`
            : `<p class="muted">${esc(t("noFixesWaiting"))}</p>`
        }
      </section>
    </div>`;
}

function renderQuestions() {
  setPage(t("questions"), t("questionsSubtitle"));
  const grid = positionGrid({ questions: rows("questions"), observations: rows("observations"), settings: settings() });
  if (!grid.rows.length) {
    els.content.innerHTML = `<section class="card">${emptyState(t("noQuestions"), t("noQuestionsBody"))}</section>`;
    return;
  }
  els.content.innerHTML = `
    <section class="card flush">
      <div class="card-heading"><p>${esc(t("legend"))}</p></div>
      <table class="table grid-table">
        <thead><tr><th>${esc(t("question"))}</th>${grid.agents.map((agent) => `<th class="agent-col">${esc(agentName(agent))}</th>`).join("")}</tr></thead>
        <tbody>
          ${grid.rows
            .map(({ question, loaded, cells }) => {
              const head = loaded
                ? `<div class="question-cell">
                    <strong>${esc(question.question)}</strong>
                    <div class="badge-row">
                      ${badge(enumLabel("priority", question.priority), toneForPriority(question.priority))}
                      ${question.status === "paused" ? badge(enumLabel("questionStatus", "paused")) : ""}
                      ${question.market ? `<span class="muted">${esc(enumLabel("market", question.market))}</span>` : ""}
                      ${question.intent ? `<span class="muted">· ${esc(enumLabel("intent", question.intent))}</span>` : ""}
                    </div>
                    ${question.target_products ? `<div class="muted">${esc(t("targetProducts"))}: ${esc(question.target_products)}</div>` : ""}
                  </div>`
                : `<div class="question-cell"><strong class="muted">${esc(t("notLoaded"))}</strong><div class="muted">${esc(t("notLoadedHint"))}</div></div>`;
              return `<tr>
                <td>${head}</td>
                ${cells
                  .map(
                    (cell) =>
                      `<td class="agent-col" data-label="${esc(agentName(cell.agent))}"${cell.checked_on ? ` title="${esc(t("checkedOn", { date: formatDay(cell.checked_on) }))}"` : ""}>${positionChip(cell.position)}</td>`,
                  )
                  .join("")}
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>
    ${loadMoreControl("questions")}
    ${loadMoreControl("observations")}`;
}

function renderAnswers() {
  setPage(t("answers"), t("answersSubtitle"));
  const observations = rows("observations");
  const lookup = questionsById();
  const filter = state.answerFilter;
  const list = filterObservations(observations, filter);
  const agents = [...new Set(observations.map((row) => row.agent).filter(Boolean))];
  const questionIds = [...new Set(observations.map((row) => row.question).filter(Boolean))];
  els.content.innerHTML = `
    <section class="card flush">
      <div class="toolbar">
        <select id="answerAgent" aria-label="${esc(t("allAgents"))}">
          <option value="">${esc(t("allAgents"))}</option>
          ${agents.map((agent) => `<option value="${esc(agent)}" ${filter.agent === agent ? "selected" : ""}>${esc(agentName(agent))}</option>`).join("")}
        </select>
        <select id="answerQuestion" aria-label="${esc(t("allQuestions"))}">
          <option value="">${esc(t("allQuestions"))}</option>
          ${questionIds
            .map((id) => `<option value="${esc(id)}" ${filter.question === id ? "selected" : ""}>${esc(questionLabel(id, lookup) || t("notLoaded"))}</option>`)
            .join("")}
        </select>
        <input id="answerQuery" class="search-field" type="search" value="${esc(filter.query)}" placeholder="${esc(t("searchAnswers"))}" aria-label="${esc(t("searchAnswers"))}">
      </div>
      <p class="filter-note muted">${esc(t("filterNote", { count: observations.length }))}</p>
      <div id="answerList" class="answer-list">${answerListMarkup(list, lookup)}</div>
    </section>
    ${loadMoreControl("observations")}`;
}

function answerListMarkup(list, lookup) {
  if (!list.length) return emptyState(t("noAnswers"), t("noAnswersBody"));
  return list
    .map((row) => {
      const link = safeUrl(row.evidence_url);
      return `<article class="answer">
        <div class="answer-head">
          <div class="answer-title">
            <strong>${questionText(row.question, lookup)}</strong>
            <div class="muted">${esc(agentName(row.agent))} · ${esc(formatDay(row.checked_on))}</div>
          </div>
          ${positionChip(row.our_position)}
        </div>
        <dl class="answer-facts">
          ${row.our_product ? `<div><dt>${esc(t("ourProduct"))}</dt><dd>${esc(row.our_product)}</dd></div>` : ""}
          ${row.picked_instead ? `<div><dt>${esc(t("pickedInstead"))}</dt><dd>${esc(row.picked_instead)}</dd></div>` : ""}
          ${row.reason_given ? `<div><dt>${esc(t("reasonGiven"))}</dt><dd>${esc(row.reason_given)}</dd></div>` : ""}
        </dl>
        ${row.answer_excerpt ? `<blockquote class="excerpt" aria-label="${esc(t("excerpt"))}">${esc(row.answer_excerpt)}</blockquote>` : ""}
        ${link ? `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(t("evidenceLink"))} ↗</a>` : ""}
      </article>`;
    })
    .join("");
}

function refreshAnswerList() {
  const list = filterObservations(rows("observations"), state.answerFilter);
  const container = document.querySelector("#answerList");
  if (container) container.innerHTML = answerListMarkup(list, questionsById());
}

function renderCompetitors() {
  setPage(t("competitors"), t("competitorsSubtitle"));
  const list = rankCompetitors(rows("competitors"));
  if (!list.length) {
    els.content.innerHTML = `<section class="card">${emptyState(t("noCompetitors"), t("noCompetitorsBody"))}</section>${loadMoreControl("competitors")}`;
    return;
  }
  els.content.innerHTML = `
    <section class="card flush">
      <table class="table stack-table">
        <thead><tr><th>${esc(t("product"))}</th><th class="num">${esc(t("timesPicked"))}</th><th class="num">${esc(t("price"))}</th><th>${esc(t("whatTheyHave"))}</th></tr></thead>
        <tbody>
          ${list
            .map((row) => {
              const link = safeUrl(row.url);
              return `<tr>
                <td data-label="${esc(t("product"))}">
                  <div class="cell-identity"><div>
                    <strong>${link ? `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(row.product)} ↗</a>` : esc(row.product)}</strong>
                    <span>${esc(row.brand)}</span>
                  </div></div>
                </td>
                <td class="num" data-label="${esc(t("timesPicked"))}">${esc(row.times_picked)}</td>
                <td class="num" data-label="${esc(t("price"))}">${esc(money(row.price))}</td>
                <td class="wrap" data-label="${esc(t("whatTheyHave"))}">${esc(row.what_they_have)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </section>
    ${loadMoreControl("competitors")}`;
}

function fixMatchesView(fix, view) {
  if (view === "all") return true;
  if (!view) return DECIDABLE_STATUSES.has(fix.status);
  return fix.status === view;
}

function renderFixes() {
  const view = FIX_VIEWS.includes(state.route.id) ? state.route.id : "";
  const all = reviewQueue(rows("fixes"));
  const list = all.filter((fix) => fixMatchesView(fix, view));
  const toDecide = all.filter((fix) => DECIDABLE_STATUSES.has(fix.status)).length;
  setPage(t("fixes"), t("fixesSubtitle"));
  const segments = FIX_VIEWS.map((id) => {
    const label = id === "" ? t("toDecide") : id === "all" ? t("all") : enumLabel("fixStatus", id);
    const count = id === "" ? toDecide : all.filter((fix) => fixMatchesView(fix, id)).length;
    return `<a class="segment ${view === id ? "active" : ""}" href="#/fixes${id ? `/${id}` : ""}" data-route="fixes">${esc(label)} <b>${count}</b></a>`;
  }).join("");
  const lookup = questionsById();
  els.content.innerHTML = `
    ${noticeBar()}
    <div class="segmented fix-views" role="tablist">${segments}</div>
    <div class="fix-list">
      ${list.length ? list.map((fix) => fixCard(fix, lookup)).join("") : `<section class="card">${emptyState(t("noFixes"), t("noFixesBody"))}</section>`}
    </div>
    ${loadMoreControl("fixes")}`;
}

function fixCard(fix, lookup) {
  const decidable = DECIDABLE_STATUSES.has(fix.status);
  const busy = state.busyFix === fix.id;
  const anyBusy = Boolean(state.busyFix);
  const unsourced = isUnsourced(fix);
  const noteError = state.noteErrors[fix.id];
  return `<article class="card fix-card" data-fix="${esc(fix.id)}">
    <div class="fix-head">
      <div class="fix-title">
        <h3>${esc(fix.title)}</h3>
        <div class="muted">${esc(fix.product)}${fix.gap_type ? ` · ${esc(enumLabel("gap", fix.gap_type))}` : ""}${fix.question ? ` · ${esc(t("forQuestion"))}: ${questionText(fix.question, lookup)}` : ""}</div>
      </div>
      <div class="badge-row">
        ${badge(enumLabel("risk", fix.risk), toneForRisk(fix.risk))}
        ${badge(enumLabel("fixStatus", fix.status), toneForStatus(fix.status))}
      </div>
    </div>
    <div class="diff">
      ${fix.field_name ? `<div class="diff-field">${esc(t("field"))}: <code>${esc(fix.field_name)}</code></div>` : ""}
      <div class="diff-grid">
        <div class="diff-side before"><span class="diff-label">${esc(t("current"))}</span><div>${esc(fix.current_value || "—")}</div></div>
        <div class="diff-arrow" aria-hidden="true">→</div>
        <div class="diff-side after"><span class="diff-label">${esc(t("proposed"))}</span><div>${esc(fix.proposed_value)}</div></div>
      </div>
    </div>
    <dl class="fix-facts">
      <div><dt>${esc(t("source"))}</dt><dd>${unsourced ? `<span class="inline-error">${esc(t("noSource"))}</span>` : esc(fix.source)}</dd></div>
      ${fix.evidence ? `<div><dt>${esc(t("evidence"))}</dt><dd>${esc(fix.evidence)}</dd></div>` : ""}
      ${fix.decision_note ? `<div><dt>${esc(t("decisionNote"))}</dt><dd>${esc(fix.decision_note)}</dd></div>` : ""}
      ${fix.applied_on ? `<div><dt>${esc(enumLabel("fixStatus", "applied"))}</dt><dd>${esc(t("appliedOn", { date: formatDay(fix.applied_on) }))}</dd></div>` : ""}
    </dl>
    ${
      decidable
        ? `<div class="decision">
            <label class="decision-label" for="note-${esc(fix.id)}">${esc(t("decisionNote"))}</label>
            <textarea id="note-${esc(fix.id)}" data-note="${esc(fix.id)}" rows="2" placeholder="${esc(t("decisionNotePlaceholder"))}" ${busy ? "disabled" : ""}>${esc(state.drafts[fix.id] || "")}</textarea>
            ${noteError ? `<div class="inline-error" role="alert">${esc(noteError)}</div>` : ""}
            <div class="decision-actions">
              <button type="button" class="button primary" data-decide="approve" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("approve"))}</button>
              <button type="button" class="button" data-decide="request-changes" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("requestChanges"))}</button>
              <button type="button" class="button danger" data-decide="block" data-fix-id="${esc(fix.id)}" ${anyBusy ? "disabled" : ""}>${esc(t("block"))}</button>
            </div>
          </div>`
        : ""
    }
  </article>`;
}

function renderSettings() {
  setPage(t("settings"), t("settingsSubtitle"));
  const current = settings();
  const agents = current?.agents?.length ? current.agents.map(agentName).join(", ") : t("notSet");
  els.content.innerHTML = `
    <section class="card settings-card">
      <h2>${esc(t("settings"))}</h2>
      <dl class="settings-grid">
        <div><dt>${esc(t("brandLabel"))}</dt><dd>${esc(current?.brand || t("notSet"))}</dd></div>
        <div><dt>${esc(t("agentsLabel"))}</dt><dd>${esc(agents)}</dd></div>
        <div><dt>${esc(t("cadenceLabel"))}</dt><dd>${esc(enumLabel("cadence", current?.cadence) || t("notSet"))}</dd></div>
        <div class="span-2"><dt>${esc(t("policyLabel"))}</dt><dd class="wrap">${esc(current?.review_policy || t("notSet"))}</dd></div>
      </dl>
    </section>
    <section class="card settings-card">
      <h2>${esc(t("dataSource"))}</h2>
      <dl class="settings-grid">
        <div><dt>${esc(t("dataSource"))}</dt><dd>${esc(state.data?.demo ? t("sourceDemo") : t("sourceLive"))}</dd></div>
        <div><dt>${esc(t("onboarding"))}</dt><dd>${esc(current?.brand ? t("onboardingDone") : t("onboardingTodo"))}</dd></div>
        ${BROWSED_KEYS.map((key) => `<div><dt>${esc(t(key === "observations" ? "answers" : key))}</dt><dd>${esc(loadedLabel(key))}</dd></div>`).join("")}
      </dl>
    </section>
    <section class="settings" id="settingsContent"></section>`;
}

function render() {
  renderShell();
  if (state.error) {
    setPage(t("errorTitle"));
    els.content.innerHTML = `<section class="card">${emptyState(t("errorTitle"), state.error, `<button type="button" class="button" data-retry>${esc(t("retry"))}</button>`)}</section>`;
    return;
  }
  if (!state.data) {
    setPage(t("loading"));
    els.content.innerHTML = `<section class="card"><p class="muted">${esc(t("loadingData"))}</p><div class="skeleton skeleton-block"></div></section>`;
    return;
  }
  const view = state.route.view;
  if (view === "questions") renderQuestions();
  else if (view === "answers") renderAnswers();
  else if (view === "competitors") renderCompetitors();
  else if (view === "fixes") renderFixes();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ── decisions ───────────────────────────────────────────────────────────────

async function decide(fixId, action) {
  if (state.busyFix) return;
  const fix = rows("fixes").find((row) => row.id === fixId);
  if (!fix) return;
  const note = String(state.drafts[fixId] || "").trim();
  if ((action === "request-changes" || action === "block") && !note) {
    state.noteErrors[fixId] = t("noteRequired");
    render();
    document.querySelector(`[data-note="${CSS.escape(fixId)}"]`)?.focus();
    return;
  }
  state.noteErrors[fixId] = "";
  state.busyFix = fixId;
  state.notice = null;
  render();
  try {
    const provider = await getProvider();
    const result = await provider.decideFix(fix, action, note);
    delete state.drafts[fixId];
    state.notice =
      result.outcome === "demo"
        ? { text: t("decisionDemo"), tone: "positive" }
        : result.outcome === "pending"
          ? { text: t("decisionPending", { id: result.changeRequestId || "—" }), tone: "positive" }
          : { text: t("decisionSaved", { title: fix.title }), tone: "positive" };
    state.busyFix = "";
    await loadState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.notice = { text: t("decisionFailed", { error: message === "NOTE_REQUIRED" ? t("noteRequired") : message }), tone: "danger" };
    state.busyFix = "";
    render();
  }
}

// ── events ──────────────────────────────────────────────────────────────────

let queryTimer;
function bindEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("resize", syncResponsiveShell);
  const refresh = () => {
    state.notice = null;
    loadState().catch(showFatal);
  };
  els.refresh.addEventListener("click", refresh);
  els.mobileRefresh.addEventListener("click", refresh);
  els.sidebarToggle.addEventListener("click", toggleSidebar);
  els.mobileSidebarToggle.addEventListener("click", toggleSidebar);
  els.sidebarScrim.addEventListener("click", () => setMobileSidebarOpen(false));
  els.language.addEventListener("change", () => {
    state.lang = normalizeLang(els.language.value);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, state.lang);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", state.lang);
    history.replaceState(null, "", `${url.pathname}${url.search}${location.hash}`);
    render();
  });
  els.content.addEventListener("click", (event) => {
    const more = event.target.closest("[data-load-more]");
    if (more) return void loadMore(more.dataset.loadMore);
    const decision = event.target.closest("[data-decide]");
    if (decision) return void decide(decision.dataset.fixId, decision.dataset.decide);
    if (event.target.closest("[data-retry]")) {
      state.error = "";
      render();
      boot();
    }
  });
  els.content.addEventListener("input", (event) => {
    const note = event.target.closest("[data-note]");
    if (note) {
      state.drafts[note.dataset.note] = note.value;
      return;
    }
    if (event.target.id === "answerQuery") {
      state.answerFilter.query = event.target.value;
      clearTimeout(queryTimer);
      queryTimer = setTimeout(refreshAnswerList, 150);
    }
  });
  els.content.addEventListener("change", (event) => {
    if (event.target.id === "answerAgent") state.answerFilter.agent = event.target.value;
    else if (event.target.id === "answerQuestion") state.answerFilter.question = event.target.value;
    else return;
    refreshAnswerList();
  });
}

function showFatal(error) {
  state.error = error instanceof Error ? error.message : String(error);
  render();
}

syncResponsiveShell();
bindEvents();
render();

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
    showFatal(error);
  }
}

boot();
