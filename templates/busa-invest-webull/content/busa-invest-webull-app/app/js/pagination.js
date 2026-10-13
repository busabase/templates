// Prev / Next pager for the browsed Bases (accounts, positions).
//
// records.list only exposes a forward keyset cursor, so cursors[key][i] is the
// cursor that fetches page i+1. Only NEIGHBOURING pages are reachable — one
// click, one request. There is deliberately no "jump to page N": reaching it on
// a keyset cursor means reading every page in between, which is a full scan
// behind a button. The honest total ("Page 2 of 5") comes from records.count.
export function createPagination({ getProvider, pageSizes, applyPage, render, label, onError }) {
  const state = { cursors: {}, current: {}, loading: {}, totals: {}, error: "" };
  const fallbackLabels = {
    en: { pagination: "Pagination", prevPage: "Prev", nextPage: "Next", pageOf: "Page {current} of {total}" },
    zh: { pagination: "分页", prevPage: "上一页", nextPage: "下一页", pageOf: "第 {current} / {total} 页" },
  };
  const text = (key) => {
    const translated = label(key);
    if (translated && translated !== key) return translated;
    const lang = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
    return fallbackLabels[lang][key] || key;
  };
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );

  function reset(pagination = {}, totals = {}) {
    state.cursors = {};
    state.current = {};
    state.loading = {};
    state.totals = totals || {};
    state.error = "";
    for (const [key, nextCursor] of Object.entries(pagination || {})) {
      state.cursors[key] = [undefined, nextCursor];
      state.current[key] = 1;
    }
  }

  function pageCount(key) {
    const total = state.totals[key];
    return total == null ? null : Math.max(1, Math.ceil(total / (pageSizes[key] || 100)));
  }

  function total(key, fallback = 0) {
    if (state.totals[key] != null) return state.totals[key];
    return `${fallback}${state.cursors[key]?.[1] ? "+" : ""}`;
  }

  // True while a Base holds only part of its rows — more pages exist, or the
  // user is on a later page. Anything summed from loaded rows must say so.
  function isPartial(key) {
    const cursors = state.cursors[key];
    if (!cursors) return false;
    const current = state.current[key] || 1;
    return current > 1 || Boolean(cursors[current]);
  }

  async function goToPage(key, targetPage) {
    if (state.loading[key] || !state.cursors[key]) return;
    const current = state.current[key] || 1;
    if (targetPage < 1 || Math.abs(targetPage - current) !== 1) return;
    const cursors = state.cursors[key];
    if (targetPage > current && !cursors[current]) return; // no next page
    state.loading[key] = true;
    state.error = "";
    render();
    try {
      const provider = await getProvider();
      if (typeof provider.fetchPage !== "function") return;
      const result = await provider.fetchPage(key, cursors[targetPage - 1]);
      cursors[targetPage] = result.nextCursor;
      applyPage(key, result.rows);
      state.current[key] = targetPage;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      onError?.(error);
    } finally {
      state.loading[key] = false;
      render();
    }
  }

  function control(key) {
    const cursors = state.cursors[key];
    if (!cursors) return "";
    const current = state.current[key] || 1;
    const loading = Boolean(state.loading[key]);
    const hasNext = Boolean(cursors[current]);
    if (current === 1 && !hasNext) return "";
    const totalPages = pageCount(key);
    return `<nav class="pager" aria-label="${escapeHtml(text("pagination"))}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${escapeHtml(text("prevPage"))}</button>
      ${totalPages == null ? "" : `<span class="pager-summary">${escapeHtml(text("pageOf").replace("{current}", current).replace("{total}", totalPages))}</span>`}
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${escapeHtml(text("nextPage"))}</button>
      ${state.error ? `<span class="pager-error" role="alert">${escapeHtml(state.error)}</span>` : ""}
    </nav>`;
  }

  function bind(root) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-goto-page]");
      if (!button) return;
      const [key, page] = button.dataset.gotoPage.split(":");
      void goToPage(key, Number(page));
    });
  }

  return { reset, goToPage, control, bind, total, isPartial };
}
