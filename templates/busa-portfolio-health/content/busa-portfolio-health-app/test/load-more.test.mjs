import assert from "node:assert/strict";
import test from "node:test";

import { createLoadMore } from "../app/js/pagination.js";

// One click = one request, appended without duplicates; no background paging.
test("createLoadMore reads exactly one page per call and dedupes by id", async () => {
  const calls = [];
  const pages = {
    c2: { rows: [{ id: "b" }, { id: "c" }], nextCursor: "c3" },
    c3: { rows: [{ id: "d" }], nextCursor: null },
  };
  let rows = [{ id: "a" }, { id: "b" }];
  const loader = createLoadMore({
    getProvider: async () => ({
      fetchPage: async (key, cursor) => {
        calls.push([key, cursor]);
        return pages[cursor];
      },
    }),
    key: "contracts",
    idOf: (row) => row.id,
    onRows: (next) => {
      rows = next;
    },
    render: () => {},
  });
  loader.reset({ cursor: "c2", total: 4 });
  assert.equal(loader.partial(), true);
  assert.equal(loader.total, 4);
  await loader.loadMore(rows);
  assert.deepEqual(calls, [["contracts", "c2"]]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b", "c"],
  );
  await loader.loadMore(rows);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(loader.partial(), false);
  await loader.loadMore(rows);
  assert.equal(calls.length, 2, "no request once the last page is read");
});

test("createLoadMore surfaces a failed page without dropping loaded rows", async () => {
  let rows = [{ id: "a" }];
  const loader = createLoadMore({
    getProvider: async () => ({
      fetchPage: async () => {
        throw new Error("PROCEDURE_DENIED: records.list");
      },
    }),
    key: "contracts",
    idOf: (row) => row.id,
    onRows: (next) => {
      rows = next;
    },
    render: () => {},
  });
  loader.reset({ cursor: "c2" });
  await loader.loadMore(rows);
  assert.equal(loader.error, "PROCEDURE_DENIED: records.list");
  assert.equal(loader.partial(), true);
  assert.deepEqual(rows, [{ id: "a" }]);
});
