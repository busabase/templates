import {
  $,
  actionBadge,
  awaitingItems,
  countFor,
  detailUrl,
  escapeHtml,
  extraItems,
  isMobileLayout,
  isPartial,
  languageMode,
  needsTestItems,
  recordUrl,
  reloadAfterWrite,
  renderLock,
  reviewById,
  reviewStore,
  route,
  setLanguageMode,
  state,
  statusBadge,
  t,
  testedBadge,
  timeAgo,
  toast,
  VIEW_MODES,
  viewUrl,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const reportError = (error) => toast(error instanceof Error ? error.message : String(error));

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the nav does not already show. The pinned SDK has no
// records.groupBy, so line totals and the oldest age are read from the loaded
// page and say so while more reviews exist; failing checks is an exact
// records.count.
function metricsBand() {
  const awaiting = awaitingItems();
  const scope = isPartial() ? ` · ${t("metric.loaded")}` : "";
  const lines = awaiting.reduce((sum, item) => sum + item.additions + item.deletions, 0);
  const oldest = awaiting
    .map((item) => item.updated_at)
    .filter(Boolean)
    .sort()[0];
  const failing = state.failingAwaiting;
  return [
    [t("metric.failing"), failing === null || failing === undefined ? "—" : String(failing)],
    [t("metric.lines") + scope, lines.toLocaleString()],
    [t("metric.oldest") + scope, oldest ? timeAgo(oldest) : "—"],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function nextStep() {
  const approved = countFor("approved");
  const needs = countFor("needs_review") + countFor("to_approve");
  if (!state.total_cached) return { title: t("next.generate.title"), body: t("next.generate.body") };
  if (approved > 0)
    return {
      title: t("next.execute.title", { count: approved, s: approved === 1 ? "" : "s" }),
      body: t("next.execute.body"),
      cta: [t("next.cta.execute"), viewUrl("approved")],
    };
  if (needs > 0) {
    const view = countFor("needs_review") ? "needs_review" : "to_approve";
    const first = awaitingItems().find((item) => item.status === view);
    return {
      title: t("next.review.title", { count: needs, s: needs === 1 ? "" : "s" }),
      body: t("next.review.body"),
      cta: [t("next.cta.review"), first && !isMobileLayout() ? recordUrl(first.id, view) : viewUrl(view)],
    };
  }
  return { title: t("next.clear.title"), body: t("next.clear.body") };
}

function overviewRows(items, view) {
  if (!items.length) return `<div class="empty-inline">${escapeHtml(t("overview.none"))}</div>`;
  return items
    .slice(0, 6)
    .map(
      (item) => `
    <a class="overview-row" href="${escapeHtml(recordUrl(item.id, view(item)))}">
      <span class="overview-row-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.repo)} #${escapeHtml(item.number)} · ${escapeHtml(item.author || t("unknown"))}</small></span>
      <span class="overview-row-meta">${testedBadge(item) || statusBadge(item)}<small>${escapeHtml(timeAgo(item.updated_at))}</small></span>
    </a>`,
    )
    .join("");
}

export function renderOverview() {
  const batch = state.batch || {};
  const config = state.config_summary || {};
  $("batchMeta").textContent = [
    batch.batch_id && state.total_all_repos
      ? t("batch.generated", { id: batch.batch_id, time: timeAgo(batch.generated_at) })
      : t("batch.none"),
    state.total_all_repos ? t("overview.all_reviews", { count: state.total_all_repos }) : "",
    config.reviewer?.handle ? t("ready.as", { handle: config.reviewer.handle }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("overviewMetrics").innerHTML = metricsBand();
  const step = nextStep();
  $("overviewBody").innerHTML = `
    <section class="card next-step-card">
      <div>
        <h2>${escapeHtml(step.title)}</h2>
        <p>${escapeHtml(step.body)}</p>
      </div>
      ${step.cta ? `<a class="button primary" href="${escapeHtml(step.cta[1])}">${escapeHtml(step.cta[0])}</a>` : ""}
    </section>
    <section class="card overview-panel">
      <h2>${escapeHtml(t("overview.waiting"))}</h2>
      ${overviewRows(awaitingItems(), (item) => (item.status === "to_approve" ? "to_approve" : "needs_review"))}
    </section>
    <section class="card overview-panel">
      <h2>${escapeHtml(t("overview.needs_test"))}</h2>
      ${overviewRows(needsTestItems(), () => "needs_test")}
    </section>
  `;
}

// ── Record view ────────────────────────────────────────────────────────────
const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;

export function renderList() {
  const list = $("prList");
  if (!state.items.length) {
    list.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t("empty.list"))}</strong></div>${loadMoreControl()}`;
    return;
  }
  list.innerHTML = `
    <table class="ws-table pr-table">
      <thead><tr>
        <th>${escapeHtml(t("table.title"))}</th>
        <th class="ws-col-narrow status-col">${escapeHtml(t("table.status"))}</th>
        <th class="ws-col-wide">${escapeHtml(t("table.repo"))}</th>
        <th class="ws-col-narrow">${escapeHtml(t("table.author"))}</th>
        <th class="ws-col-num">${escapeHtml(t("table.changes"))}</th>
        <th class="ws-col-num">${escapeHtml(t("table.updated"))}</th>
      </tr></thead>
      <tbody>
        ${state.items
          .map((item) => {
            const ref = `${item.repo} #${item.number}`;
            return `<tr data-id="${escapeHtml(item.id)}"${item.id === route.selectedId ? ' class="ws-selected"' : ""}>
              ${cell(`<span class="pr-title">${escapeHtml(item.title)}</span>`, item.title)}
              ${cell(testedBadge(item) || statusBadge(item), "", "status-col")}
              ${cell(
                item.url
                  ? `<a class="pr-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="${escapeHtml(t("open_pr"))}">${escapeHtml(ref)} ↗</a>`
                  : escapeHtml(ref),
                ref,
              )}
              ${cell(escapeHtml(item.author || t("unknown")), item.author)}
              ${cell(`<span class="plus">+${escapeHtml(item.additions)}</span> <span class="minus">−${escapeHtml(item.deletions)}</span>`, "", "ws-col-num")}
              ${cell(escapeHtml(timeAgo(item.updated_at)), item.updated_at, "ws-col-num muted")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>${loadMoreControl()}`;
}

function loadMoreControl() {
  if (!state.pagination.reviews) return "";
  return `<div class="load-more"><button type="button" class="button" data-load-more ${state.loadingMore ? "disabled" : ""}>${escapeHtml(state.loadingMore ? t("loading_more") : t("load_more"))}</button>${state.loadMoreError ? `<span role="alert">${escapeHtml(t("load_more_failed"))}</span>` : ""}</div>`;
}

function selectedItem() {
  return reviewById(route.selectedId);
}

function riskHtml(item) {
  const risks = item.risk?.length ? item.risk : [t("normal")];
  return risks
    .map((risk) => `<span class="badge ${risk === "normal" ? "" : "warn"}">${escapeHtml(risk)}</span>`)
    .join("");
}

function filesHtml(item) {
  const files = (item.changed_files || []).slice(0, 18);
  if (!files.length) return `<span class="muted">${escapeHtml(t("no_changed_files"))}</span>`;
  const extra =
    item.changed_files.length > files.length
      ? `<span class="badge">+${item.changed_files.length - files.length} ${escapeHtml(t("more"))}</span>`
      : "";
  return `${files.map((file) => `<code>${escapeHtml(file)}</code>`).join("")}${extra}`;
}

// A Busabase text field cannot hold an uploaded screenshot, so post-merge
// verification evidence is a list of links (pasted screenshot/recording
// URLs) rather than a file upload — see references/ui-schema.md.
function evidenceHtml(item) {
  const evidence = item.test_evidence || [];
  if (!evidence.length) return "";
  return `
    <div class="file-list">
      ${evidence
        .map((entry) => {
          const url = typeof entry === "string" ? entry : entry?.url || "";
          if (!url) return "";
          return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><code>${escapeHtml(url)}</code></a>`;
        })
        .join("")}
    </div>
  `;
}

function testSectionHtml(item) {
  if (!item.merged && item.status !== "merged") return "";
  const testedText = item.tested ? t("tested.at", { time: timeAgo(item.tested_at) }) : t("tested.not_yet");
  const mergedText = item.merged_at ? t("merged.at", { time: timeAgo(item.merged_at) }) : "";
  return `
    <section class="section tested-section">
      <h3>${escapeHtml(t("tested.title"))}</h3>
      <p>${escapeHtml(t("tested.body"))}</p>
      <textarea id="testNote" class="comment-box" placeholder="${escapeHtml(t("tested.note.placeholder"))}">${escapeHtml(item.test_note || "")}</textarea>
      <label class="upload-control">
        <span>${escapeHtml(t("tested.evidence.label"))}</span>
        <textarea id="testEvidence" class="comment-box" placeholder="${escapeHtml(t("tested.evidence.placeholder"))}"></textarea>
      </label>
      ${evidenceHtml(item)}
      <div class="tested-controls">
        <button class="button${item.tested ? "" : " primary"}" data-tested="${item.tested ? "false" : "true"}">${escapeHtml(t(item.tested ? "tested.unmark" : "tested.mark"))}</button>
        <span class="muted">${escapeHtml([testedText, mergedText].filter(Boolean).join(" · "))}</span>
      </div>
    </section>
  `;
}

// The same detail markup for every mode; only the bar differs. Rebuilt only
// when the record or its data changed, so the 5s refresh does not reset the
// reader's scroll position or a half-typed draft.
let renderedDetailKey = "";

export function renderDetail() {
  const { view, selectedId, presentation } = route;
  const body = $("detailBody");
  const bar = $("detailPanel").querySelector(".ws-detail-bar");
  $("detailBack").textContent = presentation === "page" || isMobileLayout() ? t("back_to_list") : t("close");
  $("detailExpand").hidden = !selectedId || presentation === "page";
  if (selectedId) $("detailExpand").href = detailUrl(selectedId, view);
  bar.hidden = !selectedId;
  const item = selectedItem();
  const key = `${language()}|${selectedId}|${item ? JSON.stringify(item) : extraItems.get(selectedId)}`;
  if (key === renderedDetailKey) return;
  renderedDetailKey = key;
  if (!selectedId) {
    body.innerHTML = VIEW_MODES[view] === "split" ? `<div class="ws-detail-empty">${escapeHtml(t("empty.detail"))}</div>` : "";
    return;
  }
  if (!item) {
    const pending = extraItems.has(selectedId) && extraItems.get(selectedId) === undefined;
    body.innerHTML = `<div class="ws-detail-empty">${escapeHtml(pending ? t("loading") : t("record.missing"))}</div>`;
    return;
  }
  body.innerHTML = `
    <div class="detail-head">
      <h2 class="detail-title">${escapeHtml(item.title)}</h2>
      <div class="detail-meta">
        <span>${escapeHtml(item.repo)} #${escapeHtml(item.number)}</span>
        <span>${escapeHtml(item.author || t("unknown"))}</span>
        ${item.review_ref ? `<span>${escapeHtml(item.review_ref)}</span>` : ""}
        ${item.url ? `<a class="detail-open-button" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(t("open_pr"))}</a>` : ""}
      </div>
    </div>
    <div class="detail-body">
      <section class="section">
        <h3>${escapeHtml(t("recommendation"))}</h3>
        <div class="action-row">${actionBadge(item.proposed_action)} ${statusBadge(item)} ${testedBadge(item)}</div>
        <p>${escapeHtml(item.reason || item.summary || t("no.recommendation"))}</p>
      </section>
      ${testSectionHtml(item)}
      <section class="section">
        <h3>${escapeHtml(t("risk"))}</h3>
        <div class="risk-list">${riskHtml(item)}</div>
      </section>
      <section class="section">
        <h3>${escapeHtml(t("changed_files"))}</h3>
        <div class="file-list">${filesHtml(item)}</div>
      </section>
      <section class="section">
        <h3>${escapeHtml(t("review_body"))}</h3>
        <textarea id="reviewBody">${escapeHtml(item.review_body || "")}</textarea>
      </section>
      <section class="section">
        <h3>${escapeHtml(t("review_note"))}</h3>
        <textarea id="reviewComment" class="comment-box">${escapeHtml(item.decision_note || "")}</textarea>
      </section>
      ${item.patch_excerpt ? `<section class="section"><h3>${escapeHtml(t("patch_excerpt"))}</h3><pre class="patch">${escapeHtml(item.patch_excerpt)}</pre></section>` : ""}
      <section class="section">
        <h3>${escapeHtml(t("action"))}</h3>
        <div class="action-row">
          <button class="button primary" data-action="approve">${escapeHtml(t("action.approve"))}</button>
          <button class="button" data-action="comment">${escapeHtml(t("action.comment"))}</button>
          <button class="button danger" data-action="request_changes">${escapeHtml(t("action.request_changes"))}</button>
          <button class="button" data-action="no_action">${escapeHtml(t("action.no_action"))}</button>
          <button class="button" data-action="needs_review">${escapeHtml(t("action.needs_review"))}</button>
          <button class="button danger" data-action="block">${escapeHtml(t("action.block"))}</button>
        </div>
      </section>
    </div>
  `;
  $("reviewBody").addEventListener("input", scheduleSaveDetail);
  $("reviewComment").addEventListener("input", scheduleSaveDetail);
  body.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => decide(button.dataset.action).catch(reportError));
  });
  body.querySelector("[data-tested]")?.addEventListener("click", (event) => {
    setTestedStatus(event.currentTarget.dataset.tested === "true").catch(reportError);
  });
  renderLock();
}

const language = () => document.documentElement.lang;

function scheduleSaveDetail() {
  clearTimeout(reviewStore.saveTimer);
  reviewStore.saveTimer = setTimeout(() => saveDetail().catch(reportError), 450);
}

async function saveDetail() {
  const item = selectedItem();
  if (!item) return;
  const reviewBody = $("reviewBody")?.value || "";
  const comment = $("reviewComment")?.value || "";
  item.review_body = reviewBody;
  item.decision_note = comment;
  const provider = await getProvider();
  await provider.saveDraft(item.id, { review_body: reviewBody, comment });
}

async function decide(action) {
  const item = selectedItem();
  if (!item) return;
  const reviewBody = $("reviewBody")?.value || "";
  const comment = $("reviewComment")?.value || "";
  const provider = await getProvider();
  await provider.applyDecision(item.id, { action, review_body: reviewBody, comment });
  toast(t("decision.saved"));
  await reloadAfterWrite(item.id);
}

function parseEvidenceLinks(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function setTestedStatus(tested) {
  const item = selectedItem();
  if (!item) return;
  const note = $("testNote")?.value.trim() || "";
  const evidence = parseEvidenceLinks($("testEvidence")?.value);
  if (tested && !note && !evidence.length && !(item.test_evidence || []).length) {
    toast(t("tested.need_evidence"));
    return;
  }
  const provider = await getProvider();
  await provider.setTested(item.id, tested, { note, evidence });
  toast(t("tested.saved"));
  await reloadAfterWrite(item.id);
}

function helpHtml() {
  const summary = state.config_summary || {};
  const repos = (summary.repos || []).map((repo) => `<span class="badge">${escapeHtml(repo.repo)}</span>`).join(" ");
  return `
    <label class="language-control" for="languageSelect">
      <span>${escapeHtml(t("language"))}</span>
      <select id="languageSelect">
        <option value="auto"${languageMode === "auto" ? " selected" : ""}>${escapeHtml(t("language.auto"))}</option>
        <option value="en"${languageMode === "en" ? " selected" : ""}>${escapeHtml(t("language.english"))}</option>
        <option value="zh-CN"${languageMode === "zh-CN" ? " selected" : ""}>${escapeHtml(t("language.chinese"))}</option>
      </select>
    </label>
    <p>${escapeHtml(t("help.body"))}</p>
    <dl>
      <dt>${escapeHtml(t("data_reader"))}</dt><dd><code>${escapeHtml(summary.reader || "busabase")}</code></dd>
      <dt>${escapeHtml(t("config_source"))}</dt><dd><code>${escapeHtml(summary.source || t("not_configured"))}</code></dd>
      <dt>${escapeHtml(t("reviewer"))}</dt><dd><code>${escapeHtml(summary.reviewer?.handle || "@me")}</code></dd>
      <dt>${escapeHtml(t("repositories"))}</dt><dd>${repos || `<span class="muted">${escapeHtml(t("no_repos"))}</span>`}</dd>
    </dl>
    <p>${escapeHtml(t("help.flow"))}</p>
  `;
}

export function openHelp() {
  $("helpBody").innerHTML = helpHtml();
  $("languageSelect")?.addEventListener("change", (event) => setLanguageMode(event.target.value));
  $("helpModal").hidden = false;
  $("helpModal").setAttribute("aria-hidden", "false");
}

export function closeHelp() {
  $("helpModal").hidden = true;
  $("helpModal").setAttribute("aria-hidden", "true");
}
