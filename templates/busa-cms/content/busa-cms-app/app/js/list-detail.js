import { toast } from "./api.js";
import { ISSUE_TONES, LIVE_STATUS } from "./content-model.js";
import { escapeHtml, formatDate, localeLabel, statusLabel, templateLabel } from "./format.js";
import { t } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";
import { navigateTo, syncRoute } from "./router.js";
import { sanitizeHtml } from "./sanitize.js";
import { captureScrollState, isMobileLayout, restoreScrollState, setMobileDetailOpen } from "./shell.js";
import { $, CONTENT_MODES, store } from "./store.js";

/**
 * Posts, Pages, Categories, Tags — the four lists, and one detail pane.
 *
 * The shape is a WordPress admin on purpose: the sidebar picks *what kind of
 * thing*, a row of tabs above the list narrows by publication state, and the
 * detail pane shows the thing with the two buttons that matter on it. No queue, no
 * hand-off, no second waiting state.
 */

const choices = () => store.state.choices || {};

/**
 * Did the write land, or is it waiting for someone with write access? The app does
 * not decide that — Busabase does, from the actor's own permission — so the answer
 * is read off what came back.
 */
const merged = (result) => result?.materialized !== false && result?.status !== "in_review";
export const inContentMode = () => CONTENT_MODES.includes(store.mode);

const STATUS_FILTERS = ["all", "published", "draft"];

const matchesStatus = (item) => {
  if (store.statusFilter === "all") return true;
  if (store.statusFilter === "published") return item.status === LIVE_STATUS;
  return item.status !== LIVE_STATUS;
};

const matchesSearch = (haystack) => {
  const query = store.query.trim().toLowerCase();
  return !query || haystack.join(" ").toLowerCase().includes(query);
};

const matchesLocale = (locale) => store.localeFilter === "all" || locale === store.localeFilter;

/** Newest first, the way an admin list reads. */
const byRecency = (a, b) =>
  (b.publishedAt || b.updatedAt || "").localeCompare(a.publishedAt || a.updatedAt || "");

export function visibleItems() {
  return (store.state.items || [])
    .filter((item) => item.kind === store.mode)
    .filter(matchesStatus)
    .filter((item) => matchesLocale(item.locale))
    .filter((item) => matchesSearch([item.title, item.path, item.slug, item.author, item.excerpt]))
    .sort(byRecency);
}

export function visibleTerms() {
  const kind = store.mode === "categories" ? "categories" : "tags";
  return (store.state.terms || [])
    .filter((term) => term.kind === kind)
    .filter((term) => matchesLocale(term.locale))
    .filter((term) => matchesSearch([term.name, term.slug, term.description]))
    .sort((a, b) => b.usedBy - a.usedBy || a.name.localeCompare(b.name));
}

export function selectedRecord() {
  const rows = inContentMode() ? visibleItems() : visibleTerms();
  return rows.find((row) => row.recordId === store.selectedId) || null;
}

// ── list ─────────────────────────────────────────────────────────────────────

const statusBadge = (item) =>
  `<span class="badge badge--${item.status === LIVE_STATUS ? "live" : "plain"}">${escapeHtml(
    item.status === LIVE_STATUS ? t("status.published") : statusLabel(item.status, choices()),
  )}</span>`;

/**
 * One warning per row at most, and only for the things a visitor would actually
 * hit: a path the SDK will refuse, or two live pages fighting over one URL. The
 * rest of the checks stay in the detail pane, where there is room to explain them.
 */
const ROW_WARNINGS = ["blank-field", "bad-path", "duplicate-path", "empty-body"];
const rowWarning = (item) => {
  const code = item.issues.find((issue) => ROW_WARNINGS.includes(issue));
  if (!code) return "";
  return `<span class="chip chip--${ISSUE_TONES[code]}" title="${escapeHtml(
    t(`issue.${code}.hint`),
  )}">${escapeHtml(t(`issue.${code}.label`))}</span>`;
};

const itemRow = (item) => `
  <button type="button" class="row${item.recordId === store.selectedId ? " is-selected" : ""}" data-record-id="${escapeHtml(item.recordId)}">
    <span class="row-head">
      <span class="row-title">${escapeHtml(item.title || t("common.untitled"))}</span>
      ${statusBadge(item)}
    </span>
    <span class="row-meta">
      <code>${escapeHtml(item.path || t("common.no_path"))}</code>
      <span class="row-dot">·</span>
      <span>${escapeHtml(localeLabel(item.locale, choices()))}</span>
      ${item.author ? `<span class="row-dot">·</span><span>${escapeHtml(item.author)}</span>` : ""}
      ${item.publishedAt ? `<span class="row-dot">·</span><span>${escapeHtml(formatDate(item.publishedAt))}</span>` : ""}
    </span>
    ${item.excerpt ? `<span class="row-excerpt">${escapeHtml(item.excerpt)}</span>` : ""}
    ${rowWarning(item) ? `<span class="row-chips">${rowWarning(item)}</span>` : ""}
  </button>`;

const termRow = (term) => `
  <button type="button" class="row${term.recordId === store.selectedId ? " is-selected" : ""}" data-record-id="${escapeHtml(term.recordId)}">
    <span class="row-head">
      <span class="row-title">${escapeHtml(term.name || t("common.untitled"))}</span>
      <span class="badge badge--${term.usedBy > 0 ? "live" : "plain"}">${escapeHtml(
        t("taxonomy.count", { count: term.usedBy }),
      )}</span>
    </span>
    <span class="row-meta">
      <code>/${escapeHtml(term.slug)}</code>
      <span class="row-dot">·</span>
      <span>${escapeHtml(localeLabel(term.locale, choices()))}</span>
    </span>
    ${term.description ? `<span class="row-excerpt">${escapeHtml(term.description)}</span>` : ""}
  </button>`;

export function renderList() {
  const list = $("contentList");
  if (!list) return;
  const content = inContentMode();
  const rows = content ? visibleItems() : visibleTerms();

  list.innerHTML = rows.length
    ? rows.map(content ? itemRow : termRow).join("")
    : `<div class="empty-list">
         <strong>${escapeHtml(t("empty.title"))}</strong>
         <span>${escapeHtml(t(`empty.${store.mode}`))}</span>
       </div>`;

  const count = $("listCount");
  if (count) count.textContent = t("list.count", { count: rows.length });
  const mobileMeta = $("mobileViewMeta");
  if (mobileMeta) mobileMeta.textContent = t("list.count", { count: rows.length });
  const mobileTitle = $("mobileViewTitle");
  if (mobileTitle) mobileTitle.textContent = t(`nav.${store.mode}`);

  // Status tabs and "Add new" only mean something for Posts and Pages.
  $("statusTabs")?.classList.toggle("is-hidden", !content);
  $("addNew")?.classList.toggle("is-hidden", !content);
  const addNew = $("addNew");
  if (addNew) addNew.textContent = t(store.mode === "pages" ? "action.add_page" : "action.add_post");
  document.querySelectorAll("[data-status-filter]").forEach((node) => {
    node.classList.toggle("active", node.dataset.statusFilter === store.statusFilter);
  });

  list.querySelectorAll("[data-record-id]").forEach((node) => {
    node.onclick = () => {
      if (isMobileLayout()) setMobileDetailOpen(true);
      navigateTo({ selectedId: node.dataset.recordId });
    };
  });
}

// ── detail ───────────────────────────────────────────────────────────────────

const metaRow = (label, value) =>
  value ? `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

const backToList = () =>
  `<button type="button" class="back-to-list" id="backToList">${escapeHtml(t("detail.back"))}</button>`;

const itemDetail = (item) => {
  const terms = new Map((store.state.terms || []).map((term) => [term.recordId, term]));
  const named = (ids) =>
    ids
      .map((id) => terms.get(id)?.name)
      .filter(Boolean)
      .join(", ");

  let bodyHtml;
  const notes = [];
  if (item.kind === "posts") {
    bodyHtml = renderMarkdown(item.body);
    notes.push(t("preview.markdown_note"));
  } else {
    const { html, dropped } = sanitizeHtml(item.body);
    bodyHtml = html;
    notes.push(t("preview.html_note"));
    if (dropped.length) notes.push(t("preview.sanitizer_dropped", { tags: dropped.join(", ") }));
  }

  const live = item.status === LIVE_STATUS;
  return `
    ${backToList()}
    <div class="detail-actions-top">
      <button type="button" class="primary" id="editItem">${escapeHtml(t("action.edit"))}</button>
      <button type="button" id="toggleStatus">${escapeHtml(
        live ? t("action.unpublish") : t("action.publish"),
      )}</button>
      ${
        item.path && live
          ? `<span class="detail-hint">${escapeHtml(t("detail.live_at", { path: item.path }))}</span>`
          : `<span class="detail-hint">${escapeHtml(t("detail.not_live"))}</span>`
      }
    </div>
    <article class="preview">
      <div class="preview-badges">
        ${statusBadge(item)}
        <span class="badge badge--plain">${escapeHtml(localeLabel(item.locale, choices()))}</span>
        ${item.template ? `<span class="badge badge--plain">${escapeHtml(templateLabel(item.template, choices()))}</span>` : ""}
      </div>
      <h2 class="preview-title">${escapeHtml(item.title || t("common.untitled"))}</h2>
      <code class="preview-path">${escapeHtml(item.path || t("common.no_path"))}</code>
      ${
        item.issues.filter((issue) => issue !== "not-published").length
          ? `<ul class="preview-issues">${item.issues
              .filter((issue) => issue !== "not-published")
              .map(
                (code) =>
                  `<li class="note note--${ISSUE_TONES[code] || "muted"}"><strong>${escapeHtml(
                    t(`issue.${code}.label`),
                  )}</strong> ${escapeHtml(t(`issue.${code}.hint`))}</li>`,
              )
              .join("")}</ul>`
          : ""
      }
      <div class="preview-body">${bodyHtml}</div>
      <dl class="preview-meta">
        ${metaRow(t("field.author"), item.author)}
        ${metaRow(t("field.published_at"), formatDate(item.publishedAt))}
        ${metaRow(t("field.updated_at"), formatDate(item.updatedAt))}
        ${metaRow(t("field.categories"), named(item.categoryIds))}
        ${metaRow(t("field.tags"), named(item.tagIds))}
        ${metaRow(t("field.canonical"), item.canonicalUrl)}
        ${metaRow(t("field.legacy_paths"), item.legacyPaths.join(", "))}
        ${metaRow(t("field.seo_title"), item.seoTitle)}
        ${metaRow(t("field.seo_description"), item.seoDescription)}
      </dl>
      <p class="preview-note">${escapeHtml(notes.join(" "))}</p>
    </article>`;
};

const termDetail = (term) => {
  const users = (store.state.items || []).filter(
    (item) => item.categoryIds.includes(term.recordId) || item.tagIds.includes(term.recordId),
  );
  return `
    ${backToList()}
    <article class="preview">
      <div class="preview-badges">
        <span class="badge badge--${term.usedBy > 0 ? "live" : "plain"}">${escapeHtml(
          t("taxonomy.count", { count: term.usedBy }),
        )}</span>
        <span class="badge badge--plain">${escapeHtml(localeLabel(term.locale, choices()))}</span>
      </div>
      <h2 class="preview-title">${escapeHtml(term.name || t("common.untitled"))}</h2>
      <code class="preview-path">/${escapeHtml(term.slug)}</code>
      ${
        term.duplicateSlug
          ? `<ul class="preview-issues"><li class="note note--danger"><strong>${escapeHtml(
              t("taxonomy.duplicate_slug"),
            )}</strong> ${escapeHtml(t("taxonomy.duplicate_slug_hint"))}</li></ul>`
          : ""
      }
      ${term.description ? `<div class="preview-body"><p>${escapeHtml(term.description)}</p></div>` : ""}
      <h3 class="preview-subhead">${escapeHtml(t("taxonomy.referenced_by"))}</h3>
      ${
        users.length
          ? `<ul class="term-users">${users
              .map(
                (item) =>
                  `<li><button type="button" data-jump-to="${escapeHtml(item.recordId)}" data-jump-kind="${escapeHtml(
                    item.kind,
                  )}">${escapeHtml(item.title || t("common.untitled"))}</button> ${statusBadge(item)}</li>`,
              )
              .join("")}</ul>`
          : `<p class="preview-note">${escapeHtml(t("taxonomy.referenced_by_none"))}</p>`
      }
    </article>`;
};

export function renderDetail() {
  const panel = $("detailPanel");
  if (!panel) return;
  const record = selectedRecord();
  if (!record) {
    panel.innerHTML = `<div class="empty-detail">${escapeHtml(t("empty.select"))}</div>`;
    return;
  }
  panel.innerHTML = inContentMode() ? itemDetail(record) : termDetail(record);

  const back = $("backToList");
  if (back) {
    back.onclick = () => {
      setMobileDetailOpen(false);
      navigateTo({ selectedId: null });
    };
  }
  $("editItem")?.addEventListener("click", () => openEditor(record.kind, record));
  const toggle = $("toggleStatus");
  if (toggle) {
    toggle.onclick = async () => {
      toggle.disabled = true;
      const publishing = record.status !== LIVE_STATUS;
      try {
        const result = await store.provider.setStatus({
          recordId: record.recordId,
          baseCommitId: record.headCommitId,
          title: record.title,
          publishedAt: record.publishedAt || undefined,
          status: publishing ? "published" : "draft",
        });
        toast(merged(result) ? t(publishing ? "toast.published" : "toast.unpublished") : t("toast.needs_approval"));
        await hooks.refresh();
      } catch (error) {
        toast(error.message);
        toggle.disabled = false;
      }
    };
  }
  panel.querySelectorAll("[data-jump-to]").forEach((node) => {
    node.onclick = () => navigateTo({ mode: node.dataset.jumpKind, selectedId: node.dataset.jumpTo });
  });
}

// ── editor ───────────────────────────────────────────────────────────────────

const hooks = { refresh: async () => {} };
export function registerListHooks(overrides) {
  Object.assign(hooks, overrides);
}

const field = (name, labelKey, value, { type = "text", required = false, hintKey = "" } = {}) => `
  <label class="field">
    <span class="field-label">${escapeHtml(t(labelKey))}${required ? " *" : ""}</span>
    ${
      type === "textarea"
        ? `<textarea class="field-input" name="${name}" rows="12" ${required ? "required" : ""}>${escapeHtml(value)}</textarea>`
        : `<input class="field-input" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? "required" : ""}>`
    }
    ${hintKey ? `<span class="field-hint">${escapeHtml(t(hintKey))}</span>` : ""}
  </label>`;

const selectField = (name, labelKey, entries, selected) => `
  <label class="field">
    <span class="field-label">${escapeHtml(t(labelKey))}</span>
    <select class="field-input" name="${name}">
      ${entries
        .map(
          ([value, label]) =>
            `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`,
        )
        .join("")}
    </select>
  </label>`;

/** @param {object|null} item an existing row to edit, or null for a new one. */
export function openEditor(kind, item = null) {
  const sheet = $("editorSheet");
  const body = $("editorFields");
  const title = $("editorTitle");
  if (!sheet || !body) return;
  const isPost = kind === "posts";
  sheet.dataset.kind = kind;
  sheet.dataset.recordId = item?.recordId ?? "";
  sheet.dataset.baseCommitId = item?.headCommitId ?? "";
  title.textContent = item
    ? t(isPost ? "editor.edit_post" : "editor.edit_page")
    : t(isPost ? "editor.new_post" : "editor.new_page");

  const localeEntries = Object.entries(choices().locale || {}).map(([id]) => [
    id,
    localeLabel(id, choices()),
  ]);
  const templateEntries = Object.entries(choices().template || {}).map(([id]) => [
    id,
    templateLabel(id, choices()),
  ]);

  body.innerHTML = [
    field("title", "field.title", item?.title ?? "", { required: true }),
    field("slug", "field.slug", item?.slug ?? "", { required: true }),
    field("path", "field.path", item?.path ?? "", { required: true, hintKey: "field.path_hint" }),
    selectField("locale", "field.locale", localeEntries, item?.locale ?? "en"),
    isPost ? "" : selectField("template", "field.template", templateEntries, item?.template ?? "standard"),
    isPost ? field("description", "field.excerpt", item?.description ?? "") : "",
    field("body", isPost ? "field.body_markdown" : "field.body_html", item?.body ?? "", {
      type: "textarea",
      required: true,
    }),
    isPost ? field("author", "field.author", item?.author ?? "") : "",
    field("seo-title", "field.seo_title", item?.seoTitle ?? ""),
    field("seo-description", "field.seo_description", item?.seoDescription ?? ""),
  ].join("");

  // Prefill the path from the slug for a new item only, and only until the path is
  // edited by hand. Rewriting the path of a live page because someone fixed a typo
  // in its slug would silently break every link to it.
  if (!item) {
    const form = $("editorForm");
    const slug = form.elements.slug;
    const path = form.elements.path;
    let pathTouched = false;
    path.addEventListener("input", () => {
      pathTouched = true;
    });
    slug.addEventListener("input", () => {
      if (!pathTouched) path.value = isPost ? `/blog/${slug.value}` : `/${slug.value}`;
    });
  }
  sheet.showModal();
}

export function registerEditorSubmit() {
  const form = $("editorForm");
  const sheet = $("editorSheet");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entries = [...new FormData(form).entries()].filter(([, value]) => String(value).trim());
    const submit = $("editorSubmit");
    submit.disabled = true;
    try {
      const result = await store.provider.save({
        kind: sheet.dataset.kind === "pages" ? "pages" : "posts",
        recordId: sheet.dataset.recordId || undefined,
        baseCommitId: sheet.dataset.baseCommitId || undefined,
        fields: Object.fromEntries(entries),
      });
      sheet.close();
      form.reset();
      toast(merged(result) ? t("toast.saved") : t("toast.needs_approval"));
      await hooks.refresh();
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

// ── chrome ───────────────────────────────────────────────────────────────────

export function renderCounts() {
  const counts = store.state.counts || {};
  for (const mode of ["posts", "pages", "categories", "tags"]) {
    const node = $(`count-${mode}`);
    if (node) node.textContent = String(counts[mode] ?? 0);
  }
}

export function renderLocaleFilter() {
  const select = $("localeFilter");
  if (!select) return;
  const locales = [...new Set((store.state.items || []).map((item) => item.locale))]
    .filter(Boolean)
    .sort();
  select.innerHTML = [
    `<option value="all">${escapeHtml(t("filter.all_locales"))}</option>`,
    ...locales.map(
      (locale) =>
        `<option value="${escapeHtml(locale)}"${locale === store.localeFilter ? " selected" : ""}>${escapeHtml(
          localeLabel(locale, choices()),
        )}</option>`,
    ),
  ].join("");
}

export { STATUS_FILTERS };

export function renderAll() {
  renderCounts();
  renderLocaleFilter();
  renderList();
  renderDetail();
  syncRoute();
}

export function renderAllPreservingScroll() {
  const scroll = captureScrollState();
  renderAll();
  restoreScrollState(scroll);
}
