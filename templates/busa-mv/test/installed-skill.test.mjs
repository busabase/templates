import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(BUSABASE_|KELLY_MV_|NODE_OPTIONS$|NODE_PATH$)/.test(key),
));
const run = (cwd, script, args = []) => spawnSync(process.execPath, [script, ...args], {
  cwd, env, encoding: "utf8", timeout: 30_000,
});
const assertOk = (result) => assert.equal(result.status, 0, result.stderr || result.stdout);

test("the installed root Skill runs without sibling AirApp or catalog assets", async (t) => {
  const installed = await mkdtemp(path.join(os.tmpdir(), "busa-mv-installed-"));
  t.after(() => rm(installed, { recursive: true, force: true }));
  // The package reader installs exactly these root Skill carriers. Exclude all
  // local dependencies so the source checkout cannot mask a missing manifest.
  for (const name of ["SKILL.md", "references", "agents", "scripts"]) {
    await cp(path.join(source, name), path.join(installed, name), {
      recursive: true,
      filter: (entry) => !entry.split(path.sep).includes("node_modules"),
    });
  }
  await assert.rejects(readFile(path.join(installed, "package.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(installed, "content/busa-mv-app/package.json")), { code: "ENOENT" });
  await assert.rejects(readFile(path.join(installed, "assets/starter-project.json")), { code: "ENOENT" });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  assertOk(spawnSync(npm, ["install", "--prefix", "scripts", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
    cwd: installed, env, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32",
  }));

  await t.test("documented command help loads every runtime import", () => {
    for (const script of ["create_sample_project", "execute_generation_requests", "generate_song_draft", "validate_shot_readiness", "export_story_bible", "setup", "publish_airapp"]) {
      const result = run(installed, `scripts/${script}.mjs`, ["--help"]);
      assertOk(result);
      assert.match(result.stdout, /Usage:/);
    }
  });
  await t.test("sample seed reads its bundled JSON with no credentials or writes", async () => {
    const result = run(installed, "scripts/create_sample_project.mjs");
    assertOk(result);
    const seed = JSON.parse(result.stdout);
    const starter = JSON.parse(await readFile(path.join(source, "assets/starter-project.json"), "utf8"));
    assert.equal(seed.mode, "dry-run");
    assert.equal(seed.project.project_id, starter.project_id);
    assert.equal(seed.project.song_title, "静夜思");
    assert.equal(seed.cast.length, starter.characters.length);
    assert.equal(seed.shots.length, starter.shots.length);
  });
  await t.test("readiness and handoff work on the bundled project snapshot", async () => {
    const snapshot = "scripts/data/starter-project.json";
    const validation = run(installed, "scripts/validate_shot_readiness.mjs", [snapshot]);
    assertOk(validation);
    assert.match(validation.stdout, /错误 0/);
    const exported = run(installed, "scripts/export_story_bible.mjs", [snapshot]);
    assertOk(exported);
    const markdown = await readFile(path.join(installed, "exports/静夜思-mv-treatment.md"), "utf8");
    assert.match(markdown, /# MV: 静夜思/);
    assert.match(markdown, /## Shotlist/);
  });
  await t.test("generation reaches its credential check instead of missing dependencies", () => {
    const result = run(installed, "scripts/execute_generation_requests.mjs");
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), "BUSABASE_BASE_URL is required");
  });
  await t.test("source maintenance stops before a credential lookup or Space request", () => {
    for (const script of ["setup", "publish_airapp", "sync-content", "sync-skill-runtime"]) {
      const result = run(installed, `scripts/${script}.mjs`);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires the full busabase\/templates checkout/);
      assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    }
  });
});

test("the shipped runtime bundle matches its canonical sources", () => {
  assertOk(run(source, "scripts/sync-skill-runtime.mjs", ["--check"]));
});
