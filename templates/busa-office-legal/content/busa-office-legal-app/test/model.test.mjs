import test from "node:test";
import assert from "node:assert/strict";
import {
  validDate,
  attentionReason,
  caseTimeline,
  verifiedAmounts,
  hiringTransition,
  mergePage,
} from "../app/js/model.js";
const r = (fields, baseKey = "cases", id = "x") => ({ fields, baseKey, id });
test("calendar validation rejects rollover and invalid dates", () => {
  assert.equal(validDate("2026-02-29"), null);
  assert.equal(validDate("2024-02-29"), "2024-02-29");
  assert.equal(validDate("not a date"), null);
  assert.equal(validDate("2026-10-02T00:00Z"), null);
});
test("attention does not mark closed work overdue; unknown dates stay unknown", () => {
  assert.equal(
    attentionReason(r({ status: "closed", due: "2020-01-01" }), "2026-09-29"),
    null,
  );
  assert.equal(
    attentionReason(r({ status: "open", due: null }), "2026-09-29"),
    null,
  );
  assert.equal(
    attentionReason(r({ status: "open", due: "2026-09-28" }), "2026-09-29"),
    "overdue",
  );
  assert.equal(
    attentionReason(r({ status: "unverified", due: null }), "2026-09-29"),
    "incomplete",
  );
});
test("realized legal amounts retain currency and exclude quote, negative and invalid amounts", () => {
  assert.equal(
    attentionReason(
      r({ status: "verified", due: "2026-09-28" }, "deadlines"),
      "2026-09-29",
    ),
    "overdue",
  );
  assert.equal(
    attentionReason(
      r({ status: "open", due: "2026-09-28" }, "updates"),
      "2026-09-29",
    ),
    null,
  );
  assert.equal(
    attentionReason(
      r({ status: "open", due: "2026-09-28" }, "settlements"),
      "2026-09-29",
    ),
    null,
  );
  const entries = [
    r(
      { kind: "recovery", amount: 100, currency: "CNY", status: "verified" },
      "settlements",
    ),
    r(
      { kind: "cost", amount: 20, currency: "USD", status: "verified" },
      "settlements",
    ),
    r(
      { kind: "cost", amount: 99, currency: "CNY", status: "needs_review" },
      "settlements",
    ),
    r(
      { kind: "cost", amount: -20, currency: "CNY", status: "verified" },
      "settlements",
    ),
  ];
  assert.deepEqual(verifiedAmounts(entries), {
    CNY: { recovery: 100, cost: 0 },
    USD: { recovery: 0, cost: 20 },
  });
});
test("case chronology uses valid dates and exact parent code", () => {
  assert.deepEqual(caseTimeline([r({ due: "2026-09-28" }, "updates", "orphan")], undefined), []);
  assert.deepEqual(caseTimeline([r({ case: "", due: "2026-09-28" }, "updates", "orphan")], ""), []);
  const rows = [
    r({ case: "C1", due: null }, "updates", "u1"),
    r({ case: "C1", due: "2026-09-28" }, "updates", "u2"),
    r({ case: "C2", due: "2026-09-29" }, "updates", "u3"),
  ];
  assert.deepEqual(
    caseTimeline(rows, "C1").map((x) => x.id),
    ["u2", "u1"],
  );
});
test("hiring stage advancement requires feedback, budget and acceptance evidence", () => {
  assert.equal(hiringTransition("screening", "hired"), false);
  assert.equal(hiringTransition("offer_review", "offered"), false);
  assert.equal(
    hiringTransition("offer_review", "offered", {
      feedbackComplete: true,
      budgetApproved: true,
    }),
    true,
  );
  assert.equal(hiringTransition("offered", "hired"), false);
  assert.equal(
    hiringTransition("offered", "hired", { acceptanceRecorded: true }),
    true,
  );
});
test("explicit next page appends without duplicate rows", () => {
  assert.deepEqual(
    mergePage(
      [r({}, "cases", "a")],
      [r({}, "cases", "a"), r({}, "cases", "b")],
    ).map((x) => x.id),
    ["a", "b"],
  );
});
