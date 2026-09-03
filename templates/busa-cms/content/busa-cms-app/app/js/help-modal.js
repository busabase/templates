import { toast } from "./api.js";
import { copyToClipboard, escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { syncRoute } from "./router.js";
import { $, store } from "./store.js";

/**
 * Help & Settings, which for this app is also where the website gets connected.
 *
 * Connecting a site is a once-per-install act with a value nobody can guess — the
 * Folder id — so it belongs behind a deliberate click rather than in the work
 * surface an editor uses every day. `Resources` is its diagnostic other half:
 * whether the SDK would accept this Folder at all.
 */

const TABS = ["guide", "connect", "resources", "appearance"];

export function isHelpOpen() {
  return !$("helpModal")?.classList.contains("is-hidden");
}

export function activeHelpTab() {
  return document.querySelector(".modal-tabs button.active")?.dataset.helpTab || "guide";
}

export function setHelpTab(tab) {
  const target = TABS.includes(tab) ? tab : "guide";
  document.querySelectorAll("[data-help-tab]").forEach((node) => {
    node.classList.toggle("active", node.dataset.helpTab === target);
  });
  document.querySelectorAll("[data-help-panel]").forEach((node) => {
    node.classList.toggle("active", node.dataset.helpPanel === target);
  });
}

export function openHelp(tab = "guide") {
  const modal = $("helpModal");
  if (!modal) return;
  renderHelp();
  setHelpTab(tab);
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  syncRoute();
}

export function closeHelp({ skipRoute = false } = {}) {
  const modal = $("helpModal");
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  if (!skipRoute) syncRoute();
}

// ── Connect ──────────────────────────────────────────────────────────────────

const codeBlock = (id, code) => `
  <div class="code-wrap">
    <pre><code id="${id}">${escapeHtml(code)}</code></pre>
    <button type="button" class="code-copy" data-copy-target="${id}">${escapeHtml(t("common.copy"))}</button>
  </div>`;

function renderConnectTab() {
  const node = $("helpConnect");
  if (!node) return;
  const connection = store.state.connection || {};
  node.innerHTML = `
    <p class="settings-lead">${escapeHtml(t("connect.lead"))}</p>
    <dl class="help-paths">
      <dt>${escapeHtml(t("connect.folder_id"))}</dt>
      <dd><code>${escapeHtml(connection.folderId || t("settings.not_configured"))}</code></dd>
      <dt>${escapeHtml(t("connect.folder_slug"))}</dt>
      <dd><code>${escapeHtml(connection.folderSlug || "—")}</code></dd>
      <dt>${escapeHtml(t("connect.space_id"))}</dt>
      <dd><code>${escapeHtml(connection.spaceId || "—")}</code></dd>
      <dt>${escapeHtml(t("connect.profile"))}</dt>
      <dd><code>${escapeHtml(connection.profile || "standard")}</code></dd>
    </dl>
    <h3>${escapeHtml(t("connect.environment"))}</h3>
    ${codeBlock("connectEnv", connection.snippets?.env ?? "")}
    <h3>${escapeHtml(t("connect.server_code"))}</h3>
    ${codeBlock("connectSnippet", connection.snippets?.server ?? "")}
    <p class="settings-note">${escapeHtml(t("connect.security_note"))}</p>`;

  node.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.onclick = async () => {
      const source = $(button.dataset.copyTarget);
      const copied = await copyToClipboard(source?.textContent || "");
      toast(copied ? t("toast.copied") : t("toast.copy_failed"));
      if (!copied) getSelection()?.selectAllChildren(source);
    };
  });
}

// ── Resources ────────────────────────────────────────────────────────────────

const problemText = (problem) =>
  t(`schema.${problem.code}`, {
    base: problem.base,
    field: problem.field || "",
    expected: problem.expected || "",
    actual: problem.actual || "",
  });

function renderResourcesTab() {
  const node = $("helpResources");
  if (!node) return;
  const health = store.state.schemaHealth;
  if (!health) {
    node.innerHTML = `<p class="settings-note">${escapeHtml(t("resources.unavailable"))}</p>`;
    return;
  }
  node.innerHTML = `
    <p class="settings-lead">${escapeHtml(t("resources.lead"))}</p>
    <div class="health-list">
      ${health
        .map(
          (base) => `
        <div class="health health--${base.tone}">
          <div class="health-head">
            <span class="health-name">${escapeHtml(base.name)}</span>
            <span class="badge badge--${base.tone === "ok" ? "live" : "plain"}">${escapeHtml(
              base.tone === "ok"
                ? t("resources.fields_match", { count: base.fieldCount })
                : t("resources.to_fix", { count: base.problems.length }),
            )}</span>
          </div>
          ${base.slug ? `<code class="health-slug">${escapeHtml(base.slug)}</code>` : ""}
          ${
            base.problems.length
              ? `<ul class="health-problems">${base.problems
                  .map(
                    (problem) =>
                      `<li class="note note--${problem.tone}">${escapeHtml(problemText(problem))}</li>`,
                  )
                  .join("")}</ul>`
              : ""
          }
        </div>`,
        )
        .join("")}
    </div>`;
}

// ── Guide ────────────────────────────────────────────────────────────────────

function renderGuideStats() {
  const node = $("helpStats");
  if (!node) return;
  const counts = store.state.counts || {};
  const stat = (value, labelKey) => `
    <div class="stat">
      <span class="stat-value">${escapeHtml(String(value ?? 0))}</span>
      <span class="stat-label">${escapeHtml(t(labelKey))}</span>
    </div>`;
  node.innerHTML = `
    <div class="stats">
      ${stat(counts.livePosts, "stats.live_posts")}
      ${stat(counts.livePages, "stats.live_pages")}
      ${stat(counts.not_live, "stats.not_live")}
      ${stat(counts.needsAttention, "stats.attention")}
    </div>`;
}

export function renderHelp() {
  renderGuideStats();
  renderConnectTab();
  renderResourcesTab();
}
