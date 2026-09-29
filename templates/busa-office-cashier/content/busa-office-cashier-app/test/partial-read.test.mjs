import { test } from "node:test";
import assert from "node:assert/strict";
import { readIndependentRegisters } from "../app/js/model.js";
test("one denied register preserves successful records with an explicit partial diagnostic", async () => {
  const calls = [];
  const result = await readIndependentRegisters(
    [{ key: "good" }, { key: "denied" }],
    async (declaration) => {
      calls.push(declaration.key);
      if (declaration.key === "denied")
        throw Object.assign(Error("Forbidden"), { status: 403 });
      return { key: declaration.key, records: [{ id: "one" }] };
    },
  );
  assert.deepEqual(calls, ["good", "denied"]);
  assert.deepEqual(result.loaded, [{ key: "good", records: [{ id: "one" }] }]);
  assert.deepEqual(result.failures, [
    { key: "denied", code: "PROCEDURE_DENIED" },
  ]);
});
test("all failed registers gate the application and distinguish an expired session from malformed schema", async () => {
  await assert.rejects(
    readIndependentRegisters([{ key: "expired" }], async () => {
      throw { code: "UNAUTHORIZED" };
    }),
    /SESSION_REQUIRED/,
  );
  await assert.rejects(
    readIndependentRegisters([{ key: "invalid" }], async () => {
      throw Error("SCHEMA_INCOMPLETE: title");
    }),
    /SCHEMA_INCOMPLETE/,
  );
});
