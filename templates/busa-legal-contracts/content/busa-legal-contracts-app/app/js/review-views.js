import {
  baseKeyFor,
  byteLength,
  charLength,
  checks,
  claimRefLinks,
  claimStatusBadge,
  claimsRegistry,
  contractById,
  contractName,
  contracts,
  countOf,
  date,
  detailUrl,
  els,
  enumLabel,
  escapeHtml,
  filteredChecks,
  filteredClaims,
  filteredContracts,
  filteredIssues,
  filteredReviewItems,
  isMobileLayout,
  isPartial,
  issueById,
  issueLabel,
  issues,
  loadState,
  localeBadge,
  noticeBanner,
  pagerControl,
  platformBadge,
  platformRulesFor,
  recordCountLabel,
  recordFor,
  recordPending,
  recordUrl,
  render,
  resultBadge,
  reviewForIssue,
  reviewItems,
  reviewStates,
  ruleName,
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
const tableHead = (columns) =>
  `<thead><tr>${columns.map(([label, className = ""]) => `<th${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead>`;
const rowOpen = (id) =>
  `<tr data-id="${escapeHtml(id)}"${id === state.route.selectedId ? ' class="ws-selected"' : ""}>`;
const issueRef = (issue) => `${t("issueRef")} #${issue?.ref ?? ""}`;

// ── Overview ───────────────────────────────────────────────────────────────
// Three numbers the sidebar does not already show (it carries awaiting
// review, failed checks and ready-to-export). Counts are exact records.count
// totals when the provider has them; "exported this week" compares dates,
// which no server count can, so it is tallied from the loaded issues and says
// so when more issues exist than are loaded.
function metricsBand() {
  const pass = countOf("checks_pass");
  const warn = countOf("checks_warn");
  const fail = countOf("checks_fail");
  const resolved = pass.value + warn.value + fail.value;
  const passRate = resolved ? `${Math.round((pass.value / resolved) * 100)}%` : "—";
  const passScope = pass.exact && warn.exact && fail.exact ? "" : ` · ${t("loadedScope")}`;
  const revision = countOf("issues_changes_requested");
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const exported = issues().filter(
    (issue) => issue.status === "done" && Date.parse(issue.updated_at || 0) >= weekAgo,
  ).length;
  const exportScope = isPartial("issues") ? ` · ${t("loadedScope")}` : "";
  return [
    [t("passRate") + passScope, passRate],
    [t("inRevision") + (revision.exact ? "" : ` · ${t("loadedScope")}`), revision.value],
    [t("exportedThisWeek") + exportScope, exported],
  ]
    .map(([label, value]) => `<div><span title="${escapeHtml(label)}">${escapeHtml(label)}</span><strong>${value}</strong></div>`)
    .join("");
}

function matrixCell(contract, platform) {
  if (!(contract.platforms || []).includes(platform)) return { state: "none", issues: [] };
  const cellIssues = issues().filter(
    (issue) => issue.contract_id === contract.contract_id && issue.platform === platform,
  );
  if (!cellIssues.length) return { state: "none", issues: [] };
  const statuses = cellIssues.map((issue) => issue.status);
  if (statuses.includes("done")) return { state: "exported", issues: cellIssues };
  if (statuses.every((status) => status === "approved")) return { state: "approved", issues: cellIssues };
  return { state: "draft", issues: cellIssues };
}

function statusMatrix() {
  const platforms = (state.settings?.config_summary?.platforms || []).map((entry) => entry.platform);
  const allPlatforms = platforms.length ? platforms : [...new Set(issues().map((issue) => issue.platform))];
  if (!contracts().length) return `<div class="empty-inline">${t("noContracts")}</div>`;
  return `
    <div class="matrix-grid">
      <table class="matrix-table">
        <thead>
          <tr><th>${t("contract")}</th>${allPlatforms.map((platform) => `<th>${escapeHtml(enumLabel(platform, "platform"))}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${contracts()
            .map(
              (contract) => `
            <tr>
              <td><a class="strong" href="${detailUrl(contract.contract_id, "contracts")}">${escapeHtml(contract.name)}</a><div class="muted">${escapeHtml(contract.sku)}</div></td>
              ${allPlatforms
                .map((platform) => {
                  const matrix = matrixCell(contract, platform);
                  const first = matrix.issues[0];
                  const label = enumLabel(matrix.state, "cell");
                  if (matrix.state === "none")
                    return `<td><span class="matrix-cell none">${escapeHtml(label)}</span></td>`;
                  return `<td><a class="matrix-cell ${escapeHtml(matrix.state)}" href="${detailUrl(first.issue_id, "issues")}">${escapeHtml(label)}${matrix.issues.length > 1 ? ` ×${matrix.issues.length}` : ""}</a></td>`;
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
    `${recordCountLabel("contracts", contracts().length)} ${t("contractsLower")}`,
    `${recordCountLabel("issues", issues().length)} ${t("issuesLower")}`,
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
      <div class="overview-panel wide">
        <h2>${t("matrix")}</h2>
        ${statusMatrix()}
      </div>
      <div class="overview-panel">
        <h2>${t("reviewQueue")}</h2>
        ${
          awaiting
            .map((item) => {
              const issue = issueById(item.issue_id);
              return `
            <a class="due-row" href="${recordUrl(item.issue_id, "review")}">
              <span><strong>${issueRef(item)} · ${escapeHtml(issue ? issueLabel(issue) : t("notLoaded"))}</strong><small>${escapeHtml(item.compliance_summary || "")}</small></span>
              <span class="due-meta">${statusBadge(item.status)}${issue ? `<small>${scoreCell(issue.compliance_score)}</small>` : ""}</span>
            </a>
          `;
            })
            .join("") || `<div class="empty-inline">${t("noReviewItems")}</div>`
        }
      </div>
      <div class="overview-panel">
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
// The description each view used to print under its title lives in the
// title's tooltip now; the view's name is already in the nav.
const VIEW_HINT = {
  contracts: "contractsHint",
  issues: "issuesHint",
  checks: "checksHint",
  claims: "claimsIntro",
  review: "reviewHint",
};

function contractOverall(contract) {
  const own = issues().filter((issue) => issue.contract_id === contract.contract_id);
  if (!own.length) return { own, status: "" };
  const exported = own.filter((issue) => issue.status === "done").length;
  const status = own.some((issue) => issue.status === "needs_review")
    ? "needs_review"
    : own.some((issue) => issue.status === "changes_requested")
      ? "changes_requested"
      : exported === own.length
        ? "done"
        : "approved";
  return { own, status };
}

function contractsTable(items) {
  return `
    <table class="ws-table lc-table contracts-table">
      ${tableHead([
        [t("contract")],
        [t("sku")],
        [t("category")],
        [t("source")],
        [t("platforms")],
        [t("issues"), "ws-col-num"],
        [t("status")],
        [t("lastUpdated")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const { own, status } = contractOverall(item);
            return `${rowOpen(item.contract_id)}
              ${cell(`<span class="strong">${escapeHtml(item.name)}</span>`, item.name)}
              ${cell(escapeHtml(item.sku || ""), item.sku)}
              ${cell(escapeHtml(item.category || ""), item.category)}
              ${cell(sourceBadge(item.source))}
              ${cell((item.platforms || []).map(platformBadge).join(" "))}
              ${cell(String(own.length), "", "ws-col-num")}
              ${cell(status ? statusBadge(status) : `<span class="muted">${enumLabel("none", "cell")}</span>`)}
              ${cell(date(item.updated_at))}
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function issuesTable(items) {
  return `
    <table class="ws-table lc-table issues-table">
      ${tableHead([
        [t("title")],
        [t("contract")],
        [t("platform")],
        [t("locale")],
        [t("score"), "ws-col-num"],
        [t("status")],
        [t("lastUpdated")],
      ])}
      <tbody>
        ${items
          .map((item) => {
            const title = item.fields?.title || "";
            const contract = contractById(item.contract_id);
            return `${rowOpen(item.issue_id)}
              ${cell(`<span class="row-ref">#${escapeHtml(item.ref)}</span> <span class="strong">${escapeHtml(title)}</span>`, title)}
              ${cell(
                contract
                  ? `<a href="${detailUrl(contract.contract_id, "contracts")}">${escapeHtml(contract.name)}</a>`
                  : `<span class="muted">${t("notLoaded")}</span>`,
                contract?.name,
              )}
              ${cell(platformBadge(item.platform))}
              ${cell(localeBadge(item.locale))}
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
    <table class="ws-table lc-table checks-table">
      ${tableHead([[t("rule")], [t("issue")], [t("platform")], [t("severity")], [t("result")], [t("evidence")]])}
      <tbody>
        ${items
          .map((item) => {
            const issue = issueById(item.issue_id);
            const name = ruleName(item.rule_id);
            const issueText = issue ? `${issueRef(issue)} · ${contractName(issue.contract_id)}` : t("notLoaded");
            return `${rowOpen(item.check_id)}
              ${cell(`<span class="strong">${escapeHtml(name)}</span>`, name)}
              ${cell(issue ? `<a href="${detailUrl(issue.issue_id, "issues")}">${escapeHtml(issueText)}</a>` : `<span class="muted">${escapeHtml(issueText)}</span>`, issueText)}
              ${cell(issue ? `${platformBadge(issue.platform)} ${localeBadge(issue.locale)}` : "")}
              ${cell(severityBadge(item.severity))}
              ${cell(resultBadge(item.result))}
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
      <table class="ws-table lc-table rules-table">
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
    <table class="ws-table lc-table claims-table">
      ${tableHead([[t("claimText")], [t("claimStatus")], [t("category")], [t("substantiation")], [t("claimEvidence")]])}
      <tbody>
        ${items
          .map(
            (claim) => `${rowOpen(claim.claim_id)}
            ${cell(`<span class="strong">${escapeHtml(claim.text)}</span>`, claim.text)}
            ${cell(claimStatusBadge(claim.status))}
            ${cell(escapeHtml(claim.category || ""), claim.category)}
            ${cell(escapeHtml(claim.substantiation || claim.notes || ""), claim.substantiation || claim.notes)}
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
    <table class="ws-table lc-table review-table">
      ${tableHead([[t("issue")], [t("status")], [t("score"), "ws-col-num ws-split-keep"]])}
      <tbody>
        ${items
          .map((item) => {
            const issue = issueById(item.issue_id);
            const label = issue ? issueLabel(issue) : t("notLoaded");
            return `${rowOpen(item.issue_id)}
              ${cell(`<span class="row-ref">#${escapeHtml(item.ref)}</span> <span class="strong">${escapeHtml(label)}</span>`, `${issueRef(item)} · ${label}`)}
              ${cell(statusBadge(item.status))}
              ${cell(issue ? scoreCell(issue.compliance_score) : "", "", "ws-col-num ws-split-keep")}
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

function renderToolbar(view, count, partial) {
  els.viewTitle.textContent = view === "claims" ? t("claimsRegistry") : t(view);
  els.viewTitle.title = t(VIEW_HINT[view]);
  els.viewCount.textContent = `${count}${partial ? "+" : ""}`;

  els.viewTabs.hidden = view !== "claims";
  els.viewTabs.innerHTML =
    view === "claims"
      ? [
          ["", t("approvedClaims"), (claimsRegistry().claims || []).length],
          ["rules", t("bannedPhrases"), (claimsRegistry().rules || []).length],
        ]
          .map(
            ([tab, label, total]) =>
              `<button type="button" class="segment ${state.route.tab === tab ? "active" : ""}" data-tab="${tab}">${escapeHtml(label)} <b>${total}</b></button>`,
          )
          .join("")
      : "";

  els.viewFilters.hidden = view !== "review";
  els.statusSelect.hidden = view !== "review";
  if (view === "review") {
    els.viewFilters.innerHTML = reviewStates()
      .map((value) => {
        const label = value === "all" ? t("all") : enumLabel(value);
        return `<button type="button" class="segment ${state.route.status === value ? "active" : ""}" data-status="${value}">${escapeHtml(label)} <b>${reviewFilterCount(value)}</b></button>`;
      })
      .join("");
    els.statusSelect.innerHTML = reviewStates()
      .map((value) => {
        const label = value === "all" ? t("all") : enumLabel(value);
        return `<option value="${value}"${state.route.status === value ? " selected" : ""}>${escapeHtml(label)} (${reviewFilterCount(value)})</option>`;
      })
      .join("");
  } else {
    els.viewFilters.innerHTML = "";
    els.statusSelect.innerHTML = "";
  }

  els.checkFilters.hidden = view !== "checks";
  if (view === "checks") {
    const { rule, platform, contract, result } = state.route.filters;
    const platforms = [...new Set(issues().map((issue) => issue.platform))];
    const select = (key, label, current, options) =>
      `<select data-filter="${key}" aria-label="${escapeHtml(label)}">
        <option value="all">${t("all")} · ${escapeHtml(label)}</option>
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>`;
    els.checkFilters.innerHTML = [
      select(
        "rule",
        t("rule"),
        rule,
        rules().map((item) => [item.rule_id, item.name]),
      ),
      select(
        "platform",
        t("platform"),
        platform,
        platforms.map((value) => [value, enumLabel(value, "platform")]),
      ),
      select(
        "contract",
        t("contract"),
        contract,
        contracts().map((item) => [item.contract_id, item.name]),
      ),
      select(
        "result",
        t("result"),
        result,
        ["pass", "warn", "fail"].map((value) => [value, enumLabel(value, "result")]),
      ),
    ].join("");
  } else {
    els.checkFilters.innerHTML = "";
  }
}

export function renderRecordView() {
  const { view, tab } = state.route;
  const key = baseKeyFor(view, tab);
  const items =
    view === "contracts"
      ? filteredContracts()
      : view === "issues"
        ? filteredIssues()
        : view === "checks"
          ? filteredChecks()
          : view === "claims"
            ? filteredClaims()
            : filteredReviewItems();
  const narrowed =
    Boolean(state.route.query) ||
    (view === "review" && state.route.status !== "all") ||
    Object.values(state.route.filters).some((value) => value !== "all");
  renderToolbar(view, items.length, !narrowed && isPartial(key));
  const table =
    view === "contracts"
      ? contractsTable(items)
      : view === "issues"
        ? issuesTable(items)
        : view === "checks"
          ? checksTable(items)
          : view === "claims"
            ? claimsTable(items)
            : reviewTable(items);
  const emptyKey =
    view === "contracts"
      ? "noContracts"
      : view === "issues"
        ? "noIssues"
        : view === "checks"
          ? "noChecks"
          : view === "claims"
            ? tab === "rules"
              ? "noClaimRules"
              : "noClaims"
            : "noReviewItems";
  const empty = emptyState(narrowed ? t("noMatches") : t(emptyKey));
  els.listPanel.innerHTML = `${items.length ? table : empty}${pagerControl(key)}`;
  renderDetail();
}

function renderDetail() {
  const { view, tab, selectedId, presentation } = state.route;
  const key = baseKeyFor(view, tab);
  els.detailBack.textContent = presentation === "page" || isMobileLayout() ? t("backToList") : t("close");
  // Drawer and split always offer the full page (a review item's page is its
  // issue's workbench); the same detail markup renders in every mode.
  els.detailExpand.hidden = !selectedId || presentation === "page";
  if (selectedId) els.detailExpand.href = detailUrl(selectedId, view, tab);
  els.detailPanel.querySelector(".ws-detail-bar").hidden = !selectedId;

  if (!selectedId) {
    els.detailBody.innerHTML = presentation === "split" ? emptyState(t("selectReview")) : "";
    return;
  }
  const item = recordFor(key, selectedId);
  if (!item) {
    els.detailBody.innerHTML = recordPending(key, selectedId)
      ? `<div class="empty-inline">${t("loading")}</div>`
      : emptyState(t("recordMissing"), t("recordMissingDetail"));
    return;
  }
  els.detailBody.innerHTML =
    view === "contracts"
      ? contractDetail(item)
      : view === "issues"
        ? issueDetail(item)
        : view === "checks"
          ? checkDetail(item)
          : view === "claims"
            ? tab === "rules"
              ? claimRuleDetail(item)
              : claimDetail(item)
            : reviewDetail(item);
}

// ── Details ────────────────────────────────────────────────────────────────
const detailHead = (title, meta) => `
  <header class="detail-head">
    <h2>${escapeHtml(title)}</h2>
    ${meta ? `<p class="muted">${escapeHtml(meta)}</p>` : ""}
  </header>`;

function contractDetail(contract) {
  const own = issues().filter((issue) => issue.contract_id === contract.contract_id);
  return `
    ${detailHead(contract.name, [contract.sku, contract.category, enumLabel(contract.source, "source")].filter(Boolean).join(" · "))}
    <section class="detail">
      <div class="detail-main">
        <div class="section-block">
          <h3>${t("specs")}</h3>
          <dl class="spec-list">
            ${(contract.specs || []).map((spec) => `<dt>${escapeHtml(spec.name)}</dt><dd>${escapeHtml(spec.value)}</dd>`).join("")}
          </dl>
        </div>
        <div class="section-block">
          <h3>${t("features")}</h3>
          <ul>${(contract.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
        </div>
        <div class="section-block">
          <h3>${t("keywords")}</h3>
          <div class="chip-list">${(contract.keywords || []).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
        </div>
        <div class="section-block">
          <h3>${t("linkedIssues")}</h3>
          ${
            own
              .map(
                (issue) => `
            <a class="due-row" href="${detailUrl(issue.issue_id, "issues")}">
              <span><strong>${issueRef(issue)} · ${escapeHtml(enumLabel(issue.platform, "platform"))} ${escapeHtml(issue.locale || "")}</strong><small>${escapeHtml(issue.fields?.title || "")}</small></span>
              <span class="due-meta">${statusBadge(issue.status)}<small>${scoreCell(issue.compliance_score)}</small></span>
            </a>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noIssues")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <div>
          <dl>
            <dt>${t("platforms")}</dt><dd>${(contract.platforms || []).map(platformBadge).join(" ")}</dd>
            <dt>${t("locales")}</dt><dd>${(contract.locales || []).map(localeBadge).join(" ")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(contract.updated_at)}</dd>
          </dl>
          ${contract.notes ? `<p class="muted product-notes">${escapeHtml(contract.notes)}</p>` : ""}
        </div>
        <div>
          <h3>${t("imageChecklist")}</h3>
          ${(contract.images || [])
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

function editedFields(issue) {
  return { ...issue.fields, ...(state.fieldEdits[issue.issue_id] || {}) };
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

function issueFieldsEditor(issue) {
  const fields = editedFields(issue);
  const rulesForPlatform = platformRulesFor(issue.platform);
  const titleMax = Number(rulesForPlatform.title_max_chars) || 0;
  if (issue.platform === "amazon" || issue.platform === "nda") {
    return `
      ${textField({ key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 200 })}
      ${listField({ key: "bullets", label: t("bullets"), values: fields.bullets, rows: 8 })}
      ${textField({ key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ key: "search_terms", label: t("searchTerms"), value: fields.search_terms, rows: 3, max: Number(rulesForPlatform.search_terms_max_bytes) || 249, unit: "bytes", mono: true })}
      ${listField({ key: "aplus_outline", label: t("aplusOutline"), values: fields.aplus_outline, rows: 5 })}
    `;
  }
  if (issue.platform === "shopify" || issue.platform === "msa") {
    return `
      ${textField({ key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 70 })}
      ${textField({ key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ key: "seo_title", label: t("seoTitle"), value: fields.seo_title, rows: 2, max: Number(rulesForPlatform.seo_title_max_chars) || 60 })}
      ${textField({ key: "seo_description", label: t("seoDescription"), value: fields.seo_description, rows: 3, max: Number(rulesForPlatform.seo_description_max_chars) || 160 })}
    `;
  }
  if (issue.platform === "tiktok_shop" || issue.platform === "dpa") {
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

function localeTabs(issue) {
  if (!issue.variant_group) return "";
  const variants = issues().filter((item) => item.variant_group === issue.variant_group);
  if (variants.length < 2) return "";
  return `
    <div class="locale-tabs" role="tablist" aria-label="${t("variantTabs")}">
      <span class="muted">${t("variantTabs")}:</span>
      ${variants
        .map(
          (variant) => `
        <a role="tab" aria-selected="${variant.issue_id === issue.issue_id}" class="locale-tab ${variant.issue_id === issue.issue_id ? "active" : ""}" href="${detailUrl(variant.issue_id, "issues")}">${escapeHtml(variant.locale || `#${variant.ref}`)}</a>
      `,
        )
        .join("")}
    </div>
  `;
}

function issueDetail(issue) {
  const contract = contractById(issue.contract_id);
  const issueChecks = checks().filter((item) => item.issue_id === issue.issue_id);
  const review = reviewForIssue(issue.issue_id);
  return `
    ${detailHead(`${issueRef(issue)} · ${contractName(issue.contract_id)}`, "")}
    ${noticeBanner()}
    ${warnings(issue.issue_id)}
    <section class="detail">
      <div class="detail-main">
        ${localeTabs(issue)}
        <div class="section-block workbench" data-issue="${escapeHtml(issue.issue_id)}">
          <h3>${t("editFields")}</h3>
          ${issueFieldsEditor(issue)}
          <div class="notes-actions">
            <button id="saveFields" class="button" type="button" ${!review ? "disabled" : ""}>${t("saveEdits")}</button>
            <span class="muted">${t("fieldsSavedHint")}</span>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <div>
          <dl>
            <dt>${t("status")}</dt><dd>${statusBadge(issue.status)}</dd>
            <dt>${t("score")}</dt><dd>${scoreCell(issue.compliance_score)}</dd>
            <dt>${t("platform")}</dt><dd>${platformBadge(issue.platform)}</dd>
            <dt>${t("locale")}</dt><dd>${localeBadge(issue.locale)}</dd>
            <dt>${t("contract")}</dt><dd>${contract ? `<a href="${detailUrl(contract.contract_id, "contracts")}">${escapeHtml(contract.name)}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
            <dt>${t("sku")}</dt><dd>${escapeHtml(contract?.sku || "")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(issue.updated_at)}</dd>
          </dl>
        </div>
        ${
          issue.keyword_strategy
            ? `
          <div class="agent-panel">
            <h3>${t("keywordStrategy")}</h3>
            <p>${escapeHtml(issue.keyword_strategy)}</p>
          </div>
        `
            : ""
        }
        <div>
          <h3>${t("complianceChecks")}</h3>
          ${
            issueChecks
              .map(
                (item) => `
            <div class="check-row">
              ${resultBadge(item.result)}
              <span>
                <a href="${recordUrl(item.check_id, "checks")}"><strong>${escapeHtml(ruleName(item.rule_id))}</strong></a>
                <small>${escapeHtml(item.evidence || "")}</small>
                ${claimRefLinks(item.refs)}
              </span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
          }
        </div>
      </aside>
    </section>
  `;
}

function checkDetail(item) {
  const issue = issueById(item.issue_id);
  return `
    ${detailHead(ruleName(item.rule_id), "")}
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("result")}</dt><dd>${resultBadge(item.result)}</dd>
        <dt>${t("severity")}</dt><dd>${severityBadge(item.severity)}</dd>
        <dt>${t("issue")}</dt><dd>${issue ? `<a href="${detailUrl(issue.issue_id, "issues")}">${escapeHtml(`${issueRef(issue)} · ${issue.fields?.title || ""}`)}</a>` : `<span class="muted">${t("notLoaded")}</span>`}</dd>
        <dt>${t("contract")}</dt><dd>${issue ? escapeHtml(contractName(issue.contract_id)) : ""}</dd>
        <dt>${t("platform")}</dt><dd>${issue ? `${platformBadge(issue.platform)} ${localeBadge(issue.locale)}` : ""}</dd>
        <dt>${t("checkedAt")}</dt><dd>${date(item.checked_at)}</dd>
      </dl>
      <section>
        <h3>${t("evidence")}</h3>
        <p>${escapeHtml(item.evidence || "—")}</p>
        ${claimRefLinks(item.refs)}
      </section>
    </div>
  `;
}

function claimDetail(claim) {
  return `
    ${detailHead(claim.text, claim.category || "")}
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("claimStatus")}</dt><dd>${claimStatusBadge(claim.status)}</dd>
        <dt>${t("substantiation")}</dt><dd>${escapeHtml(claim.substantiation || "—")}</dd>
        <dt>${t("claimEvidence")}</dt><dd>${(claim.evidence || []).map((entry) => `<span class="tag">${escapeHtml(entry)}</span>`).join(" ") || "—"}</dd>
        <dt>${t("approvedBy")}</dt><dd>${escapeHtml(claim.approved_by || "—")}</dd>
        <dt>${t("approvedAt")}</dt><dd>${date(claim.approved_at) || "—"}</dd>
      </dl>
      ${claim.notes ? `<section><h3>${t("notes")}</h3><p>${escapeHtml(claim.notes)}</p></section>` : ""}
    </div>
  `;
}

function claimRuleDetail(rule) {
  return `
    ${detailHead(rule.phrase, "")}
    <div class="detail-stack">
      <dl class="detail-fields">
        <dt>${t("severity")}</dt><dd>${severityBadge(rule.severity || "error")}</dd>
        <dt>${t("type")}</dt><dd><span class="tag">${escapeHtml(enumLabel(rule.type, "claim"))}</span></dd>
        <dt>${t("reason")}</dt><dd>${escapeHtml(rule.reason || "—")}</dd>
        <dt>${t("alternative")}</dt><dd>${escapeHtml(rule.alternative || "—")}</dd>
      </dl>
    </div>
  `;
}

function reviewDetail(issue) {
  const item = reviewForIssue(issue.issue_id) || {
    review_id: issue.issue_id,
    ref: issue.ref,
    status: issue.status,
    compliance_summary: issue.compliance_summary,
    suggestions: issue.suggestions,
  };
  const edits = state.edits[item.review_id] || {};
  const note = edits.note ?? issue.decision_note ?? "";
  const disabled = state.settings?.demo ? "disabled" : "";
  return `
    <article class="review-detail status-${escapeHtml(item.status)}" data-review="${escapeHtml(item.review_id)}">
      <header class="queue-head">
        <span class="queue-ref">${issueRef(item)}</span>
        ${statusBadge(item.status)}
        ${platformBadge(issue.platform)}
        ${localeBadge(issue.locale)}
        <span class="queue-score muted">${t("score")} ${scoreCell(issue.compliance_score)}</span>
      </header>
      <h2 class="queue-subject">${escapeHtml(issue.fields?.title || "")}</h2>
      <div class="queue-meta">${contractById(issue.contract_id) ? `<a href="${detailUrl(issue.contract_id, "contracts")}">${escapeHtml(contractName(issue.contract_id))}</a>` : escapeHtml(contractName(issue.contract_id))}</div>
      ${warnings(issue.issue_id)}
      <p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary || "")}</p>
      ${issue.keyword_strategy ? `<p class="queue-summary"><span class="muted">${t("keywordStrategy")}:</span> ${escapeHtml(issue.keyword_strategy)}</p>` : ""}
      ${
        item.suggestions?.length
          ? `
        <span class="queue-label">${t("suggestions")}</span>
        <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
      `
          : ""
      }
      <label class="queue-label" for="note-${escapeHtml(item.review_id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.review_id)}" class="queue-note" data-field="note" rows="3" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
      ${noticeBanner()}
      <div class="queue-actions">
        <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
        ${issue.decision_action ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(issue.decision_action, "action"))} · ${escapeHtml(issue.decided_at ? new Date(issue.decided_at).toLocaleString() : "")}</span>` : ""}
      </div>
    </article>
  `;
}

// One set of delegated listeners on the detail panel — the markup inside it is
// re-rendered on every route change.
export function bindDetailEvents() {
  els.detailBody.addEventListener("input", (event) => {
    const input = event.target;
    const workbench = input.closest?.(".workbench");
    if (workbench && input.matches("textarea.field-input")) {
      const issueId = workbench.dataset.issue;
      const key = input.dataset.field;
      const edits = state.fieldEdits[issueId] || (state.fieldEdits[issueId] = {});
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
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) counter.textContent = String(values.length);
      } else {
        edits[key] = input.value;
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) {
          const max = Number(input.dataset.max) || 0;
          const unit = input.dataset.unit || "chars";
          const current = unit === "bytes" ? byteLength(input.value) : charLength(input.value);
          counter.textContent = `${current}${max ? ` / ${max}` : ""} ${t(unit)}`;
          counter.classList.toggle("over", Boolean(max) && current > max);
        }
      }
      return;
    }
    const card = input.closest?.("[data-review]");
    if (card && input.matches("textarea[data-field]")) {
      const id = card.dataset.review;
      state.edits[id] = { ...state.edits[id], [input.dataset.field]: input.value };
    }
  });
  els.detailBody.addEventListener("click", (event) => {
    if (event.target.closest("#saveFields")) {
      const issueId = event.target.closest(".workbench")?.dataset.issue;
      const issue = issueById(issueId);
      if (!issue || !reviewForIssue(issueId)) return;
      submitDecision(issueId, "revise", { fields: editedFields(issue) });
      return;
    }
    const button = event.target.closest(".queue-actions button[data-action]");
    if (!button) return;
    const card = button.closest("[data-review]");
    const note = card.querySelector('[data-field="note"]')?.value ?? "";
    submitDecision(card.dataset.review, button.dataset.action, { comment: note });
  });
}

async function submitDecision(issueId, action, { comment = "", fields } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  let result;
  try {
    const provider = await getProvider();
    result = await provider.decideIssue({ issue_id: issueId, action, note: comment, fields });
  } catch (error) {
    state.notice = error?.message || `Decision failed: ${action}`;
    render();
    return;
  }
  delete state.edits[issueId];
  delete state.fieldEdits[issueId];
  await loadState();
  // Without write access the decision is a ChangeRequest, and the issue keeps
  // its old status until someone who has it approves: say that, not "Saved".
  state.notice = result?.pending ? t("savedForReview") : t("saved");
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
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "busabase")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("seller")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(seller.brand || "")}</dd>
          <dt>${t("entity")}</dt><dd>${escapeHtml(seller.entity || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(seller.tone || "")}</dd>
          <dt>${t("locales")}</dt><dd>${(summary.locales || []).map(localeBadge).join(" ")}</dd>
        </dl>
      </section>
      <section>
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
      <section>
        <h2>${t("bannedWords")} · ${t("competitorBrands")}</h2>
        <dl>
          <dt>${t("bannedWords")}</dt><dd>${summary.banned_words_count || 0}</dd>
          <dt>${t("competitorBrands")}</dt><dd>${summary.competitor_brands_count || 0}</dd>
          <dt>${t("maxRepeats")}</dt><dd>${summary.keyword_stuffing?.max_repeats || 3}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown+csv")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
        </dl>
      </section>
      <section>
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
