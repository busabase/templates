// Load More for the contracts Base: one click reads exactly one more page and
// appends it (deduplicated by contract id). Every view here — the table, the
// watchlist, the concentration buckets and the Overview sums — is derived from
// the contracts loaded so far, so appending (rather than replacing a page)
// keeps those derived numbers growing toward the whole book instead of jumping
// between unrelated slices. There is no "jump to page N" and no background
// paging: reading another page is always a visible user action.
export function createLoadMore({ getProvider, key, idOf, onRows, render }) {
  const state = { cursor: null, total: null, loading: false, error: "" };

  function reset({ cursor = null, total = null } = {}) {
    state.cursor = cursor || null;
    state.total = typeof total === "number" ? total : null;
    state.loading = false;
    state.error = "";
  }

  // True while more contracts exist than are loaded.
  const partial = () => Boolean(state.cursor);

  async function loadMore(loadedRows) {
    if (state.loading || !state.cursor) return;
    state.loading = true;
    state.error = "";
    render();
    try {
      const provider = await getProvider();
      const { rows, nextCursor } = await provider.fetchPage(key, state.cursor);
      const seen = new Set(loadedRows.map(idOf));
      onRows([...loadedRows, ...rows.filter((row) => !seen.has(idOf(row)))]);
      state.cursor = nextCursor || null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  return {
    reset,
    partial,
    loadMore,
    get total() {
      return state.total;
    },
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
  };
}
