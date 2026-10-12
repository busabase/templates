// Shared mutable app state. One object, not many exported `let` bindings —
// ESM only gives importers a read-only live view of an exported `let`, so
// every reassignment would need its own setter function. Mutating properties
// of a shared object works the same way across every module that imports it.

export const $ = (id) => document.getElementById(id);

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-drama.sidebarCollapsed";
export const LANG_STORAGE_KEY = "kdrama_lang";

// Demo mode: `/?demo=<scene>&lang=en|zh` shows deterministic mock data.
export const PAGE_QUERY = new URLSearchParams(window.location.search);
export const DEMO_SCENARIO = PAGE_QUERY.get("demo") || "";
export const URL_LANG = PAGE_QUERY.get("lang") || "";

export const store = {
  state: null,
  view: "overview",
  // The record shown in the detail pane (page, drawer or split), or null.
  selectedId: null,
  // How the selected record is shown: "page" for a `/<view>/<id>` path,
  // otherwise the view's declared mode ("drawer" | "split") for `?peek=`.
  presentation: null,
  // Keyboard cursor in a list whose rows open a full page (no peek to move).
  cursorId: null,
  query: "",
  episodeTab: "summary",
  isApplyingRoute: false,
  routeNeedsReplace: false,
  lastAppliedHash: "",
  langPref: URL_LANG || localStorage.getItem(LANG_STORAGE_KEY) || "auto",
  expandedShots: new Set(),
  loadingMore: {},
  loadMoreError: {},
};

export function project() {
  return store.state?.project || {};
}

// Generation-backend settings now live on the project record itself
// (`project()._settings`, written by js/providers/busabase-provider.js's
// saveImageConfig) instead of a separate `/api/image-config` round trip.
export function settings() {
  return project()._settings || {};
}
