import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAppSdkHelpers, findPrivateCopies } from "./check-app-sdk-helpers.mjs";

const rules = (source) => findPrivateCopies(source).map(({ rule, line }) => `${rule}:${line}`);

test("flags a local isQueued, however it is declared", () => {
  assert.deepEqual(rules('const isQueued = (result) => result?.materialized === false;'), ["private-is-queued:1"]);
  assert.deepEqual(rules("function isQueued(result) { return false; }"), ["private-is-queued:1"]);
  assert.deepEqual(rules("let isQueued;\nisQueued = () => true;"), ["private-is-queued:1"]);
});

test("lets the SDK's name and plain uses through", () => {
  assert.deepEqual(rules('import { isAirAppWriteQueued } from "../vendor/busabase-airapp.js";\nif (isAirAppWriteQueued(r)) {}'), []);
  assert.deepEqual(rules("const pending = [a, b].find(isQueued);"), []);
});

test("flags a browser fetch of the runtime route, not the server route that answers it", () => {
  assert.deepEqual(rules('const r = await fetch("__airapp/runtime", { headers });'), ["private-runtime-probe:1"]);
  assert.deepEqual(rules("const r = await fetch(`__airapp/runtime`);"), ["private-runtime-probe:1"]);
  assert.deepEqual(rules('app.get("/__airapp/runtime", (c) => c.json(describeBusabaseAirAppRuntime()));'), []);
  assert.deepEqual(rules("const runtime = await detectAirAppRuntime();"), []);
});

test("flags the SDK's review sentence written out again, in any language it ships", () => {
  const en = "Sent for review. You don't have write access here, so this waits until someone who does approves it.";
  assert.deepEqual(rules(`savedForReview: "${en}",`), ["private-review-notice:1"]);
  assert.deepEqual(rules('savedForReview: "已提交审核。你在这里没有写权限",'), ["private-review-notice:1"]);
  assert.deepEqual(rules("notice: `已送出審核。你在這裡沒有寫入權限`"), ["private-review-notice:1"]);
  assert.deepEqual(rules('note: "レビューに送信しました。"'), ["private-review-notice:1"]);
  // other wording about review is the app's own
  assert.deepEqual(rules('sentForReview: "Sent for review",'), []);
  assert.deepEqual(rules('pendingCr: "Sent for review as ChangeRequest {id}. It lands once approved.",'), []);
  assert.deepEqual(rules('decisionPending: "Decision sent for review as change request {id}.",'), []);
});

test("ignores comments that talk about the copies", () => {
  const source = [
    '// the old isQueued = (r) => r.materialized === false, and fetch("__airapp/runtime")',
    '/* "Sent for review. You don\'t have write access" was copied 47 times */',
    "const ok = 1;",
  ].join("\n");
  assert.deepEqual(rules(source), []);
});

test("accepts a copy that says why, and only with a reason", () => {
  const reason = "this app ships no busabase-airapp.js bundle, so the helper is not available to it";
  assert.deepEqual(rules(`// allow-private-copy: ${reason}\nconst isQueued = (r) => r.pending;`), []);
  assert.deepEqual(rules(`const isQueued = (r) => r.pending; // allow-private-copy: ${reason}`), []);
  const bare = findPrivateCopies("const isQueued = (r) => r.pending; // allow-private-copy: later");
  assert.equal(bare.length, 1);
  assert.match(bare[0].problem, /reason of at least/);
});

test("reads AirApp source only, not vendored bundles, tests or dev scripts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-app-sdk-helpers-"));
  const app = path.join(root, "templates", "fixture", "content", "fixture-app");
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(app, relative)), { recursive: true });
    fs.writeFileSync(path.join(app, relative), text);
  };
  write("app/js/providers/busabase-provider.js", "const isQueued = (r) => r.pending;\n");
  write("app/js/runtime.js", 'export const probe = () => fetch("__airapp/runtime");\n');
  write("app/vendor/busabase-airapp.js", 'const isQueued = (r) => r.pending; fetch("__airapp/runtime");\n');
  write("test/provider.test.mjs", "const isQueued = () => true;\n");
  write("scripts/check.mjs", 'if (!source.includes("fetch(\\"__airapp/runtime\\")")) fail();\n');
  const findings = checkAppSdkHelpers({ root });
  assert.deepEqual(
    findings.map(({ file, rule }) => `${path.relative("templates/fixture/content/fixture-app", file)}:${rule}`),
    ["app/js/providers/busabase-provider.js:private-is-queued", "app/js/runtime.js:private-runtime-probe"],
  );
});
