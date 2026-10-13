import {
  byteLength,
  charLength,
  checks,
  claimRefLinks,
  claimStatusBadge,
  claimsRegistry,
  countOf,
  DETAIL_MODES,
  date,
  detailUrl,
  draftById,
  draftLabel,
  drafts,
  els,
  enumLabel,
  escapeHtml,
  filteredChecks,
  filteredClaims,
  filteredDrafts,
  filteredProducts,
  filteredReviewItems,
  isPartial,
  isPendingRecord,
  loadState,
  localeBadge,
  noticeBanner,
  pagerControl,
  platformBadge,
  platformRulesFor,
  productById,
  productName,
  products,
  REVIEW_STATES,
  recordById,
  recordUrl,
  render,
  resultBadge,
  reviewForDraft,
  reviewItems,
  ruleById,
  rules,
  scoreCell,
  severityBadge,
  sourceBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

const cell = (html, title = "", className = "") =>
  `<td${className ? ` class="${className}"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}>${html}</td>`;
const emptyState = (title, detail = "") =>
  `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
const draftRef = (draft) => `${t("draftRef")} #${draft?.ref ?? ""}`;
// In a table whose column is already headed "Draft", the row only needs "#4".
const shortRef = (draft) => `#${draft?.ref ?? ""}`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries review / failed
// / ready-to-export). Exact counts come from records.count when the provider
// has them; anything tallied from loaded rows says so when more rows exist.
function passRate() {
  const { checks_pass: pass, checks_warn: warn, checks_fail: fail } = state.counts || {};
  if (pass != null && warn != null && fail != null) {
    return { value: `${Math.round((pass / Math.max(1, pass + warn + fail)) * 100)}%`, partial: false };
  }
  return { value: `${state.snapshot?.metrics?.compliance_pass_rate || 0}%`, partial: isPartial("checks") };
}

function metricsBand() {
  const metrics = state.snapshot?.metrics || {};
  const rate = passRate();
  const loadedScope = (key) => (isPartial(key) ? ` · ${t("loadedOnly")}` : "");
  return [
    [`${t("passRate")}${rate.partial ? ` · ${t("loadedOnly")}` : ""}`, rate.value],
    [t("inRevision"), countOf("drafts_changes_requested", "drafts", metrics.drafts_in_revision || 0)],
    [`${t("exportedThisWeek")}${loadedScope("drafts")}`, metrics.exported_this_week || 0],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function matrixCell(product, platform) {
  if (!(product.platforms || []).includes(platform)) return { state: "none", drafts: [] };
  const cellDrafts = drafts().filter((draft) => draft.product_id === product.product_id && draft.platform === platform);
  if (!cellDrafts.length) return { state: "none", drafts: [] };
  const statuses = cellDrafts.map((draft) => draft.status);
  if (statuses.includes("done")) return { state: "exported", drafts: cellDrafts };
  if (statuses.every((status) => status === "approved")) return { state: "approved", drafts: cellDrafts };
  return { state: "draft", drafts: cellDrafts };
}

function statusMatrix() {
  const platforms = (state.settings?.config_summary?.platforms || []).map((entry) => entry.platform);
  const allPlatforms = platforms.length ? platforms : [...new Set(drafts().map((draft) => draft.platform))];
  if (!products().length) return `<div class="empty-inline">${t("noProducts")}</div>`;
  return `
    <div class="matrix-wrap">
      <table class="matrix-table">
        <thead>
          <tr><th>${t("product")}</th>${allPlatforms.map((platform) => `<th>${escapeHtml(enumLabel(platform, "platform"))}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${products()
            .map(
              (product) => `
            <tr>
              <td><a class="strong" href="${detailUrl(product.product_id, "products")}">${escapeHtml(product.name)}</a><div class="muted">${escapeHtml(product.sku)}</div></td>
              ${allPlatforms
                .map((platform) => {
                  const entry = matrixCell(product, platform);
                  const first = entry.drafts[0];
                  const label = enumLabel(entry.state, "cell");
                  if (entry.state === "none") return `<td><span class="matrix-cell none">${escapeHtml(label)}</span></td>`;
                  return `<td><a class="matrix-cell ${escapeHtml(entry.state)}" href="${detailUrl(first.draft_id, "drafts")}">${escapeHtml(label)}${entry.drafts.length > 1 ? ` ×${entry.drafts.length}` : ""}</a></td>`;
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
    state.snapshot?.seller?.brand || "",
    `${countOf("products_total", "products", products().length)} ${t("productsLower")}`,
    `${countOf("drafts_total", "drafts", drafts().length)} ${t("draftsLower")}`,
    generated ? `${t("generated")} ${generated}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("overviewMetrics").innerHTML = metricsBand();
  const awaiting = reviewItems().filter((item) => item.status === "needs_review");
  const activity = (state.snapshot?.activity_log || [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8);
  document.getElementById("overviewBody").innerHTML = `
    ${warnings()}
    <section class="overview-grid">
      <div class="card overview-panel overview-wide">
        <h2>${t("matrix")}</h2>
        ${statusMatrix()}
      </div>
      <div class="card overview-panel">
        <h2>${t("reviewQueue")}</h2>
        ${
          awaiting
            .map((item) => {
              const draft = draftById(item.draft_id);
              return `
            <a class="due-row" href="${recordUrl(item.draft_id, "review")}">
              <span><strong>${draftRef(item)} · ${escapeHtml(draft ? draftLabel(draft) : t("notLoaded"))}</strong><small>${escapeHtml(item.compliance_summary || "")}</small></span>
              <span class="due-meta">${statusBadge(item.status)}${draft ? `<small>${scoreCell(draft.compliance_score)}</small>` : ""}</span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noReviewItems")}</div>`
        }
      </div>
      <div class="card overview-panel">
        <h2>${t("activities")}</h2>
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
const VIEW_HINT = {
  products: "productsHint",
  drafts: "draftsHint",
  checks: "checksHint",
  claims: "claimsIntro",
  review: "reviewHint",
};

const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;

const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;

function productStatus(own) {
  if (!own.length) return "";
  if (own.some((draft) => draft.status === "needs_review")) return "needs_review";
  if (own.some((draft) => draft.status === "changes_requested")) return "changes_requested";
  if (own.every((draft) => draft.status === "done")) return "done";
  return "approved";
}

function productsTable(items) {
  return `
    <table class="ws-table listing-table products-table">
      ${tableHead([
        [t("product")],
        [t("sku")],
        [t("category")],
        [t("source")],
        [t("platforms")],
        [t("drafts"), "ws-col-num"],
        [t("status")],
        [t("lastUpdated")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const own = drafts().filter((draft) => draft.product_id === item.product_id);
            const overall = productStatus(own);
            return `${rowOpen(item.product_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(escapeHtml(item.sku), item.sku)}
              ${cell(escapeHtml(item.category || ""), item.category)}
              ${cell(sourceBadge(item.source))}
              ${cell((item.platforms || []).map(platformBadge).join(" "), (item.platforms || []).map((p) => enumLabel(p, "platform")).join(", "))}
              ${cell(String(own.length), "", "ws-col-num")}
              ${cell(overall ? statusBadge(overall) : `<span class="muted">${enumLabel("none", "cell")}</span>`)}
              ${cell(date(item.updated_at))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function draftsTable(items) {
  return `
    <table class="ws-table listing-table drafts-table">
      ${tableHead([
        [t("draft")],
        [t("platform")],
        [t("locale")],
        [t("title")],
        [t("score"), "ws-col-num"],
        [t("status")],
        [t("lastUpdated")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const name = `${shortRef(item)} · ${productName(item.product_id)}`;
            const title = item.fields?.title || "";
            return `${rowOpen(item.draft_id)}
              ${cell(`<span class="strong">${escapeHtml(name)}</span>`, name)}
              ${cell(platformBadge(item.platform))}
              ${cell(localeBadge(item.locale))}
              ${cell(escapeHtml(title), title)}
              ${cell(scoreCell(item.compliance_score), "", "ws-col-num")}
              ${cell(statusBadge(item.status))}
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
    <table class="ws-table listing-table checks-table">
      ${tableHead([[t("rule")], [t("result")], [t("draft")], [t("platform")], [t("severity")], [t("evidence")]])}
      <tbody>
        ${items
          .map((item) => {
            const draft = draftById(item.draft_id);
            const name = draft
              ? `${shortRef(draft)} · ${productName(draft.product_id)}${draft.locale ? ` · ${draft.locale}` : ""}`
              : t("notLoaded");
            const ruleName = ruleById(item.rule_id)?.name || enumLabel(item.rule_id, "rule");
            return `${rowOpen(item.check_id)}
              ${cell(`<span class="strong">${escapeHtml(ruleName)}</span>`, ruleName)}
              ${cell(resultBadge(item.result))}
              ${cell(escapeHtml(name), name)}
              ${cell(draft ? platformBadge(draft.platform) : "")}
              ${cell(severityBadge(item.severity))}
              ${cell(escapeHtml(item.evidence || ""), item.evidence)}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function claimsTable(items) {
  if (state.route.tab === "rules") {
    return `
      <table class="ws-table listing-table rules-table">
        ${tableHead([[t("phrase")], [t("severity")], [t("type")], [t("reason")], [t("alternative")]])}
        <tbody>
          ${items
            .map(
              (rule) => `${rowOpen(rule.rule_id)}
              ${cell(`<span class="strong">${escapeHtml(rule.phrase)}</span>`, rule.phrase)}
              ${cell(severityBadge(rule.severity || "error"))}
              ${cell(`<span class="tag">${escapeHtml(enumLabel(rule.type, "claim"))}</span>`)}
              ${cell(escapeHtml(rule.reason || ""), rule.reason)}
              ${cell(escapeHtml(rule.alternative || ""), rule.alternative)}
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }
  return `
    <table class="ws-table listing-table claims-table">
      ${tableHead([[t("claimText")], [t("claimStatus")], [t("category")], [t("substantiation")], [t("claimEvidence")]])}
      <tbody>
        ${items
          .map(
            (claim) => `${rowOpen(claim.claim_id)}
            ${cell(`<span class="strong">${escapeHtml(claim.text)}</span>`, claim.text)}
            ${cell(claimStatusBadge(claim.status))}
            ${cell(escapeHtml(claim.category || ""), claim.category)}
            ${cell(escapeHtml(claim.substantiation || ""), claim.substantiation)}
            ${cell(escapeHtml((claim.evidence || []).join(", ")), (claim.evidence || []).join(", "))}
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function reviewTable(items) {
  return `
    <table class="ws-table listing-table review-table">
      ${tableHead([[t("draft")], [t("status")], [t("score"), "ws-col-num ws-split-keep"]])}
      <tbody>
        ${items
          .map((item) => {
            const draft = draftById(item.draft_id);
            const name = `${shortRef(item)} · ${draft ? draftLabel(draft) : t("notLoaded")}`;
            return `${rowOpen(item.draft_id)}
              ${cell(`<span class="strong">${escapeHtml(name)}</span>`, name)}
              ${cell(statusBadge(item.status))}
              ${cell(draft ? scoreCell(draft.compliance_score) : "", "", "ws-col-num ws-split-keep")}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function reviewFilterCount(value) {
  return value === "all" ? reviewItems().length : reviewItems().filter((item) => item.status === value).length;
}

function toolbarControls(view) {
  els.viewFilters.hidden = !["review", "claims"].includes(view);
  els.viewFilters.classList.toggle("view-tabs", view === "claims");
  els.statusSelect.hidden = view !== "review";
  els.viewSelects.hidden = view !== "checks";
  if (view === "review") {
    els.viewFilters.innerHTML = REVIEW_STATES.map((value) => {
      const label = value === "all" ? t("all") : enumLabel(value);
      return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${reviewFilterCount(value)}</b></button>`;
    }).join("");
    els.statusSelect.innerHTML = REVIEW_STATES.map(
      (value) =>
        `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(value === "all" ? t("all") : enumLabel(value))} (${reviewFilterCount(value)})</option>`,
    ).join("");
  } else if (view === "claims") {
    const registry = claimsRegistry();
    const tabs = [
      ["claims", t("approvedClaimsTab"), `${(registry.claims || []).length}${isPartial("claims") ? "+" : ""}`],
      ["rules", t("bannedPhrasesTab"), `${(registry.rules || []).length}${isPartial("claim-rules") ? "+" : ""}`],
    ];
    els.viewFilters.innerHTML = tabs
      .map(
        ([value, label, count]) =>
          `<button type="button" class="segment ${state.route.tab === value ? "active" : ""}" data-tab="${value}">${escapeHtml(label)} <b>${count}</b></button>`,
      )
      .join("");
  } else {
    els.viewFilters.innerHTML = "";
  }
  if (view === "checks") {
    const { filters } = state.route;
    const platforms = [...new Set(drafts().map((draft) => draft.platform))];
    const select = (key, label, options) => `
      <select data-filter="${key}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
        <option value="all">${escapeHtml(`${t("all")} · ${label}`)}</option>
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}"${filters[key] === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>`;
    els.viewSelects.innerHTML = [
      select(
        "rule",
        t("rule"),
        rules().map((rule) => [rule.rule_id, rule.name]),
      ),
      select(
        "platform",
        t("platform"),
        platforms.map((platform) => [platform, enumLabel(platform, "platform")]),
      ),
      select(
        "product",
        t("product"),
        products().map((product) => [product.product_id, product.name]),
      ),
      select(
        "result",
        t("result"),
        ["pass", "warn", "fail"].map((result) => [result, enumLabel(result, "result")]),
      ),
    ].join("");
  } else {
    els.viewSelects.innerHTML = "";
  }
}

export function renderRecordView() {
  const { view } = state.route;
  els.viewTitle.textContent = view === "claims" ? t("claims") : t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  toolbarControls(view);
  let items;
  let table;
  let pagerKey = view;
  let empty;
  if (view === "products") {
    items = filteredProducts();
    table = productsTable(items);
    empty = state.route.query ? t("noMatches") : t("noProducts");
  } else if (view === "drafts") {
    items = filteredDrafts();
    table = draftsTable(items);
    empty = state.route.query ? t("noMatches") : t("noDrafts");
  } else if (view === "checks") {
    items = filteredChecks();
    table = checksTable(items);
    empty = t("noChecks");
  } else if (view === "claims") {
    items = filteredClaims();
    table = claimsTable(items);
    pagerKey = state.route.tab === "rules" ? "claim-rules" : "claims";
    empty = state.route.tab === "rules" ? t("noClaimRules") : t("noClaims");
  } else {
    items = filteredReviewItems();
    table = reviewTable(items);
    pagerKey = "drafts";
    empty = t("noReviewItems");
  }
  els.viewCount.textContent = `${items.length}${isPartial(pagerKey) ? "+" : ""}`;
  els.listPanel.innerHTML = `${state.route.view === "review" ? noticeBanner() : ""}${items.length ? table : emptyState(empty)}${pagerControl(pagerKey)}`;
  renderDetail();
}

function renderDetail() {
  const { view, selectedId, presentation } = state.route;
  const phone = window.matchMedia("(max-width: 720px)").matches;
  els.detailBack.textContent = presentation === "page" || phone ? t("backToList") : t("close");
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) {
    els.detailExpand.href = detailUrl(selectedId, view);
  }
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;
  if (!selectedId) {
    els.detailBody.innerHTML = DETAIL_MODES[view] === "split" ? `<div class="ws-detail-empty">${t("selectReview")}</div>` : "";
    return;
  }
  const item = view === "review" ? draftById(selectedId) : recordById(view, selectedId);
  if (!item) {
    els.detailBody.innerHTML = isPendingRecord(view, selectedId)
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  const renderers = {
    products: productDetail,
    drafts: draftDetail,
    checks: checkDetail,
    claims: state.route.tab === "rules" ? ruleDetail : claimDetail,
    review: reviewDetail,
  };
  els.detailBody.innerHTML = renderers[view](item);
}

// ── Detail renderers (one markup for page, drawer and split) ───────────────
function productDetail(product) {
  const own = drafts().filter((draft) => draft.product_id === product.product_id);
  return `
    <header class="detail-head">
      <h2>${escapeHtml(product.name)}</h2>
      <p class="muted">${escapeHtml([product.sku, product.category, enumLabel(product.source, "source")].filter(Boolean).join(" · "))}</p>
    </header>
    <section class="detail">
      <div class="detail-main">
        <div class="card overview-panel">
          <h3>${t("specs")}</h3>
          <dl class="spec-list">
            ${(product.specs || []).map((spec) => `<dt>${escapeHtml(spec.name)}</dt><dd>${escapeHtml(spec.value)}</dd>`).join("")}
          </dl>
        </div>
        <div class="card overview-panel">
          <h3>${t("features")}</h3>
          <ul class="plain-list">${(product.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
        </div>
        <div class="card overview-panel">
          <h3>${t("keywords")}</h3>
          <div class="chip-list">${(product.keywords || []).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
        </div>
        <div class="card overview-panel">
          <h3>${t("linkedDrafts")}</h3>
          ${
            own
              .map(
                (draft) => `
            <a class="due-row" href="${detailUrl(draft.draft_id, "drafts")}">
              <span><strong>${draftRef(draft)} · ${escapeHtml(enumLabel(draft.platform, "platform"))} ${escapeHtml(draft.locale || "")}</strong><small>${escapeHtml(draft.fields?.title || "")}</small></span>
              <span class="due-meta">${statusBadge(draft.status)}<small>${scoreCell(draft.compliance_score)}</small></span>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noDrafts")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side-stack">
        <div class="card detail-side">
          <dl>
            <dt>${t("sku")}</dt><dd>${escapeHtml(product.sku)}</dd>
            <dt>${t("source")}</dt><dd>${sourceBadge(product.source)}</dd>
            <dt>${t("platforms")}</dt><dd>${(product.platforms || []).map(platformBadge).join(" ")}</dd>
            <dt>${t("locales")}</dt><dd>${(product.locales || []).map(localeBadge).join(" ")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(product.updated_at)}</dd>
          </dl>
          ${product.notes ? `<p class="muted product-notes">${escapeHtml(product.notes)}</p>` : ""}
        </div>
        <div class="card detail-side">
          <h3>${t("imageChecklist")}</h3>
          ${(product.images || [])
            .map(
              (image) => `
            <div class="check-row">
              <span class="image-tick ${escapeHtml(image.status)}" aria-hidden="true">${image.status === "ready" ? "✓" : image.status === "missing" ? "✕" : "…"}</span>
              <span><strong>${escapeHtml(image.name)}</strong><small>${escapeHtml(enumLabel(image.status, "image"))}</small></span>
            </div>
          `,
            )
            .join("")}
        </div>
      </aside>
    </section>
  `;
}

function editedFields(draft) {
  return { ...draft.fields, ...(state.fieldEdits[draft.draft_id] || {}) };
}

function counterMarkup(id, current, max, unit) {
  const over = max && current > max;
  return `<span class="counter ${over ? "over" : ""}" id="${id}">${current}${max ? ` / ${max}` : ""} ${unit}</span>`;
}

function textField({ key, label, value, rows = 2, max = 0, unit = "chars", mono = false }) {
  const current = unit === "bytes" ? byteLength(value) : charLength(value);
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label>${counterMarkup(`count-${key}`, current, max, t(unit))}</div>
      <textarea id="f-${key}" class="field-input ${mono ? "mono" : ""}" data-field="${escapeHtml(key)}" data-max="${max}" data-unit="${unit}" rows="${rows}">${escapeHtml(value || "")}</textarea>
    </div>
  `;
}

function listField({ key, label, values, rows = 6, hint = "" }) {
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label><span class="counter" id="count-${key}">${(values || []).length}</span></div>
      <textarea id="f-${key}" class="field-input" data-field="${escapeHtml(key)}" data-kind="list" rows="${rows}">${escapeHtml((values || []).join("\n"))}</textarea>
      ${hint ? `<div class="muted field-hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function draftFieldsEditor(draft) {
  const fields = editedFields(draft);
  const draftRules = platformRulesFor(draft.platform);
  const titleMax = Number(draftRules.title_max_chars) || 0;
  if (draft.platform === "amazon") {
    return `
      ${textField({ key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 200 })}
      ${listField({ key: "bullets", label: `${t("bullets")} (5)`, values: fields.bullets, rows: 8 })}
      ${textField({ key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ key: "search_terms", label: t("searchTerms"), value: fields.search_terms, rows: 3, max: Number(draftRules.search_terms_max_bytes) || 249, unit: "bytes", mono: true })}
      ${listField({ key: "aplus_outline", label: t("aplusOutline"), values: fields.aplus_outline, rows: 5 })}
    `;
  }
  if (draft.platform === "shopify") {
    return `
      ${textField({ key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 70 })}
      ${textField({ key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ key: "seo_title", label: t("seoTitle"), value: fields.seo_title, rows: 2, max: Number(draftRules.seo_title_max_chars) || 60 })}
      ${textField({ key: "seo_description", label: t("seoDescription"), value: fields.seo_description, rows: 3, max: Number(draftRules.seo_description_max_chars) || 160 })}
    `;
  }
  if (draft.platform === "tiktok_shop") {
    return `
      ${textField({ key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 255 })}
      ${listField({ key: "selling_points", label: t("sellingPoints"), values: fields.selling_points, rows: 5 })}
    `;
  }
  return `
    ${textField({ key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 80 })}
    ${textField({ key: "subtitle", label: t("subtitle"), value: fields.subtitle, rows: 2 })}
    ${textField({ key: "description", label: t("description"), value: fields.description, rows: 5 })}
    ${listField({ key: "item_specifics", label: t("itemSpecifics"), values: (fields.item_specifics || []).map((item) => `${item.name}: ${item.value}`), rows: 6 })}
  `;
}

function localeTabs(draft) {
  if (!draft.variant_group) return "";
  const variants = drafts().filter((item) => item.variant_group === draft.variant_group);
  if (variants.length < 2) return "";
  return `
    <div class="locale-tabs" role="tablist" aria-label="${t("variantTabs")}">
      <span class="muted">${t("variantTabs")}:</span>
      ${variants
        .map(
          (variant) => `
        <a role="tab" aria-selected="${variant.draft_id === draft.draft_id}" class="locale-tab ${variant.draft_id === draft.draft_id ? "active" : ""}" href="${detailUrl(variant.draft_id, "drafts")}">${escapeHtml(variant.locale || draftRef(variant))}</a>
      `,
        )
        .join("")}
    </div>
  `;
}

function draftChecksList(draft) {
  const draftChecks = checks().filter((item) => item.draft_id === draft.draft_id);
  return (
    draftChecks
      .map(
        (item) => `
    <div class="check-row">
      ${resultBadge(item.result)}
      <span>
        <strong>${escapeHtml(ruleById(item.rule_id)?.name || enumLabel(item.rule_id, "rule"))}</strong>
        <small>${escapeHtml(item.evidence || "")}</small>
        ${claimRefLinks(item.refs)}
      </span>
    </div>
  `,
      )
      .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
  );
}

function draftDetail(draft) {
  const product = productById(draft.product_id);
  const review = reviewForDraft(draft.draft_id);
  return `
    <header class="detail-head">
      <h2>${draftRef(draft)} · ${escapeHtml(productName(draft.product_id))}</h2>
      <p class="muted">${escapeHtml([enumLabel(draft.platform, "platform"), draft.locale, enumLabel(draft.status)].filter(Boolean).join(" · "))}</p>
    </header>
    ${warnings(draft.draft_id)}
    ${noticeBanner()}
    <section class="detail">
      <div class="detail-main">
        ${localeTabs(draft)}
        <div class="card overview-panel workbench" data-draft="${escapeHtml(draft.draft_id)}">
          <h3>${t("editFields")}</h3>
          ${draftFieldsEditor(draft)}
          <div class="notes-actions">
            <button id="saveFields" class="button" type="button" ${!review ? "disabled" : ""}>${t("saveEdits")}</button>
            <span class="muted">${t("fieldsSavedHint")}</span>
          </div>
        </div>
      </div>
      <aside class="detail-side-stack">
        <div class="card detail-side">
          <dl>
            <dt>${t("status")}</dt><dd>${statusBadge(draft.status)}</dd>
            <dt>${t("score")}</dt><dd>${scoreCell(draft.compliance_score)}</dd>
            <dt>${t("platform")}</dt><dd>${platformBadge(draft.platform)}</dd>
            <dt>${t("locale")}</dt><dd>${localeBadge(draft.locale)}</dd>
            <dt>${t("product")}</dt><dd>${product ? `<a href="${detailUrl(draft.product_id, "products")}">${escapeHtml(product.name)}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
            <dt>${t("sku")}</dt><dd>${escapeHtml(product?.sku || "")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(draft.updated_at)}</dd>
          </dl>
          <a class="button detail-link" href="${recordUrl(draft.draft_id, "review")}">${t("openInReview")}</a>
        </div>
        ${draft.keyword_strategy ? `<div class="agent-panel"><h3>${t("keywordStrategy")}</h3><p>${escapeHtml(draft.keyword_strategy)}</p></div>` : ""}
        <div class="card detail-side">
          <h3>${t("complianceChecks")}</h3>
          ${draftChecksList(draft)}
        </div>
      </aside>
    </section>
  `;
}

function checkDetail(check) {
  const draft = draftById(check.draft_id);
  const ruleName = ruleById(check.rule_id)?.name || enumLabel(check.rule_id, "rule");
  return `
    <header class="detail-head">
      <h2>${escapeHtml(ruleName)}</h2>
      <p class="muted">${escapeHtml(draft ? `${draftRef(draft)} · ${draftLabel(draft)}` : t("notLoaded"))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("result")}</dt><dd>${resultBadge(check.result)}</dd>
        <dt>${t("severity")}</dt><dd>${severityBadge(check.severity)}</dd>
        <dt>${t("draft")}</dt><dd>${draft ? `<a href="${detailUrl(draft.draft_id, "drafts")}">${escapeHtml(`${draftRef(draft)} · ${productName(draft.product_id)}`)}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
        <dt>${t("platform")}</dt><dd>${draft ? platformBadge(draft.platform) : ""} ${draft ? localeBadge(draft.locale) : ""}</dd>
        <dt>${t("checkedAt")}</dt><dd>${date(check.checked_at)}</dd>
      </dl>
      <section>
        <h3>${t("evidence")}</h3>
        <p class="detail-text">${escapeHtml(check.evidence || "—")}</p>
        ${claimRefLinks(check.refs)}
      </section>
    </div>
  `;
}

function claimDetail(claim) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(claim.text)}</h2>
      <p class="muted">${escapeHtml([enumLabel(claim.status, "claim"), claim.category].filter(Boolean).join(" · "))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("claimStatus")}</dt><dd>${claimStatusBadge(claim.status)}</dd>
        <dt>${t("category")}</dt><dd>${escapeHtml(claim.category || "")}</dd>
        <dt>${t("claimEvidence")}</dt><dd>${(claim.evidence || []).map((entry) => `<span class="tag">${escapeHtml(entry)}</span>`).join(" ")}</dd>
      </dl>
      <section>
        <h3>${t("substantiation")}</h3>
        <p class="detail-text">${escapeHtml(claim.substantiation || "—")}</p>
      </section>
    </div>
  `;
}

function ruleDetail(rule) {
  return `
    <header class="detail-head">
      <h2>${escapeHtml(rule.phrase)}</h2>
      <p class="muted">${escapeHtml(enumLabel(rule.type, "claim"))}</p>
    </header>
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("severity")}</dt><dd>${severityBadge(rule.severity || "error")}</dd>
        <dt>${t("type")}</dt><dd><span class="tag">${escapeHtml(enumLabel(rule.type, "claim"))}</span></dd>
        <dt>${t("alternative")}</dt><dd>${rule.alternative ? `<span class="tag">${escapeHtml(rule.alternative)}</span>` : "—"}</dd>
      </dl>
      <section>
        <h3>${t("reason")}</h3>
        <p class="detail-text">${escapeHtml(rule.reason || "—")}</p>
      </section>
    </div>
  `;
}

function reviewDetail(draft) {
  const item = reviewForDraft(draft.draft_id);
  const demo = Boolean(state.settings?.demo);
  const disabled = demo ? "disabled" : "";
  const edits = state.edits[item.review_id] || {};
  const note = edits.note ?? draft.decision_note ?? "";
  return `
    <article class="review-detail status-${escapeHtml(item.status)}" data-review="${escapeHtml(item.review_id)}">
      <header class="queue-head">
        <span class="queue-ref">${draftRef(item)}</span>
        ${statusBadge(item.status)}
        ${platformBadge(draft.platform)}
        ${localeBadge(draft.locale)}
        <span class="queue-score muted">${t("score")} ${scoreCell(draft.compliance_score)}</span>
      </header>
      <h2 class="queue-subject">${escapeHtml(draft.fields?.title || draftLabel(draft))}</h2>
      <div class="queue-meta">
        ${productById(draft.product_id) ? `<a href="${detailUrl(draft.product_id, "products")}">${escapeHtml(productName(draft.product_id))}</a>` : `<span>${t("notLoaded")}</span>`}
        · <a href="${detailUrl(draft.draft_id, "drafts")}">${t("openWorkbench")}</a>
      </div>
      ${warnings(draft.draft_id)}
      <p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary || "—")}</p>
      ${draft.keyword_strategy ? `<p class="queue-summary"><span class="muted">${t("keywordStrategy")}:</span> ${escapeHtml(draft.keyword_strategy)}</p>` : ""}
      ${
        item.suggestions?.length
          ? `
        <span class="queue-label">${t("suggestions")}</span>
        <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      `
          : ""
      }
      <label class="queue-label" for="note-${escapeHtml(item.review_id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.review_id)}" class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${draft.decision_action ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(draft.decision_action, "action"))} · ${escapeHtml(draft.decided_at ? new Date(draft.decided_at).toLocaleString() : "")}</span>` : ""}
      </div>
      <h3 class="review-checks-title">${t("complianceChecks")}</h3>
      ${draftChecksList(draft)}
    </article>
  `;
}

// ── Detail events (delegated: the detail body is re-rendered) ──────────────
export function bindDetailEvents() {
  els.detailBody.addEventListener("input", (event) => {
    const reviewField = event.target.closest("[data-review] textarea[data-field]");
    if (reviewField) {
      const id = reviewField.closest("[data-review]").dataset.review;
      state.edits[id] = { ...state.edits[id], [reviewField.dataset.field]: reviewField.value };
      return;
    }
    const input = event.target.closest(".workbench textarea.field-input");
    if (!input) return;
    const workbench = input.closest(".workbench");
    const draftId = workbench.dataset.draft;
    const key = input.dataset.field;
    const edits = state.fieldEdits[draftId] || (state.fieldEdits[draftId] = {});
    const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
    if (input.dataset.kind === "list") {
      const values = input.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      edits[key] =
        key === "item_specifics"
          ? values.map((line) => {
              const idx = line.indexOf(":");
              return idx === -1
                ? { name: line, value: "" }
                : { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
            })
          : values;
      if (counter) counter.textContent = String(values.length);
      return;
    }
    edits[key] = input.value;
    if (counter) {
      const max = Number(input.dataset.max) || 0;
      const unit = input.dataset.unit || "chars";
      const current = unit === "bytes" ? byteLength(input.value) : charLength(input.value);
      counter.textContent = `${current}${max ? ` / ${max}` : ""} ${t(unit)}`;
      counter.classList.toggle("over", Boolean(max) && current > max);
    }
  });
  els.detailBody.addEventListener("click", (event) => {
    const save = event.target.closest("#saveFields");
    if (save) {
      const draft = draftById(save.closest(".workbench")?.dataset.draft);
      if (draft && reviewForDraft(draft.draft_id)) submitDecision(draft.draft_id, "revise", { fields: editedFields(draft) });
      return;
    }
    const button = event.target.closest("[data-review] button[data-action]");
    if (!button) return;
    const card = button.closest("[data-review]");
    const note = card.querySelector('[data-field="note"]')?.value ?? "";
    submitDecision(card.dataset.review, button.dataset.action, { comment: note });
  });
}

async function submitDecision(draftId, action, { comment = "", fields } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  try {
    const provider = await getProvider();
    await provider.decideDraft({ draft_id: draftId, action, note: comment, fields });
  } catch (error) {
    state.notice = error?.message || `Decision failed: ${action}`;
    render();
    return;
  }
  delete state.edits[draftId];
  if (fields) delete state.fieldEdits[draftId];
  await loadState();
  state.notice = t("saved");
  render();
}

// ── Help & Settings ────────────────────────────────────────────────────────
export function renderSettings() {
  document.getElementById("settingsTitle").title = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const seller = summary.seller || {};
  const exportPrefs = summary.export || {};
  const publish = summary.publish || {};
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
        <h2>${t("seller")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(seller.brand || "")}</dd>
          <dt>${t("entity")}</dt><dd>${escapeHtml(seller.entity || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(seller.tone || "")}</dd>
          <dt>${t("locales")}</dt><dd>${(summary.locales || []).map(localeBadge).join(" ")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("platforms")} · ${t("rules")}</h2>
        ${
          (summary.platforms || [])
            .map((entry) => {
              const rulesList = Object.entries(entry.rules || {})
                .map(
                  ([key, value]) =>
                    `<span class="tag">${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? value.join(", ") : String(value))}</span>`,
                )
                .join(" ");
              return `
            <div class="settings-row">
              <strong>${escapeHtml(enumLabel(entry.platform, "platform"))}</strong>
              <span>${(entry.locales || []).map(localeBadge).join(" ")}</span>
              <span class="${entry.enabled ? "ok" : "warn"}">${entry.enabled ? t("yes") : t("no")}</span>
              <div class="chip-list rule-chips">${rulesList}</div>
            </div>
          `;
            })
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section class="card">
        <h2>${t("bannedWords")} · ${t("competitorBrands")}</h2>
        <dl>
          <dt>${t("bannedWords")}</dt><dd>${summary.banned_words_count || 0}</dd>
          <dt>${t("competitorBrands")}</dt><dd>${summary.competitor_brands_count || 0}</dd>
          <dt>${t("maxRepeats")}</dt><dd>${summary.keyword_stuffing?.max_repeats || 3}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown+csv")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
        </dl>
      </section>
      <section class="card">
        <h2>${t("publishHandoff")}</h2>
        <dl>
          <dt>${t("handoffToAgent")}</dt><dd>${publish.handoff_to_agent ? t("byAgentAfterApproval") : t("no")}</dd>
          <dt>${t("requiresApproval")}</dt><dd>${publish.requires_approval ? t("yes") : t("no")}</dd>
        </dl>
        ${
          (publish.secret_envs || []).length
            ? `
          <div class="settings-row">
            <strong>${(publish.secret_envs || []).join(", ")}</strong>
            <span></span>
            <span class="${publish.secrets_ready ? "ok" : "warn"}">${publish.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `
            : ""
        }
      </section>
    </div>
  `;
}

