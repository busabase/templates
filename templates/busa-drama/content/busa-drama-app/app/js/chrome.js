import { escapeHtml } from "./format.js";
import { applyI18n, t } from "./i18n.js";
import { $, project, store } from "./store.js";

export function viewMeta() {
  return {
    overview: [t("view_overview"), t("view_overview_sub")],
    characters: [t("view_characters"), t("view_characters_sub")],
    relationships: [t("view_relationships"), t("view_relationships_sub")],
    episodes: [t("view_episodes"), t("view_episodes_sub")],
    tasks: [t("view_tasks"), t("view_tasks_sub")],
  };
}

// A per-Base count: the server total when records.count answered, otherwise
// the loaded rows marked "+" while more pages exist.
export function baseCount(key) {
  const total = store.state?.totalCount?.[key];
  if (Number.isFinite(total)) return String(total);
  const loaded = project()[key]?.length || 0;
  return `${loaded}${store.state?.pagination?.[key] ? "+" : ""}`;
}

export function renderProjectSwitcher() {
  const select = $("projectSelect");
  const projects = store.state.projects?.length
    ? store.state.projects
    : [
        {
          id: store.state.project?.project_id,
          title: store.state.project?.series?.title,
          genre: store.state.project?.series?.genre,
          format: store.state.project?.series?.format,
        },
      ];
  const currentId = store.state.active_project_id || store.state.project?.project_id || projects[0]?.id || "";
  select.innerHTML = projects
    .map((item) => {
      const selected = item.id === currentId ? "selected" : "";
      return `<option value="${escapeHtml(item.id || item.title)}" ${selected}>${escapeHtml(item.title || t("project_unnamed"))}</option>`;
    })
    .join("");
  const current = projects.find((item) => item.id === currentId) || projects[0] || {};
  $("projectSwitchMeta").innerHTML = `
    <span>${escapeHtml(current.genre || store.state.project?.series?.genre || "")}</span>
    <span>${escapeHtml(current.format || store.state.project?.series?.format || "")}</span>
  `;
}

export function updateChrome() {
  applyI18n();
  renderProjectSwitcher();
  $("projectPath").textContent = store.state.config_summary?.config_path || "";
  $("attentionNeeds").textContent = store.state.attention?.needs_review || 0;
  $("attentionShots").textContent = store.state.completeness?.shots_missing_prompt || 0;
  $("attentionViews").textContent = store.state.completeness?.characters_missing_views || 0;
  $("lockBanner").hidden = !store.state.lock?.locked;
  document.querySelectorAll(".nav [data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === store.view);
  });
  document.querySelectorAll("[data-nav-count]").forEach((node) => {
    node.textContent = baseCount(node.dataset.navCount);
  });
  const [title, subtitle] = viewMeta()[store.view] || ["", ""];
  // The view's description lives in the title tooltip, not on a second line.
  $("viewTitle").textContent = title;
  $("viewTitle").title = subtitle;
  if (document.activeElement !== $("searchInput")) $("searchInput").value = store.query;
  $("mobileViewTitle").textContent = title;
}
