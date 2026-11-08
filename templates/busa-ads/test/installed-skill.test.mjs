import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(BUSABASE_|NODE_OPTIONS$|NODE_PATH$)/.test(key),
));
const run = (cwd, script, args = []) => spawnSync(process.execPath, [script, ...args], {
  cwd, env, encoding: "utf8", timeout: 30_000,
});
const assertOk = (result) => assert.equal(result.status, 0, result.stderr || result.stdout);

test("the installed root Skill runs without the AirApp tree", async (t) => {
  const installed = await mkdtemp(path.join(os.tmpdir(), "busa-ads-installed-"));
  t.after(() => rm(installed, { recursive: true, force: true }));
  for (const name of ["SKILL.md", "references", "agents", "scripts"]) {
    await cp(path.join(source, name), path.join(installed, name), {
      recursive: true,
      filter: (entry) => !entry.split(path.sep).includes("node_modules"),
    });
  }
  await assert.rejects(readFile(path.join(installed, "package.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(installed, "content/busa-ads-app/app/js/config.js")), { code: "ENOENT" });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  assertOk(spawnSync(npm, ["install", "--prefix", "scripts", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
    cwd: installed, env, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32",
  }));

  await t.test("runtime commands load busabase-sdk and the bundled model", () => {
    assertOk(run(installed, "scripts/ingest_reports.mjs", ["--help"]));
    assertOk(run(installed, "scripts/run_checks.mjs", ["--help"]));
    assertOk(run(installed, "scripts/execute_decisions.mjs", ["--help"]));
    const dryRun = run(installed, "scripts/ingest_reports.mjs");
    assertOk(dryRun);
    assert.match(dryRun.stdout, /Usage:/);
  });
  await t.test("a credential-gated dry run fails on missing env, not a missing module", () => {
    const result = run(installed, "scripts/run_checks.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BUSABASE_BASE_URL is required/);
    assert.doesNotMatch(`${result.stderr}\n${result.stdout}`, /ERR_MODULE_NOT_FOUND/);
  });
  await t.test("source maintenance stops before a credential lookup", () => {
    for (const script of ["setup", "publish_airapp", "sync-content", "sync-skill-runtime"]) {
      const result = run(installed, `scripts/${script}.mjs`);
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.match(result.stderr, /requires the full busabase\/templates checkout/);
      assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    }
  });
});

test("the shipped runtime bundle matches its canonical sources", () => {
  assertOk(run(source, "scripts/sync-skill-runtime.mjs", ["--check"]));
});
