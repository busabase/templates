import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAppWrites, codeOnly, findForcedReview } from "./check-app-writes.mjs";

const lines = (source) => findForcedReview(source).map((finding) => finding.line);

test("flags review forced on a person's write", () => {
  assert.deepEqual(lines("client.records.changeRequest({ recordId, autoMerge: false });"), [1]);
  assert.deepEqual(lines("let written = { autoMerge: false };"), [1]);
});

test("flags autoMerge worked out from where the app runs", () => {
  const source = [
    "const autoMerge = isStandaloneLocalRuntime();",
    "await client.bases.createChangeRequest({ baseId, fields, autoMerge });",
    "await client.records.changeRequest({ recordId, autoMerge: isStandaloneLocalRuntime() });",
    "const merge = { autoMerge: !isAirAppRequest() };",
  ].join("\n");
  assert.deepEqual(lines(source), [1, 2, 3, 4]);
});

test("lets an omitted or literal-true autoMerge through", () => {
  assert.deepEqual(lines("await client.records.changeRequest({ recordId, fields });"), []);
  assert.deepEqual(lines("await client.nodes.createChangeRequest({ operations, autoMerge: true });"), []);
});

test("ignores the word in comments, strings, template text and regexes", () => {
  const source = [
    "// autoMerge is omitted: the workspace's permissions decide.",
    "/* never pass autoMerge: false here */",
    'const hint = "pass autoMerge: false to force review";',
    "const label = `autoMerge = ${String(flag)}`;",
    "const rule = /autoMerge:\\s*false/;",
    "const ok = rule.test(source); // autoMerge: false",
  ].join("\n");
  assert.deepEqual(lines(source), []);
  assert.match(codeOnly("const label = `x ${autoMerge} y`;"), /autoMerge/);
});

test("accepts forced review only with a stated reason", () => {
  const reason = "drafts an outgoing contract that legal must approve before it is sent";
  assert.deepEqual(lines(`autoMerge: false, // allow-forced-review: ${reason}`), []);
  assert.deepEqual(lines(`// allow-forced-review: ${reason}\nautoMerge: false,`), []);
  const bare = findForcedReview("autoMerge: false, // allow-forced-review: risky");
  assert.equal(bare.length, 1);
  assert.match(bare[0].problem, /reason of at least/);
});

test("reads AirApp source only, not vendored bundles, tests or dev scripts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-app-writes-"));
  const app = path.join(root, "templates", "fixture", "content", "fixture-app");
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(app, relative)), { recursive: true });
    fs.writeFileSync(path.join(app, relative), text);
  };
  write("app/js/providers/busabase-provider.js", "export const save = (c) => c.records.changeRequest({ autoMerge: false });\n");
  write("app/vendor/busabase-airapp.js", "publish({ autoMerge: false });\n");
  write("test/provider.test.mjs", "assert.equal(input.autoMerge, false);\n");
  write("scripts/check.mjs", "if (source.autoMerge === false) fail();\n");
  write("lib/client.ts", "const autoMerge = !isAirAppRequest();\n");
  const findings = checkAppWrites({ root });
  assert.deepEqual(
    findings.map(({ file, line }) => `${file}:${line}`),
    [
      "templates/fixture/content/fixture-app/app/js/providers/busabase-provider.js:1",
      "templates/fixture/content/fixture-app/lib/client.ts:1",
    ],
  );
});
