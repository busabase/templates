import { viewMeta } from "./chrome.js";
import { appConfig } from "./config.js?v=0.1.0";
import { render } from "./render.js";
import { store } from "./store.js";

// Where a record opens, per view — declared once in config.js `ui.detail_modes`
// (page / drawer / split, with the reason next to each). A `/<view>/<id>` path
// is always the full page; `?peek=<id>` drives a drawer or split selection.
// On a phone every mode is a page (base-ui.css handles that).
export const DETAIL_MODES = appConfig.ui.detail_modes;

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

// `#/<view>[/<id>[/<tab>]][?q=…&peek=…]`. Search and the peeked record live in
// the URL so refresh, shared links and Back restore the same list context.
export function routeFor(next = {}) {
  const view = next.view || store.view || "overview";
  if (view === "overview") return "/overview";
  const selectedId = next.selectedId === undefined ? store.selectedId : next.selectedId;
  const presentation = next.presentation === undefined ? store.presentation : next.presentation;
  const episodeTab = next.episodeTab || store.episodeTab || "summary";
  const query = next.query === undefined ? store.query : next.query;
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  let path = `/${view}`;
  if (selectedId && presentation === "page") {
    path += `/${encodeRoutePart(selectedId)}`;
    if (view === "episodes") path += `/${episodeTab === "shots" ? "shots" : "summary"}`;
  } else if (selectedId) {
    params.set("peek", selectedId);
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export function parseHashRoute() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeRoutePart);
  const params = new URLSearchParams(queryPart);
  const meta = viewMeta();
  const view = meta[parts[0]] ? parts[0] : "overview";
  const mode = DETAIL_MODES[view];
  const pathId = mode ? parts[1] || null : null;
  const peek = mode && mode !== "page" && !pathId ? params.get("peek") || null : null;
  return {
    view,
    selectedId: pathId || peek,
    presentation: pathId ? "page" : peek ? mode : null,
    episodeTab: view === "episodes" && parts[2] === "shots" ? "shots" : "summary",
    query: view === "overview" ? "" : params.get("q") || "",
  };
}

function applyRoute(route) {
  store.view = route.view;
  store.selectedId = route.selectedId;
  store.presentation = route.presentation;
  store.episodeTab = route.episodeTab;
  store.query = route.query;
}

export function applyRouteFromHash({ replaceEmpty = false } = {}) {
  const route = parseHashRoute();
  store.isApplyingRoute = true;
  store.routeNeedsReplace = false;
  applyRoute(route);
  if (replaceEmpty && !window.location.hash) {
    history.replaceState(history.state, "", `#${routeFor(route)}`);
  }
  render();
  if (store.routeNeedsReplace) {
    history.replaceState(history.state, "", `#${routeFor()}`);
    store.routeNeedsReplace = false;
  }
  store.lastAppliedHash = window.location.hash || `#${routeFor()}`;
  store.isApplyingRoute = false;
}

export function navigateTo(partial = {}, { replace = false } = {}) {
  const next = {
    view: store.view,
    selectedId: store.selectedId,
    presentation: store.presentation,
    episodeTab: store.episodeTab,
    query: store.query,
    ...partial,
  };
  if (partial.view && partial.view !== store.view) {
    next.selectedId = partial.selectedId ?? null;
    next.presentation = partial.presentation ?? null;
    next.query = partial.query ?? "";
    next.episodeTab = partial.episodeTab ?? "summary";
  }
  if (!next.selectedId) next.presentation = null;
  const target = `#${routeFor(next)}`;
  if (window.location.hash === target) {
    applyRoute(next);
    render();
    return;
  }
  if (replace) {
    history.replaceState(history.state, "", target);
    applyRouteFromHash();
  } else {
    window.location.hash = target;
  }
}

// What a row opens: the full page for a `page` view, else `?peek=`.
export function openRecord(id, view = store.view) {
  const mode = DETAIL_MODES[view] || "page";
  const presentation = mode === "page" ? "page" : mode;
  // Switching records while a drawer/split is open replaces the entry, so
  // Close still steps back to the list the drawer was opened from.
  const replace = view === store.view && store.presentation && store.presentation !== "page";
  if (!replace && view === store.view && !store.selectedId) {
    // Opened from its own list: mark the entry so Back/Close/Escape return to
    // that list entry instead of pushing a new one.
    const target = `#${routeFor({ view, selectedId: id, presentation, episodeTab: "summary" })}`;
    history.pushState({ fromList: true }, "", target);
    applyRouteFromHash();
    return;
  }
  navigateTo({ view, selectedId: id, presentation, episodeTab: "summary" }, { replace: Boolean(replace) });
}

export function openFullPage(id = store.selectedId) {
  if (!id) return;
  navigateTo({ selectedId: id, presentation: "page", episodeTab: "summary" });
}

// Back / Close / Escape: step back to the exact list entry the record was
// opened from when there is one, otherwise go to the list.
export function closeDetail() {
  if (history.state?.fromList) {
    history.back();
    return;
  }
  navigateTo({ selectedId: null, presentation: null, episodeTab: "summary" });
}

export function syncRoute({ replace = true } = {}) {
  if (store.isApplyingRoute) {
    store.routeNeedsReplace = true;
    return;
  }
  const target = `#${routeFor()}`;
  if (window.location.hash === target) return;
  if (replace) history.replaceState(history.state, "", target);
  else window.location.hash = target;
}
