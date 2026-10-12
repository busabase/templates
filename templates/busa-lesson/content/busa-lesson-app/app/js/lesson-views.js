import {
  CHECK_RESULTS,
  checks,
  DETAIL_MODES,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  exactCount,
  filteredChecks,
  filteredPlans,
  filteredReviewItems,
  isPartial,
  loadState,
  noticeBanner,
  pageCount,
  planById,
  planLabel,
  plans,
  recordById,
  recordUrl,
  render,
  resultBadge,
  reviewItems,
  reviewStates,
  ruleById,
  ruleName,
  rules,
  scoreCell,
  severityBadge,
  sourceBadge,
  state,
  statusBadge,
  t,
  teacherById,
  teacherName,
  teachers,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const shown = (value, suffix = "") => (value == null ? "—" : `${value}${suffix}`);
// Panels on Overview tally the loaded page; say so when more plans exist.
const scopeNote = (key) =>
  isPartial(key) ? ` <small class="muted">${escapeHtml(t("loadedScope").replace("{n}", plans().length))}</small>` : "";

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries awaiting review,
// failed checks and in revision). All three are exact records.count figures.
function metricsBand() {
  return [
    [t("plansTotal"), shown(exactCount("plans"))],
    [t("approved"), shown(exactCount("plans_approved"))],
    [t("passRate"), shown(exactCount("checks_pass_rate"), "%")],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function configOrdered(values, configured = []) {
  const collator = new Intl.Collator(document.documentElement.lang === "zh-CN" ? "zh-Hans" : "en", { numeric: true });
  return [...new Set(values)].sort((a, b) => {
    const ai = configured.indexOf(a);
    const bi = configured.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? configured.length : ai) - (bi === -1 ? configured.length : bi);
    return collator.compare(a, b);
  });
}

function coverageTable() {
  const summary = state.settings?.config_summary || {};
  const grades = configOrdered(
    plans().map((item) => item.grade),
    summary.grades,
  );
  const subjects = configOrdered(
    plans().map((item) => item.subject),
    summary.subjects,
  );
  if (!grades.length) return `<div class="empty-inline">${t("noPlans")}</div>`;
  return `
    <div class="coverage-grid">
      <table class="overview-table">
        <thead>
          <tr><th>${t("subject")}</th>${grades.map((grade) => `<th>${escapeHtml(grade)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${subjects
            .map(
              (subject) => `
            <tr>
              <td class="strong">${escapeHtml(subject)}</td>
              ${grades
                .map((grade) => {
                  const count = plans().filter((item) => item.subject === subject && item.grade === grade).length;
                  return `<td><span class="coverage-count ${count ? "" : "zero"}">${count}</span></td>`;
                })
                .join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderOverview() {
  const generated = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at).toLocaleString() : "";
  document.getElementById("overviewSummary").textContent = [
    state.snapshot?.school?.name,
    teachers().length ? `${teachers().length} ${t("teachersLower")}` : "",
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const awaiting = reviewItems()
    .filter((item) => item.status === "needs_review")
    .slice(0, 6);
  const activity = (state.snapshot?.activity_log || [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);
  const teacherRows = teachers().map((teacher) => {
    const own = plans().filter((item) => item.teacher_id === teacher.teacher_id);
    const approved = own.filter((item) => ["approved", "done"].includes(item.status)).length;
    const revision = own.filter((item) => item.status === "changes_requested").length;
    const needsReview = own.filter((item) => item.status === "needs_review").length;
    const avg = own.length
      ? Math.round(own.reduce((sum, item) => sum + Number(item.compliance_score || 0), 0) / own.length)
      : 0;
    return { teacher, own, approved, revision, needsReview, avg };
  });
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel">
        <h2>${t("coverage")}${scopeNote("plans")}</h2>
        ${coverageTable()}
      </div>
      <div class="card overview-panel">
        <h2>${t("reviewQueue")}</h2>
        ${
          awaiting
            .map((item) => {
              const plan = planById(item.plan_id);
              return `
            <a class="due-row" href="${recordUrl(item.review_id, "review")}">
              <span><strong>${escapeHtml(planLabel(item.plan_id))}</strong><small>${escapeHtml(item.compliance_summary || "")}</small></span>
              <span class="due-meta">${statusBadge(item.status)}${plan ? `<small>${scoreCell(plan.compliance_score)}</small>` : ""}</span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noReviewItems")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("teacherStatus")}${scopeNote("plans")}</h2>
        <div class="overview-table-wrap">
          <table class="overview-table">
            <thead>
              <tr><th>${t("teacher")}</th><th>${t("subject")}</th><th>${t("grades")}</th><th class="num">${t("plans")}</th><th class="num">${t("approved")}</th><th class="num">${t("inRevision")}</th><th>${t("status")}</th><th class="num">${t("avgScore")}</th></tr>
            </thead>
            <tbody>
              ${teacherRows
                .map(
                  ({ teacher, own, approved, revision, needsReview, avg }) => `
                <tr>
                  <td class="strong">${escapeHtml(teacher.name)}</td>
                  <td>${escapeHtml(teacher.subject)}</td>
                  <td>${(teacher.grades || []).map((grade) => `<span class="tag">${escapeHtml(grade)}</span>`).join(" ")}</td>
                  <td class="num">${own.length}</td>
                  <td class="num">${approved}</td>
                  <td class="num">${revision}</td>
                  <td>${statusBadge(needsReview ? "needs_review" : revision ? "changes_requested" : "done")}</td>
                  <td class="num">${scoreCell(avg)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card overview-panel overview-wide">
        <h2>${t("recentActivity")}</h2>
        ${
          activity
            .map(
              (item) => `
          <div class="activity-row">
            <span class="badge">${escapeHtml(enumLabel(item.actor, "actor"))}</span>
            <span><small>${escapeHtml(item.detail)}</small></span>
            <span class="muted">${date(item.at)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("noActivity")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = { plans: "plansHint", checks: "checksHint", review: "reviewHint" };

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function plansTable(items) {
  return `
    <table class="ws-table lesson-table plans-table">
      ${tableHead([
        [t("plan")],
        [t("subject")],
        [t("grade")],
        [t("unit")],
        [t("teacher")],
        [t("source")],
        [t("score"), "ws-col-num"],
        [t("status"), "ws-split-keep"],
        [t("lastUpdated")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const label = `${t("planRef")} #${item.ref} · ${item.title}`;
            const teacher = teacherName(item.teacher_id);
            return `${rowOpen(item.plan_id)}
              ${cell(`<span class="strong">${escapeHtml(label)}</span>`, label)}
              ${cell(escapeHtml(item.subject), item.subject)}
              ${cell(escapeHtml(item.grade), item.grade)}
              ${cell(escapeHtml(item.unit || ""), item.unit)}
              ${cell(escapeHtml(teacher), teacher)}
              ${cell(sourceBadge(item.source))}
              ${cell(scoreCell(item.compliance_score), "", "ws-col-num")}
              ${cell(statusBadge(item.status), "", "ws-split-keep")}
              ${cell(date(item.updated_at))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function checksTable(items) {
  return `
    <table class="ws-table lesson-table checks-table">
      ${tableHead([[t("plan")], [t("teacher")], [t("rule"), "ws-split-keep"], [t("severity")], [t("result"), "ws-split-keep"], [t("evidence")]])}
      <tbody>
        ${items
          .map((item) => {
            const plan = planById(item.plan_id);
            const label = planLabel(item.plan_id);
            const teacher = plan ? teacherName(plan.teacher_id) : "";
            const rule = ruleName(item.rule_id);
            return `${rowOpen(item.check_id)}
              ${cell(plan ? `<span class="strong">${escapeHtml(label)}</span>` : `<span class="muted">${escapeHtml(label)}</span>`, label)}
              ${cell(escapeHtml(teacher), teacher)}
              ${cell(escapeHtml(rule), rule, "ws-split-keep")}
              ${cell(severityBadge(item.severity))}
              ${cell(resultBadge(item.result), "", "ws-split-keep")}
              ${cell(escapeHtml(item.evidence || ""), item.evidence)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function reviewTable(items) {
  return `
    <table class="ws-table lesson-table review-table">
      ${tableHead([[t("plan")], [t("status")]])}
      <tbody>
        ${items
          .map((item) => {
            const label = planLabel(item.plan_id);
            return `${rowOpen(item.review_id)}
              ${cell(`<span class="strong">${escapeHtml(label)}</span>`, label)}
              ${cell(statusBadge(item.status))}
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
  const current = state.currentPage[key] || 1;
  const hasNext = Boolean(cursors[current]);
  if (current === 1 && !hasNext) return "";
  const total = pageCount(key);
  const loading = Boolean(state.pageLoading[key]);
  const summary =
    total == null
      ? t("pageN").replace("{current}", current)
      : t("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current));
  return `
    <div class="pager">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
      <span class="pager-summary">${escapeHtml(summary)}</span>
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${t("nextPage")}</button>
    </div>
  `;
}

function reviewFilterCounts(value) {
  return value === "all" ? reviewItems().length : reviewItems().filter((item) => item.status === value).length;
}

function renderToolbarFilters(view) {
  els.viewFilters.hidden = view !== "review";
  els.statusSelect.hidden = view !== "review";
  els.checkFilters.hidden = view !== "checks";
  if (view === "review") {
    els.viewFilters.innerHTML = reviewStates()
      .map((value) => {
        const label = value === "all" ? t("all") : enumLabel(value);
        return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${reviewFilterCounts(value)}</b></button>`;
      })
      .join("");
    els.statusSelect.innerHTML = reviewStates()
      .map(
        (value) =>
          `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("all") : enumLabel(value))} (${reviewFilterCounts(value)})</option>`,
      )
      .join("");
  } else {
    els.viewFilters.innerHTML = "";
    els.statusSelect.innerHTML = "";
  }
  if (view === "checks") {
    const option = (value, label, selected) =>
      `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
    els.checkFilters.innerHTML = `
      <select data-filter="rule" aria-label="${escapeHtml(t("rule"))}">
        ${option("all", `${t("all")} · ${t("rule")}`, state.route.rule)}
        ${rules()
          .map((rule) => option(rule.rule_id, rule.name, state.route.rule))
          .join("")}
      </select>
      <select data-filter="teacher" aria-label="${escapeHtml(t("teacher"))}">
        ${option("all", `${t("all")} · ${t("teacher")}`, state.route.teacher)}
        ${teachers()
          .map((teacher) => option(teacher.teacher_id, teacher.name, state.route.teacher))
          .join("")}
      </select>
      <select data-filter="result" aria-label="${escapeHtml(t("result"))}">
        ${option("all", `${t("all")} · ${t("result")}`, state.route.result)}
        ${CHECK_RESULTS.map((result) => option(result, enumLabel(result, "result"), state.route.result)).join("")}
      </select>
    `;
  } else {
    els.checkFilters.innerHTML = "";
  }
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = view === "plans" ? filteredPlans() : view === "checks" ? filteredChecks() : filteredReviewItems();
  const pageKey = view === "review" ? "plans" : view;
  els.viewCount.textContent = `${items.length}${isPartial(pageKey) ? "+" : ""}`;
  renderToolbarFilters(view);

  const table = view === "plans" ? plansTable(items) : view === "checks" ? checksTable(items) : reviewTable(items);
  const filtered =
    state.route.query ||
    (view === "review" && state.route.status !== "all") ||
    (view === "checks" && [state.route.rule, state.route.teacher, state.route.result].some((value) => value !== "all"));
  const empty = filtered
    ? emptyState(t("noMatches"))
    : emptyState(view === "plans" ? t("noPlans") : view === "checks" ? t("noChecks") : t("noReviewItems"));
  els.listPanel.innerHTML = `${view === "review" ? "" : warnings()}${items.length ? table : empty}${pagerControl(pageKey)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? emptyState(t("selectReview")) : "";
    return;
  }
  const item = recordById(view, selectedId);
  if (!item) {
    const pending = state.extra[view]?.has(selectedId) && state.extra[view].get(selectedId) === undefined;
    els.detailBody.innerHTML = pending
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "plans" ? planDetail(item) : view === "checks" ? checkDetail(item) : reviewDetail(item);
}

function sectionList(title, values) {
  if (!values?.length) return "";
  return `
    <div class="section-block">
      <h3>${title}</h3>
      <ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>
    </div>
  `;
}

function sectionText(title, value) {
  if (!value) return "";
  return `
    <div class="section-block">
      <h3>${title}</h3>
      <p>${escapeHtml(value)}</p>
    </div>
  `;
}

function planDetail(plan) {
  const sections = plan.sections || {};
  const planChecks = checks().filter((item) => item.plan_id === plan.plan_id);
  const teacher = teacherName(plan.teacher_id);
  const demo = Boolean(state.settings?.demo);
  // The initial value and the save target are both the plan's decision_note
  // (the same field the review queue's "Review note" textarea edits) — a
  // "revise" decision only resaves this note/draft and never changes status.
  const noteValue = state.edits[`note:${plan.plan_id}`] ?? plan.decision_note ?? "";
  const disabled = demo ? "disabled" : "";
  return `
    <header class="detail-head">
      <h2>${escapeHtml(`${t("planRef")} #${plan.ref} · ${plan.title}`)}</h2>
      <p class="muted">${escapeHtml([plan.subject, plan.grade, teacher].filter(Boolean).join(" · "))}</p>
    </header>
    ${noticeBanner()}
    ${warnings(plan.plan_id)}
    <section class="detail">
      <div class="detail-main">
        ${sectionList(t("objectives"), sections.objectives)}
        ${sectionList(t("keyPoints"), [...(sections.key_points || []), ...(sections.difficulties || [])])}
        ${sectionList(t("materials"), sections.materials)}
        ${
          sections.stages?.length
            ? `
          <div class="section-block">
            <h3>${t("lessonFlow")}</h3>
            <table class="stage-table">
              <thead><tr><th>${t("stage")}</th><th class="num">${t("minutes")}</th><th>${t("activities")}</th></tr></thead>
              <tbody>
                ${sections.stages
                  .map(
                    (item) => `
                  <tr>
                    <td class="strong">${escapeHtml(item.name)}</td>
                    <td class="num">${Number(item.minutes || 0) || "—"}</td>
                    <td>${escapeHtml(item.activities || "")}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
            : ""
        }
        ${sectionText(t("boardPlan"), sections.board_plan)}
        ${sectionText(t("homework"), sections.homework)}
        ${sectionText(t("safetyNotes"), sections.safety_notes)}
        ${sectionText(t("reflection"), sections.reflection)}
        ${sectionList(t("curriculumRefs"), sections.curriculum_refs)}
      </div>
      <aside class="card detail-side">
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(plan.status)}</dd>
          <dt>${t("score")}</dt><dd>${scoreCell(plan.compliance_score)}</dd>
          <dt>${t("source")}</dt><dd>${sourceBadge(plan.source)}</dd>
          <dt>${t("teacher")}</dt><dd>${escapeHtml(teacher)}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(plan.unit || "")}</dd>
          <dt>${t("duration")}</dt><dd>${plan.duration_minutes || 0} / ${plan.class_length_minutes || 45} ${t("min")}</dd>
          <dt>${t("lastUpdated")}</dt><dd>${date(plan.updated_at)}</dd>
        </dl>
        <div>
          <h3>${t("complianceChecks")}</h3>
          ${
            planChecks
              .map(
                (item) => `
            <a class="check-row" href="${recordUrl(item.check_id, "checks")}">
              ${resultBadge(item.result)}
              <span>
                <strong>${escapeHtml(ruleName(item.rule_id))}</strong>
                <small>${escapeHtml(item.evidence || "")}</small>
              </span>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
          }
        </div>
        <div class="notes-panel" data-plan-note="${escapeHtml(plan.plan_id)}">
          <h3>${t("editNotes")}</h3>
          <textarea data-field="note" rows="3" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(noteValue)}</textarea>
          <div class="notes-actions">
            <button type="button" class="button" data-action="revise" ${disabled}>${t("saveNote")}</button>
            <span class="muted">${t("notesHint")}</span>
          </div>
        </div>
      </aside>
    </section>
  `;
}

function checkDetail(item) {
  const plan = planById(item.plan_id);
  const rule = ruleById(item.rule_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(ruleName(item.rule_id))}</h2>
      <p class="muted">${escapeHtml(planLabel(item.plan_id))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("result")}</dt><dd>${resultBadge(item.result)}</dd>
        <dt>${t("severity")}</dt><dd>${severityBadge(item.severity)}</dd>
        ${rule?.type ? `<dt>${t("typeLabel")}</dt><dd>${escapeHtml(enumLabel(rule.type, "type"))}</dd>` : ""}
        <dt>${t("plan")}</dt><dd>${plan ? `<a href="${detailUrl(plan.plan_id, "plans")}">${escapeHtml(planLabel(plan.plan_id))}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
        ${plan ? `<dt>${t("teacher")}</dt><dd>${escapeHtml(teacherName(plan.teacher_id))}</dd>` : ""}
        ${plan ? `<dt>${t("score")}</dt><dd>${scoreCell(plan.compliance_score)}</dd>` : ""}
        ${item.judged_by ? `<dt>${t("judgedBy")}</dt><dd>${escapeHtml(enumLabel(item.judged_by, "actor"))}</dd>` : ""}
        ${item.checked_at ? `<dt>${t("checkedAt")}</dt><dd>${date(item.checked_at)}</dd>` : ""}
      </dl>
      <section>
        <h3>${t("evidence")}</h3>
        <p class="detail-text">${escapeHtml(item.evidence || "—")}</p>
      </section>
    </div>
  `;
}

function reviewDetail(item) {
  const plan = planById(item.plan_id);
  const teacher = plan ? teacherName(plan.teacher_id) : "";
  const edits = state.edits[item.review_id] || {};
  const draft = edits.draft ?? plan?.feedback_draft ?? item.feedback_draft ?? "";
  const note = edits.note ?? plan?.decision_note ?? "";
  const disabled = state.settings?.demo ? "disabled" : "";
  const id = escapeHtml(item.review_id);
  return `
    <article class="review-detail status-${escapeHtml(item.status)}" data-review="${id}">
      <header class="queue-head">
        <span class="queue-ref">${t("planRef")} #${item.ref}</span>
        ${statusBadge(item.status)}
        ${plan ? sourceBadge(plan.source) : ""}
        ${plan ? `<span class="queue-score muted">${t("score")} ${scoreCell(plan.compliance_score)}</span>` : ""}
      </header>
      <h2 class="queue-subject">${plan ? `<a href="${detailUrl(plan.plan_id, "plans")}">${escapeHtml(plan.title)}</a>` : escapeHtml(t("notLoaded"))}</h2>
      ${plan ? `<div class="queue-meta">${escapeHtml([plan.subject, plan.grade, teacher].filter(Boolean).join(" · "))}</div>` : ""}
      ${warnings(item.plan_id)}
      ${item.compliance_summary ? `<p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary)}</p>` : ""}
      ${
        item.suggestions?.length
          ? `
        <span class="queue-label">${t("suggestions")}</span>
        <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      `
          : ""
      }
      <label class="queue-label" for="draft-${id}">${t("feedbackDraft")}</label>
      <textarea id="draft-${id}" class="queue-draft" data-field="draft" rows="9" ${disabled}>${escapeHtml(draft)}</textarea>
      <label class="queue-label" for="note-${id}">${t("reviewNote")}</label>
      <textarea id="note-${id}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${plan?.decision_action ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(plan.decision_action, "action"))} · ${escapeHtml(plan.decided_at ? new Date(plan.decided_at).toLocaleString() : "")}</span>` : ""}
      </div>
    </article>
  `;
}

export async function submitDecision(planId, action, { comment = "", draft } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.decidePlan({ plan_id: planId, action, note: comment, draft });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : `Decision failed: ${action}`;
    render();
    return;
  }
  delete state.edits[planId];
  delete state.edits[`note:${planId}`];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const school = summary.school || {};
  const exportPrefs = summary.export || {};
  const feedback = summary.feedback || {};
  document.getElementById("settingsBody").innerHTML = `
    <div class="settings">
      <section class="card">
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("school")}</h2>
        <dl>
          <dt>${t("schoolName")}</dt><dd>${escapeHtml(school.name || "")}</dd>
          <dt>${t("kind")}</dt><dd>${escapeHtml(enumLabel(school.kind, "kind"))}</dd>
          <dt>${t("term")}</dt><dd>${escapeHtml(school.term || "")}</dd>
          <dt>${t("classLength")}</dt><dd>${school.class_length_minutes || 45} ${t("min")}</dd>
        </dl>
        <div class="chip-list">${(summary.subjects || []).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("")}</div>
        <div class="chip-list">${(summary.grades || []).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("")}</div>
      </section>
      <section class="card">
        <h2>${t("templateSections")}</h2>
        ${
          (summary.template_sections || [])
            .map(
              (section) => `
          <div class="settings-row">
            <strong>${escapeHtml(section.label)}</strong>
            <span class="muted">${escapeHtml(section.key)}</span>
            <span>${section.required ? `<span class="tag">${t("required")}</span>` : ""}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("complianceRules")}</h2>
        ${
          (summary.compliance_rules || [])
            .map(
              (rule) => `
          <div class="settings-row">
            <strong>${escapeHtml(rule.name)}</strong>
            <span>${severityBadge(rule.severity)}</span>
            <span class="muted">${escapeHtml(enumLabel(rule.type, "type"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
          <dt>${t("docxViaAgent")}</dt><dd>${exportPrefs.docx_via_agent ? t("yes") : t("no")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("feedbackHandoff")}</h2>
        <dl>
          <dt>${t("handoffSkill")}</dt><dd>${escapeHtml(feedback.handoff_skill || "")}</dd>
          <dt>${t("requiresApproval")}</dt><dd>${feedback.requires_approval ? t("yes") : t("no")}</dd>
        </dl>
      </section>
    </div>
  `;
}
