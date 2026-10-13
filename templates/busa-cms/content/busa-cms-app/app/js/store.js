// Shared mutable app state. One object, not many exported `let` bindings —
// ESM only gives importers a read-only live view of an exported `let`, so every
// reassignment would need its own setter function. Mutating properties of a
// shared object works the same way across every module that imports it.

export const $ = (id) => document.getElementById(id);

const ACCENT_THEMES = [
  { id: "blue", color: "#0a84ff" },
  { id: "purple", color: "#bf5af2" },
  { id: "pink", color: "#ff2d55" },
  { id: "red", color: "#ff3b30" },
  { id: "orange", color: "#ff9500" },
  { id: "yellow", color: "#ffcc00", check: "#1d1d1f" },
  { id: "green", color: "#30d158" },
  { id: "graphite", color: "#6e6e73" },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", labelKey: "language.auto" },
  { value: "en", labelKey: "language.english" },
  { value: "zh-CN", labelKey: "language.chinese" },
];

export const LANGUAGE_STORAGE_KEY = "busa-cms.uiLanguage";
export const ACCENT_THEME_STORAGE_KEY = "busa-cms.accentTheme";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "busa-cms.sidebarCollapsed";
export { ACCENT_THEMES, LANGUAGE_OPTIONS };

/**
 * Navigation is the content type, the way a WordPress admin menu is: Posts,
 * Pages, Categories, Tags. Publication state is a filter above the list, not a
 * separate place to go — an editor thinks "my posts", then narrows.
 */
export const MODES = ["posts", "pages", "categories", "tags"];

/** Overview is the default route and the first nav item; it is not a Base. */
export const ROUTE_MODES = ["overview", ...MODES];

/** Modes whose list is content; the other two list taxonomy terms. */
export const CONTENT_MODES = ["posts", "pages"];

export function resolveAccentTheme(value) {
  return ACCENT_THEMES.some((theme) => theme.id === value) ? value : "purple";
}

const params =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const queryLanguage = params.get("lang");

export const store = {
  params,
  state: {
    items: [],
    terms: [],
    counts: {},
    /** Exact server totals (records.count), or null where unavailable. */
    totals: null,
    connection: null,
    schemaHealth: null,
    provider_status: {},
    setup: {},
  },
  selectedId: null,
  /** How the selected record is shown: "page" | "drawer" | null (list only). */
  presentation: null,
  mode: "overview",
  /** The raw rows loaded so far, per Base — first page plus any "Load more". */
  raw: { posts: [], pages: [], categories: [], tags: [] },
  /** Next-page cursor per Base; null when the Base is fully loaded. */
  cursors: {},
  /** True once "Load more" appended a page, so the timer does not reset it. */
  loadedExtra: false,
  /** Record ids already looked up with records.get, so a miss is asked once. */
  fetchedIds: new Set(),
  languageMode:
    queryLanguage ||
    (typeof localStorage !== "undefined" ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null) ||
    "auto",
  accentTheme: resolveAccentTheme(
    (typeof localStorage !== "undefined" ? localStorage.getItem(ACCENT_THEME_STORAGE_KEY) : null) ||
      "purple",
  ),
  uiLanguage: "en",
  isApplyingRoute: false,
  routeNeedsReplace: false,
  localAuth: null,
  query: "",
  localeFilter: "all",
  statusFilter: "all",
  refreshTimer: null,
  /** Resolved once on boot: the real workspace, or the deterministic demo. */
  provider: null,
};
