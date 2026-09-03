import { setupNeeded } from "./provider.js";
import { applyProviderGate } from "./setup.js";
import { $, SIDEBAR_COLLAPSED_STORAGE_KEY, store } from "./store.js";

export function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

export function syncModeButtons() {
  document.querySelectorAll("[data-mode]").forEach((node) => {
    node.classList.toggle("active", node.dataset.mode === store.mode);
  });
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const toggle = $("sidebarToggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(!collapsed));
}

export function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

export function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const scrim = $("sidebarScrim");
  if (scrim) scrim.hidden = !open;
}

export function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

export function setMobileDetailOpen(open) {
  store.mobileDetailOpen = Boolean(open);
  document.body.classList.toggle("mobile-detail-open", store.mobileDetailOpen);
}

export function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
    setMobileDetailOpen(Boolean(store.selectedId) && store.mobileDetailOpen);
  } else {
    setMobileSidebarOpen(false);
    setMobileDetailOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", {
      persist: false,
    });
  }
  syncSidebarState();
}

export function closeDetailActionMenu() {
  const menu = $("detailActionMenu");
  const toggle = $("detailActionMenuToggle");
  if (menu) menu.classList.remove("is-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

/**
 * Auto-refresh must never redraw under someone's hands. The draft sheet is a long
 * textarea; losing it to a timer is the difference between a tool you trust with
 * a post and one you paste into from elsewhere.
 */
export function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.matches("textarea")) return true;
  return active.matches("input") && active.id !== "searchInput";
}

export function captureScrollState() {
  const page = document.scrollingElement || document.documentElement;
  return {
    pageTop: page?.scrollTop || 0,
    listTop: $("contentList")?.scrollTop || 0,
    detailTop: $("detailPanel")?.scrollTop || 0,
  };
}

export function restoreScrollState(scrollState) {
  const page = document.scrollingElement || document.documentElement;
  if (page) page.scrollTop = scrollState.pageTop;
  const list = $("contentList");
  if (list) list.scrollTop = scrollState.listTop;
  const detail = $("detailPanel");
  if (detail) detail.scrollTop = scrollState.detailTop;
}

/** The setup gate owns the screen while it is up; nothing behind it is clickable. */
export function applyGateState() {
  const unavailable = setupNeeded();
  document.body.classList.toggle("provider-unavailable", unavailable);
  if (unavailable) closeDetailActionMenu();
  applyProviderGate();
  document.querySelectorAll("button, input, textarea, select").forEach((node) => {
    const keepEnabled =
      node.id === "helpButton" ||
      node.id === "mobileHelpButton" ||
      node.id === "providerGateHelpButton" ||
      node.id === "setupCopyPrompt" ||
      node.id === "closeHelp" ||
      node.id === "sidebarToggle" ||
      node.id === "mobileSidebarToggle" ||
      Boolean(node.closest("#helpModal")) ||
      Boolean(node.closest("#providerGate"));
    node.disabled = !keepEnabled && unavailable;
  });
}
