import { appConfig } from "./config.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";
import { buildOverviewModel, localDateKey, renderOverviewMarkup } from "./overview.js";
import { playOverviewEntrance } from "./overview-motion.js";
import { formatMoney } from "./pipeline.js";
import { renderIcons } from "../vendor/lucide-icons.js?v=recording-ui-2";

// Where a record opens, per Base — chosen by what people do with it:
//   companies  → page:   an account is a workplace — its people, its activity
//                        history — read before a call, so it gets the room.
//   contacts   → drawer: a contact is a fact scanned among many; read it, log
//                        an activity, return to the list.
//   activities → split:  the follow-up queue is worked top to bottom, one
//                        interaction after the next, list kept beside it.
//   deals      → page:   a deal owns its stage change, next step and activity
//                        trail; people stay on it for minutes.
// `#/<view>/<id>` always opens the full page; `?peek=<id>` drives drawer/split.
// On a phone every mode is a page (base-ui.css). Declared in config.js.
const DETAIL_MODES = appConfig.ui.detail_modes || {};
const SCREEN_BASE = { pipeline: "deals", activities: "activities" };
const DIRECTORY_TABS = ["companies", "contacts"];

// `#/overview`, `#/directory/<tab>[/<id>]`, `#/pipeline[/<id>]`,
// `#/activities[/<id>]`, each with optional `?q=…&f=…&peek=…` so refresh,
// shared links and Back restore the same list context.
const routeFromHash = (hash = window.location.hash) => {
  const raw = hash.replace(/^#\/?/, "");
  const [path, queryString = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(queryString);
  let screen = parts[0] || "overview";
  let tab = "companies";
  let idPart = parts[1];
  if (screen === "directory") {
    tab = DIRECTORY_TABS.includes(parts[1]) ? parts[1] : "companies";
    idPart = DIRECTORY_TABS.includes(parts[1]) ? parts[2] : undefined;
  } else if (!SCREEN_BASE[screen]) {
    return { screen: "overview", tab, recordId: "", peek: "", query: "", filter: "" };
  }
  let recordId = "";
  try {
    recordId = idPart ? decodeURIComponent(idPart) : "";
  } catch {
    recordId = "";
  }
  const baseKey = SCREEN_BASE[screen] || tab;
  const mode = DETAIL_MODES[baseKey] || "drawer";
  return {
    screen,
    tab,
    recordId,
    peek: !recordId && mode !== "page" ? params.get("peek") || "" : "",
    query: params.get("q") || "",
    filter: params.get("f") || "",
  };
};

const routeKey = (route) => JSON.stringify(route);

const initialRoute = routeFromHash();
const state = {
  provider: null,
  payload: null,
  screen: initialRoute.screen,
  directoryTab: initialRoute.tab,
  selectedRecordId: "",
  presentation: null,
  query: "",
  filter: "",
  // The current search/filter result for one Base. The unfiltered window in
  // `payload.records` stays intact for the Overview, the attention block,
  // relation names and the forms, whatever the list is narrowed to.
  filtered: null,
  querySequence: 0,
  appliedRoute: "",
  activityDraft: null,
  activitySource: null,
  dealDraft: null,
  stageDraft: null,
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const activeBaseKey = () => SCREEN_BASE[state.screen] || state.directoryTab;
const detailMode = (key = activeBaseKey()) => DETAIL_MODES[key] || "drawer";
const baseConfig = (key = activeBaseKey()) =>
  appConfig.schema.bases.find((base) => base.key === key);
const recordsForBase = (key = activeBaseKey()) =>
  (state.payload?.records || []).filter((record) => record.baseKey === key);
const pageInfo = (key = activeBaseKey()) => state.payload?.pageInfo?.[key] || {};
const loadedCount = (count, hasMore) => `${count}${hasMore ? "+" : ""}`;
const narrowed = () => Boolean(state.query.trim() || state.filter);
const filteredMatches = () =>
  state.filtered &&
  state.filtered.baseKey === activeBaseKey() &&
  state.filtered.query === state.query.trim() &&
  state.filtered.filter === state.filter;
// What the active list shows: the narrowed result while a search or filter
// is on, the loaded window otherwise.
const listRecords = () => (narrowed() ? (filteredMatches() ? state.filtered.records : []) : recordsForBase());
const knownRecords = () => [...(state.payload?.records || []), ...(state.filtered?.records || [])];
const findRecord = (id, key) => knownRecords().find((record) => record.id === id && (!key || record.baseKey === key));
const primarySlug = (key = activeBaseKey()) => baseConfig(key)?.fields?.[0]?.slug || "name";
const recordTitle = (record) => displayValue(record?.fields?.[primarySlug(record?.baseKey)]);
const choiceFor = (baseKey, fieldSlug, value) =>
  baseConfig(baseKey)?.fields?.find((item) => item.slug === fieldSlug)?.options?.choices?.find((choice) => choice.id === value);
const choiceLabel = (baseKey, fieldSlug, value) => {
  if (value == null || value === "") return "-";
  return choiceFor(baseKey, fieldSlug, value)?.name || String(value);
};

const relationTokens = (value) => {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(relationTokens);
  if (typeof value === "object") {
    return [value.id, value.recordId, value.name, value.title, value.label].filter(Boolean).map(String);
  }
  return [String(value)];
};

// A relation comes back as the target record's id. Resolve it to that
// record's name; when the target is not in the loaded window say so —
// never print the id.
const relationLabel = (value) => {
  const tokens = relationTokens(value);
  if (!tokens.length) return "-";
  const names = [];
  for (const token of tokens) {
    const related = findRecord(token);
    if (related) names.push(recordTitle(related));
  }
  if (names.length) return [...new Set(names)].join(", ");
  const named = Array.isArray(value) ? value.find((item) => item?.name || item?.title) : value;
  return named?.name || named?.title || messages.notLoaded;
};

function displayValue(value, baseKey, fieldSlug) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.map((item) => displayValue(item, baseKey, fieldSlug)).join(", ");
  if (typeof value === "object") return value.name || value.title || value.label || "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return baseKey && fieldSlug ? choiceLabel(baseKey, fieldSlug, value) : String(value);
}

const relationMatches = (value, record) => {
  const candidates = new Set([record.id, recordTitle(record)]);
  return relationTokens(value).some((token) => candidates.has(token));
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

const formatTimestamp = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

// The provider's clock when it has one (the Demo is pinned to a date), so the
// attention block, the lists and the Overview agree on what "due" means.
const today = () => localDateKey(state.payload?.provider?.now ? new Date(state.payload.provider.now) : new Date());
const isDue = (value) => Boolean(value) && String(value).slice(0, 10) <= today();
const dueActivities = () =>
  recordsForBase("activities").filter((record) => isDue(record.fields?.["next-follow-up-date"]));

const setText = (id, value) => {
  const element = byId(id);
  if (element) element.textContent = value;
};
const setButtonLabel = (id, value) => {
  const element = byId(id);
  const label = element?.querySelector(".button-label");
  if (label) label.textContent = value;
  else if (element) element.textContent = value;
};
const resetFormResult = (id) => {
  const element = byId(id);
  element.hidden = true;
  element.className = "form-result";
  element.textContent = "";
};
// What happened to a write, as Busabase decided it from the person's own
// permission: it landed (and the records on screen were reloaded), or it is a
// ChangeRequest waiting for someone who has write access.
const showWriteResult = (id, request, savedText) => {
  const element = byId(id);
  element.className = "form-result success";
  element.innerHTML = request.pending
    ? `<span class="result-icon" aria-hidden="true"><i data-lucide="send"></i></span><span class="result-copy"><strong>${escapeHtml(messages.sentForReview)}</strong><span>${escapeHtml(messages.sentForReviewDetail)}</span><code>${escapeHtml(request.id)}</code></span>`
    : `<span class="result-icon" aria-hidden="true"><i data-lucide="circle-check"></i></span><span class="result-copy"><strong>${escapeHtml(savedText)}</strong><span>${escapeHtml(messages.savedDetail)}</span></span>`;
  element.hidden = false;
  renderIcons(element);
};
const showRequestError = (id, error) => {
  const element = byId(id);
  element.className = "form-result error";
  element.textContent = humanError(error);
  element.hidden = false;
};
const setMobileSidebar = (open) => {
  document.body.classList.toggle("sidebar-open", open);
  byId("sidebarScrim").hidden = !open;
};
const setDesktopSidebar = (collapsed, { restoreFocus = false } = {}) => {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  byId("sidebarClose").setAttribute("aria-expanded", String(!collapsed));
  byId("sidebarExpand").setAttribute("aria-expanded", String(!collapsed));
  if (restoreFocus) {
    setTimeout(() => (collapsed ? byId("sidebarExpand") : byId("sidebarClose")).focus({ preventScroll: true }), 200);
  }
};

const humanError = (error) => {
  const raw = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages.providerErrors).find((item) => raw.includes(item));
  return code ? messages.providerErrors[code] : raw;
};

// ── URLs ───────────────────────────────────────────────────────────────────
const screenPath = (screen = state.screen, tab = state.directoryTab) =>
  screen === "directory" ? `#/directory/${tab}` : `#/${screen}`;
const routeQuery = (extra = {}, { query = state.query, filter = state.filter } = {}) => {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filter) params.set("f", filter);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};
const listUrl = () => `${screenPath()}${routeQuery()}`;
// The full page: the record in the path, whatever the view's mode.
const detailUrl = (id) => `${screenPath()}/${encodeURIComponent(id)}${routeQuery()}`;
// What a row opens: the page for a `page` Base, else `?peek=`.
const recordUrl = (id) => (detailMode() === "page" ? detailUrl(id) : `${screenPath()}${routeQuery({ peek: id })}`);

// ── Render ─────────────────────────────────────────────────────────────────
const SCREEN_NAMES = { overview: "Overview", directory: "Directory", pipeline: "Pipeline", activities: "Activities" };

const navTotal = (key) => {
  const total = state.payload?.baseTotals?.[key];
  return total == null ? null : total;
};
const navCount = (keys) => {
  const totals = keys.map(navTotal);
  if (totals.every((total) => total != null)) return String(totals.reduce((sum, total) => sum + total, 0));
  const loaded = keys.reduce((sum, key) => sum + recordsForBase(key).length, 0);
  return loadedCount(loaded, keys.some((key) => pageInfo(key).nextCursor));
};

function renderNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === state.screen);
  });
  setText("directoryNavCount", navCount(["companies", "contacts"]));
  setText("pipelineNavCount", navCount(["deals"]));
  setText("activitiesNavCount", navCount(["activities"]));
}

// The sidebar's human-attention block: follow-ups due, plus the requests this
// app has proposed that still wait for a reviewer.
function renderAttention() {
  setText("attentionValue", loadedCount(dueActivities().length, pageInfo("activities").nextCursor));
  setText("attentionCopy", messages.followUpLabel);
  const pending = (state.payload?.changeRequests || []).filter((request) =>
    ["in_review", "changes_requested", "approved", "conflict"].includes(request.status),
  ).length;
  setText(
    "attentionPending",
    pending
      ? `${loadedCount(pending, state.payload?.changeRequestPageInfo?.nextCursor)} ${pending === 1 ? messages.pendingOne : messages.pendingLabel}`
      : messages.pendingEmpty,
  );
}

function renderOverview() {
  const stages = baseConfig("deals")?.fields.find((field) => field.slug === "stage")?.options?.choices || [];
  const model = buildOverviewModel({
    records: state.payload?.records || [],
    pageInfo: state.payload?.pageInfo || {},
    counts: state.payload?.overviewCounts || {},
    stages,
    ...(state.payload?.provider?.now ? { now: new Date(state.payload.provider.now) } : {}),
  });
  const staleNotice = state.payload?.provider?.stale
    ? '<div class="overview-notice" role="status">This data window may be stale. Refresh the AirApp before acting on time-sensitive follow-ups.</div>'
    : "";
  byId("overviewBody").innerHTML = staleNotice + renderOverviewMarkup(model, {
    escapeHtml,
    formatDate,
    formatMoney,
    recordTitle,
    displayValue: relationLabel,
    choiceLabel,
  });
}

const filterDefinition = () => {
  if (activeBaseKey() === "companies") return { label: "Relationship", fieldSlug: "relationship-type" };
  if (activeBaseKey() === "contacts") return { label: "Status", fieldSlug: "contact-status" };
  if (activeBaseKey() === "deals") return { label: "Stage", fieldSlug: "stage" };
  return { label: "Activity type", fieldSlug: "activity-type" };
};

function renderToolbar() {
  const base = baseConfig();
  setText("viewTitle", SCREEN_NAMES[state.screen]);
  // The view's description lives in the title tooltip, not on the page.
  byId("viewTitle").title = messages.screens[state.screen]?.summary || "";
  byId("directoryTabs").hidden = state.screen !== "directory";
  byId("addDealOpen").hidden = state.screen !== "pipeline";
  document.querySelectorAll("[data-directory-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.directoryTab === state.directoryTab);
  });
  const definition = filterDefinition();
  const field = base?.fields.find((item) => item.slug === definition.fieldSlug);
  setText("filterLabel", definition.label);
  byId("recordFilter").innerHTML = [
    `<option value="">All ${escapeHtml(definition.label.toLowerCase())}</option>`,
    ...(field?.options?.choices || []).map(
      (choice) => `<option value="${escapeHtml(choice.id)}">${escapeHtml(choice.name)}</option>`,
    ),
  ].join("");
  byId("recordFilter").value = state.filter;
  if (byId("searchInput").value !== state.query) byId("searchInput").value = state.query;
  byId("searchInput").placeholder = `Search ${base?.name.toLowerCase() || "records"}`;
  setText("searchLabel", `Search ${base?.name || "records"}`);
  const records = listRecords();
  const more = narrowed() ? state.filtered?.nextCursor : pageInfo().nextCursor;
  setText("viewCount", loadedCount(records.length, more));
}

const badge = (label, color) =>
  `<span class="badge"${color ? ` style="--dot:${escapeHtml(color)}"` : ""}>${escapeHtml(label)}</span>`;
const choiceBadge = (baseKey, fieldSlug, value) =>
  value ? badge(choiceLabel(baseKey, fieldSlug, value), choiceFor(baseKey, fieldSlug, value)?.color) : '<span class="cell-muted">-</span>';
const textCell = (value) => escapeHtml(displayValue(value));
const dateCell = (value) => (value ? escapeHtml(formatDate(value)) : '<span class="cell-muted">-</span>');

// One line per row; each Base names its own columns. The first column names
// the record; on a phone (and in the split queue) only the first two show,
// plus any `ws-split-keep` column.
const TABLES = {
  companies: [
    { label: "Company", cell: (record) => escapeHtml(recordTitle(record)) },
    { label: "Relationship", className: "col-badge", cell: (record) => choiceBadge("companies", "relationship-type", record.fields?.["relationship-type"]) },
    { label: "Industry", cell: (record) => escapeHtml(choiceLabel("companies", "industry", record.fields?.industry)) },
    { label: "Size", className: "ws-col-narrow", cell: (record) => escapeHtml(choiceLabel("companies", "company-size", record.fields?.["company-size"])) },
    { label: "Headquarters", cell: (record) => textCell(record.fields?.headquarters) },
  ],
  contacts: [
    { label: "Name", cell: (record) => escapeHtml(recordTitle(record)) },
    { label: "Company", cell: (record) => escapeHtml(relationLabel(record.fields?.company)) },
    { label: "Job title", cell: (record) => textCell(record.fields?.["job-title"]) },
    { label: "Buying role", cell: (record) => escapeHtml(choiceLabel("contacts", "buying-role", record.fields?.["buying-role"])) },
    {
      label: "Email",
      className: "ws-col-wide",
      cell: (record) => {
        const fields = record.fields || {};
        if (fields.email) return escapeHtml(fields.email);
        if (fields.phone) return escapeHtml(fields.phone);
        return `<span class="cell-due">${escapeHtml(messages.noChannel)}</span>`;
      },
    },
    { label: "Status", className: "col-badge", cell: (record) => choiceBadge("contacts", "contact-status", record.fields?.["contact-status"]) },
  ],
  activities: [
    { label: "Activity", cell: (record) => escapeHtml(recordTitle(record)) },
    {
      label: "Follow-up",
      className: "ws-split-keep",
      cell: (record) => {
        const value = record.fields?.["next-follow-up-date"];
        if (!value) return '<span class="cell-muted">-</span>';
        return isDue(value) ? `<span class="cell-due">${escapeHtml(formatDate(value))}</span>` : escapeHtml(formatDate(value));
      },
    },
    { label: "Type", className: "ws-col-narrow", cell: (record) => escapeHtml(choiceLabel("activities", "activity-type", record.fields?.["activity-type"])) },
    { label: "Date", cell: (record) => dateCell(record.fields?.["activity-date"]) },
    { label: "Company", cell: (record) => escapeHtml(relationLabel(record.fields?.company)) },
    { label: "Contact", cell: (record) => escapeHtml(relationLabel(record.fields?.contact)) },
  ],
  deals: [
    { label: "Deal", cell: (record) => escapeHtml(recordTitle(record)) },
    { label: "Stage", className: "col-badge", cell: (record) => choiceBadge("deals", "stage", record.fields?.stage) },
    { label: "Company", cell: (record) => escapeHtml(relationLabel(record.fields?.company)) },
    { label: "Amount", className: "ws-col-num", cell: (record) => escapeHtml(formatMoney(record.fields?.amount, record.fields?.currency)) },
    { label: "Expected close", cell: (record) => dateCell(record.fields?.["expected-close-date"]) },
    { label: "Next step", className: "ws-col-wide", cell: (record) => textCell(record.fields?.["next-step"]) },
  ],
};

function renderList() {
  const columns = TABLES[activeBaseKey()];
  const records = listRecords();
  const waiting = narrowed() && !filteredMatches();
  byId("recordTable").dataset.base = activeBaseKey();
  byId("loadMore").hidden = narrowed() || !pageInfo().nextCursor;
  if (!byId("loadMore").disabled) setText("loadMore", messages.loadMore);
  byId("recordHead").innerHTML = `<tr>${columns
    .map((column) => `<th scope="col"${column.className ? ` class="${column.className}"` : ""}>${escapeHtml(column.label)}</th>`)
    .join("")}</tr>`;
  if (!records.length) {
    const message = waiting ? messages.refreshing : narrowed() ? messages.noMatches : messages.noRecords;
    byId("recordList").innerHTML = `<tr class="empty-row"><td class="empty-list" colspan="${columns.length}">${escapeHtml(message)}</td></tr>`;
    return;
  }
  byId("recordList").innerHTML = records.map((record) => {
    const selected = record.id === state.selectedRecordId;
    return `<tr data-record="${escapeHtml(record.id)}" tabindex="0"${selected ? ' class="ws-selected" aria-selected="true"' : ""}>${columns
      .map((column) => `<td${column.className ? ` class="${column.className}"` : ""}>${column.cell(record)}</td>`)
      .join("")}</tr>`;
  }).join("");
}

const fieldValueHtml = (baseKey, field, value, record) => {
  if (baseKey === "deals" && field.slug === "amount") {
    return escapeHtml(formatMoney(value, record?.fields?.currency));
  }
  if (field.type === "relation") return escapeHtml(relationLabel(value));
  const label = displayValue(value, baseKey, field.slug);
  if (value && field.type === "url") return `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  if (value && field.type === "email") return `<a href="mailto:${escapeHtml(value)}">${escapeHtml(label)}</a>`;
  if (value && field.type === "phone") return `<a href="tel:${escapeHtml(value)}">${escapeHtml(label)}</a>`;
  if (value && field.type === "date") return escapeHtml(formatDate(value));
  return escapeHtml(label);
};

function renderAudit(record) {
  const user = record.createdByUser || record.headCommit?.authorUser;
  // A bare member id is not a name; say who when we know, never print the id.
  const name = user?.name || user?.email || "Unknown member";
  const avatar = user?.image
    ? `<span class="audit-avatar"><img src="${escapeHtml(user.image)}" alt=""></span>`
    : `<span class="audit-avatar">${escapeHtml(String(name).slice(0, 1).toUpperCase())}</span>`;
  byId("auditLine").innerHTML = `${avatar}<span>Created by <strong>${escapeHtml(name)}</strong> on ${escapeHtml(formatTimestamp(record.createdAt))}</span>`;
}

const relatedFor = (record, targetBaseKey, relationField) =>
  recordsForBase(targetBaseKey).filter((item) => relationMatches(item.fields?.[relationField], record));

function renderRelated(record) {
  const contactsSection = byId("relatedContactsSection");
  const activitiesSection = byId("relatedActivitiesSection");
  let contacts = [];
  let activities = [];
  if (record.baseKey === "companies") {
    contacts = relatedFor(record, "contacts", "company");
    activities = relatedFor(record, "activities", "company");
  } else if (record.baseKey === "contacts") {
    activities = relatedFor(record, "activities", "contact");
  } else if (record.baseKey === "deals") {
    activities = relatedFor(record, "activities", "deal");
  }
  contactsSection.hidden = record.baseKey !== "companies";
  activitiesSection.hidden = record.baseKey === "activities";
  if (!contactsSection.hidden) {
    setText("relatedContactsCount", loadedCount(contacts.length, pageInfo("contacts").nextCursor));
    byId("relatedContacts").innerHTML = contacts.length
      ? contacts.map((item) => `<div class="related-item"><strong>${escapeHtml(recordTitle(item))}</strong><span>${escapeHtml(displayValue(item.fields?.["job-title"]))} / ${escapeHtml(displayValue(item.fields?.email))}</span></div>`).join("")
      : '<div class="empty-related">No contacts in the loaded window.</div>';
  }
  if (!activitiesSection.hidden) {
    activities.sort((a, b) => String(b.fields?.["activity-date"] || "").localeCompare(String(a.fields?.["activity-date"] || "")));
    setText("relatedActivitiesCount", loadedCount(activities.length, pageInfo("activities").nextCursor));
    byId("relatedActivities").innerHTML = activities.length
      ? activities.slice(0, 20).map((item) => `<div class="related-item"><strong>${escapeHtml(recordTitle(item))}</strong><span>${escapeHtml(choiceLabel("activities", "activity-type", item.fields?.["activity-type"]))} / ${escapeHtml(formatDate(item.fields?.["activity-date"]))}</span></div>`).join("")
      : '<div class="empty-related">No activity in the loaded window.</div>';
  }
}

const emptyDetailMessage = () => {
  const key = activeBaseKey();
  if (key === "companies") return messages.selectCompany;
  if (key === "contacts") return messages.selectContact;
  if (key === "deals") return messages.selectDeal;
  return messages.selectActivity;
};

function renderDetail() {
  const selectedId = state.selectedRecordId;
  const record = selectedId ? findRecord(selectedId, activeBaseKey()) : null;
  byId("detailBar").hidden = !selectedId;
  byId("detailEmpty").hidden = Boolean(record);
  byId("detailContent").hidden = !record;
  if (!record) {
    // Split's resting state, or a link to a record outside the loaded window.
    byId("detailEmpty").innerHTML = selectedId
      ? `<strong>${escapeHtml(messages.missingRecord)}</strong><span>${escapeHtml(messages.missingRecordHint)}</span>`
      : `<span>${escapeHtml(emptyDetailMessage())}</span>`;
    return;
  }
  const base = baseConfig();
  byId("detailExpand").hidden = state.presentation === "page";
  byId("detailExpand").href = detailUrl(record.id);
  setText("detailTitle", recordTitle(record));
  byId("logActivityOpen").hidden = !["contacts", "deals"].includes(record.baseKey);
  byId("stageChangeOpen").hidden = record.baseKey !== "deals";
  byId("detailActions").hidden = byId("logActivityOpen").hidden && byId("stageChangeOpen").hidden;
  renderAudit(record);
  byId("detailFields").innerHTML = (base?.fields || []).slice(1).map((field) =>
    `<div class="field-row"><span>${escapeHtml(field.name)}</span><strong>${fieldValueHtml(record.baseKey, field, record.fields?.[field.slug], record)}</strong></div>`,
  ).join("");
  renderRelated(record);
}

function renderSettings() {
  const provider = state.payload?.provider || {};
  const budgets = appConfig.schema.bases.map((base) => `${base.name}: ${base.readLimit}`).join("; ");
  const modes = appConfig.schema.bases.map((base) => `${base.name}: ${detailMode(base.key)}`).join("; ");
  const rows = [
    ["Provider", provider.name || state.provider?.name || "Not connected"],
    ["Mode", provider.mode || "Not set"],
    ["Deployment", appConfig.deployment],
    ["Space", "Busa Sales"],
    ["Configured Bases", appConfig.schema.bases.map((base) => base.slug).join(", ")],
    ["Page budgets", `${budgets}; pending reviews: 20`],
    ["Record detail", modes],
    ["Overview counts", "Exact records.count filters; dated lists and values remain bounded"],
    ["Write policy", "ChangeRequest only; no direct canonical mutation"],
  ];
  byId("settingsGrid").innerHTML = rows.map(([label, value]) => `<div class="settings-row"><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`).join("");
}

function applyBodyState() {
  const ready = Boolean(state.payload);
  const onView = ready && state.screen !== "overview";
  const body = document.body.classList;
  const mode = detailMode();
  body.toggle("ws-detail-open", onView && Boolean(state.selectedRecordId));
  body.toggle("ws-detail-page", onView && state.presentation === "page" && Boolean(state.selectedRecordId));
  body.toggle("ws-detail-drawer", onView && state.presentation === "drawer");
  body.toggle("ws-layout-split", onView && mode === "split" && state.presentation !== "page");
  body.toggle("ws-searching", onView && narrowed());
  body.add("ws-has-mobile-bar");
  byId("overviewPage").hidden = !ready || state.screen !== "overview";
  byId("viewPage").hidden = !onView;
  setText("mobileTitle", SCREEN_NAMES[state.screen]);
}

function render() {
  document.documentElement.lang = appConfig.locale;
  document.documentElement.style.setProperty("--accent", appConfig.brand?.accent || "#0F766E");
  document.title = appConfig.appName;
  applyBodyState();
  if (!state.payload) return;
  renderNavigation();
  renderAttention();
  if (state.screen === "overview") {
    renderOverview();
  } else {
    renderToolbar();
    renderList();
    renderDetail();
  }
  renderSettings();
  renderIcons();
  if (state.screen === "overview") playOverviewEntrance(byId("overviewPage"));
}

// ── Data ───────────────────────────────────────────────────────────────────
async function load() {
  setText("loadingState", messages.loading);
  byId("errorState").hidden = true;
  try {
    state.provider = await getProvider();
    state.payload = await state.provider.getState();
    setText("loadingState", "");
    byId("errorState").hidden = true;
    state.appliedRoute = "";
    applyRoute();
  } catch (error) {
    setText("loadingState", "");
    byId("errorState").hidden = false;
    setText("errorState", humanError(error));
  }
}

// One request per search/filter change. An empty search reads nothing: the
// list falls back to the window already loaded.
async function runQuery() {
  const sequence = ++state.querySequence;
  const baseKey = activeBaseKey();
  const query = state.query.trim();
  const filter = state.filter;
  if (!query && !filter) {
    state.filtered = null;
    render();
    return;
  }
  if (filteredMatches()) return;
  const definition = filterDefinition();
  setText("loadingState", messages.refreshing);
  render();
  try {
    const page = await state.provider.queryBase(baseKey, {
      query,
      filter: filter ? { fieldSlug: definition.fieldSlug, value: filter } : null,
    });
    if (sequence !== state.querySequence || baseKey !== activeBaseKey()) return;
    state.filtered = { baseKey, query, filter, records: page.records, nextCursor: page.nextCursor };
    setText("loadingState", "");
    byId("errorState").hidden = true;
    render();
  } catch (error) {
    if (sequence !== state.querySequence) return;
    setText("loadingState", "");
    byId("errorState").hidden = false;
    setText("errorState", `${messages.queryFailed} ${humanError(error)}`);
  }
}

let searchTimer;
const queueQuery = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runQuery, 320);
};

async function loadMore() {
  const baseKey = activeBaseKey();
  const cursor = pageInfo(baseKey).nextCursor;
  if (!cursor) return;
  byId("loadMore").disabled = true;
  setText("loadMore", messages.loadingMore);
  try {
    const page = await state.provider.loadMore(baseKey, cursor);
    const known = new Set(state.payload.records.map((record) => record.id));
    state.payload.records.push(...page.records.filter((record) => !known.has(record.id)));
    state.payload.pageInfo[baseKey] = { nextCursor: page.nextCursor, limit: page.limit };
    byId("loadMore").disabled = false;
    render();
  } catch {
    setText("loadMore", messages.loadMoreFailed);
  } finally {
    byId("loadMore").disabled = false;
  }
}

// ── Routing ────────────────────────────────────────────────────────────────
const resetScroll = () => {
  byId("overviewPage").scrollTop = 0;
  byId("listPanel").scrollTop = 0;
  byId("detailPanel").scrollTop = 0;
};

function applyRoute() {
  const route = routeFromHash();
  const key = routeKey(route);
  if (key === state.appliedRoute) return;
  state.appliedRoute = key;
  const previousSelection = state.selectedRecordId;
  const contextChanged = route.screen !== state.screen || route.tab !== state.directoryTab;
  state.screen = route.screen;
  state.directoryTab = route.tab;
  state.query = route.query;
  state.filter = route.filter;
  state.selectedRecordId = route.recordId || route.peek;
  state.presentation = route.recordId ? "page" : route.peek ? detailMode() : null;
  setMobileSidebar(false);
  if (contextChanged) {
    state.querySequence += 1;
    resetScroll();
  }
  render();
  if (state.screen !== "overview" && narrowed() && !filteredMatches()) runQuery();
  if (state.selectedRecordId && state.selectedRecordId !== previousSelection) {
    byId("detailPanel").scrollTop = 0;
    const target = state.presentation === "page" ? byId("backButton") : byId("detailClose");
    setTimeout(() => target.focus({ preventScroll: true }), 60);
  } else if (!state.selectedRecordId && previousSelection && !contextChanged) {
    // Back on the list: return focus to the row the record was opened from.
    [...byId("recordList").querySelectorAll("[data-record]")]
      .find((row) => row.dataset.record === previousSelection)
      ?.focus({ preventScroll: true });
  }
}

const navigate = (url, { replace = false, fromList = false } = {}) => {
  if (replace) history.replaceState(history.state, "", url);
  else history.pushState(fromList ? { fromList: true } : null, "", url);
  applyRoute();
};

function closeDetail() {
  if (history.state?.fromList) history.back();
  else navigate(listUrl());
}

function openRecord(id) {
  // Switching records while a drawer or split is open replaces the entry, so
  // Close still steps back to the list it was opened from.
  if (state.selectedRecordId && state.presentation !== "page") navigate(recordUrl(id), { replace: true });
  else navigate(recordUrl(id), { fromList: true });
}

// Search and filter edits replace the entry (no Back step per keystroke) and
// drop any peeked record, which may not be in the narrowed result.
function updateListQuery() {
  history.replaceState(history.state, "", listUrl());
  state.appliedRoute = routeKey(routeFromHash());
  state.selectedRecordId = "";
  state.presentation = null;
  render();
  queueQuery();
}

const selectedContact = () => findRecord(state.selectedRecordId, "contacts");
const selectedDeal = () => findRecord(state.selectedRecordId, "deals");
const closeActivityModal = () => {
  byId("activityModal").hidden = true;
  state.activityDraft = null;
  state.activitySource = null;
};

function openActivityModal() {
  const source = activeBaseKey() === "deals" ? selectedDeal() : selectedContact();
  if (!source) return;
  state.activitySource = source;
  const form = byId("activityForm");
  form.reset();
  form.elements["activity-date"].value = today();
  const contactName = source.baseKey === "deals" ? relationLabel(source.fields?.["primary-contact"]) : recordTitle(source);
  setText("activityContext", `${contactName} / ${relationLabel(source.fields?.company)}${source.baseKey === "deals" ? ` / ${recordTitle(source)}` : ""}`);
  byId("activityFields").hidden = false;
  byId("requestPreview").hidden = true;
  resetFormResult("activityResult");
  byId("activityBack").hidden = true;
  byId("activityCancel").hidden = false;
  byId("activityReview").hidden = false;
  byId("activitySubmit").hidden = true;
  byId("activityModal").hidden = false;
  form.elements["activity-subject"].focus();
}

function draftFromForm() {
  const source = state.activitySource;
  const data = new FormData(byId("activityForm"));
  const draft = {
    "activity-subject": String(data.get("activity-subject") || "").trim(),
    company: source?.fields?.company,
    contact: source?.baseKey === "deals" ? source.fields?.["primary-contact"] : source?.id,
    "activity-type": String(data.get("activity-type") || ""),
    "activity-date": String(data.get("activity-date") || ""),
    summary: String(data.get("summary") || "").trim(),
  };
  const followUp = String(data.get("next-follow-up-date") || "");
  if (followUp) draft["next-follow-up-date"] = followUp;
  if (source?.baseKey === "deals") draft.deal = source.id;
  return draft;
}

function reviewActivity() {
  if (!byId("activityForm").reportValidity()) return;
  state.activityDraft = draftFromForm();
  const source = state.activitySource;
  const rows = [
    ["Contact", source?.baseKey === "deals" ? relationLabel(source.fields?.["primary-contact"]) : recordTitle(source)],
    ["Company", relationLabel(source?.fields?.company)],
    ...(source?.baseKey === "deals" ? [["Deal", recordTitle(source)]] : []),
    ["Subject", state.activityDraft["activity-subject"]],
    ["Type", choiceLabel("activities", "activity-type", state.activityDraft["activity-type"])],
    ["Activity date", formatDate(state.activityDraft["activity-date"])],
    ["Summary", state.activityDraft.summary],
    ["Next follow-up", formatDate(state.activityDraft["next-follow-up-date"])],
  ];
  byId("previewFields").innerHTML = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  byId("activityFields").hidden = true;
  byId("requestPreview").hidden = false;
  byId("activityBack").hidden = false;
  byId("activityReview").hidden = true;
  byId("activitySubmit").hidden = false;
}

// A write that landed changes the records on screen, so reload them; a queued
// one only adds to the requests awaiting review.
async function refreshAfterWrite(request) {
  if (!request.pending) {
    await load();
    return;
  }
  const pending = await state.provider.refreshPending();
  state.payload.changeRequests = pending.changeRequests;
  state.payload.changeRequestPageInfo.nextCursor = pending.nextCursor;
}

async function submitActivity() {
  if (!state.activityDraft) return;
  const button = byId("activitySubmit");
  button.disabled = true;
  setButtonLabel("activitySubmit", "Saving...");
  try {
    const request = await state.provider.createActivity(state.activityDraft);
    await refreshAfterWrite(request);
    byId("requestPreview").hidden = true;
    showWriteResult("activityResult", request, messages.activitySaved);
    byId("activityBack").hidden = true;
    byId("activitySubmit").hidden = true;
    byId("activityCancel").textContent = "Close";
    renderAttention();
  } catch (error) {
    showRequestError("activityResult", error);
  } finally {
    button.disabled = false;
    setButtonLabel("activitySubmit", "Save");
  }
}

const recordOptions = (baseKey, selected = "") => recordsForBase(baseKey)
  .map((record) => `<option value="${escapeHtml(record.id)}" ${record.id === selected ? "selected" : ""}>${escapeHtml(recordTitle(record))}</option>`)
  .join("");

const closeDealModal = () => {
  byId("dealModal").hidden = true;
  state.dealDraft = null;
};

function refreshDealContacts() {
  const form = byId("dealForm");
  const company = recordsForBase("companies").find((record) => record.id === form.elements.company.value);
  const current = form.elements["primary-contact"].value;
  const contacts = company
    ? recordsForBase("contacts").filter((record) => relationMatches(record.fields?.company, company))
    : recordsForBase("contacts");
  form.elements["primary-contact"].innerHTML = '<option value="">Not set</option>' + contacts
    .map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(recordTitle(record))}</option>`)
    .join("");
  if (contacts.some((record) => record.id === current)) form.elements["primary-contact"].value = current;
}

function openDealModal() {
  const form = byId("dealForm");
  form.reset();
  form.elements.company.innerHTML = '<option value="">Select company</option>' + recordOptions("companies");
  refreshDealContacts();
  byId("dealFields").hidden = false;
  byId("dealPreview").hidden = true;
  resetFormResult("dealResult");
  byId("dealBack").hidden = true;
  byId("dealCancel").hidden = false;
  byId("dealCancel").textContent = "Cancel";
  byId("dealReview").hidden = false;
  byId("dealSubmit").hidden = true;
  byId("dealModal").hidden = false;
  form.elements["deal-name"].focus();
}

function dealDraftFromForm() {
  const data = new FormData(byId("dealForm"));
  const draft = {
    "deal-name": String(data.get("deal-name") || "").trim(),
    company: String(data.get("company") || ""),
    amount: Number(data.get("amount") || 0),
    currency: String(data.get("currency") || ""),
    stage: String(data.get("stage") || ""),
  };
  for (const field of ["primary-contact", "expected-close-date", "next-step", "notes"]) {
    const value = String(data.get(field) || "").trim();
    if (value) draft[field] = value;
  }
  return draft;
}

function reviewDeal() {
  if (!byId("dealForm").reportValidity()) return;
  state.dealDraft = dealDraftFromForm();
  const rows = [
    ["Deal", state.dealDraft["deal-name"]],
    ["Company", relationLabel(state.dealDraft.company)],
    ["Primary contact", relationLabel(state.dealDraft["primary-contact"])],
    ["Amount", `${choiceLabel("deals", "currency", state.dealDraft.currency)} ${new Intl.NumberFormat("en").format(state.dealDraft.amount)}`],
    ["Stage", choiceLabel("deals", "stage", state.dealDraft.stage)],
    ["Expected close", formatDate(state.dealDraft["expected-close-date"])],
    ["Next step", displayValue(state.dealDraft["next-step"])],
  ];
  byId("dealPreviewFields").innerHTML = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  byId("dealFields").hidden = true;
  byId("dealPreview").hidden = false;
  byId("dealBack").hidden = false;
  byId("dealReview").hidden = true;
  byId("dealSubmit").hidden = false;
}

async function submitDeal() {
  if (!state.dealDraft) return;
  const button = byId("dealSubmit");
  button.disabled = true;
  setButtonLabel("dealSubmit", "Saving...");
  try {
    const request = await state.provider.createDeal(state.dealDraft);
    await refreshAfterWrite(request);
    byId("dealPreview").hidden = true;
    showWriteResult("dealResult", request, messages.dealSaved);
    byId("dealBack").hidden = true;
    byId("dealSubmit").hidden = true;
    byId("dealCancel").textContent = "Close";
    renderAttention();
  } catch (error) {
    showRequestError("dealResult", error);
  } finally {
    button.disabled = false;
    setButtonLabel("dealSubmit", "Save");
  }
}

const closeStageModal = () => {
  setStageMenu(false);
  byId("stageModal").hidden = true;
  state.stageDraft = null;
};

const stageOptions = () => [...byId("stageSelectMenu").querySelectorAll(".stage-select-option")];

function syncStageSelect(value) {
  const options = stageOptions();
  const selected = options.find((option) => option.dataset.value === value) || options[0];
  byId("stageValue").value = selected.dataset.value;
  setText("stageSelectValue", selected.textContent.trim());
  options.forEach((option) => option.setAttribute("aria-selected", String(option === selected)));
}

function positionStageMenu() {
  const menu = byId("stageSelectMenu");
  const trigger = byId("stageSelectTrigger").getBoundingClientRect();
  const viewportGap = 12;
  const controlGap = 6;
  const width = Math.min(trigger.width, window.innerWidth - viewportGap * 2);
  menu.style.width = `${width}px`;
  const menuHeight = menu.offsetHeight;
  const spaceBelow = window.innerHeight - trigger.bottom - viewportGap;
  const spaceAbove = trigger.top - viewportGap;
  const openUp = menuHeight > spaceBelow && spaceAbove > spaceBelow;
  const top = openUp
    ? Math.max(viewportGap, trigger.top - controlGap - menuHeight)
    : Math.min(trigger.bottom + controlGap, window.innerHeight - viewportGap - menuHeight);
  const left = Math.min(
    Math.max(viewportGap, trigger.left),
    window.innerWidth - viewportGap - width,
  );
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function setStageMenu(open, focusSelected = false) {
  const menu = byId("stageSelectMenu");
  menu.hidden = !open;
  byId("stageSelectTrigger").setAttribute("aria-expanded", String(open));
  if (open && focusSelected) {
    positionStageMenu();
    (stageOptions().find((option) => option.getAttribute("aria-selected") === "true") || stageOptions()[0]).focus();
  }
}

function moveStageOptionFocus(direction) {
  const options = stageOptions();
  const current = Math.max(0, options.indexOf(document.activeElement));
  options[(current + direction + options.length) % options.length].focus();
}

function openStageModal() {
  const deal = selectedDeal();
  if (!deal) return;
  const form = byId("stageForm");
  form.reset();
  syncStageSelect(deal.fields?.stage || "qualification");
  setText("stageContext", `${recordTitle(deal)} / Current: ${choiceLabel("deals", "stage", deal.fields?.stage)}`);
  byId("stageFields").hidden = false;
  byId("stagePreview").hidden = true;
  resetFormResult("stageResult");
  byId("stageBack").hidden = true;
  byId("stageCancel").hidden = false;
  byId("stageCancel").textContent = "Cancel";
  byId("stageReview").hidden = false;
  byId("stageSubmit").hidden = true;
  byId("stageModal").hidden = false;
  byId("stageSelectTrigger").focus();
}

function reviewStage() {
  const deal = selectedDeal();
  if (!deal || !byId("stageForm").reportValidity()) return;
  const stage = byId("stageValue").value;
  state.stageDraft = { recordId: deal.id, baseCommitId: deal.headCommitId, stage };
  const rows = [
    ["Deal", recordTitle(deal)],
    ["Current stage", choiceLabel("deals", "stage", deal.fields?.stage)],
    ["New stage", choiceLabel("deals", "stage", stage)],
  ];
  byId("stagePreviewFields").innerHTML = rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("");
  byId("stageFields").hidden = true;
  byId("stagePreview").hidden = false;
  byId("stageBack").hidden = false;
  byId("stageReview").hidden = true;
  byId("stageSubmit").hidden = false;
}

async function submitStage() {
  if (!state.stageDraft) return;
  const button = byId("stageSubmit");
  button.disabled = true;
  setButtonLabel("stageSubmit", "Saving...");
  try {
    const request = await state.provider.updateDealStage(state.stageDraft);
    await refreshAfterWrite(request);
    byId("stagePreview").hidden = true;
    showWriteResult("stageResult", request, messages.stageSaved);
    byId("stageBack").hidden = true;
    byId("stageSubmit").hidden = true;
    byId("stageCancel").textContent = "Close";
    renderAttention();
  } catch (error) {
    showRequestError("stageResult", error);
  } finally {
    button.disabled = false;
    setButtonLabel("stageSubmit", "Save");
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
byId("mainNav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-screen]");
  if (!button) return;
  const screen = button.dataset.screen;
  navigate(screen === "directory" ? "#/directory/companies" : `#/${screen}`);
});
byId("overviewPage").addEventListener("click", (event) => {
  const stageButton = event.target.closest("[data-stage]");
  if (stageButton) {
    navigate(`#/pipeline${routeQuery({}, { query: "", filter: stageButton.dataset.stage })}`);
    return;
  }
  const recordButton = event.target.closest("[data-overview-record]");
  if (recordButton) {
    const id = encodeURIComponent(recordButton.dataset.overviewRecord);
    navigate(recordButton.dataset.overviewBase === "deals" ? `#/pipeline/${id}` : `#/activities?peek=${id}`);
    return;
  }
  const targetButton = event.target.closest("[data-overview-target]");
  if (!targetButton) return;
  const target = targetButton.dataset.overviewTarget;
  if (target === "customers" || target === "prospects") {
    navigate(`#/directory/companies?f=${target === "customers" ? "customer" : "prospect"}`);
  } else if (target === "activities" || target === "followups") {
    navigate("#/activities");
  } else if (target === "missing-next-step") {
    navigate("#/pipeline");
  }
});
byId("directoryTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-directory-tab]");
  if (button && button.dataset.directoryTab !== state.directoryTab) navigate(`#/directory/${button.dataset.directoryTab}`);
});
byId("recordList").addEventListener("click", (event) => {
  if (event.target.closest("a, button")) return;
  const row = event.target.closest("tr[data-record]");
  if (row) openRecord(row.dataset.record);
});
byId("recordList").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("tr[data-record]");
  if (!row) return;
  event.preventDefault();
  openRecord(row.dataset.record);
});
byId("searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  updateListQuery();
});
byId("recordFilter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  updateListQuery();
});
byId("loadMore").addEventListener("click", loadMore);
byId("backButton").addEventListener("click", closeDetail);
byId("detailClose").addEventListener("click", closeDetail);
byId("sidebarOpen").addEventListener("click", () => setMobileSidebar(true));
byId("sidebarClose").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 720px)").matches) setMobileSidebar(false);
  else setDesktopSidebar(true, { restoreFocus: true });
});
byId("sidebarExpand").addEventListener("click", () => setDesktopSidebar(false, { restoreFocus: true }));
byId("sidebarScrim").addEventListener("click", () => setMobileSidebar(false));
byId("overviewAddDeal").addEventListener("click", openDealModal);
byId("overviewFollowUps").addEventListener("click", () => navigate("#/activities"));

const setSettings = (open) => {
  byId("settingsModal").hidden = !open;
  if (open) {
    renderSettings();
    byId("settingsClose").focus();
  }
};
byId("settingsOpen").addEventListener("click", () => setSettings(true));
byId("mobileSettings").addEventListener("click", () => setSettings(true));
byId("settingsClose").addEventListener("click", () => setSettings(false));
byId("settingsModal").addEventListener("click", (event) => {
  if (event.target === byId("settingsModal")) setSettings(false);
});

byId("logActivityOpen").addEventListener("click", openActivityModal);
byId("activityForm").addEventListener("submit", (event) => event.preventDefault());
byId("activityReview").addEventListener("click", reviewActivity);
byId("activitySubmit").addEventListener("click", submitActivity);
byId("activityBack").addEventListener("click", () => {
  byId("activityFields").hidden = false;
  byId("requestPreview").hidden = true;
  byId("activityBack").hidden = true;
  byId("activityReview").hidden = false;
  byId("activitySubmit").hidden = true;
});
byId("activityCancel").addEventListener("click", closeActivityModal);
byId("activityModalClose").addEventListener("click", closeActivityModal);
byId("activityModal").addEventListener("click", (event) => {
  if (event.target === byId("activityModal")) closeActivityModal();
});

byId("addDealOpen").addEventListener("click", openDealModal);
byId("dealForm").elements.company.addEventListener("change", refreshDealContacts);
byId("dealForm").addEventListener("submit", (event) => event.preventDefault());
byId("dealReview").addEventListener("click", reviewDeal);
byId("dealSubmit").addEventListener("click", submitDeal);
byId("dealBack").addEventListener("click", () => {
  byId("dealFields").hidden = false;
  byId("dealPreview").hidden = true;
  byId("dealBack").hidden = true;
  byId("dealReview").hidden = false;
  byId("dealSubmit").hidden = true;
});
byId("dealCancel").addEventListener("click", closeDealModal);
byId("dealModalClose").addEventListener("click", closeDealModal);
byId("dealModal").addEventListener("click", (event) => {
  if (event.target === byId("dealModal")) closeDealModal();
});

byId("stageChangeOpen").addEventListener("click", openStageModal);
byId("stageForm").addEventListener("submit", (event) => event.preventDefault());
byId("stageSelectTrigger").addEventListener("click", () => {
  const open = byId("stageSelectTrigger").getAttribute("aria-expanded") !== "true";
  setStageMenu(open, open);
});
byId("stageSelectTrigger").addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
  event.preventDefault();
  setStageMenu(true, true);
});
byId("stageSelectMenu").addEventListener("click", (event) => {
  const option = event.target.closest(".stage-select-option");
  if (!option) return;
  syncStageSelect(option.dataset.value);
  setStageMenu(false);
  byId("stageSelectTrigger").focus();
});
byId("stageSelectMenu").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveStageOptionFocus(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const options = stageOptions();
    options[event.key === "Home" ? 0 : options.length - 1].focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    document.activeElement.click();
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    setStageMenu(false);
    byId("stageSelectTrigger").focus();
  } else if (event.key === "Tab") {
    setStageMenu(false);
  }
});
byId("stageReview").addEventListener("click", reviewStage);
byId("stageSubmit").addEventListener("click", submitStage);
byId("stageBack").addEventListener("click", () => {
  byId("stageFields").hidden = false;
  byId("stagePreview").hidden = true;
  byId("stageBack").hidden = true;
  byId("stageReview").hidden = false;
  byId("stageSubmit").hidden = true;
});
byId("stageCancel").addEventListener("click", closeStageModal);
byId("stageModalClose").addEventListener("click", closeStageModal);
byId("stageModal").addEventListener("click", (event) => {
  if (!event.target.closest("#stageSelect")) setStageMenu(false);
  if (event.target === byId("stageModal")) closeStageModal();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!byId("stageModal").hidden) closeStageModal();
  else if (!byId("dealModal").hidden) closeDealModal();
  else if (!byId("activityModal").hidden) closeActivityModal();
  else if (!byId("settingsModal").hidden) setSettings(false);
  else if (document.body.classList.contains("sidebar-open")) setMobileSidebar(false);
  else if (event.target.closest?.("input, select, textarea")) event.target.blur();
  // Escape closes a drawer or split selection; a full page stays put.
  else if (state.selectedRecordId && state.presentation && state.presentation !== "page") closeDetail();
});
window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 720px)").matches) setMobileSidebar(false);
  else setDesktopSidebar(false);
  if (!byId("stageSelectMenu").hidden) positionStageMenu();
});
window.addEventListener("popstate", applyRoute);
window.addEventListener("hashchange", applyRoute);

renderIcons();
load();
