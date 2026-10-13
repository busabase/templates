import { toast } from "./api.js";
import { analyze } from "./content-model.js";
import { getProvider } from "./providers/index.js";
import { activeHelpTab, closeHelp, isHelpOpen, openHelp, renderHelp, setHelpTab } from "./help-modal.js";
import { applyTranslations, onLanguageChange, setAccentTheme, setLanguageMode, t } from "./i18n.js";
import {
  closeDetail,
  openEditor,
  openRecord,
  registerEditorSubmit,
  registerListHooks,
  render,
  renderAll,
  renderAllPreservingScroll,
} from "./list-detail.js";
import { applyRouteFromHash, navigateTo, parseHashRoute, registerRouterHooks, syncRoute } from "./router.js";
import { ensureLocalBusabaseConnection, copySetupPrompt, registerSetupHooks } from "./setup.js";
import {
  applyGateState,
  isEditing,
  setMobileSidebarOpen,
  syncModeButtons,
  syncResponsiveShell,
  toggleSidebar,
} from "./shell.js";
import { CHOICES } from "./schema.js";
import { $, MODES, store } from "./store.js";

const REFRESH_INTERVAL_MS = 45_000;
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Re-run the analysis over every row loaded so far. It runs here, on whichever
 * provider answered, so "what counts as published" cannot end up implemented twice.
 */
function reanalyze() {
  const analysis = analyze(store.raw);
  store.state = { ...store.state, ...analysis, choices: CHOICES };
}

/** First page of every Base. Resets anything "Load more" appended. */
export async function refresh({ preserveScroll = true } = {}) {
  store.provider ??= await getProvider();
  const data = await store.provider.getState();
  store.raw = Object.fromEntries(MODES.map((key) => [key, [...(data.records?.[key] || [])]]));
  store.cursors = data.cursors || {};
  store.loadedExtra = false;
  store.fetchedIds = new Set();
  store.state = { ...data, totals: data.totals || null };
  reanalyze();
  applyGateState();
  if (preserveScroll) renderAllPreservingScroll();
  else renderAll();
  if (isHelpOpen()) renderHelp();
}

/** Exactly one more page of the Base on screen — one click, one request. */
async function loadMore() {
  const key = store.mode;
  const cursor = store.cursors[key];
  if (!cursor || !store.provider?.loadMore) return;
  const button = $("loadMore");
  if (button) button.disabled = true;
  try {
    const page = await store.provider.loadMore(key, cursor);
    const seen = new Set(store.raw[key].map((row) => row.id));
    store.raw[key].push(...page.records.filter((row) => !seen.has(row.id)));
    store.cursors = { ...store.cursors, [key]: page.nextCursor || null };
    store.loadedExtra = true;
    reanalyze();
    renderAllPreservingScroll();
  } catch (error) {
    toast(error.message);
    if (button) button.disabled = false;
  }
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
  refresh,
  render,
});
registerSetupHooks({ refresh });
registerListHooks({ refresh: () => refresh({ preserveScroll: false }), reanalyze });
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
      // makes the detail disagree with the list beside it.
      setMobileSidebarOpen(false);
      navigateTo({ mode: node.dataset.mode, selectedId: null });
    });
  });

  let searchTimer = null;
  $("searchInput")?.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => navigateTo({ query: value }, { replace: true }), SEARCH_DEBOUNCE_MS);
  });
  $("localeFilter")?.addEventListener("change", (event) => {
    navigateTo({ localeFilter: event.target.value, selectedId: null }, { replace: true });
  });
  document.querySelectorAll("[data-status-filter]").forEach((node) => {
    node.addEventListener("click", () => {
      navigateTo({ statusFilter: node.dataset.statusFilter, selectedId: null }, { replace: true });
    });
  });

  $("listPanel")?.addEventListener("click", (event) => {
    if (event.target.closest("#loadMore")) {
      loadMore();
      return;
    }
    if (event.target.closest("[data-add-new]")) {
      openEditor(store.mode);
      return;
    }
    if (event.target.closest("a, button")) return;
    const row = event.target.closest("tr[data-record-id]");
    if (row) openRecord(row.dataset.recordId);
  });
  $("detailBack")?.addEventListener("click", closeDetail);

  $("addNew")?.addEventListener("click", () => openEditor(store.mode));
  $("overviewAddPost")?.addEventListener("click", () => openEditor("posts"));
  $("overviewConnect")?.addEventListener("click", () => openHelp("connect"));
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

  // applyRouteFromHash only restores state; drawing is this listener's job.
  window.addEventListener("hashchange", () => {
    applyRouteFromHash();
    render();
  });
  window.addEventListener("resize", syncResponsiveShell);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isHelpOpen()) {
      closeHelp();
      return;
    }
    // The draft sheet is a native <dialog>: Escape there closes the sheet only.
    if ($("editorSheet")?.open) return;
    if (event.target.closest?.("input, textarea, select")) {
      event.target.blur();
      return;
    }
    // Escape dismisses the drawer; a full page is left with Back.
    if (store.selectedId && store.presentation && store.presentation !== "page") closeDetail();
  });
}

async function boot() {
  applyTranslations();
  syncResponsiveShell();
  wireEvents();
  // Restore the URL's view before anything renders: the first render rewrites the
  // hash from state, and it used to run first, so every shared or reloaded link
  // landed on the default list with nothing selected. A settings link opens Help
  // only once data is in, so the Connect tab is built from the real connection.
  const initialRoute = parseHashRoute();
  if (!initialRoute.settingsTab) applyRouteFromHash();

  if (!(await ensureLocalBusabaseConnection())) return;

  try {
    await refresh({ preserveScroll: false });
  } catch (error) {
    toast(error.message);
    renderAll();
  }
  if (initialRoute.settingsTab) openHelp(initialRoute.settingsTab);

  // Auto-refresh, but never under someone's hands: a timer that wipes a
  // half-written post is worse than a stale count, and a reload would also drop
  // the pages someone deliberately loaded with "Load more".
  store.refreshTimer = setInterval(() => {
    if (isEditing() || $("editorSheet")?.open || store.loadedExtra) return;
    refresh().catch(() => {});
  }, REFRESH_INTERVAL_MS);
}

boot().catch((error) => {
  const panel = $("overviewBody") || $("detailBody");
  if (panel) panel.textContent = `${t("error.boot")} ${error.message}`;
});
