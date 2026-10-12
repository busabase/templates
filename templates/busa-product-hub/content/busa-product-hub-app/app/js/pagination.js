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

  function reset(pagination = {}, totals = {}) {
    state.cursors = {};
    state.current = {};
    state.loading = {};
    state.totals = totals;
    state.error = "";
    for (const [key, nextCursor] of Object.entries(pagination)) {
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

  // Replaces the displayed page with a NEIGHBOURING page: one click, one
  // request, with a cursor already learned. records.list only exposes a
  // forward keyset cursor, so "jump to page N" would mean reading every page
  // in between — a full scan behind a button — and is deliberately absent.
  async function goToPage(key, targetPage) {
    if (state.loading[key] || !state.cursors[key]) return;
    const current = state.current[key] || 1;
    if (Math.abs(targetPage - current) !== 1 || targetPage < 1) return;
    if (targetPage > current && !state.cursors[key][current]) return;
    state.loading[key] = true;
    state.error = "";
    render();
    try {
      const provider = await getProvider();
      const result = await provider.fetchPage(key, state.cursors[key][targetPage - 1]);
      state.cursors[key][targetPage] = result.nextCursor;
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

  // True while a Base holds only part of its rows — more pages exist, or the
  // user is on a later page. Anything summed from loaded rows must say so.
  function isPartial(key) {
    const cursors = state.cursors[key];
    if (!cursors) return false;
    const current = state.current[key] || 1;
    return current > 1 || Boolean(cursors[current]);
  }

  // Prev / "Page x of y" / Next. The total comes from records.count when the
  // provider has it; without it there is no honest page count to show.
  function control(key) {
    if (!state.cursors[key]) return "";
    const total = pageCount(key);
    const current = state.current[key] || 1;
    const loading = Boolean(state.loading[key]);
    const hasNext = Boolean(state.cursors[key][current]);
    if (current === 1 && !hasNext) return "";
    const escape = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
      );
    return `<nav class="pager" aria-label="${text("pagination")}">
      <button type="button" class="button" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${text("prevPage")}</button>
      ${total == null ? "" : `<span class="pager-summary">${text("pageOf").replace("{current}", current).replace("{total}", Math.max(total, current))}</span>`}
      <button type="button" class="button" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${text("nextPage")}</button>
      ${state.error ? `<span class="pager-error" role="alert">${escape(state.error)}</span>` : ""}
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
