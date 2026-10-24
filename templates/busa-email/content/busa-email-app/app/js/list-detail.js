import { api, attachmentUrl, toast } from "./api.js";
import {
  accountEmailLabel,
  accountLabel,
  actionLabel,
  attachmentHtml,
  badge,
  escapeHtml,
  languageLabel,
  replyIdentityLabel,
  shortSender,
  tooltipAttr,
} from "./format.js";
import { t, template } from "./i18n.js";
import { setupNeeded } from "./provider.js";
import { applyRouteFromHash, navigateTo, recordHref, registerRouterHooks, routeFor } from "./router.js";
import {
  applyLockState,
  attachHtmlPreviewAutoResize,
  captureScrollState,
  closeDetailActionMenu,
  isEditing,
  isLocked,
  isMobileLayout,
  pollLock,
  restoreScrollState,
  syncLayoutClasses,
  syncModeButtons,
} from "./shell.js";
import { $, appendStatePage, store } from "./store.js";

function countFor(name) {
  if (name === "all") return store.state.total_cached || 0;
  return store.state.counts[name] || 0;
}

function modeLabel(name = store.mode) {
  return t(`filter.${name}`);
}

export function renderMobileTopbar() {
  const title = $("mobileViewTitle");
  const meta = $("mobileViewMeta");
  if (!title || !meta) return;
  if (store.page === "overview") {
    title.textContent = t("nav.overview");
    meta.textContent = t("list.items", { count: countFor("all") });
    return;
  }
  // The detail names the message itself; the bar keeps naming the queue.
  title.textContent = modeLabel();
  meta.textContent = loadedLabel();
}

function isPartial() {
  return Boolean(store.state.pagination?.next_cursor);
}

// "8 items", or "50 of 120 items" while more pages exist.
function loadedLabel() {
  const loaded = store.state.items?.length || 0;
  if (store.mode === "all" && isPartial()) {
    return t("list.loaded_items", { loaded, total: store.state.total_cached ?? loaded });
  }
  return t("list.items", { count: isPartial() ? `${loaded}+` : loaded });
}

export function renderCounts() {
  ["all", "needs_review", "approved", "done", "blocked"].forEach((name) => {
    const el = $(`count-${name}`);
    if (el) el.textContent = countFor(name);
  });
  const humanNeeds = $("count-human-needs_review");
  if (humanNeeds) humanNeeds.textContent = countFor("needs_review");
}

export function renderLoadMore() {
  const control = $("loadMoreControl");
  const button = $("loadMore");
  const status = $("loadMoreStatus");
  if (!control || !button || !status) return;
  const hasNext = isPartial();
  control.hidden = !hasNext && !store.loadMoreError;
  button.hidden = !hasNext;
  button.disabled = store.loadingMore || isLocked();
  button.textContent = t(store.loadingMore ? "list.loading_more" : "list.load_more");
  status.textContent = store.loadMoreError
    ? t("list.load_more_failed")
    : t("list.loaded_items", { loaded: store.state.items.length, total: store.state.total_cached ?? "?" });
}

export function renderBulkActions() {
  const bar = $("bulkActions");
  const selected = $("selectedCount");
  if (!bar || !selected) return;
  const count = store.checked.size;
  bar.hidden = count === 0;
  // While messages are checked the toolbar row is for deciding them, so the
  // search field steps aside instead of wrapping the row (the count stays).
  const search = $("searchInput")?.closest("label");
  if (search) search.hidden = count > 0;
  selected.textContent = t("list.selected", { count });
  const bulkSelect = $("bulkDecisionSelect");
  if (bulkSelect) bulkSelect.value = "";
}

function decisionLabel(item) {
  const action = item.decision?.action;
  if (!action) return "";
  if (action === "review" || action === "needs_review") return badge(t("badge.review_requested"), "review");
  if (action === "draft_reply") return badge(t("badge.approved_draft"), "decided");
  if (action === "mark_read") return badge(t("badge.approved_mark_read"), "decided");
  if (action === "send_reply") return badge(t("badge.approved_send"), "decided");
  if (action === "no_action") return badge(t("badge.no_action"), "done");
  return badge(t("badge.approved_action", { action: actionLabel(action) }), "decided");
}

function executionLabel(item) {
  const execution = item.execution || {};
  if (execution.status === "executed")
    return badge(t("badge.executed", { action: actionLabel(execution.action) }), "executed");
  if (execution.status === "blocked") return badge(t("badge.blocked"), "blocked");
  return "";
}

function reviewBriefFor(item) {
  const brief = item.review_brief || {};
  const localized = brief.i18n?.[store.uiLanguage] || brief.i18n?.[brief.user_language] || brief.i18n?.en || null;
  const background =
    localized?.background ||
    brief.background ||
    t("review.background.default", {
      from: item.from || t("unknown.sender"),
      subject: item.subject || t("unknown.subject"),
      summary: item.summary || "",
    });
  const why =
    localized?.why_review ||
    (store.uiLanguage === "zh-CN" ? brief.why_review || item.reason : "") ||
    t("review.why.default");
  let recommendation =
    localized?.recommendation ||
    (store.uiLanguage === "zh-CN" ? brief.recommendation : "") ||
    t("review.recommend.default");
  const category = item.category || "";
  const risks = new Set(item.risk || []);
  if (!localized?.recommendation && !(store.uiLanguage === "zh-CN" && brief.recommendation)) {
    if (category === "money" || risks.has("money")) {
      recommendation = t("review.recommend.money");
    } else if (category === "course_feedback") {
      recommendation = t("review.recommend.course");
    } else if (category.includes("security") || risks.has("security")) {
      recommendation = t("review.recommend.security");
    } else if (category === "partnership") {
      recommendation = t("review.recommend.partnership");
    } else if (category === "customer") {
      recommendation = t("review.recommend.customer");
    } else if ((item.attachments || []).length) {
      recommendation = t("review.recommend.attachments");
    }
  }
  return { background, why, recommendation };
}

function suggestedReplyFor(item) {
  return String(item.draft || item.suggested_reply || item.review_brief?.suggested_reply || "").trim();
}

function primaryActionFor(item) {
  if (item.status === "drafted" || item.proposed_action === "send_reply" || item.decision?.action === "send_reply") {
    return {
      id: "approveSend",
      action: "approve_send",
      label: t("action.approve_send"),
      tooltip: t("detail.send.tooltip"),
    };
  }
  if (item.proposed_action === "archive") {
    return {
      id: "approveArchive",
      action: "approve_archive",
      label: t("action.approve_archive"),
      tooltip: t("detail.archive.tooltip"),
    };
  }
  if (item.proposed_action === "mark_read" || item.proposed_action === "keep_unread") {
    return {
      id: "approveRead",
      action: "approve_mark_read",
      label: t("action.approve_read"),
      tooltip: t("detail.read.tooltip"),
    };
  }
  if (item.proposed_action === "draft_reply") {
    return {
      id: "draftReply",
      action: "draft_reply",
      label: t("action.draft_reply"),
      tooltip: t("detail.draft.tooltip"),
    };
  }
  return {
    id: "approveProposed",
    action: "approve_proposed",
    label: t("action.approve_plan"),
    tooltip: t("detail.approve.tooltip"),
  };
}

function planBadge(item) {
  const action = item.proposed_action || "review";
  if (action === "review") return badge(t("action_label.review"), "review");
  return badge(t("badge.suggested", { action: actionLabel(action) }));
}

function emailBodySectionsHtml(item) {
  const original = item.body_original || item.body || "";
  const translation = item.body_translation || item.translated_body || "";
  const sourceLanguage = item.body_original_language || item.source_language || "";
  const translationLanguage =
    item.body_translation_language || item.translation_language || item.review_brief?.user_language || "";
  const originalLabel =
    sourceLanguage && sourceLanguage !== "unknown"
      ? `${t("detail.original_text")} · ${languageLabel(sourceLanguage)}`
      : t("detail.original_text");
  const translationHtml = translation
    ? `
      <div class="section-title">${escapeHtml(t("detail.translation_text"))} · ${escapeHtml(languageLabel(translationLanguage))}</div>
      <div class="body-box translated-body">${escapeHtml(translation)}</div>
    `
    : `<div class="translation-empty">${escapeHtml(t("detail.translation_empty"))}</div>`;
  return `
    <div class="section-title">${escapeHtml(originalLabel)}</div>
    <div class="body-box">${escapeHtml(original)}</div>
    ${translationHtml}
  `;
}

function reviewBriefHtml(item) {
  const needs = item.status === "needs_review" || ["needs_review", "revise", "review"].includes(item.decision?.action);
  if (!needs) return "";
  const brief = reviewBriefFor(item);
  const title = item.review_ref ? `${t("detail.suggestion")} · ${item.review_ref}` : t("detail.suggestion");
  return `
    <div class="review-advice">
      <div class="review-advice-title">${escapeHtml(title)}</div>
      <dl>
        <dt>${escapeHtml(t("detail.background"))}</dt>
        <dd>${escapeHtml(brief.background)}</dd>
        <dt>${escapeHtml(t("detail.why_review"))}</dt>
        <dd>${escapeHtml(brief.why)}</dd>
        <dt>${escapeHtml(t("detail.recommendation"))}</dt>
        <dd>${escapeHtml(brief.recommendation)}</dd>
      </dl>
    </div>
  `;
}

// The one state that matters in a queue row: what happened, else what was
// decided, else where the message stands. Everything else is in the detail.
function stateBadge(item) {
  return executionLabel(item) || decisionLabel(item) || badge(item.status || t("badge.new"), item.status || "");
}

const SENSITIVE_RISKS = new Set(["security", "money", "identity", "privacy"]);
function isSensitive(item) {
  return (item.risk || []).some((risk) => SENSITIVE_RISKS.has(risk)) || SENSITIVE_RISKS.has(item.category);
}

function rowHtml(item) {
  const id = escapeHtml(item.id);
  const checkedAttr = store.checked.has(item.id) ? "checked" : "";
  const selected = store.selectedId === item.id ? ' class="ws-selected"' : "";
  // The full "Review #n" label is in the detail; the row keeps the number.
  const reviewRef = item.review_number
    ? `<span class="review-ref" title="${escapeHtml(item.review_ref)}">#${escapeHtml(item.review_number)}</span>`
    : "";
  const sender = shortSender(item.from);
  const subject = item.subject || t("unknown.subject");
  return `
    <tr data-id="${id}"${selected}>
      <td title="${escapeHtml(`${subject}\n${item.summary || ""}`)}">
        <span class="row-subject">
          <input type="checkbox" class="row-check" data-id="${id}" aria-label="${escapeHtml(t("list.select_row"))}" ${checkedAttr}>
          ${reviewRef}<strong>${escapeHtml(subject)}</strong>
        </span>
      </td>
      <td title="${escapeHtml(item.from || "")}">${escapeHtml(sender)}</td>
      <td class="ws-split-keep row-state">${stateBadge(item)}</td>
      <td>${escapeHtml(accountLabel(item))}</td>
      <td>${planBadge(item)}</td>
      <td class="row-date">${escapeHtml(item.date || "")}</td>
    </tr>`;
}

function tableHtml(items) {
  const allChecked = items.length > 0 && items.every((item) => store.checked.has(item.id));
  return `
    <table class="ws-table message-table">
      <thead>
        <tr>
          <th><span class="row-subject"><input type="checkbox" id="selectAll" aria-label="${escapeHtml(t("list.select_all"))}" ${allChecked ? "checked" : ""}>${escapeHtml(t("col.subject"))}</span></th>
          <th>${escapeHtml(t("col.from"))}</th>
          <th class="ws-split-keep">${escapeHtml(t("col.state"))}</th>
          <th>${escapeHtml(t("detail.source_account"))}</th>
          <th>${escapeHtml(t("detail.next"))}</th>
          <th class="row-date">${escapeHtml(t("detail.date"))}</th>
        </tr>
      </thead>
      <tbody>${items.map(rowHtml).join("")}</tbody>
    </table>`;
}

function emptyHtml(title, detail = "") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
}

function searchQuery() {
  return ($("searchInput")?.value || "").trim();
}

export function renderList() {
  if (store.page !== "view") return;
  const title = $("viewTitle");
  title.textContent = modeLabel();
  title.title = t(`filter.${store.mode}.tooltip`);
  $("viewCount").textContent = `${store.state.items.length}${isPartial() ? "+" : ""}`;
  if (setupNeeded()) {
    $("messageList").innerHTML = emptyHtml(t("setup.list_empty"));
    renderLoadMore();
    renderBulkActions();
    return;
  }
  const items = store.state.items;
  $("messageList").innerHTML = items.length
    ? tableHtml(items)
    : emptyHtml(searchQuery() ? t("list.no_matches") : t("list.no_items"));
  renderLoadMore();
  renderMobileTopbar();
  renderBulkActions();
}

// Row clicks, checkboxes and select-all are delegated once from the list
// container, so re-rendering the table never re-binds handlers.
export function wireList() {
  const list = $("messageList");
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") return;
    const row = target.closest?.("tbody tr[data-id]");
    if (!row || isLocked()) return;
    navigateTo({ page: "view", selectedId: row.dataset.id, presentation: store.presentation === "page" ? "page" : "peek" });
  });
  list.addEventListener("change", (event) => {
    const box = event.target;
    if (!(box instanceof HTMLInputElement)) return;
    if (isLocked()) {
      box.checked = box.id === "selectAll" ? false : store.checked.has(box.dataset.id);
      toast(t("lock.processing"));
      return;
    }
    if (box.id === "selectAll") {
      if (box.checked) {
        for (const item of store.state.items) store.checked.add(item.id);
      } else store.checked.clear();
      renderList();
      return;
    }
    if (!box.classList.contains("row-check")) return;
    if (box.checked) store.checked.add(box.dataset.id);
    else store.checked.delete(box.dataset.id);
    renderBulkActions();
  });
}

export function onboardingHtml() {
  const onboarding = store.state.email_accounts?.onboarding || {};
  const missing = (onboarding.missing_env || [])
    .map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`)
    .join("");
  return `
    <div class="onboarding-card">
      <strong>${onboarding.state === "missing_secrets" ? escapeHtml(t("onboarding.add_secrets")) : escapeHtml(t("onboarding.setup"))}</strong>
      <p>${escapeHtml(onboarding.message || t("onboarding.default_message"))}</p>
      <ol>
        <li>${template(escapeHtml(t("onboarding.copy")), { path: `<code>${escapeHtml(onboarding.example_config || ".agents/skills/busa-email/config.example.json")}</code>` })}</li>
        <li>${template(escapeHtml(t("onboarding.save_as")), { path: `<code>${escapeHtml(onboarding.recommended_config || "busabase:base/busa-email-settings-v3")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.fill"))}</li>
        <li>${template(escapeHtml(t("onboarding.env")), { path: `<code>${escapeHtml(onboarding.recommended_env || "busabase:vault/busa-email")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.test"))}</li>
      </ol>
      ${missing ? `<div class="account-envs">${missing}</div>` : ""}
    </div>
  `;
}

export function selectedItem() {
  return store.state.items.find((item) => item.id === store.selectedId);
}

export function renderDetail() {
  if (store.page !== "view") return;
  const asPage = store.presentation === "page" || isMobileLayout();
  $("detailBar").hidden = !store.selectedId;
  $("detailBack").textContent = asPage ? t("detail.back_to_list") : t("detail.close");
  $("detailExpand").hidden = !store.selectedId || store.presentation === "page";
  if (store.selectedId) $("detailExpand").href = recordHref(store.selectedId, "page");
  $("detailActions").innerHTML = "";
  if (setupNeeded()) {
    $("detailBody").innerHTML = `<div class="ws-detail-empty">${escapeHtml(t("setup.detail_empty"))}</div>`;
    renderMobileTopbar();
    return;
  }
  if (!store.selectedId) {
    $("detailBody").innerHTML = `<div class="ws-detail-empty">${escapeHtml(t("empty.select_message"))}</div>`;
    renderMobileTopbar();
    return;
  }
  const item = selectedItem();
  if (!item) {
    // A shared link to a message outside this queue or the loaded page.
    $("detailBody").innerHTML = emptyHtml(t("detail.missing"), t("detail.missing_hint"));
    renderMobileTopbar();
    return;
  }
  const attachments = (item.attachments || []).map(attachmentHtml).join("");
  const htmlPreview = (item.html || "").trim()
    ? `<iframe class="html-preview" sandbox srcdoc="${escapeHtml(item.html)}" data-email-html></iframe>`
    : `<div class="body-box muted">${escapeHtml(t("detail.no_html"))}</div>`;
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const suggestedReply = suggestedReplyFor(item);
  const showDraft = Boolean(suggestedReply) || item.status === "drafted" || item.decision?.action === "send_reply";
  const draftSection = showDraft
    ? `
    <div class="section-title">${escapeHtml(t("detail.suggested_reply"))}</div>
    <textarea id="draftText" class="draft-box" placeholder="${escapeHtml(t("detail.suggested_reply.placeholder"))}">${escapeHtml(suggestedReply)}</textarea>
  `
    : `<textarea id="draftText" class="draft-box is-hidden">${escapeHtml(item.draft || "")}</textarea>`;
  const reviewMeta = item.review_ref
    ? `<strong>${escapeHtml(t("detail.review"))}</strong><div><span class="review-ref detail-review-ref">${escapeHtml(item.review_ref)}</span></div>`
    : "";
  const primaryAction = primaryActionFor(item);
  const menuActions = [
    ["draftReply", "draft_reply", t("action.draft_reply"), t("detail.draft.tooltip")],
    ["approveArchive", "approve_archive", t("action.approve_archive"), t("detail.archive.tooltip")],
    ["approveRead", "approve_mark_read", t("action.approve_read"), t("detail.read.tooltip")],
    ["approveSend", "approve_send", t("action.approve_send"), t("detail.send.tooltip")],
    ["markReview", "needs_review", t("action.needs_review"), t("detail.review.tooltip")],
    ["noAction", "no_action", t("action.no_action"), t("detail.no_action.tooltip")],
  ].filter(([id]) => id !== primaryAction.id);
  const actionBar = `
      <div class="action-cluster">
        <button id="primaryDetailAction" class="detail-primary-action primary has-tooltip" data-tooltip="${escapeHtml(primaryAction.tooltip)}" title="${escapeHtml(primaryAction.tooltip)}">${escapeHtml(primaryAction.label)}</button>
        <button
          id="detailActionMenuToggle"
          class="detail-more-action"
          type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="${escapeHtml(t("action.more"))}"
          title="${escapeHtml(t("action.more"))}"
        >${escapeHtml(t("action.more"))}</button>
        <div id="detailActionMenu" class="detail-action-menu" role="menu">
          ${menuActions
            .map(
              ([id, action, label, tooltip], index) => `
            ${index === 4 ? `<span class="detail-action-separator" aria-hidden="true"></span>` : ""}
            <button id="${escapeHtml(id)}" type="button" role="menuitem" data-action="${escapeHtml(action)}" ${tooltipAttr(tooltip)}>${escapeHtml(label)}</button>
          `,
            )
            .join("")}
        </div>
      </div>
  `;
  $("detailActions").innerHTML = actionBar;
  $("detailBody").innerHTML = `
    <h2 class="detail-title">${escapeHtml(item.subject || t("unknown.subject"))}</h2>
    ${item.summary ? `<p class="detail-summary">${escapeHtml(item.summary)}</p>` : ""}
    <div class="detail-meta">
      ${reviewMeta}
      <strong>${escapeHtml(t("detail.source_account"))}</strong><div>${escapeHtml(accountLabel(item))} <span class="muted">· ${escapeHtml(accountEmailLabel(item))}</span></div>
      <strong>${escapeHtml(t("detail.reply_identity"))}</strong><div>${escapeHtml(replyIdentityLabel(item))}</div>
      <strong>${escapeHtml(t("detail.from"))}</strong><div>${escapeHtml(item.from)}</div>
      <strong>${escapeHtml(t("detail.to"))}</strong><div>${escapeHtml(item.to)}</div>
      <strong>${escapeHtml(t("detail.date"))}</strong><div>${escapeHtml(item.date)}</div>
      <strong>${escapeHtml(t("detail.status"))}</strong><div>${badge(item.status, item.status)} ${badge(item.category)} ${risks} ${decisionLabel(item)} ${executionLabel(item)}</div>
      <strong>${escapeHtml(t("detail.next"))}</strong><div>${escapeHtml(actionLabel(item.proposed_action))} · ${escapeHtml(item.reason)}</div>
    </div>
    ${reviewBriefHtml(item)}
    ${draftSection}
    <div class="section-title">${escapeHtml(t("detail.html_email"))}</div>
    ${htmlPreview}
    <div class="section-title">${escapeHtml(t("detail.attachments"))}</div>
    <div class="attachment-list">${attachments || `<span class="muted">${escapeHtml(t("detail.no_attachments"))}</span>`}</div>
    <div class="section-title">${escapeHtml(t("detail.review_note"))}</div>
    <textarea id="commentText" class="comment-box" placeholder="${escapeHtml(t("detail.comment.placeholder"))}">${escapeHtml(item.user_comment || "")}</textarea>
    <div class="detail-actions">
      <button id="saveDetail" class="has-tooltip" data-tooltip="${escapeHtml(t("detail.save.tooltip"))}" title="${escapeHtml(t("detail.save.tooltip"))}">${escapeHtml(t("action.save_note"))}</button>
    </div>
    ${emailBodySectionsHtml(item)}
  `;
  renderMobileTopbar();
  attachHtmlPreviewAutoResize();
  resolveAttachments(item).catch(() => {});
  applyLockState();
  closeDetailActionMenu();
  $("primaryDetailAction").onclick = () => decide(primaryAction.action, [item.id]);
  $("detailActionMenuToggle").onclick = (event) => {
    event.stopPropagation();
    if (isLocked()) return toast(t("lock.processing"));
    store.openActionMenu = !store.openActionMenu;
    $("detailActionMenu").classList.toggle("is-open", store.openActionMenu);
    $("detailActionMenuToggle").setAttribute("aria-expanded", String(store.openActionMenu));
  };
  menuActions.forEach(([id, action]) => {
    const button = $(id);
    if (!button) return;
    button.onclick = () => {
      closeDetailActionMenu();
      decide(action, [item.id]);
    };
  });
  $("saveDetail").onclick = async () => {
    if (isLocked()) return toast(t("lock.processing"));
    const data = await api("/api/detail", {
      id: item.id,
      draft: $("draftText").value,
      suggested_reply: $("draftText").value,
      comment: $("commentText").value,
    });
    toast(data.change_requests?.length ? t("toast.submitted_review") : t("toast.saved_detail"));
    await refresh({ preserveScroll: false });
    store.selectedId = item.id;
    renderDetail();
  };
}

// ── Overview ─────────────────────────────────────────────────────────────
// Three numbers the nav does not already show. The SDK pinned here has no
// server aggregate for them, so they are counted over the loaded page and say
// so while more pages exist.
function metricsHtml() {
  const items = store.state.items || [];
  const open = items.filter((item) => item.execution?.status !== "executed" && item.decision?.action !== "no_action");
  const drafts = open.filter((item) => suggestedReplyFor(item)).length;
  const sensitive = open.filter(isSensitive).length;
  const mailboxes = (store.state.email_accounts?.accounts || []).length;
  const scope = isPartial() ? t("metric.loaded_scope", { count: items.length }) : "";
  return [
    [t("metric.drafts") + scope, drafts],
    [t("metric.sensitive") + scope, sensitive],
    [t("metric.mailboxes"), mailboxes],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function overviewRows(items, mode) {
  return items
    .map(
      (item) => `
      <a class="overview-row" href="${recordHref(item.id, "peek", mode)}">
        <span class="overview-row-main">
          <strong>${escapeHtml(item.subject || t("unknown.subject"))}</strong>
          <small>${escapeHtml(shortSender(item.from))}</small>
        </span>
        <span class="overview-row-state">${stateBadge(item)}</span>
      </a>`,
    )
    .join("");
}

function overviewPanel(title, href, body, empty) {
  return `
    <section class="card overview-panel">
      <header class="overview-panel-head">
        <h2>${escapeHtml(title)}</h2>
        ${href ? `<a href="${href}">${escapeHtml(t("overview.see_all"))}</a>` : ""}
      </header>
      ${body || `<p class="overview-empty">${escapeHtml(empty)}</p>`}
    </section>`;
}

export function renderOverview() {
  if (store.page !== "overview") return;
  const batch = store.state.batch || {};
  const items = store.state.items || [];
  const scanned = batch.last_scan || batch.updated_at || "";
  $("overviewSummary").textContent = setupNeeded()
    ? t("setup.list_empty")
    : batch.batch_id
      ? t("overview.summary", {
          count: store.state.total_cached ?? items.length,
          date: scanned ? new Date(scanned).toLocaleString(store.uiLanguage) : "—",
        })
      : t("overview.summary_empty");
  $("overviewMetrics").innerHTML = metricsHtml();
  const needs = items.filter((item) => item.review_ref).slice(0, 6);
  const blocked = items.filter((item) => item.execution?.status === "blocked").slice(0, 4);
  const accounts = store.state.email_accounts?.accounts || [];
  const accountRows = accounts
    .map(
      (account) => `
      <div class="overview-row">
        <span class="overview-row-main">
          <strong>${escapeHtml(account.display_name || account.primary_email || t("account.unknown"))}</strong>
          <small>${escapeHtml(account.primary_email || "")}</small>
        </span>
        <span class="overview-row-state">${badge(account.imap_env_configured ? t("account.imap_ready") : t("account.imap_missing"), account.imap_env_configured ? "done" : "blocked")}</span>
      </div>`,
    )
    .join("");
  $("overviewBody").innerHTML = `
    ${overviewPanel(t("overview.next_up"), "#/needs_review", overviewRows(needs, "needs_review"), t("overview.next_up_empty"))}
    ${overviewPanel(t("overview.blocked"), blocked.length ? "#/blocked" : "", overviewRows(blocked, "blocked"), t("overview.blocked_empty"))}
    ${overviewPanel(t("overview.mailboxes"), "", accountRows, t("overview.mailboxes_empty"))}
  `;
}

// One render pass for whatever the route says is on screen.
export function renderAll() {
  const onView = store.page === "view";
  $("overviewPage").hidden = onView;
  $("viewPage").hidden = !onView;
  syncModeButtons();
  syncLayoutClasses();
  renderCounts();
  if (onView && store.stateMode !== store.mode) {
    // The route moved to another queue before its page arrived.
    $("messageList").innerHTML = "";
  } else {
    renderOverview();
    renderList();
    renderDetail();
  }
  renderMobileTopbar();
  applyLockState();
}

export async function refresh({ preserveScroll = true, append = false } = {}) {
  if (isEditing()) return pollLock();
  applyRouteFromHash();
  const scrollState = preserveScroll ? captureScrollState() : null;
  const q = encodeURIComponent($("searchInput").value || "");
  if (store.mode === "to_approve") store.mode = "approved";
  const pagination = append ? store.state.pagination || {} : {};
  const cursor = pagination.next_cursor ? `&cursor=${encodeURIComponent(pagination.next_cursor)}` : "";
  const batchId = pagination.batch_id ? `&batch_id=${encodeURIComponent(pagination.batch_id)}` : "";
  // Overview summarises the whole batch; a queue reads only its own mode.
  const mode = store.page === "overview" ? "all" : store.mode;
  const query = store.page === "overview" ? "" : q;
  const next = await api(`/api/state?mode=${mode}&q=${query}${cursor}${batchId}`);
  store.state = append ? appendStatePage(store.state, next) : next;
  store.stateMode = mode;
  store.pagesLoaded = append ? store.pagesLoaded + 1 : 1;
  renderAll();
  if (store.routeNeedsReplace) {
    history.replaceState(null, "", `#${routeFor()}`);
    store.routeNeedsReplace = false;
  }
  if (scrollState) requestAnimationFrame(() => restoreScrollState(scrollState));
}

export async function loadMore() {
  if (store.loadingMore || !store.state.pagination?.next_cursor) return;
  store.loadingMore = true;
  store.loadMoreError = "";
  renderLoadMore();
  try {
    await refresh({ append: true });
  } catch (error) {
    store.loadMoreError = error instanceof Error ? error.message : String(error);
    toast(t("list.load_more_failed"));
  } finally {
    store.loadingMore = false;
    renderLoadMore();
  }
}

export async function decide(action, ids = null) {
  if (isLocked()) return toast(t("lock.processing"));
  const isSingleDetailAction = Array.isArray(ids) && ids.length === 1;
  const list = isSingleDetailAction ? ids : Array.from(store.checked);
  if (!list.length) return toast(t("toast.select_one"));
  const item = isSingleDetailAction ? selectedItem() : null;
  const comment = item ? $("commentText")?.value || "" : "";
  const payload = { ids: list, action };
  if (item) {
    payload.comment = comment;
    payload.draft = $("draftText")?.value || item.draft || "";
    payload.suggested_reply = $("draftText")?.value || item.suggested_reply || "";
  }
  const order = store.state.items.map((entry) => entry.id);
  const data = await api("/api/decision", payload);
  for (const id of list) store.checked.delete(id);
  toast(
    data.change_requests?.length
      ? t("toast.submitted_review_count", { count: data.changed.length })
      : t("toast.saved_count", { count: data.changed.length }),
  );
  await refresh({ preserveScroll: false });
  // Working a queue top to bottom: when the decided message leaves this queue,
  // open the one that followed it instead of leaving the detail empty.
  if (isSingleDetailAction && store.selectedId === list[0] && !selectedItem()) {
    const remaining = new Set(store.state.items.map((entry) => entry.id));
    const nextId = order.slice(order.indexOf(list[0]) + 1).find((id) => remaining.has(id)) || null;
    navigateTo({ selectedId: nextId }, { replace: true });
  }
}

// Saved attachments (and inline `cid:` images, which the scan rewrote to the same
// URLs) are read from the app's Drive and shown as object URLs. A link that cannot
// be resolved stays without an href rather than pointing at a route nobody serves.
const PROVIDER_FILE_URL = /\/api\/provider-file\/[^"'\s)<>]+/g;

async function resolveAttachments(item) {
  const body = $("detailBody");
  for (const node of body.querySelectorAll("[data-attachment-url]")) {
    const resolved = await attachmentUrl(node.dataset.attachmentUrl);
    if (!resolved || !node.isConnected) continue;
    node.setAttribute(node.tagName === "A" ? "href" : "src", resolved);
  }
  const frame = body.querySelector("[data-email-html]");
  const html = String(item.html || "");
  const inline = [...new Set(html.match(PROVIDER_FILE_URL) || [])];
  if (!frame || !inline.length) return;
  let rewritten = html;
  for (const url of inline) {
    const resolved = await attachmentUrl(url, { inline: true });
    if (resolved) rewritten = rewritten.replaceAll(url, resolved);
  }
  if (frame.isConnected && rewritten !== html) frame.srcdoc = rewritten;
}

// router.js needs refresh/renderList/renderDetail (registered below) and this
// module needs navigateTo/syncRoute from router.js — a real two-way edge, but
// safe in ESM since every use on both sides happens inside function bodies,
// never at module-evaluation time.
registerRouterHooks({
  refresh,
  renderAll,
});
