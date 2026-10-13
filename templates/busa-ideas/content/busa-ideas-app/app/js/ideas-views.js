import {
  ATTENTION_STATES,
  attentionBadge,
  clarityBar,
  DETAIL_MODES,
  date,
  els,
  enumLabel,
  escapeHtml,
  filteredIdeas,
  ideaById,
  ideaUrl,
  ideas,
  isPartial,
  loadState,
  lockBanner,
  noticeBanner,
  pageCount,
  render,
  setRoute,
  stageBadge,
  state,
  t,
  viewLabel,
  warnings,
} from "../app.js";
import { DOC_KINDS, STAGES } from "./ideas-model.js?v=0.2.0";
import { hydrateDocumentVisuals, renderMarkdownDocument } from "./markdown-renderer.js?v=0.2.0";
import { getProvider } from "./providers/index.js?v=0.2.0";

const DOC_TABS = ["overview", "questions", ...DOC_KINDS];

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function docStatusBadge(doc) {
  return `<span class="badge ${doc.status === "已完善" ? "ok" : "draft"}">${escapeHtml(enumLabel(doc.status, "docStatus"))}</span>`;
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries waiting-on-you,
// ready-to-advance and the idea total). They are counted from the loaded page
// and say so when more ideas exist than are loaded.
function metricsBand() {
  const loaded = ideas();
  const openQuestions = loaded.reduce((sum, idea) => sum + (idea.open_questions || 0), 0);
  const settledDocs = loaded.reduce(
    (sum, idea) => sum + DOC_KINDS.filter((kind) => idea.documents[kind]?.status === "已完善").length,
    0,
  );
  const atPrd = loaded.filter((idea) => idea.stage === "prd").length;
  const plus = isPartial("ideas") ? "+" : "";
  return [
    [t("metricOpenQuestions"), openQuestions],
    [t("metricSettledDocs"), settledDocs],
    [t("metricAtPrd"), atPrd],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}${plus}</strong></div>`)
    .join("");
}

// The first screen answers "what do I need to do?" -- it leads with the ideas
// waiting on the operator, not with a data dashboard.
export function renderOverview() {
  document.getElementById("overviewSummary").textContent = t("overviewLead");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const all = ideas();
  const needsAnswer = all.filter((item) => item.attention === "needs_answer");
  const ready = all.filter((item) => item.attention === "ready_for_agent");
  const parked = all.filter((item) => item.attention === "parked");

  const ideaLink = (idea, meta) => `
    <a class="due-row" href="${ideaUrl(idea.record_id)}">
      <span>
        <strong>${escapeHtml(idea.title)}</strong>
        <small>${escapeHtml(idea.one_liner || t("noOneLiner"))}</small>
      </span>
      <span class="due-meta">${stageBadge(idea.stage)}<small>${escapeHtml(meta)}</small></span>
    </a>
  `;

  document.getElementById("overviewBody").innerHTML = `
    ${lockBanner()}
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("panelNeedsAnswer")}</h2>
        ${
          needsAnswer
            .map((idea) =>
              ideaLink(
                idea,
                idea.open_questions
                  ? t("openQuestionsCount").replace("{count}", String(idea.open_questions))
                  : t("missingFields"),
              ),
            )
            .join("") || `<div class="empty-inline">${t("nothingToAnswer")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("panelReady")}</h2>
        ${
          ready
            .map((idea) =>
              ideaLink(idea, t("readyFor").replace("{stage}", t(`stage_${idea.advance.target || idea.stage}`))),
            )
            .join("") || `<div class="empty-inline">${t("nothingReady")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("panelParked")}</h2>
        ${
          parked.map((idea) => ideaLink(idea, t("attention_parked"))).join("") ||
          `<div class="empty-inline">${t("nothingParked")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
function ideasTable(items) {
  return `
    <table class="ws-table ideas-table">
      ${tableHead([
        [t("colIdea")],
        [t("colAttention")],
        [t("colStage")],
        [t("field_one_liner")],
        [t("clarity"), "ws-col-num"],
        [t("colOpenQuestions"), "ws-col-num"],
        [t("colUpdated")],
      ])}
      <tbody>
        ${items
          .map((idea) => {
            const clarity = Math.max(0, Math.min(100, Number(idea.clarity) || 0));
            return `${rowOpen(idea.record_id)}
              ${cell(`<span class="strong">${escapeHtml(idea.title)}</span>`, idea.title)}
              ${cell(attentionBadge(idea))}
              ${cell(stageBadge(idea.stage))}
              ${cell(idea.one_liner ? escapeHtml(idea.one_liner) : `<span class="muted">${t("noOneLiner")}</span>`, idea.one_liner)}
              ${cell(`<span class="mini-clarity" aria-hidden="true"><span style="width:${clarity}%"></span></span>${clarity}`, "", "ws-col-num")}
              ${cell(idea.open_questions ? String(idea.open_questions) : `<span class="muted">0</span>`, "", "ws-col-num")}
              ${cell(date(idea.updated_at || idea.created_at))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// One row per idea that has this kind of document; the row key is the idea.
function documentsTable(kind, items) {
  return `
    <table class="ws-table documents-table">
      ${tableHead([[t("colIdea")], [t("colStatus")], [t("colVersion"), "ws-col-num"], [t("colGaps"), "ws-col-num"], [t("colUpdated")]])}
      <tbody>
        ${items
          .map((idea) => {
            const doc = idea.documents[kind];
            return `${rowOpen(idea.record_id)}
              ${cell(`<span class="strong">${escapeHtml(idea.title)}</span>`, idea.title)}
              ${cell(docStatusBadge(doc))}
              ${cell(`v${doc.version}`, "", "ws-col-num")}
              ${cell(doc.gaps.length ? String(doc.gaps.length) : `<span class="muted">0</span>`, "", "ws-col-num")}
              ${cell(date(doc.updated_at))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// Prev / Next only. Each click is one request for a neighbouring page with a
// cursor already in hand; the total comes from records.count.
function pagerControl(key) {
  const cursors = state.pageCursors[key];
  if (!cursors) return "";
  const total = pageCount(key);
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const loading = Boolean(state.pageLoading[key]);
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function attentionFilters() {
  const loaded = filteredIdeas({ attention: "all" });
  const count = (value) => (value === "all" ? loaded.length : loaded.filter((idea) => idea.attention === value).length);
  const label = (value) => (value === "all" ? t("all") : t(`attention_${value}`));
  els.viewFilters.innerHTML = ATTENTION_STATES.map(
    (value) =>
      `<button type="button" class="segment ${state.route.attention === value ? "active" : ""}" data-attention="${value}">${escapeHtml(label(value))} <b>${count(value)}</b></button>`,
  ).join("");
  els.attentionSelect.innerHTML = ATTENTION_STATES.map(
    (value) =>
      `<option value="${value}"${state.route.attention === value ? " selected" : ""}>${escapeHtml(label(value))} (${count(value)})</option>`,
  ).join("");
}

export function renderRecordView() {
  const { view } = state.route;
  const isIdeas = view === "ideas";
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = isIdeas ? t("ideasHint") : t(`docHint_${view}`);
  const items = isIdeas ? filteredIdeas() : filteredIdeas({ attention: "all" }).filter((idea) => idea.documents[view]);
  els.viewCount.textContent = `${items.length}${isPartial("ideas") ? "+" : ""}`;
  // The attention filter narrows the list; on an idea's own page it has nothing to narrow.
  const showFilters = isIdeas && !state.route.id;
  els.viewFilters.hidden = !showFilters;
  els.attentionSelect.hidden = !showFilters;
  if (showFilters) attentionFilters();
  const banners = `${lockBanner()}${noticeBanner()}${warnings()}`;
  els.viewBanners.innerHTML = banners;
  els.viewBanners.hidden = !banners;

  const empty = state.route.query
    ? emptyState(t("noMatches"))
    : emptyState(isIdeas ? t("noIdeas") : t("noDocsOfKind").replace("{kind}", view.toUpperCase()));
  const table = isIdeas ? ideasTable(items) : documentsTable(view, items);
  els.listPanel.innerHTML = `${items.length ? table : empty}${isIdeas ? pagerControl("ideas") : ""}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId && DOC_KINDS.includes(view)) els.detailExpand.href = ideaUrl(selectedId, view);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML =
      DETAIL_MODES[view] === "split"
        ? `<div class="ws-detail-empty">${escapeHtml(t("selectDocument").replace("{kind}", view.toUpperCase()))}</div>`
        : "";
    return;
  }
  const idea = ideaById(selectedId);
  if (!idea) {
    els.detailBody.innerHTML = emptyState(t("ideaNotFound"));
    return;
  }
  if (view === "ideas") renderIdeaPage(idea);
  else {
    els.detailBody.innerHTML = `
      <header class="detail-head"><h2>${escapeHtml(idea.title)}</h2></header>
      ${documentTab(idea, view)}
    `;
  }
  void hydrateDocumentVisuals(els.detailBody);
}

function questionCard(question) {
  const answered = question.status === "answered";
  const skipped = question.status === "skipped";
  const pending = state.settings?.pendingAnswers?.includes(question.record_id);
  const stateClass = answered ? "answered" : skipped ? "skipped" : "open";
  const why = question.why_asking ? `<p class="question-why">${escapeHtml(question.why_asking)}</p>` : "";
  const body = answered
    ? `<blockquote class="question-answer">${escapeHtml(question.answer)}</blockquote>`
    : skipped
      ? `<p class="muted">${t("questionSkipped")}</p>`
      : pending
        ? `<p class="muted">${t("requiredAnswerPending")}</p>`
      : `
        <textarea class="question-input" data-answer-for="${escapeHtml(question.record_id)}"
          rows="3" placeholder="${t("answerPlaceholder")}">${escapeHtml(state.settings?.pendingDrafts?.[question.record_id] || question.answer)}</textarea>
        ${question.recovery ? `<p class="muted">${t("requiredAnswerRejected")}</p>` :
          state.settings?.pendingDrafts?.[question.record_id] ? `<p class="muted">${t("requiredAnswerPartialPending")}</p>` : ""}
        <div class="question-actions">
          <button type="button" class="btn primary" data-answer="${escapeHtml(question.record_id)}">${t("submitAnswer")}</button>
          ${question.target_field ? "" : `<button type="button" class="btn quiet" data-skip="${escapeHtml(question.record_id)}">${t("skipQuestion")}</button>`}
        </div>
      `;
  return `
    <li class="question ${stateClass}">
      <div class="question-head">
        <span class="badge stage">${t(`stage_${question.stage}`)}</span>
        <span class="question-text">${escapeHtml(question.generated ? t(`requiredQuestion_${question.target_field}`) : question.question)}</span>
      </div>
      ${why}
      ${body}
    </li>
  `;
}

function overviewTab(idea) {
  const field = (label, value) =>
    `<div class="field"><dt>${label}</dt><dd>${value ? escapeHtml(value) : `<span class="muted">${t("notAnswered")}</span>`}</dd></div>`;
  const advance = idea.advance;
  let gate = "";
  if (advance.reason === "complete") {
    gate = `<div class="gate done">${t("gateComplete")}</div>`;
  } else if (advance.reason === "parked") {
    gate = `<div class="gate parked">${t("gateParked")}</div>`;
  } else if (advance.canAdvance) {
    gate = `
      <div class="gate ready">
        <p>${t("gateReady").replace("{stage}", t(`stage_${advance.target}`))}</p>
        <button type="button" class="btn primary" data-advance="${escapeHtml(idea.record_id)}">
          ${t("advanceTo").replace("{stage}", t(`stage_${advance.target}`))}
        </button>
      </div>
    `;
  } else {
    const blockers = advance.missingFields.length
      ? advance.missingFields.map((f) => t(`field_${f}`)).join("、")
      : t("openQuestionsCount").replace("{count}", String(advance.openQuestions.length));
    const answerLink = advance.missingFields.length
      ? `<a data-tab href="${ideaUrl(idea.record_id, "questions")}">${t("answerRequiredQuestions")}</a>`
      : "";
    gate = `<div class="gate blocked"><p>${t("gateBlocked").replace("{blockers}", escapeHtml(blockers))}</p>${answerLink}</div>`;
  }
  return `
    ${gate}
    <dl class="fields">
      ${field(t("field_one_liner"), idea.one_liner)}
      ${field(t("field_who"), idea.who)}
      ${field(t("field_problem"), idea.problem)}
      ${field(t("field_why_now"), idea.why_now)}
    </dl>
    ${idea.notes ? `<section class="notes"><h3>${t("notes")}</h3><p>${escapeHtml(idea.notes)}</p></section>` : ""}
  `;
}

function documentTab(idea, kind) {
  const doc = idea.documents[kind];
  if (!doc) {
    const reachable = STAGES.indexOf(idea.stage) >= STAGES.indexOf(kind);
    return `<div class="empty">${reachable ? t("docNotWritten") : t("docLocked").replace("{stage}", t(`stage_${kind}`))}</div>`;
  }
  const gaps = doc.gaps.length
    ? `<div class="gaps"><h4>${t("gaps")}</h4><ul>${doc.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul></div>`
    : "";
  return `
    <div class="doc">
      <div class="doc-head">
        ${docStatusBadge(doc)}
        <span class="muted">v${doc.version} · ${date(doc.updated_at)}</span>
      </div>
      ${gaps}
      <article class="doc-body">${renderMarkdownDocument(doc.body)}</article>
    </div>
  `;
}

// The idea's own page: its gate, the questions waiting on the operator, and
// the three documents, one tab each. Tabs replace the history entry (see
// bindDetailEvents) so Back to list is one step, however many tabs were read.
function renderIdeaPage(idea) {
  const tab = DOC_TABS.includes(state.route.tab) ? state.route.tab : "overview";
  const openCount = idea.questions.filter((q) => q.status === "open").length;
  const tabs = DOC_TABS.map((key) => {
    const label = key === "overview" ? t("tabOverview") : key === "questions" ? t("tabQuestions") : key.toUpperCase();
    const badge = key === "questions" && openCount ? `<span class="tab-badge">${openCount}</span>` : "";
    return `<a class="tab ${key === tab ? "active" : ""}" data-tab href="${ideaUrl(idea.record_id, key === "overview" ? "" : key)}">${label}${badge}</a>`;
  }).join("");

  let body;
  if (tab === "overview") body = overviewTab(idea);
  else if (tab === "questions") {
    body = idea.questions.length
      ? `<ul class="questions">${idea.questions.map(questionCard).join("")}</ul>`
      : `<div class="empty">${t("noQuestions")}</div>`;
  } else body = documentTab(idea, tab);

  els.detailBody.innerHTML = `
    <header class="detail-head">
      <div class="detail-title">
        <h2>${escapeHtml(idea.title)}</h2>
        <p>${escapeHtml(idea.one_liner || t("noOneLiner"))}</p>
      </div>
      <div class="detail-meta">
        <div class="detail-badges">${stageBadge(idea.stage)}${attentionBadge(idea)}</div>
        ${clarityBar(idea)}
      </div>
    </header>
    <nav class="tabs">${tabs}</nav>
    <div class="tab-body">${body}</div>
  `;
}

// Delegated once on the detail panel: answer / skip / advance, and tabs.
export function bindDetailEvents() {
  els.detailBody.addEventListener("click", (event) => {
    const tabLink = event.target.closest("a[data-tab]");
    if (tabLink) {
      event.preventDefault();
      history.replaceState(history.state, "", tabLink.getAttribute("href"));
      setRoute();
      return;
    }
    const answerButton = event.target.closest("[data-answer]");
    if (answerButton) {
      void submitAnswer(answerButton.dataset.answer);
      return;
    }
    const skipButton = event.target.closest("[data-skip]");
    if (skipButton) {
      void applyAndReload({ action: "skip", question_id: skipButton.dataset.skip });
      return;
    }
    const advanceButton = event.target.closest("[data-advance]");
    if (advanceButton) void applyAndReload({ action: "advance", idea_id: advanceButton.dataset.advance });
  });
}

async function submitAnswer(id) {
  const input = els.detailBody.querySelector(`[data-answer-for="${CSS.escape(id)}"]`);
  const answer = String(input?.value || "").trim();
  const question = ideaById(state.route.id)?.questions.find((item) => item.record_id === id);
  if (!answer) {
    state.notice = t(question?.target_field ? "requiredAnswerEmpty" : "answerEmpty");
    render();
    return;
  }
  await applyAndReload({
    action: "answer",
    question_id: id,
    answer,
    ...(question?.recovery ? { idea_id: question.idea_id, target_field: question.target_field } : {}),
  });
}

async function applyAndReload(payload) {
  try {
    const provider = await getProvider();
    const result = await provider.applyDecision(payload);
    if (payload.action === "answer" || payload.action === "skip") {
      state.notice = result?.pending ? t("answerPendingReview") : t("answerSaved");
    }
    await loadState();
  } catch (error) {
    state.notice = String(error?.message || error);
    render();
  }
}

export function renderSettings() {
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const bases = state.settings?.resources || [];
  document.getElementById("settingsBody").innerHTML = `
    ${lockBanner()}
    <section class="settings-block">
      <h3>${t("connection")}</h3>
      <dl class="fields">
        <div class="field"><dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "")}</dd></div>
        <div class="field"><dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd></div>
      </dl>
    </section>
    <section class="settings-block">
      <h3>${t("operator")}</h3>
      <dl class="fields">
        <div class="field"><dt>${t("name")}</dt><dd>${escapeHtml(operator.name || "")}</dd></div>
        <div class="field"><dt>${t("role")}</dt><dd>${escapeHtml(operator.role || "")}</dd></div>
      </dl>
    </section>
    ${
      bases.length
        ? `<section class="settings-block"><h3>${t("resources")}</h3><ul>${bases
            .map((b) => `<li>${escapeHtml(b.name || b.key)}</li>`)
            .join("")}</ul></section>`
        : ""
    }
  `;
}
