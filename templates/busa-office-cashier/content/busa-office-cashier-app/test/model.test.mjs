import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStaleBalance,
  attentionReason,
  moneyByCurrency,
  resolveRelation,
  appendPage,
  normalize,
} from "../app/js/model.js";
test("restricted accounts still count as stale while retaining restriction priority", () => {
  const record = {
    baseKey: "accounts",
    fields: { status: "restricted", checkedAt: "2026-09-25" },
  };
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(isStaleBalance(record, now), true);
  assert.equal(attentionReason(record, now), "pendingReason");
});
test("approval is distinct from payment; completion evidence matters", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(
    attentionReason(
      {
        baseKey: "payments",
        fields: { status: "approved", due: "2026-10-03" },
      },
      now,
    ),
    "",
  );
  assert.equal(
    attentionReason(
      { baseKey: "payments", fields: { status: "paid", paidAt: "" } },
      now,
    ),
    "paidReason",
  );
  assert.equal(
    attentionReason(
      {
        baseKey: "checks",
        fields: { status: "matched", balance: 100, bankBalance: 90 },
      },
      now,
    ),
    "difference",
  );
});
test("stale checks, overdue dates and partial sums", () => {
  const now = Date.parse("2026-09-29T10:00:00Z");
  assert.equal(
    attentionReason(
      {
        baseKey: "accounts",
        fields: { status: "active", checkedAt: "2026-09-25" },
      },
      now,
    ),
    "staleReason",
  );
  assert.equal(
    attentionReason(
      { baseKey: "filings", fields: { status: "planned", due: "2026-09-20" } },
      now,
    ),
    "overdueReason",
  );
  assert.deepEqual(
    moneyByCurrency([
      { fields: { currency: "CNY", amount: 10 } },
      { fields: { currency: "USD", amount: 2 } },
      { fields: { amount: 3 } },
    ]),
    { CNY: 10, USD: 2 },
  );
});
test("unknown relations never expose IDs and continuation normalizes identical payloads", () => {
  assert.equal(resolveRelation("recunknown0000000000", []), null);
  const row = normalize(
    { id: "a", headCommit: { payload: { title: "Receipt", amount: 12 } } },
    "ledger",
  );
  assert.deepEqual(row.fields, { title: "Receipt", amount: 12 });
  assert.equal(appendPage([row], [row, { id: "b" }]).length, 2);
});
