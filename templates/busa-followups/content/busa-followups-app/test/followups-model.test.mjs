import assert from "node:assert/strict";
import test from "node:test";
import { buildSnapshot, isDueToday } from "../app/js/followups-model.js";

const TODAY = "2026-09-02";

test("a done item is never due today, even overdue", () => {
  assert.equal(isDueToday({ status: "done", due: "2026-01-01" }, TODAY), false);
});

test("no due date means always due today", () => {
  assert.equal(isDueToday({ status: "pending", due: "" }, TODAY), true);
});

test("a future due date is not due today", () => {
  assert.equal(isDueToday({ status: "pending", due: "2026-09-10" }, TODAY), false);
});

test("an overdue pending item counts as due today", () => {
  assert.equal(isDueToday({ status: "pending", due: "2026-08-20" }, TODAY), true);
});

test("buildSnapshot splits today / upcoming / done", () => {
  const snapshot = buildSnapshot(
    {
      followups: [
        { record_id: "1", person: "A", action: "a", due: "2026-08-20", status: "pending" },
        { record_id: "2", person: "B", action: "b", due: "2026-09-10", status: "pending" },
        { record_id: "3", person: "C", action: "c", due: "2026-01-01", status: "done" },
      ],
    },
    TODAY,
  );
  assert.equal(snapshot.counts.today, 1);
  assert.equal(snapshot.counts.upcoming, 1);
  assert.equal(snapshot.counts.done, 1);
});

test("overdue is pending with a past date; undated is due but not overdue", () => {
  const snapshot = buildSnapshot(
    {
      followups: [
        { record_id: "1", person: "A", action: "a", due: "2026-08-20", status: "pending" },
        { record_id: "2", person: "B", action: "b", due: "", status: "pending" },
        { record_id: "3", person: "C", action: "c", due: TODAY, status: "pending" },
        { record_id: "4", person: "D", action: "d", due: "2026-08-01", status: "done" },
      ],
    },
    TODAY,
  );
  assert.equal(snapshot.counts.today, 3);
  assert.equal(snapshot.counts.overdue, 1);
  assert.deepEqual(
    snapshot.followups.map((row) => row.record_id),
    ["2", "1", "3", "4"],
  );
});
