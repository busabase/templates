import assert from "node:assert/strict";
import test from "node:test";
import {
  WriteResultUnknownError,
  createWithConfirmation,
  fieldsMatch,
  isUnknownWriteError,
  updateWithConfirmation,
} from "../app/js/operation-recovery.js";

test("classifies gateway and transport failures as unknown results", () => {
  assert.equal(isUnknownWriteError({ status: 504 }), true);
  assert.equal(isUnknownWriteError(new Error("Gateway Timeout")), true);
  assert.equal(isUnknownWriteError(new Error("Validation failed")), false);
});

test("matches only the fields owned by the attempted operation", () => {
  const record = { fields: { status: "approved", "operation-key": "op-1", untouched: "yes" } };
  assert.equal(fieldsMatch(record, { status: "approved", "operation-key": "op-1" }), true);
  assert.equal(fieldsMatch(record, { status: "done" }), false);
});

test("reconciles an update whose response was lost", async () => {
  let reads = 0;
  const outcome = await updateWithConfirmation({
    write: async () => {
      throw Object.assign(new Error("Gateway Timeout"), { status: 504 });
    },
    read: async () => ({ fields: { status: ++reads > 1 ? "approved" : "needs-review", "operation-key": "op-1" } }),
    expectedFields: { status: "approved", "operation-key": "op-1" },
    onConfirming: undefined,
    confirmOptions: { attempts: 2, intervalMs: 0 },
  });
  assert.equal(outcome.reconciled, true);
  assert.equal(outcome.result.fields.status, "approved");
});

test("retries a create once with the caller's idempotent operation", async () => {
  let creates = 0;
  const outcome = await createWithConfirmation({
    create: async () => {
      creates += 1;
      if (creates === 1) throw Object.assign(new Error("fetch failed"), { status: 504 });
      return { id: "cr-1" };
    },
    find: async () => null,
    onConfirming: undefined,
    confirmOptions: { attempts: 1, intervalMs: 0 },
  });
  assert.equal(creates, 2);
  assert.equal(outcome.result.id, "cr-1");
});

test("keeps an unresolved write unknown instead of reporting failure", async () => {
  await assert.rejects(
    updateWithConfirmation({
      write: async () => {
        throw Object.assign(new Error("Gateway Timeout"), { status: 504 });
      },
      read: async () => ({ fields: { status: "needs-review" } }),
      expectedFields: { status: "approved" },
      onConfirming: undefined,
      confirmOptions: { attempts: 1, intervalMs: 0 },
    }),
    WriteResultUnknownError,
  );
});
