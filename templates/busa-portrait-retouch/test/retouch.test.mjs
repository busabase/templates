import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

const cli = path.resolve("scripts/retouch.mjs");

test("creates a non-destructive candidate and comparison", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "portrait-retouch-"));
  const input = path.join(temp, "portrait.png");
  const output = path.join(temp, "candidate.png");
  const compare = path.join(temp, "compare.jpg");
  const summary = path.join(temp, "summary.json");
  await sharp({ create: { width: 80, height: 100, channels: 3, background: "#a87362" } })
    .png()
    .toFile(input);
  const run = spawnSync(
    process.execPath,
    [cli, input, "--output", output, "--compare", compare, "--summary", summary, "--face", "20,20,40,55", "--json"],
    {
      cwd: path.resolve("."),
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.faces.length, 1);
  assert.equal(result.face_processing, "masked");
  assert.equal(result.engine_version, "sharp-natural-v1");
  assert.equal(JSON.parse(await readFile(summary, "utf8")).output, output);
  assert.deepEqual((await sharp(output).metadata()).width, 80);
  assert.deepEqual((await sharp(compare).metadata()).width, 160);
  assert.ok((await readFile(input)).length > 0);
});

test("trusted sync command defaults to an idempotent dry run", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "portrait-retouch-sync-"));
  const input = path.join(temp, "portrait.png");
  const output = path.join(temp, "candidate.png");
  const summary = path.join(temp, "summary.json");
  await sharp({ create: { width: 40, height: 40, channels: 3, background: "#b77768" } })
    .png()
    .toFile(input);
  const retouch = spawnSync(process.execPath, [cli, input, "--output", output, "--summary", summary, "--json"], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
  assert.equal(retouch.status, 0, retouch.stderr);
  const sync = spawnSync(process.execPath, [path.resolve("scripts/sync-candidate.mjs"), summary], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
  assert.equal(sync.status, 0, sync.stderr);
  const plan = JSON.parse(sync.stdout);
  assert.equal(plan.mode, "dry-run");
  assert.match(plan.jobId, /^portrait-[a-f0-9]{16}$/);
  assert.match(plan.candidateId, /^candidate-[a-f0-9]{20}$/);
});

test("refuses to overwrite an existing output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "portrait-retouch-"));
  const input = path.join(temp, "portrait.png");
  await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } })
    .png()
    .toFile(input);
  const run = spawnSync(process.execPath, [cli, input, "--output", input], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /cannot replace the input/i);
});
