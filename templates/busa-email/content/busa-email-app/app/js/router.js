import { toast } from "./api.js";
import { store } from "./store.js";

// closeHelp/openHelp (help-modal.js), refresh/renderAll (list-detail.js), and
// syncModeButtons (shell.js) all need routing and vice versa. Rather than
// import across that whole cycle, app.js registers the real implementations
// once every module has loaded.
const hooks = {
  isHelpOpen: () => false,
  openHelp: () => {},
  closeHelp: () => {},
  activeHelpTab: () => "guide",
  syncModeButtons: () => {},
  refresh: async () => {},
  renderAll: () => {},
};

export function registerRouterHooks(overrides) {
  Object.assign(hooks, overrides);
}

export function routeModes() {
  return ["all", "needs_review", "approved", "done", "blocked"];
}

export function helpTabs() {
  return ["guide", "files", "accounts", "profile", "style", "knowledge", "appearance", "config"];
}

function encodeRoutePart(value) {
  return encodeURIComponent(String(value || ""));
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

// Routes:
//   #/overview                 the summary page (default)
//   #/<mode>                   a review queue, nothing selected
//   #/<mode>?peek=<id>         split selection — the queue stays beside it
//   #/<mode>/<id>              the same message as a full page
//   #/settings/<tab>           Help & Settings over whatever page is open
export function routeFor() {
  if (hooks.isHelpOpen()) return `/settings/${hooks.activeHelpTab() || "guide"}`;
  if (store.page === "overview") return "/overview";
  const mode = routeModes().includes(store.mode) ? store.mode : "all";
  if (!store.selectedId) return `/${mode}`;
  if (store.presentation === "page") return `/${mode}/${encodeRoutePart(store.selectedId)}`;
  return `/${mode}?peek=${encodeRoutePart(store.selectedId)}`;
}

export function recordHref(id, presentation = "peek", mode = store.mode) {
  const safeMode = routeModes().includes(mode) ? mode : "all";
  return presentation === "page"
    ? `#/${safeMode}/${encodeRoutePart(id)}`
    : `#/${safeMode}?peek=${encodeRoutePart(id)}`;
}

export function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeRoutePart);
  const query = new URLSearchParams(queryPart);
  if (parts[0] === "settings") {
    const requestedTab = parts[1] === "language" ? "appearance" : parts[1];
    return {
      settingsTab: helpTabs().includes(requestedTab) ? requestedTab : "guide",
      page: store.page,
      mode: store.mode,
      selectedId: store.selectedId,
      presentation: store.presentation,
    };
  }
  if (routeModes().includes(parts[0])) {
    const peek = query.get("peek");
    const selectedId = parts[1] || peek || null;
    return {
      settingsTab: null,
      page: "view",
      mode: parts[0],
      selectedId,
      presentation: selectedId ? (parts[1] ? "page" : "peek") : null,
    };
  }
  // Empty hash: a `?demo=<scenario>` link that names a queue opens that queue,
  // everything else lands on Overview.
  const landing = !parts.length && store.demoMode !== "all" ? "view" : "overview";
  return { settingsTab: null, page: landing, mode: store.demoMode, selectedId: null, presentation: null };
}

export function applyRouteFromHash({ refreshData = false } = {}) {
  store.isApplyingRoute = true;
  store.routeNeedsReplace = false;
  const route = parseHashRoute();
  const dataChanged = route.page !== store.page || route.mode !== store.mode;
  store.page = route.page;
  store.mode = route.mode;
  store.selectedId = route.selectedId;
  store.presentation = route.presentation;
  hooks.syncModeButtons();
  if (route.settingsTab) {
    hooks.openHelp(route.settingsTab);
  } else if (hooks.isHelpOpen()) {
    hooks.closeHelp({ skipRoute: true });
  }
  store.isApplyingRoute = false;
  // Selecting or closing a message re-renders; switching page or queue fetches.
  if (refreshData && dataChanged) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
  else if (refreshData) hooks.renderAll();
}

export function syncRoute({ push = false } = {}) {
  if (store.isApplyingRoute) {
    store.routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (push) window.location.hash = target;
  else history.replaceState(null, "", target);
}

// Every navigation goes through the hash, so Back/Forward and reloads restore
// the same page, queue, and selection. The hashchange handler does the work.
export function navigateTo(next = {}, { replace = false, refresh = false } = {}) {
  const target = { page: store.page, mode: store.mode, selectedId: store.selectedId, presentation: store.presentation, ...next };
  const previous = { page: store.page, mode: store.mode, selectedId: store.selectedId, presentation: store.presentation };
  Object.assign(store, target);
  if (!store.selectedId) store.presentation = null;
  else if (!store.presentation) store.presentation = "peek";
  const hash = `#${routeFor()}`;
  Object.assign(store, previous);
  if (window.location.hash === hash) {
    if (refresh) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
    else applyRouteFromHash({ refreshData: true });
    return;
  }
  if (replace) {
    history.replaceState(null, "", hash);
    applyRouteFromHash({ refreshData: true });
  } else {
    window.location.hash = hash;
  }
}
