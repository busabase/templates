import { toast } from "./api.js";
import { appConfig } from "./config.js";
import { ROUTE_MODES, store } from "./store.js";

// closeHelp/openHelp (help-modal.js), refresh/renderList/renderDetail
// (list-detail.js), and syncModeButtons (shell.js) all need routing and vice
// versa. Rather than import across that whole cycle, app.js registers the real
// implementations once every module has loaded.
const hooks = {
  isHelpOpen: () => false,
  openHelp: () => {},
  closeHelp: () => {},
  activeHelpTab: () => "guide",
  syncModeButtons: () => {},
  refresh: async () => {},
  render: () => {},
};

export function registerRouterHooks(overrides) {
  Object.assign(hooks, overrides);
}

/**
 * Where each Base opens a record — declared once, in config.js `ui.detail_modes`
 * (the why is there). A `/<record>` path is always the full page; `?peek=` is the
 * drawer. On a phone every mode is a page (base-ui.css handles that).
 */
export const DETAIL_MODES = appConfig.ui.detail_modes;

const STATUS_FILTERS = ["all", "published", "draft"];

export function helpTabs() {
  return ["guide", "connect", "resources", "appearance"];
}

const decodeRoutePart = (value) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
};

/**
 * `#/<mode>[/<record>][?q=…&status=…&locale=…&peek=…]`. Search and both filters
 * live in the URL, so refresh, a shared link and Back restore the same list.
 * `#/settings/<tab>` opens Help & Settings over whatever was on screen.
 */
export function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeRoutePart);
  if (parts[0] === "settings") {
    const requestedTab = parts[1] === "language" ? "appearance" : parts[1];
    return { settingsTab: helpTabs().includes(requestedTab) ? requestedTab : "guide" };
  }
  const params = new URLSearchParams(queryPart);
  const mode = ROUTE_MODES.includes(parts[0]) ? parts[0] : "overview";
  const detailMode = DETAIL_MODES[mode];
  const id = detailMode ? parts[1] || "" : "";
  const peek = detailMode && detailMode !== "page" && !id ? params.get("peek") || "" : "";
  const status = params.get("status") || "all";
  return {
    settingsTab: null,
    mode,
    selectedId: id || peek || null,
    presentation: id ? "page" : peek ? detailMode : null,
    query: params.get("q") || "",
    statusFilter: STATUS_FILTERS.includes(status) ? status : "all",
    localeFilter: params.get("locale") || "all",
  };
}

const listQuery = (extra = {}) => {
  const params = new URLSearchParams();
  if (store.query) params.set("q", store.query);
  if (["posts", "pages"].includes(store.mode) && store.statusFilter !== "all") {
    params.set("status", store.statusFilter);
  }
  if (store.localeFilter !== "all") params.set("locale", store.localeFilter);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export function routeFor() {
  if (hooks.isHelpOpen()) return `/settings/${hooks.activeHelpTab() || "guide"}`;
  const mode = ROUTE_MODES.includes(store.mode) ? store.mode : "overview";
  if (mode === "overview") return "/overview";
  if (store.selectedId && store.presentation === "page") {
    return `/${mode}/${encodeURIComponent(store.selectedId)}${listQuery()}`;
  }
  if (store.selectedId && store.presentation) return `/${mode}${listQuery({ peek: store.selectedId })}`;
  return `/${mode}${listQuery()}`;
}

/** The full-page URL of a record, whatever its Base's mode ("Open full page"). */
export function fullPageHash(mode, recordId) {
  return `#/${mode}/${encodeURIComponent(recordId)}${mode === store.mode ? listQuery() : ""}`;
}

export function applyRouteFromHash({ refreshData = false } = {}) {
  store.isApplyingRoute = true;
  store.routeNeedsReplace = false;
  const route = parseHashRoute();
  if (route.settingsTab) {
    hooks.openHelp(route.settingsTab);
  } else {
    store.mode = route.mode;
    store.selectedId = route.selectedId;
    store.presentation = route.presentation;
    store.query = route.query;
    store.statusFilter = route.statusFilter;
    store.localeFilter = route.localeFilter;
    if (hooks.isHelpOpen()) hooks.closeHelp({ skipRoute: true });
  }
  hooks.syncModeButtons();
  store.isApplyingRoute = false;
  if (refreshData) hooks.refresh({ preserveScroll: false }).catch((error) => toast(error.message));
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

/**
 * Change what is on screen. `selectedId` without an explicit `presentation`
 * opens the record in its Base's declared mode.
 */
export function navigateTo(next = {}, { replace = false, state = null } = {}) {
  if ("mode" in next) store.mode = next.mode;
  for (const key of ["query", "statusFilter", "localeFilter"]) if (key in next) store[key] = next[key];
  if ("selectedId" in next) {
    store.selectedId = next.selectedId || null;
    store.presentation = store.selectedId
      ? next.presentation || DETAIL_MODES[store.mode] || "page"
      : null;
  }
  hooks.syncModeButtons();
  const target = `#${routeFor()}`;
  if (window.location.hash === target) {
    hooks.render();
    return;
  }
  if (replace) {
    history.replaceState(state ?? history.state, "", target);
    hooks.render();
  } else if (state) {
    // pushState does not fire hashchange, so draw here.
    history.pushState(state, "", target);
    hooks.render();
  } else {
    window.location.hash = target;
  }
}
