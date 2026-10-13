import { visibleItems } from "./list-detail.js";
import { DETAIL_MODES, navigateTo } from "./router.js";
import { $, SIDEBAR_COLLAPSED_STORAGE_KEY, store } from "./store.js";

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

export function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  $("sidebarToggle")?.setAttribute("aria-expanded", String(!collapsed));
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

export function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

let lastMobile = null;
export function syncResponsiveShell() {
  const mobile = isMobileLayout();
  if (mobile) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
  // Crossing the phone breakpoint changes the detail bar's Back/Close label.
  if (lastMobile !== null && lastMobile !== mobile) window.dispatchEvent(new Event("busa-drama:layout"));
  lastMobile = mobile;
}

export function toggleSidebar() {
  if (isMobileLayout()) setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
  else setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function isTypingTarget(target) {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
}

// Arrow keys walk the list. In a drawer/split they switch the shown record;
// in a list whose rows open a full page they move a cursor (Enter opens it).
export function moveSelection(direction) {
  if (store.view === "overview" || store.presentation === "page") return;
  const items = visibleItems();
  if (!items.length) return;
  const peeking = DETAIL_MODES[store.view] !== "page";
  const current = peeking ? store.selectedId : store.cursorId;
  const foundIndex = items.findIndex((item) => item.id === current);
  const currentIndex = foundIndex < 0 ? (direction > 0 ? -1 : items.length) : foundIndex;
  const nextId = items[Math.min(items.length - 1, Math.max(0, currentIndex + direction))].id;
  if (peeking) {
    navigateTo({ selectedId: nextId, presentation: DETAIL_MODES[store.view] }, { replace: true });
    return;
  }
  store.cursorId = nextId;
  document.querySelectorAll(".ws-list tr[data-id]").forEach((row) => {
    const on = row.dataset.id === nextId;
    row.classList.toggle("ws-selected", on);
    if (on) row.scrollIntoView({ block: "nearest" });
  });
}
