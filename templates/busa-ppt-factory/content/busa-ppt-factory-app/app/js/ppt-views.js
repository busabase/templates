import {
  checks,
  DETAIL_MODES,
  date,
  deckById,
  decks,
  detailUrl,
  els,
  escapeHtml,
  exportsList,
  isPartial,
  label,
  loadState,
  projectById,
  projects,
  recordById,
  recordUrl,
  render,
  resultBadge,
  reviewTarget,
  reviews,
  slideById,
  slides,
  snapshot,
  state,
  statusBadge,
  styleSystems,
  t,
  VIEW_BASES,
  viewLabel,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const text = (value) => cell(escapeHtml(value ?? ""), value ?? "");
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const muted = (value) => `<span class="muted">${escapeHtml(value)}</span>`;
// A relation is a business id. Show the target's name; when it is not on the
// loaded page say so — never print the id.
const relationName = (record, id, field = "title") => (record ? record[field] : id ? t("notLoaded") : "");

function matches(values) {
  const query = state.route.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav and the attention block do not already show. The
// average style score has no server aggregate over a text-typed Base, so it is
// computed from the loaded decks and says so when more decks exist.
function metricsBand() {
  const metrics = snapshot().metrics || {};
  const loaded = decks();
  const scores = loaded.map((item) => Number(item.style_score) || 0);
  const avg = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const scope = isPartial("decks") ? ` · ${t("loadedOnly").replace("{n}", loaded.length)}` : "";
  return [
    [t("decksGenerated"), metrics.decks_generated ?? "—"],
    [t("qaOpen"), metrics.qa_warnings ?? "—"],
    [t("avgStyleScore") + scope, avg ?? "—"],
  ]
    .map(([name, value]) => `<div><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

export function renderOverview() {
  document.getElementById("overviewSummary").textContent = [t("subtitle"), state.data?.demo ? t("demoData") : ""]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();

  const queue = reviews()
    .filter((item) => ["needs_review", "changes_requested"].includes(item.status))
    .slice(0, 5);
  const activity = (snapshot().activity_log || []).slice(0, 6);
  const warnings = (snapshot().warnings || []).slice(0, 5);
  const targetLink = (id) => {
    if (slideById(id)) return [recordUrl(id, "slides"), slideById(id).title];
    if (deckById(id)) return [detailUrl(id, "decks"), deckById(id).title];
    return ["", ""];
  };
  document.getElementById("overviewBody").innerHTML = `
    <section class="overview-grid">
      <div class="card overview-panel">
        <div class="card-heading"><h2>${t("humanQueue")}</h2><a class="small-link" href="#/review">${t("viewAll")}</a></div>
        ${
          queue
            .map((item) => {
              const target = reviewTarget(item);
              return `<a class="due-row" href="${recordUrl(item.review_id, "review")}">
                <span><strong>${escapeHtml(relationName(target, item.target_id))}</strong><small>${escapeHtml(item.summary)}</small></span>
                <span class="due-meta">${statusBadge(item.status)}<small>${escapeHtml(label("kindValue", item.target_type))}</small></span>
              </a>`;
            })
            .join("") || `<div class="empty-inline">${t("queueClear")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <div class="card-heading"><h2>${t("qaWarnings")}</h2></div>
        ${
          warnings
            .map((item) => {
              const [href, title] = targetLink(item.target_id);
              const body = `<span><strong>${escapeHtml(item.message)}</strong><small>${escapeHtml(title || item.detail)}</small></span>
                <span class="due-meta">${resultBadge(item.severity === "error" ? "fail" : "warn")}</span>`;
              return href ? `<a class="due-row" href="${href}">${body}</a>` : `<div class="due-row">${body}</div>`;
            })
            .join("") || `<div class="empty-inline">${t("noWarnings")}</div>`
        }
      </div>
      <div class="card overview-panel overview-wide">
        <div class="card-heading"><h2>${t("recentActivity")}</h2></div>
        ${
          activity
            .map((item) => {
              const [href, title] = targetLink(item.target_id);
              return `<a class="activity-row" href="${href || "#/review"}">
                <span class="badge">${escapeHtml(label("action", item.action))}</span>
                <span><strong>${escapeHtml(title || t("notLoaded"))}</strong><small>${escapeHtml(item.note || "")}</small></span>
                <span class="muted">${date(item.at)}</span>
              </a>`;
            })
            .join("") || `<div class="empty-inline">${t("noActivity")}</div>`
        }
      </div>
    </section>
  `;
}

// ── Record views ───────────────────────────────────────────────────────────
const VIEW_HINT = {
  projects: "projectsHint",
  decks: "decksHint",
  slides: "slidesHint",
  review: "reviewHint",
  style: "styleHint",
  exports: "exportsHint",
};

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([name, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(name)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

const strong = (value) => cell(`<span class="strong">${escapeHtml(value || "")}</span>`, value);

function filteredProjects() {
  return projects().filter((item) => matches([item.title, item.course, item.stage, item.owner, item.status]));
}
function filteredDecks() {
  return decks().filter((item) =>
    matches([item.title, item.theme, item.level, item.status, projectById(item.project_id)?.title]),
  );
}
function filteredSlides() {
  return slides().filter((item) =>
    matches([item.title, item.objective, item.slide_type, item.layout, item.status, deckById(item.deck_id)?.title]),
  );
}
function filteredReviews() {
  return reviews().filter((item) =>
    matches([item.summary, item.draft_note, reviewTarget(item)?.title, item.target_type, item.status]),
  );
}
function filteredStyles() {
  return styleSystems().filter((item) => matches([item.name, ...(item.component_library || [])]));
}
function filteredExports() {
  return exportsList().filter((item) => matches([item.path, item.qa_summary, item.status, deckById(item.deck_id)?.title]));
}

const TABLES = {
  projects: {
    rows: filteredProjects,
    id: "project_id",
    head: () => [
      [t("project")],
      [t("useCase")],
      [t("stageLabel")],
      [t("decks"), "ws-col-num"],
      [t("slides"), "ws-col-num"],
      [t("due"), "ppt-col-date"],
      [t("status"), "ppt-col-status"],
    ],
    row: (item) => `${strong(item.title)}
      ${text(item.course)}
      ${text(label("stage", item.stage))}
      ${cell(escapeHtml(item.deck_count), "", "ws-col-num")}
      ${cell(escapeHtml(item.slide_count), "", "ws-col-num")}
      ${text(date(item.due_at, false))}
      ${cell(statusBadge(item.status))}`,
  },
  decks: {
    rows: filteredDecks,
    id: "deck_id",
    head: () => [
      [t("deck")],
      [t("project"), "ws-col-wide"],
      [t("theme")],
      [t("approved"), "ws-col-num"],
      [t("styleScore"), "ws-col-num"],
      [t("status"), "ppt-col-status"],
    ],
    row: (item) => `${strong(item.title)}
      ${text(relationName(projectById(item.project_id), item.project_id))}
      ${text(item.theme)}
      ${cell(`${escapeHtml(item.approved_slide_count)}/${escapeHtml(item.target_slide_count)}`, "", "ws-col-num")}
      ${cell(escapeHtml(item.style_score), "", "ws-col-num")}
      ${cell(statusBadge(item.status))}`,
  },
  slides: {
    rows: filteredSlides,
    id: "slide_id",
    head: () => [[t("slideCards")], [t("deck"), "ws-col-wide"], [t("slideType")], [t("layout"), "ws-col-wide"], [t("status"), "ppt-col-status"]],
    row: (item) => `${strong(item.title)}
      ${text(relationName(deckById(item.deck_id), item.deck_id))}
      ${text(label("type", item.slide_type))}
      ${text(item.layout)}
      ${cell(statusBadge(item.status))}`,
  },
  // The split queue shows the first two columns beside the record; the rest
  // appear when it is opened as a plain list on a wide screen.
  review: {
    rows: filteredReviews,
    id: "review_id",
    head: () => [[t("target")], [t("status")], [t("kind")], [t("summary"), "ws-col-wide"]],
    row: (item) => `${strong(relationName(reviewTarget(item), item.target_id))}
      ${cell(statusBadge(item.status))}
      ${text(label("kindValue", item.target_type))}
      ${text(item.summary)}`,
  },
  style: {
    rows: filteredStyles,
    id: "style_system_id",
    head: () => [[t("name")], [t("palette"), "ws-col-wide"], [t("fonts"), "ws-col-wide"], [t("components"), "ws-col-num"]],
    row: (item) => `${strong(item.name)}
      ${cell(`<span class="swatch-row">${(item.palette || []).map((color) => `<i style="--swatch:${escapeHtml(color)}"></i>`).join("")}</span>`, (item.palette || []).join(" "))}
      ${text([item.fonts?.heading, item.fonts?.body, item.fonts?.chinese].filter(Boolean).join(" · "))}
      ${cell(escapeHtml((item.component_library || []).length), "", "ws-col-num")}`,
  },
  exports: {
    rows: filteredExports,
    id: "export_id",
    head: () => [[t("deck")], [t("format"), "ws-col-narrow"], [t("path"), "ws-col-wide"], [t("generatedAt"), "ppt-col-date"], [t("status"), "ppt-col-status"]],
    row: (item) => `${strong(relationName(deckById(item.deck_id), item.deck_id))}
      ${text(String(item.format || "").toUpperCase())}
      ${text(item.path)}
      ${text(date(item.generated_at) || "—")}
      ${cell(statusBadge(item.status))}`,
  },
};

function loadMoreControl(view) {
  return (VIEW_BASES[view] || [])
    .filter((key) => state.pagination[key])
    .map(
      (key) =>
        `<div class="load-more"><button type="button" class="button" data-load-more="${escapeHtml(key)}" ${state.loadingMore[key] ? "disabled" : ""}>${state.loadingMore[key] ? t("loadingMore") : t("loadMore")}</button>${state.loadMoreError[key] ? `<span role="alert">${t("loadMoreFailed")}</span>` : ""}</div>`,
    )
    .join("");
}

export function renderRecordView() {
  const { view } = state.route;
  const table = TABLES[view];
  els.viewTitle.textContent = viewLabel(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  const items = table.rows();
  els.viewCount.textContent = `${items.length}${isPartial(view) ? "+" : ""}`;
  const body = items.length
    ? `<table class="ws-table ppt-table ppt-${view}">
        ${tableHead(table.head())}
        <tbody>${items.map((item) => `${rowOpen(item[table.id])}${table.row(item)}</tr>`).join("")}</tbody>
      </table>`
    : emptyState(state.route.query ? t("noMatches") : view === "review" ? t("queueClear") : t("empty"));
  els.listPanel.innerHTML = `${body}${loadMoreControl(view)}`;
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
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectReview")}</div>` : "";
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
  const renderers = {
    projects: projectDetail,
    decks: deckDetail,
    slides: slideDetail,
    review: reviewDetail,
    style: styleDetail,
    exports: exportDetail,
  };
  els.detailBody.innerHTML = `<div class="detail-content${presentation === "page" ? " detail-page-content" : ""}">${renderers[view](item)}</div>`;
}

const head = (title, meta = []) =>
  `<header class="detail-head"><h2>${escapeHtml(title || "")}</h2>${meta.filter(Boolean).length ? `<p class="muted">${meta.filter(Boolean).map(escapeHtml).join(" · ")}</p>` : ""}</header>`;
const facts = (pairs) =>
  `<dl class="facts">${pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd>${value}</dd>`)
    .join("")}</dl>`;
function section(title, body) {
  return body ? `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>` : "";
}
function listSection(title, items = []) {
  if (!items?.length) return "";
  return `<h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}
function renderChecks(items) {
  if (!items.length) return `<p class="muted">${t("checks")}: 0</p>`;
  return `<div class="check-list">${items.map((item) => `<div>${resultBadge(item.result)}<strong>${escapeHtml(item.rule)}</strong><p>${escapeHtml(item.evidence)}</p></div>`).join("")}</div>`;
}

function projectDetail(item) {
  const projectDecks = decks().filter((deck) => deck.project_id === item.project_id);
  const brand = snapshot().brand_profiles?.find((entry) => entry.client_id === item.client_id)?.name;
  return `${head(item.title, [item.course, label("stage", item.stage)])}
    ${facts([
      [t("brand"), escapeHtml(brand || "—")],
      [t("status"), statusBadge(item.status)],
      [t("owner"), escapeHtml(item.owner)],
      [t("decks"), escapeHtml(item.deck_count)],
      [t("slides"), escapeHtml(item.slide_count)],
      [t("due"), escapeHtml(date(item.due_at, false))],
      [t("generatedAt"), escapeHtml(date(item.updated_at))],
    ])}
    <h3>${t("decks")}</h3>
    <div class="mini-list">${
      projectDecks
        .map(
          (deck) =>
            `<a href="${detailUrl(deck.deck_id, "decks")}"><span>${escapeHtml(deck.title)}</span>${statusBadge(deck.status)}</a>`,
        )
        .join("") || muted(isPartial("decks") ? t("notLoaded") : t("empty"))
    }</div>`;
}

function deckDetail(item) {
  const deckSlides = slides().filter((slide) => slide.deck_id === item.deck_id);
  const deckChecks = checks().filter((check) => check.target_id === item.deck_id);
  const project = projectById(item.project_id);
  const review = reviews().find((entry) => entry.target_type === "deck" && entry.target_id === item.deck_id);
  return `${head(item.title, [item.theme, label("level", item.level)])}
    ${facts([
      [
        t("project"),
        project
          ? `<a href="${detailUrl(project.project_id, "projects")}">${escapeHtml(project.title)}</a>`
          : muted(relationName(null, item.project_id)),
      ],
      [t("status"), statusBadge(item.status)],
      [t("slides"), `${escapeHtml(item.generated_slide_count)}/${escapeHtml(item.target_slide_count)} ${escapeHtml(t("generated"))}`],
      [t("approved"), `${escapeHtml(item.approved_slide_count)}/${escapeHtml(item.target_slide_count)}`],
      [t("avgStyleScore"), escapeHtml(item.style_score)],
      ["PPTX", escapeHtml(item.pptx_path || "")],
      [t("renderPath"), escapeHtml(item.render_path || "")],
    ])}
    ${review ? `<a class="small-link" href="${recordUrl(review.review_id, "review")}">${t("review")}</a>` : ""}
    <h3>${t("slideCards")}</h3>
    <div class="mini-list">${
      deckSlides
        .map(
          (slide) =>
            `<a href="${recordUrl(slide.slide_id, "slides")}"><span>${escapeHtml(slide.title)}</span>${statusBadge(slide.status)}</a>`,
        )
        .join("") || muted(isPartial("slides") ? t("notLoaded") : t("empty"))
    }</div>
    <h3>${t("checks")}</h3>${renderChecks(deckChecks)}`;
}

function slideDetail(item) {
  const c = item.content || {};
  const review = reviews().find((entry) => entry.target_type === "slide" && entry.target_id === item.slide_id);
  const deck = deckById(item.deck_id);
  return `${head(item.title, [label("type", item.slide_type), item.layout])}
    ${facts([
      [
        t("deck"),
        deck ? `<a href="${detailUrl(deck.deck_id, "decks")}">${escapeHtml(deck.title)}</a>` : muted(relationName(null, item.deck_id)),
      ],
      [t("status"), statusBadge(item.status)],
    ])}
    <section class="slide-preview"><h3>${escapeHtml(c.title || item.title)}</h3>${c.subtitle ? `<p>${escapeHtml(c.subtitle)}</p>` : ""}<div class="zh-line">${escapeHtml(c.chinese || "")}</div><div class="pinyin-line">${escapeHtml(c.pinyin || "")}</div><div class="en-line">${escapeHtml(c.english || "")}</div></section>
    ${section(t("summary"), item.objective)}${section(t("interaction"), c.interaction)}${section(t("teacherNotes"), c.teacher_notes)}${section(t("assetBrief"), item.asset_brief)}${listSection(t("styleChecks"), item.style_checks)}${listSection(t("qaFlags"), item.qa_flags)}
    ${review ? `<a class="small-link" href="${recordUrl(review.review_id, "review")}">${t("review")}</a>` : ""}`;
}

function reviewDetail(item) {
  const target = reviewTarget(item);
  // `||`, not `??`: an empty decision note must fall through to the agent's
  // draft note instead of hiding it.
  const note = state.edits[`review:${item.review_id}`] ?? (target?.decision_note || item.draft_note || "");
  const targetHref =
    item.target_type === "slide" ? recordUrl(item.target_id, "slides") : detailUrl(item.target_id, "decks");
  const decision = target?.decision_action
    ? `${label("action", target.decision_action)}${target.decided_at ? ` · ${date(target.decided_at)}` : ""}`
    : "";
  return `${head(relationName(target, item.target_id), [label("kindValue", item.target_type)])}
    ${facts([
      [t("target"), target ? `<a href="${targetHref}">${escapeHtml(label("kindValue", item.target_type))}</a>` : muted(t("notLoaded"))],
      [t("status"), statusBadge(item.status)],
      [t("summary"), escapeHtml(item.summary)],
      [t("decision"), escapeHtml(decision)],
    ])}
    ${listSection(t("suggestions"), item.suggestions)}
    <label class="field"><span>${t("reviewNote")}</span><textarea rows="6" data-review-note="${escapeHtml(item.review_id)}" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}">${escapeHtml(note)}</textarea></label>
    ${state.notice ? `<div class="notice-banner" role="status">${escapeHtml(state.notice)}</div>` : ""}
    <div class="action-row">
      <button type="button" class="button primary" data-action="approve" data-review="${escapeHtml(item.review_id)}">${t("approve")}</button>
      <button type="button" class="button" data-action="request_changes" data-review="${escapeHtml(item.review_id)}">${t("requestChanges")}</button>
      <button type="button" class="button" data-action="revise" data-review="${escapeHtml(item.review_id)}">${t("saveRevision")}</button>
      <button type="button" class="button danger" data-action="block" data-review="${escapeHtml(item.review_id)}">${t("block")}</button>
    </div>`;
}

function styleDetail(item) {
  return `${head(item.name)}
    <h3>${t("palette")}</h3><div class="swatches">${(item.palette || []).map((color) => `<span style="--swatch:${escapeHtml(color)}"><b></b><em>${escapeHtml(color)}</em></span>`).join("")}</div>
    <h3>${t("fonts")}</h3>
    ${facts([
      ["Heading", escapeHtml(item.fonts?.heading || "")],
      ["Body", escapeHtml(item.fonts?.body || "")],
      ["CJK", escapeHtml(item.fonts?.chinese || "")],
    ])}
    ${listSection(t("visualRules"), item.visual_rules)}${listSection(t("layoutRules"), item.layout_rules)}${listSection(t("components"), item.component_library)}`;
}

function exportDetail(item) {
  const deck = deckById(item.deck_id);
  return `${head(relationName(deck, item.deck_id), [String(item.format || "").toUpperCase()])}
    ${facts([
      [t("deck"), deck ? `<a href="${detailUrl(deck.deck_id, "decks")}">${escapeHtml(deck.title)}</a>` : muted(relationName(null, item.deck_id))],
      [t("status"), statusBadge(item.status)],
      ["PPTX", escapeHtml(item.path)],
      [t("renderPath"), escapeHtml(item.render_path || deck?.render_path || "")],
      [t("generatedAt"), escapeHtml(date(item.generated_at) || "—")],
      ["QA", escapeHtml(item.qa_summary || "")],
    ])}
    <h3>${t("checks")}</h3>
    ${renderChecks(checks().filter((check) => check.target_id === item.deck_id || check.target_id === item.export_id))}`;
}

// ── Decisions ──────────────────────────────────────────────────────────────
export async function submitDecision(button) {
  const reviewId = button.dataset.review;
  const item = recordById("review", reviewId);
  if (!item) return;
  if (state.data?.demo) {
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  const note = document.querySelector(`[data-review-note="${CSS.escape(reviewId)}"]`)?.value || "";
  button.disabled = true;
  try {
    const provider = await getProvider();
    await provider.decideItem({
      targetType: item.target_type,
      id: item.target_id,
      action: button.dataset.action,
      comment: note,
      draft: note,
    });
  } catch (error) {
    state.notice = error instanceof Error ? error.message : "Could not save decision";
    render();
    return;
  }
  delete state.edits[`review:${reviewId}`];
  await loadState();
  state.notice = t("decisionSaved");
  render();
}

// ── Settings ───────────────────────────────────────────────────────────────
let lastSettingsHtml = "";
export function renderSettings() {
  const summary = state.data?.config_summary || {};
  const html = `
    <section class="card settings-card">
      <h2>${t("config")}</h2>
      ${facts([
        [t("dataProvider"), escapeHtml(state.data?.data_provider || "")],
        [t("onboarding"), escapeHtml(state.data?.onboarding?.completed ? "complete" : "pending")],
        [t("outDir"), escapeHtml(summary.export?.out_dir || "")],
        [t("renderDir"), escapeHtml(summary.export?.render_dir || "")],
        [t("requireRenderQa"), escapeHtml(String(summary.export?.require_render_qa ?? ""))],
      ])}
    </section>
    <section class="card settings-card">
      ${listSection(
        t("brand"),
        (summary.brand_profiles || []).map((item) => `${item.name} · ${item.audience}`),
      ) || `<h3>${t("brand")}</h3><p class="muted">—</p>`}
      ${listSection(
        t("styleSystem"),
        styleSystems().map((item) => item.name),
      )}
    </section>`;
  // Re-rendering identical markup would drop the accent picker that
  // accent-theme.js mounts into this container.
  if (html === lastSettingsHtml) return;
  lastSettingsHtml = html;
  document.getElementById("settingsContent").innerHTML = html;
}
