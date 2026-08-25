import { appConfig } from "./config.js";
import { messages } from "./messages.js";
import { getProvider } from "./providers/index.js";

const state = {
  provider: null,
  payload: null,
  screen: "directory",
  directoryTab: "companies",
  selectedRecordId: null,
  query: "",
  filter: "",
  querySequence: 0,
  activityDraft: null,
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const activeBaseKey = () => (state.screen === "activities" ? "activities" : state.directoryTab);
const baseConfig = (key = activeBaseKey()) =>
  appConfig.schema.bases.find((base) => base.key === key);
const recordsForBase = (key = activeBaseKey()) =>
  (state.payload?.records || []).filter((record) => record.baseKey === key);
const pageInfo = (key = activeBaseKey()) => state.payload?.pageInfo?.[key] || {};
const loadedCount = (count, hasMore) => `${count}${hasMore ? "+" : ""}`;
const primarySlug = (key = activeBaseKey()) => baseConfig(key)?.fields?.[0]?.slug || "name";
const recordTitle = (record) => displayValue(record?.fields?.[primarySlug(record?.baseKey)]);
const choiceLabel = (baseKey, fieldSlug, value) => {
  const field = baseConfig(baseKey)?.fields?.find((item) => item.slug === fieldSlug);
  return field?.options?.choices?.find((choice) => choice.id === value)?.name || value;
};

const relationTokens = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(relationTokens);
  if (typeof value === "object") {
    return [value.id, value.recordId, value.name, value.title, value.label].filter(Boolean).map(String);
  }
  return [String(value)];
};

const relatedRecordTitle = (token) => {
  const related = (state.payload?.records || []).find((record) => record.id === token);
  return related ? recordTitle(related) : token;
};

function displayValue(value, baseKey, fieldSlug) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.map((item) => displayValue(item, baseKey, fieldSlug)).join(", ");
  if (typeof value === "object") return value.name || value.title || value.label || value.id || "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const selected = baseKey && fieldSlug ? choiceLabel(baseKey, fieldSlug, value) : value;
  return relatedRecordTitle(String(selected));
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

const today = () => new Date().toISOString().slice(0, 10);
const dueActivities = () =>
  recordsForBase("activities").filter((record) => {
    const followUp = record.fields?.["next-follow-up-date"];
    return followUp && String(followUp).slice(0, 10) <= today();
  });

const setText = (id, value) => {
  const element = byId(id);
  if (element) element.textContent = value;
};
const setMobileSidebar = (open) => {
  document.body.classList.toggle("sidebar-open", open);
  byId("sidebarScrim").hidden = !open;
};
const setMobileDetail = (open) => document.body.classList.toggle("mobile-detail-open", open);

const humanError = (error) => {
  const raw = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages.providerErrors).find((item) => raw.includes(item));
  return code ? messages.providerErrors[code] : raw;
};

function renderNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === state.screen);
  });
  const directoryCount = recordsForBase("companies").length + recordsForBase("contacts").length;
  setText("directoryNavCount", loadedCount(directoryCount, pageInfo("companies").nextCursor || pageInfo("contacts").nextCursor));
  setText("activitiesNavCount", loadedCount(recordsForBase("activities").length, pageInfo("activities").nextCursor));
}

function renderMetrics() {
  const pending = (state.payload?.changeRequests || []).filter((request) =>
    ["in_review", "changes_requested", "approved", "conflict"].includes(request.status),
  ).length;
  const metrics = [
    ["Companies", loadedCount(recordsForBase("companies").length, pageInfo("companies").nextCursor)],
    ["Contacts", loadedCount(recordsForBase("contacts").length, pageInfo("contacts").nextCursor)],
    ["Follow-ups due", loadedCount(dueActivities().length, pageInfo("activities").nextCursor)],
    ["Pending reviews", loadedCount(pending, state.payload?.changeRequestPageInfo?.nextCursor)],
  ];
  byId("metrics").innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  setText("attentionValue", loadedCount(dueActivities().length, pageInfo("activities").nextCursor));
  setText("attentionCopy", messages.followUpLabel);
}

const filterDefinition = () => {
  if (activeBaseKey() === "companies") return { label: "Relationship", fieldSlug: "relationship-type" };
  if (activeBaseKey() === "contacts") return { label: "Status", fieldSlug: "contact-status" };
  return { label: "Activity type", fieldSlug: "activity-type" };
};

function renderControls() {
  const screenCopy = messages.screens[state.screen];
  setText("viewEyebrow", screenCopy.eyebrow);
  setText("viewTitle", screenCopy.title);
  setText("viewSummary", screenCopy.summary);
  setText("mobileTitle", state.screen === "activities" ? "Activities" : "Directory");
  byId("directoryTabs").hidden = state.screen !== "directory";
  document.querySelectorAll("[data-directory-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.directoryTab === state.directoryTab);
  });
  const base = baseConfig();
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
  byId("searchInput").placeholder = `Search ${base?.name.toLowerCase() || "records"}`;
  setText("searchLabel", `Search ${base?.name || "records"}`);
  setText("windowNote", pageInfo().nextCursor ? "More records are available" : "Showing the complete loaded window");
}

function listRow(record) {
  const fields = record.fields || {};
  if (record.baseKey === "companies") {
    return {
      title: recordTitle(record),
      meta: `${displayValue(fields["relationship-type"], "companies", "relationship-type")} / ${displayValue(fields.industry, "companies", "industry")} / ${displayValue(fields.headquarters)}`,
      warning: false,
    };
  }
  if (record.baseKey === "contacts") {
    return {
      title: recordTitle(record),
      meta: `${displayValue(fields["job-title"])} / ${displayValue(fields.company)} / ${displayValue(fields.email)}`,
      warning: !fields.email && !fields.phone,
    };
  }
  const followUp = fields["next-follow-up-date"];
  return {
    title: recordTitle(record),
    meta: `${displayValue(fields["activity-type"], "activities", "activity-type")} / ${formatDate(fields["activity-date"])}${followUp ? ` / Follow up ${formatDate(followUp)}` : ""}`,
    warning: followUp && String(followUp).slice(0, 10) <= today(),
  };
}

function renderList() {
  const records = recordsForBase();
  const base = baseConfig();
  setText("listEyebrow", state.screen === "activities" ? "Relationship history" : "Directory");
  setText("listTitle", base?.name || "Records");
  setText("recordCount", loadedCount(records.length, pageInfo().nextCursor));
  byId("loadMore").hidden = !pageInfo().nextCursor || Boolean(state.query || state.filter);
  setText("loadMore", messages.loadMore);
  if (!records.length) {
    byId("recordList").innerHTML = `<div class="empty-list">${escapeHtml(state.query || state.filter ? messages.noMatches : messages.noRecords)}</div>`;
    return;
  }
  byId("recordList").innerHTML = records.map((record) => {
    const row = listRow(record);
    return `<button class="record-row ${record.id === state.selectedRecordId ? "selected" : ""}" type="button" data-record="${escapeHtml(record.id)}">
      <strong>${escapeHtml(row.title)}</strong>
      <span class="row-meta"><i class="status-dot ${row.warning ? "warning" : ""}" aria-hidden="true"></i><span>${escapeHtml(row.meta)}</span></span>
    </button>`;
  }).join("");
}

const fieldValueHtml = (baseKey, field, value) => {
  const label = displayValue(value, baseKey, field.slug);
  if (value && field.type === "url") return `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  if (value && field.type === "email") return `<a href="mailto:${escapeHtml(value)}">${escapeHtml(label)}</a>`;
  if (value && field.type === "phone") return `<a href="tel:${escapeHtml(value)}">${escapeHtml(label)}</a>`;
  if (value && field.type === "date") return escapeHtml(formatDate(value));
  return escapeHtml(label);
};

function renderAudit(record) {
  const user = record.createdByUser || record.headCommit?.authorUser;
  const name = user?.name || user?.email || record.createdBy || "Unknown member";
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

function renderDetail() {
  const record = recordsForBase().find((item) => item.id === state.selectedRecordId);
  byId("detailEmpty").hidden = Boolean(record);
  byId("detailContent").hidden = !record;
  if (!record) {
    const message = activeBaseKey() === "companies" ? messages.selectCompany : activeBaseKey() === "contacts" ? messages.selectContact : messages.selectActivity;
    byId("detailEmpty").innerHTML = `<strong>No record selected</strong><span>${escapeHtml(message)}</span>`;
    return;
  }
  const base = baseConfig();
  setText("detailEyebrow", base?.name.slice(0, -1) || "Record");
  setText("detailTitle", recordTitle(record));
  byId("logActivityOpen").hidden = record.baseKey !== "contacts";
  renderAudit(record);
  byId("detailFields").innerHTML = (base?.fields || []).slice(1).map((field) =>
    `<div class="field-row"><span>${escapeHtml(field.name)}</span><strong>${fieldValueHtml(record.baseKey, field, record.fields?.[field.slug])}</strong></div>`,
  ).join("");
  renderRelated(record);
}

function renderSettings() {
  const provider = state.payload?.provider || {};
  const budgets = appConfig.schema.bases.map((base) => `${base.name}: ${base.readLimit}`).join("; ");
  const rows = [
    ["Provider", provider.name || state.provider?.name || "Not connected"],
    ["Mode", provider.mode || "Not set"],
    ["Deployment", appConfig.deployment],
    ["Space", appConfig.spaceId || "Ambient Busabase session"],
    ["Configured Bases", appConfig.schema.bases.map((base) => base.slug).join(", ")],
    ["Page budgets", `${budgets}; pending reviews: 20`],
    ["Write policy", "ChangeRequest only; no direct canonical mutation"],
  ];
  byId("settingsGrid").innerHTML = rows.map(([label, value]) => `<div class="settings-row"><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`).join("");
}

function render() {
  document.documentElement.lang = appConfig.locale;
  document.documentElement.style.setProperty("--accent", appConfig.brand?.accent || "#0F766E");
  document.title = appConfig.appName;
  renderNavigation();
  renderControls();
  renderMetrics();
  renderList();
  renderDetail();
  renderSettings();
}

async function load() {
  setText("loadingState", messages.loading);
  byId("errorState").hidden = true;
  try {
    state.provider = await getProvider();
    state.payload = await state.provider.getState();
    setText("loadingState", state.payload?.provider?.stale ? "This demo window is marked stale." : "");
    render();
  } catch (error) {
    setText("loadingState", "");
    byId("errorState").hidden = false;
    setText("errorState", humanError(error));
  }
}

async function runQuery() {
  const sequence = ++state.querySequence;
  const baseKey = activeBaseKey();
  const definition = filterDefinition();
  setText("loadingState", messages.refreshing);
  try {
    const page = await state.provider.queryBase(baseKey, {
      query: state.query.trim(),
      filter: state.filter ? { fieldSlug: definition.fieldSlug, value: state.filter } : null,
    });
    if (sequence !== state.querySequence || baseKey !== activeBaseKey()) return;
    state.payload.records = [
      ...state.payload.records.filter((record) => record.baseKey !== baseKey),
      ...page.records,
    ];
    state.payload.pageInfo[baseKey] = { nextCursor: page.nextCursor, limit: page.limit };
    state.selectedRecordId = null;
    setText("loadingState", "");
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
    render();
  } catch {
    setText("loadMore", messages.loadMoreFailed);
  } finally {
    byId("loadMore").disabled = false;
  }
}

const selectedContact = () => recordsForBase("contacts").find((record) => record.id === state.selectedRecordId);
const closeActivityModal = () => {
  byId("activityModal").hidden = true;
  state.activityDraft = null;
};

function openActivityModal() {
  const contact = selectedContact();
  if (!contact) return;
  const form = byId("activityForm");
  form.reset();
  form.elements["activity-date"].value = today();
  setText("activityContext", `${recordTitle(contact)} / ${displayValue(contact.fields?.company)}`);
  byId("activityFields").hidden = false;
  byId("requestPreview").hidden = true;
  byId("activityResult").hidden = true;
  byId("activityBack").hidden = true;
  byId("activityCancel").hidden = false;
  byId("activityReview").hidden = false;
  byId("activitySubmit").hidden = true;
  byId("activityModal").hidden = false;
  form.elements["activity-subject"].focus();
}

function draftFromForm() {
  const contact = selectedContact();
  const data = new FormData(byId("activityForm"));
  const draft = {
    "activity-subject": String(data.get("activity-subject") || "").trim(),
    company: contact?.fields?.company,
    contact: contact?.id,
    "activity-type": String(data.get("activity-type") || ""),
    "activity-date": String(data.get("activity-date") || ""),
    summary: String(data.get("summary") || "").trim(),
  };
  const followUp = String(data.get("next-follow-up-date") || "");
  if (followUp) draft["next-follow-up-date"] = followUp;
  return draft;
}

function reviewActivity(event) {
  event.preventDefault();
  if (!byId("activityForm").reportValidity()) return;
  state.activityDraft = draftFromForm();
  const contact = selectedContact();
  const rows = [
    ["Contact", recordTitle(contact)],
    ["Company", displayValue(contact?.fields?.company)],
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

async function submitActivity() {
  if (!state.activityDraft) return;
  const button = byId("activitySubmit");
  button.disabled = true;
  setText("activitySubmit", "Submitting...");
  try {
    const request = await state.provider.createActivity(state.activityDraft);
    const pending = await state.provider.refreshPending();
    state.payload.changeRequests = pending.changeRequests;
    state.payload.changeRequestPageInfo.nextCursor = pending.nextCursor;
    byId("requestPreview").hidden = true;
    byId("activityResult").hidden = false;
    byId("activityResult").innerHTML = `ChangeRequest <strong>${escapeHtml(request.id)}</strong> is ready for review.`;
    byId("activityBack").hidden = true;
    byId("activitySubmit").hidden = true;
    byId("activityCancel").textContent = "Close";
    renderMetrics();
  } catch (error) {
    byId("activityResult").hidden = false;
    setText("activityResult", humanError(error));
  } finally {
    button.disabled = false;
    setText("activitySubmit", "Submit ChangeRequest");
  }
}

function switchContext({ screen = state.screen, tab = state.directoryTab }) {
  state.screen = screen;
  state.directoryTab = tab;
  state.selectedRecordId = null;
  state.query = "";
  state.filter = "";
  state.querySequence += 1;
  byId("searchInput").value = "";
  setMobileSidebar(false);
  setMobileDetail(false);
  window.location.hash = screen === "activities" ? "#/activities" : `#/directory/${tab}`;
  render();
}

byId("mainNav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-screen]");
  if (button) switchContext({ screen: button.dataset.screen });
});
byId("directoryTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-directory-tab]");
  if (button) switchContext({ screen: "directory", tab: button.dataset.directoryTab });
});
byId("recordList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-record]");
  if (!button) return;
  state.selectedRecordId = button.dataset.record;
  setMobileDetail(true);
  renderList();
  renderDetail();
});
byId("searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  queueQuery();
});
byId("recordFilter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  queueQuery();
});
byId("loadMore").addEventListener("click", loadMore);
byId("backButton").addEventListener("click", () => {
  state.selectedRecordId = null;
  setMobileDetail(false);
  renderList();
  renderDetail();
});
byId("sidebarOpen").addEventListener("click", () => setMobileSidebar(true));
byId("sidebarClose").addEventListener("click", () => setMobileSidebar(false));
byId("sidebarScrim").addEventListener("click", () => setMobileSidebar(false));

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
byId("activityForm").addEventListener("submit", reviewActivity);
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

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!byId("activityModal").hidden) closeActivityModal();
  else if (!byId("settingsModal").hidden) setSettings(false);
  else setMobileSidebar(false);
});
window.addEventListener("resize", () => {
  if (!window.matchMedia("(max-width: 720px)").matches) {
    setMobileSidebar(false);
    setMobileDetail(false);
  }
});

load();
