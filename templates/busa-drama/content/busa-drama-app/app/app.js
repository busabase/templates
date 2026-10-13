import { newItem, registerActionHooks } from "./js/actions.js";
import { passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { escapeHtml } from "./js/format.js";
import { closeModal, isModalOpen } from "./js/modal.js";
import { getProvider } from "./js/providers/index.js?v=0.1.0";
import { render } from "./js/render.js";
import {
  applyRouteFromHash,
  closeDetail,
  DETAIL_MODES,
  navigateTo,
  openFullPage,
  openRecord,
  routeFor,
} from "./js/router.js";
import { closeSettings, openSettings, setSettingsTab } from "./js/settings.js";
import {
  isTypingTarget,
  moveSelection,
  setMobileSidebarOpen,
  syncResponsiveShell,
  toggleSidebar,
} from "./js/shell.js";
import { shotsForEpisode } from "./js/shots.js";
import { loadState } from "./js/state.js";
import { $, DEMO_SCENARIO, store } from "./js/store.js";

registerActionHooks({ render, shotsForEpisode });

async function load() {
  await loadState();
  if (DEMO_SCENARIO && !window.location.hash) {
    const demoRoutes = {
      overview: "/overview",
      characters: "/characters",
      relationships: "/relationships",
      episodes: "/episodes",
    };
    history.replaceState(null, "", `#${demoRoutes[DEMO_SCENARIO] || "/overview"}`);
  }
  applyRouteFromHash({ replaceEmpty: true });
}

document.addEventListener("click", (event) => {
  const loadMoreButton = event.target.closest("[data-load-more]");
  if (loadMoreButton) {
    loadMore(loadMoreButton.dataset.loadMore);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setMobileSidebarOpen(false);
    store.cursorId = null;
    navigateTo({ view: viewButton.dataset.view, selectedId: null, presentation: null, query: "" });
  }
});

// A row opens its record in the view's declared mode (page / drawer / split).
$("list").addEventListener("click", (event) => {
  if (event.target.closest("a, button, input, select, textarea")) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  store.cursorId = row.dataset.id;
  openRecord(row.dataset.id);
});

async function loadMore(key) {
  const cursor = store.state?.pagination?.[key];
  if (!cursor || store.loadingMore[key]) return;
  store.loadingMore[key] = true;
  store.loadMoreError[key] = false;
  render();
  try {
    const provider = await getProvider();
    if (typeof provider.fetchPage !== "function") return;
    const page = await provider.fetchPage(key, cursor);
    const current = store.state.project[key] || [];
    const known = new Set(current.map((item) => item.id));
    current.push(...page.items.filter((item) => !known.has(item.id)));
    store.state.pagination[key] = page.nextCursor;
  } catch {
    store.loadMoreError[key] = true;
  } finally {
    store.loadingMore[key] = false;
    render();
  }
}

// Search lives in the URL (`?q=`) so Back and refresh keep the list context;
// keystrokes replace the entry instead of each becoming a Back step.
$("searchInput").addEventListener("input", (event) => {
  navigateTo({ query: event.target.value }, { replace: true });
});

$("newItemButton").addEventListener("click", newItem);
$("sidebarToggle").addEventListener("click", toggleSidebar);
$("mobileSidebarToggle").addEventListener("click", () => setMobileSidebarOpen(true));
$("sidebarScrim").addEventListener("click", () => setMobileSidebarOpen(false));
$("backToList").addEventListener("click", closeDetail);
$("openFullPage").addEventListener("click", () => openFullPage());
window.addEventListener("resize", syncResponsiveShell);
window.addEventListener("busa-drama:layout", () => render());
$("settingsButton").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
$("settingsModal").addEventListener("click", (event) => {
  if (event.target === $("settingsModal")) closeSettings();
});
document.querySelectorAll("[data-settings-tab]").forEach((node) => {
  node.addEventListener("click", () => setSettingsTab(node.dataset.settingsTab));
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && store.view !== "overview") {
    event.preventDefault();
    $("searchInput").focus();
    $("searchInput").select();
    return;
  }
  if (event.key === "/" && !isTypingTarget(event.target) && store.view !== "overview") {
    event.preventDefault();
    $("searchInput").focus();
    return;
  }
  if (event.key.toLowerCase() === "n" && !isTypingTarget(event.target) && store.view !== "overview") {
    event.preventDefault();
    newItem();
    return;
  }
  if (event.key === "Escape") {
    if (isModalOpen()) {
      closeModal();
      return;
    }
    if (!$("settingsModal").classList.contains("hidden")) {
      closeSettings();
      return;
    }
    if (document.activeElement === $("searchInput") && store.query) {
      navigateTo({ query: "" }, { replace: true });
      return;
    }
    // Escape inside a field only leaves the field; a second Escape closes.
    if (isTypingTarget(event.target)) {
      event.target.blur();
      return;
    }
    // Escape closes a drawer or split selection (a full page has Back).
    if (store.selectedId && store.presentation && store.presentation !== "page") closeDetail();
    return;
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  }
  if (!isTypingTarget(event.target) && event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  }
  if (
    !isTypingTarget(event.target) &&
    event.key === "Enter" &&
    DETAIL_MODES[store.view] === "page" &&
    !store.selectedId &&
    store.cursorId
  ) {
    event.preventDefault();
    openRecord(store.cursorId);
  }
});

window.addEventListener("hashchange", () => {
  if (store.state) applyRouteFromHash();
});

window.addEventListener("popstate", () => {
  if (store.state) applyRouteFromHash();
});

window.addEventListener("pageshow", () => {
  if (store.state) applyRouteFromHash({ replaceEmpty: true });
});

setInterval(() => {
  if (!store.state || store.isApplyingRoute || isTypingTarget(document.activeElement)) return;
  const currentHash = window.location.hash || "#/overview";
  if (currentHash !== store.lastAppliedHash || currentHash !== `#${routeFor()}`) {
    applyRouteFromHash({ replaceEmpty: true });
  }
}, 300);

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    syncResponsiveShell();
    await load();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    document.body.innerHTML = `<pre>${escapeHtml(error?.stack || error?.message || error)}</pre>`;
  }
}

boot();
