import { api, toast } from "./api.js";
import { activeHelpTab, closeHelp, isHelpOpen, openHelp, renderHelp, setHelpTab } from "./help-modal.js";
import { applyTranslations, onLanguageChange, setAccentTheme, setLanguageMode, t } from "./i18n.js";
import {
  openEditor,
  registerEditorSubmit,
  registerListHooks,
  renderAll,
  renderAllPreservingScroll,
  renderDetail,
  renderList,
} from "./list-detail.js";
import { applyRouteFromHash, navigateTo, registerRouterHooks, syncRoute } from "./router.js";
import { ensureLocalBusabaseConnection, copySetupPrompt, registerSetupHooks } from "./setup.js";
import {
  applyGateState,
  isEditing,
  isMobileLayout,
  setMobileDetailOpen,
  setMobileSidebarOpen,
  syncModeButtons,
  syncResponsiveShell,
  toggleSidebar,
} from "./shell.js";
import { $, store } from "./store.js";

const REFRESH_INTERVAL_MS = 45_000;

export async function refresh({ preserveScroll = true } = {}) {
  const data = await api("/api/state");
  store.state = data;
  applyGateState();
  if (preserveScroll) renderAllPreservingScroll();
  else renderAll();
  if (isHelpOpen()) renderHelp();
}

/**
 * These modules need each other in a cycle (routing renders, rendering routes), so
 * the real implementations are registered once every module has loaded rather than
 * imported across the cycle.
 */
registerRouterHooks({
  isHelpOpen,
  openHelp,
  closeHelp,
  activeHelpTab,
  syncModeButtons,
  isMobileLayout,
  setMobileDetailOpen,
  refresh,
  renderList,
  renderDetail,
});
registerSetupHooks({ refresh });
registerListHooks({ refresh: () => refresh({ preserveScroll: false }) });
onLanguageChange(() => {
  renderAll();
  if (isHelpOpen()) renderHelp();
});

function wireEvents() {
  $("sidebarToggle")?.addEventListener("click", toggleSidebar);
  $("mobileSidebarToggle")?.addEventListener("click", toggleSidebar);
  $("sidebarScrim")?.addEventListener("click", () => setMobileSidebarOpen(false));

  document.querySelectorAll("[data-mode]").forEach((node) => {
    node.addEventListener("click", () => {
      // Changing what you are looking at clears what you had selected: the
      // selected row is usually not in the new list, and silently keeping it
      // makes the detail pane disagree with the list beside it.
      setMobileSidebarOpen(false);
      setMobileDetailOpen(false);
      navigateTo({ mode: node.dataset.mode, selectedId: null });
    });
  });

  $("searchInput")?.addEventListener("input", (event) => {
    store.query = event.target.value;
    renderList();
  });
  $("localeFilter")?.addEventListener("change", (event) => {
    store.localeFilter = event.target.value;
    navigateTo({ selectedId: null });
  });
  document.querySelectorAll("[data-status-filter]").forEach((node) => {
    node.addEventListener("click", () => {
      store.statusFilter = node.dataset.statusFilter;
      navigateTo({ selectedId: null });
      renderList();
    });
  });

  $("addNew")?.addEventListener("click", () => openEditor(store.mode));
  document.querySelectorAll("[data-close-sheet]").forEach((node) => {
    node.addEventListener("click", () => $("editorSheet")?.close());
  });
  registerEditorSubmit();

  $("helpButton")?.addEventListener("click", () => openHelp(activeHelpTab()));
  $("mobileHelpButton")?.addEventListener("click", () => openHelp(activeHelpTab()));
  $("providerGateHelpButton")?.addEventListener("click", () => openHelp("connect"));
  $("setupCopyPrompt")?.addEventListener("click", () => copySetupPrompt().catch((e) => toast(e.message)));
  $("closeHelp")?.addEventListener("click", () => closeHelp());
  $("helpModal")?.addEventListener("click", (event) => {
    if (event.target === $("helpModal")) closeHelp();
  });
  document.querySelectorAll("[data-help-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      setHelpTab(node.dataset.helpTab);
      syncRoute();
    });
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-ui-language]")) setLanguageMode(event.target.value);
    if (event.target.matches('input[name="accentTheme"]')) setAccentTheme(event.target.value);
  });

  // applyRouteFromHash only restores state; drawing is this listener's job. Without
  // the redraw a sidebar click changed the URL and left the old list on screen.
  window.addEventListener("hashchange", () => {
    applyRouteFromHash();
    renderList();
    renderDetail();
  });
  window.addEventListener("resize", syncResponsiveShell);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isHelpOpen()) closeHelp();
  });
}

async function boot() {
  applyTranslations();
  syncResponsiveShell();
  wireEvents();

  if (!(await ensureLocalBusabaseConnection())) return;

  try {
    await refresh({ preserveScroll: false });
  } catch (error) {
    toast(error.message);
  }
  applyRouteFromHash();
  renderAll();

  // Auto-refresh, but never under someone's hands: a timer that wipes a
  // half-written post is worse than a stale count.
  store.refreshTimer = setInterval(() => {
    if (isEditing() || $("editorSheet")?.open) return;
    refresh().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

boot().catch((error) => {
  const panel = $("detailPanel");
  if (panel) panel.textContent = `${t("error.boot")} ${error.message}`;
});
