import { toast } from "./api.js";
import { ISSUE_TONES, LIVE_STATUS, needsAttention } from "./content-model.js";
import { escapeHtml, formatDate, kindLabel, localeLabel, statusLabel, templateLabel } from "./format.js";
import { t } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";
import { DETAIL_MODES, fullPageHash, navigateTo, syncRoute } from "./router.js";
import { sanitizeHtml } from "./sanitize.js";
import { $, CONTENT_MODES, MODES, store } from "./store.js";

/**
 * Overview, then Posts, Pages, Categories, Tags — one toolbar row over a
 * full-bleed table each, and one detail markup shown in the Base's mode
 * (`ui.detail_modes` in config.js): posts and pages open as a page, terms in a
 * drawer over the list.
 *
 * The shape is still a WordPress admin: the sidebar picks *what kind of thing*,
 * the toolbar narrows by publication state and locale, and the detail shows the
 * thing with the two buttons that matter on it. No queue, no second waiting state.
 */

const choices = () => store.state.choices || {};

/**
 * Did the write land, or is it waiting for someone with write access? The app does
 * not decide that — Busabase does, from the actor's own permission — so the answer
 * is read off what came back.
 */
const merged = (result) => result?.materialized !== false && result?.status !== "in_review";
export const inContentMode = () => CONTENT_MODES.includes(store.mode);
const onRecordView = () => MODES.includes(store.mode);

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

/** True while search or a filter narrows the list, so the toolbar shows its count. */
const isNarrowed = () =>
  Boolean(store.query.trim()) ||
  store.localeFilter !== "all" ||
  (inContentMode() && store.statusFilter !== "all");

/**
 * The record the URL names, looked up among everything loaded for this Base —
 * not only the filtered rows, or a shared link would open nothing whenever its
 * record did not match the list's current filter.
 */
export function selectedRecord() {
  if (!store.selectedId) return null;
  const rows = inContentMode()
    ? (store.state.items || []).filter((item) => item.kind === store.mode)
    : (store.state.terms || []).filter((term) => term.kind === store.mode);
  return rows.find((row) => row.recordId === store.selectedId) || null;
}

// ── badges ───────────────────────────────────────────────────────────────────

/** base-ui `.badge`: one --dot token drives dot, wash and ink together. */
const STATUS_TONE = { published: "positive", "in-review": "warning", in_review: "warning" };
const statusBadge = (item) =>
  `<span class="badge ${STATUS_TONE[item.status] || ""}">${escapeHtml(
    item.status === LIVE_STATUS ? t("status.published") : statusLabel(item.status, choices()),
  )}</span>`;

const usageBadge = (term) =>
  `<span class="badge ${term.usedBy > 0 ? "positive" : ""}">${escapeHtml(
    t("taxonomy.count", { count: term.usedBy }),
  )}</span>`;

/**
 * One warning per row at most, and only for the things a visitor would actually
 * hit: a path the SDK will refuse, or two live pages fighting over one URL. The
 * rest of the checks stay in the detail, where there is room to explain them.
 */
const ROW_WARNINGS = ["blank-field", "bad-path", "duplicate-path", "empty-body"];
const issueChip = (code) =>
  `<span class="chip chip--${ISSUE_TONES[code] || "muted"}" title="${escapeHtml(
    t(`issue.${code}.hint`),
  )}">${escapeHtml(t(`issue.${code}.label`))}</span>`;
const rowWarning = (item) => {
  const code = ROW_WARNINGS.find((candidate) => item.issues.includes(candidate));
  return code ? issueChip(code) : "";
};
/** Overview lists warnings too, so it names the worst issue of any tone. */
const worstIssueChip = (item) => {
  const code = item.issues.find((issue) => ISSUE_TONES[issue] === "danger") ||
    item.issues.find((issue) => ISSUE_TONES[issue] === "warn");
  return code ? issueChip(code) : "";
};

// ── list ─────────────────────────────────────────────────────────────────────

const rowOpen = (id) =>
  `<tr data-record-id="${escapeHtml(id)}"${id === store.selectedId ? ' class="ws-selected"' : ""}>`;

const itemRow = (item) => `
  ${rowOpen(item.recordId)}
    <td><span class="cell-name"><span class="cell-title">${escapeHtml(
      item.title || t("common.untitled"),
    )}</span>${rowWarning(item)}</span></td>
    <td>${statusBadge(item)}</td>
    <td><code class="cell-path">${escapeHtml(item.path || t("common.no_path"))}</code></td>
    <td>${escapeHtml(localeLabel(item.locale, choices()))}</td>
    ${
      item.kind === "posts"
        ? `<td>${escapeHtml(item.author)}</td><td class="cell-date">${escapeHtml(formatDate(item.publishedAt))}</td>`
        : `<td>${escapeHtml(item.template ? templateLabel(item.template, choices()) : "")}</td><td class="cell-date">${escapeHtml(formatDate(item.updatedAt))}</td>`
    }
  </tr>`;

const termRow = (term) => `
  ${rowOpen(term.recordId)}
    <td><span class="cell-name"><span class="cell-title">${escapeHtml(term.name || t("common.untitled"))}</span></span></td>
    <td>${term.usedBy === 0 && term.usedByDrafts === 0 ? issueChip("orphan") : usageBadge(term)}</td>
    <td><code class="cell-path">/${escapeHtml(term.slug)}</code>${
      term.duplicateSlug ? ` <span class="chip chip--danger">${escapeHtml(t("taxonomy.duplicate_slug"))}</span>` : ""
    }</td>
    <td>${escapeHtml(localeLabel(term.locale, choices()))}</td>
    <td class="cell-muted">${escapeHtml(term.description)}</td>
  </tr>`;

const itemHead = (kind) => `
  <tr>
    <th>${escapeHtml(t("field.title"))}</th>
    <th class="col-status">${escapeHtml(t("col.status"))}</th>
    <th class="ws-col-wide">${escapeHtml(t("field.path"))}</th>
    <th class="col-locale">${escapeHtml(t("field.locale"))}</th>
    <th class="col-meta">${escapeHtml(t(kind === "posts" ? "field.author" : "field.template"))}</th>
    <th class="col-date">${escapeHtml(t(kind === "posts" ? "field.published_at" : "field.updated_at"))}</th>
  </tr>`;

const termHead = () => `
  <tr>
    <th>${escapeHtml(t("col.name"))}</th>
    <th class="col-status">${escapeHtml(t("taxonomy.referenced_by"))}</th>
    <th class="ws-col-wide">${escapeHtml(t("field.slug"))}</th>
    <th class="col-locale">${escapeHtml(t("field.locale"))}</th>
    <th>${escapeHtml(t("col.description"))}</th>
  </tr>`;

/** `50+` when the Base has more pages than are loaded; the exact total otherwise. */
export function navCount(mode) {
  const exact = store.state.totals?.[mode];
  if (typeof exact === "number") return String(exact);
  const loaded = store.raw[mode]?.length ?? 0;
  return store.cursors[mode] ? `${loaded}+` : String(loaded);
}

export function renderList() {
  const list = $("listPanel");
  if (!list || !onRecordView()) return;
  const content = inContentMode();
  const rows = content ? visibleItems() : visibleTerms();
  const more = store.cursors[store.mode]
    ? `<div class="list-more"><button type="button" class="button" id="loadMore">${escapeHtml(
        t("list.load_more"),
      )}</button><span>${escapeHtml(t("list.partial", { count: store.raw[store.mode]?.length ?? 0 }))}</span></div>`
    : "";

  list.innerHTML = rows.length
    ? `<table class="ws-table cms-table cms-table--${content ? "items" : "terms"}">
         <thead>${content ? itemHead(store.mode) : termHead()}</thead>
         <tbody>${rows.map(content ? itemRow : termRow).join("")}</tbody>
       </table>${more}`
    : `<div class="empty-state">
         <strong>${escapeHtml(t(isNarrowed() ? "empty.filtered_title" : "empty.title"))}</strong>
         <p>${escapeHtml(t(isNarrowed() ? "empty.filtered" : `empty.${store.mode}`))}</p>
         ${
           content && !isNarrowed()
             ? `<button type="button" class="button primary" data-add-new>${escapeHtml(
                 t(store.mode === "pages" ? "action.add_page" : "action.add_post"),
               )}</button>`
             : ""
         }
       </div>${more}`;

  const count = $("viewCount");
  if (count) count.textContent = String(rows.length);
}

// ── detail ───────────────────────────────────────────────────────────────────

const metaRow = (label, value) =>
  value ? `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

/** Relation ids → names. A term outside the loaded page says so instead of showing its id. */
const termNames = (ids) => {
  const terms = new Map((store.state.terms || []).map((term) => [term.recordId, term]));
  return ids.map((id) => terms.get(id)?.name || t("common.not_loaded")).join(", ");
};

const itemDetail = (item) => {
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
  const issues = item.issues.filter((issue) => issue !== "not-published");

  return `
    <article class="preview">
      <div class="preview-badges">
        ${statusBadge(item)}
        <span class="badge">${escapeHtml(localeLabel(item.locale, choices()))}</span>
        ${item.template ? `<span class="badge">${escapeHtml(templateLabel(item.template, choices()))}</span>` : ""}
      </div>
      <h2 class="preview-title">${escapeHtml(item.title || t("common.untitled"))}</h2>
      <code class="preview-path">${escapeHtml(item.path || t("common.no_path"))}</code>
      ${
        issues.length
          ? `<ul class="preview-issues">${issues
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
        ${metaRow(t("field.categories"), termNames(item.categoryIds))}
        ${metaRow(t("field.tags"), termNames(item.tagIds))}
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
    <article class="preview">
      <div class="preview-badges">
        ${usageBadge(term)}
        <span class="badge">${escapeHtml(localeLabel(term.locale, choices()))}</span>
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
                  `<li><a href="${escapeHtml(fullPageHash(item.kind, item.recordId))}">${escapeHtml(
                    item.title || t("common.untitled"),
                  )}</a> ${statusBadge(item)}</li>`,
              )
              .join("")}</ul>`
          : `<p class="preview-note">${escapeHtml(t("taxonomy.referenced_by_none"))}</p>`
      }
    </article>`;
};

/** The record the URL names is not loaded: ask for it once with records.get. */
const fetchMissing = async (recordId, mode) => {
  if (store.fetchedIds.has(recordId) || !store.provider?.getRecord) return;
  store.fetchedIds.add(recordId);
  const record = await store.provider.getRecord(recordId).catch(() => null);
  if (!record || !store.raw[mode]) {
    renderDetail();
    return;
  }
  if (!store.raw[mode].some((row) => row.id === record.id)) store.raw[mode].push(record);
  hooks.reanalyze();
  renderList();
  renderDetail();
};

const barActions = (record) => {
  const content = inContentMode();
  const parts = [];
  if (content) {
    const live = record.status === LIVE_STATUS;
    parts.push(
      `<span class="detail-hint">${escapeHtml(
        live && record.path ? t("detail.live_at", { path: record.path }) : t("detail.not_live"),
      )}</span>`,
      `<button type="button" class="button" id="toggleStatus">${escapeHtml(
        live ? t("action.unpublish") : t("action.publish"),
      )}</button>`,
      `<button type="button" class="button primary" id="editItem">${escapeHtml(t("action.edit"))}</button>`,
    );
  }
  if (store.presentation !== "page") {
    parts.push(
      `<a class="button" href="${escapeHtml(fullPageHash(store.mode, record.recordId))}">${escapeHtml(
        t("detail.open_full"),
      )}</a>`,
    );
  }
  return parts.join("");
};

export function renderDetail() {
  const body = $("detailBody");
  const bar = $("detailBar");
  if (!body || !bar || !onRecordView()) return;
  if (!store.selectedId) {
    bar.hidden = true;
    body.innerHTML = "";
    return;
  }
  bar.hidden = false;
  const back = $("detailBack");
  if (back) back.textContent = t(store.presentation === "page" ? "detail.back" : "common.close");
  const record = selectedRecord();
  const actions = $("detailActions");
  if (!record) {
    if (actions) actions.innerHTML = "";
    const pending = !store.fetchedIds.has(store.selectedId) && store.provider?.getRecord;
    body.innerHTML = `<div class="ws-detail-empty">${escapeHtml(t(pending ? "detail.loading" : "detail.missing"))}</div>`;
    fetchMissing(store.selectedId, store.mode);
    return;
  }
  if (actions) actions.innerHTML = barActions(record);
  body.innerHTML = inContentMode() ? itemDetail(record) : termDetail(record);

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
}

/**
 * Back (page) or Close/Escape (drawer): return to the list with its search and
 * filters. When the record was opened from that list, step back to the list's
 * own history entry, so the browser's Back does not reopen what was just closed.
 */
export function closeDetail() {
  if (history.state?.fromList) {
    history.back();
    return;
  }
  navigateTo({ selectedId: null }, { replace: true });
}

export function openRecord(recordId) {
  // Switching records while the drawer is open replaces the entry, so Close
  // still steps back to the list the drawer was opened from.
  const replace = Boolean(store.selectedId) && store.presentation === "drawer";
  navigateTo({ selectedId: recordId }, { replace, state: { fromList: true } });
}

// ── overview ─────────────────────────────────────────────────────────────────

const recordLink = (item) =>
  `<a class="overview-link" href="${escapeHtml(fullPageHash(item.kind, item.recordId))}">${escapeHtml(
    item.title || t("common.untitled"),
  )}</a>`;

/** An exact total from records.count when every input is known, else the loaded figure marked partial. */
const exactOr = (values, fallback, partial) =>
  values.every((value) => typeof value === "number")
    ? String(values.reduce((sum, value) => sum + value, 0))
    : `${fallback}${partial ? "+" : ""}`;

export function renderOverview() {
  const page = $("overviewPage");
  if (!page || store.mode !== "overview") return;
  const counts = store.state.counts || {};
  const totals = store.state.totals || {};
  const items = store.state.items || [];
  const partial = Boolean(store.cursors.posts || store.cursors.pages);

  const live = exactOr([totals.livePosts, totals.livePages], counts.live ?? 0, partial);
  const notLive =
    [totals.posts, totals.pages, totals.livePosts, totals.livePages].every((value) => typeof value === "number")
      ? String(totals.posts + totals.pages - totals.livePosts - totals.livePages)
      : `${counts.not_live ?? 0}${partial ? "+" : ""}`;
  const attention = items.filter(needsAttention);

  const metrics = $("overviewMetrics");
  if (metrics) {
    metrics.innerHTML = [
      [t("overview.metric.live"), live, t("overview.metric.live_hint")],
      [t("overview.metric.not_live"), notLive, t("overview.metric.not_live_hint")],
      [t("overview.metric.attention"), `${attention.length}${partial ? "+" : ""}`, t("overview.metric.attention_hint")],
    ]
      .map(
        ([label, value, hint]) =>
          `<div title="${escapeHtml(hint)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`,
      )
      .join("");
  }

  const summary = $("overviewSummary");
  if (summary) {
    const locales = (counts.locales || []).map((id) => localeLabel(id, choices()));
    summary.textContent = locales.length
      ? t("overview.summary", { locales: locales.join(", ") })
      : t("overview.summary_none");
  }

  const attentionRows = attention
    .slice()
    .sort((a, b) => (a.tone === b.tone ? byRecency(a, b) : a.tone === "danger" ? -1 : 1))
    .slice(0, 8)
    .map(
      (item) => `
        <li>
          ${recordLink(item)}
          <span class="overview-kind">${escapeHtml(kindLabel(item.kind))}</span>
          ${worstIssueChip(item)}
        </li>`,
    )
    .join("");
  const recentRows = items
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || byRecency(a, b))
    .slice(0, 8)
    .map(
      (item) => `
        <li>
          ${recordLink(item)}
          <span class="overview-kind">${escapeHtml(kindLabel(item.kind))}</span>
          ${statusBadge(item)}
        </li>`,
    )
    .join("");

  const body = $("overviewBody");
  if (body) {
    body.innerHTML = `
      <section class="card overview-card">
        <div class="card-heading"><h2>${escapeHtml(t("overview.attention_title"))}</h2></div>
        ${
          attentionRows
            ? `<ul class="overview-list">${attentionRows}</ul>`
            : `<p class="overview-empty">${escapeHtml(t("overview.attention_none"))}</p>`
        }
      </section>
      <section class="card overview-card">
        <div class="card-heading"><h2>${escapeHtml(t("overview.recent_title"))}</h2></div>
        ${
          recentRows
            ? `<ul class="overview-list">${recentRows}</ul>`
            : `<p class="overview-empty">${escapeHtml(t("empty.posts"))}</p>`
        }
      </section>`;
  }
}

// ── editor ───────────────────────────────────────────────────────────────────

const hooks = { refresh: async () => {}, reanalyze: () => {} };
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
  for (const mode of MODES) {
    const node = $(`count-${mode}`);
    if (node) node.textContent = navCount(mode);
  }
}

export function renderLocaleFilter() {
  const select = $("localeFilter");
  if (!select) return;
  const rows = inContentMode()
    ? (store.state.items || []).filter((item) => item.kind === store.mode)
    : (store.state.terms || []).filter((term) => term.kind === store.mode);
  const locales = [...new Set(rows.map((row) => row.locale))].filter(Boolean).sort();
  if (store.localeFilter !== "all" && !locales.includes(store.localeFilter)) locales.push(store.localeFilter);
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

/** The toolbar row: the view's name (description as its tooltip), filters, search, Add. */
function renderToolbar() {
  const content = inContentMode();
  const title = $("viewTitle");
  if (title) {
    title.textContent = t(`nav.${store.mode}`);
    title.title = t(`nav.${store.mode}.tooltip`);
  }
  $("statusTabs").hidden = !content;
  const addNew = $("addNew");
  if (addNew) {
    addNew.hidden = !content;
    addNew.textContent = t(store.mode === "pages" ? "action.add_page" : "action.add_post");
  }
  document.querySelectorAll("[data-status-filter]").forEach((node) => {
    node.classList.toggle("active", node.dataset.statusFilter === store.statusFilter);
  });
  const search = $("searchInput");
  if (search && document.activeElement !== search) search.value = store.query;
  renderLocaleFilter();
}

function renderMobileBar() {
  const title = $("mobileViewTitle");
  if (title) title.textContent = t(`nav.${store.mode}`);
  // The phone bar names the view, so it also carries the list's count — the
  // toolbar title (and its count) is hidden there to give the rows the room.
  const meta = $("mobileViewMeta");
  if (meta) {
    const rows = onRecordView() ? (inContentMode() ? visibleItems() : visibleTerms()).length : null;
    meta.textContent = rows === null ? t("brand.subtitle") : t("list.count", { count: rows });
  }
}

/**
 * Body state is the contract with base-ui.css "Record views": `ws-detail-open`
 * whenever a record is shown, plus exactly one mode class.
 */
function syncBodyState() {
  const recordView = onRecordView();
  const shown = recordView && Boolean(store.selectedId);
  const body = document.body.classList;
  body.toggle("ws-detail-open", shown);
  body.toggle("ws-detail-page", shown && store.presentation === "page");
  body.toggle("ws-detail-drawer", recordView && store.presentation !== "page" && DETAIL_MODES[store.mode] === "drawer");
  body.toggle("ws-searching", recordView && isNarrowed());
  body.add("ws-has-mobile-bar");
  $("overviewPage").hidden = recordView;
  $("viewPage").hidden = !recordView;
}

export function render() {
  syncBodyState();
  renderCounts();
  renderMobileBar();
  if (onRecordView()) {
    renderToolbar();
    renderList();
    renderDetail();
  } else {
    renderOverview();
  }
}

export function renderAll() {
  render();
  syncRoute();
}

export function renderAllPreservingScroll() {
  const list = $("listPanel");
  const detail = $("detailPanel");
  const overview = $("overviewPage");
  const tops = [list?.scrollTop || 0, detail?.scrollTop || 0, overview?.scrollTop || 0];
  renderAll();
  if (list) list.scrollTop = tops[0];
  if (detail) detail.scrollTop = tops[1];
  if (overview) overview.scrollTop = tops[2];
}
