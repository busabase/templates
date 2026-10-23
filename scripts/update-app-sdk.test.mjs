import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  behindApps,
  committedLockfiles,
  findApps,
  installCommands,
  isSdkBundle,
  parseArgs,
  setReleaseAgeExclude,
  setSdkVersion,
  updateApp,
  verifySteps,
} from "./update-app-sdk.mjs";

const script = fileURLToPath(new URL("./update-app-sdk.mjs", import.meta.url));

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "update-app-sdk-"));

const writeApp = (root, relative, packageJson, extra = {}) => {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    typeof packageJson === "string" ? packageJson : `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  for (const [name, text] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

const app = (version, scripts = {}) => ({
  name: "fixture-airapp",
  private: true,
  scripts: { dev: "node server.js", ...scripts },
  dependencies: { "busabase-sdk": version, hono: "4.12.29" },
});

test("moves the pin without reformatting package.json", () => {
  const pretty = `${JSON.stringify(app("0.30.1"), null, 2)}\n`;
  assert.equal(setSdkVersion(pretty, "0.98.0"), pretty.replace('"busabase-sdk": "0.30.1"', '"busabase-sdk": "0.98.0"'));

  const oneLine = '{"name":"x","dependencies":{"hono":"4.13.10","busabase-sdk":"0.90.2","lucide":"1.48.0"}}';
  assert.equal(
    setSdkVersion(oneLine, "0.98.0"),
    '{"name":"x","dependencies":{"hono":"4.13.10","busabase-sdk":"0.98.0","lucide":"1.48.0"}}',
  );
  assert.equal(setSdkVersion('{"devDependencies": {"busabase-sdk" : "^0.30.1"}}', "0.98.0"), '{"devDependencies": {"busabase-sdk" : "0.98.0"}}');
});

test("moves the release-age exclusion with the pin, keeping its quoting", () => {
  assert.equal(
    setReleaseAgeExclude("minimumReleaseAgeExclude:\n  - busabase-sdk@0.30.1\n", "0.98.0"),
    "minimumReleaseAgeExclude:\n  - busabase-sdk@0.98.0\n",
  );
  assert.equal(
    setReleaseAgeExclude('packages:\n  - "."\n\nminimumReleaseAgeExclude:\n  - "busabase-sdk@0.30.1"\n  - "hono@4.12.29"\n', "0.98.0"),
    'packages:\n  - "."\n\nminimumReleaseAgeExclude:\n  - "busabase-sdk@0.98.0"\n  - "hono@4.12.29"\n',
  );
  assert.equal(setReleaseAgeExclude("minimumReleaseAgeExclude: [busabase-sdk@0.30.1]\n", "0.98.0"), "minimumReleaseAgeExclude: [busabase-sdk@0.98.0]\n");
});

test("finds apps that depend on busabase-sdk, by glob or by path", () => {
  const root = fixture();
  const crm = writeApp(root, "templates/busa-crm/content/busa-crm-app", app("0.30.1"));
  const rnd = writeApp(root, "templates/busa-rnd/content/busa-rnd-app", app("0.96.0"));
  writeApp(root, "templates/busa-crm/content/contacts", { name: "not-an-app" });
  fs.mkdirSync(path.join(root, "templates/busa-crm/content/deals"), { recursive: true });
  const kelly = writeApp(root, "skills/kelly-crm/content/kelly-crm-app", app("0.30.1"));

  assert.deepEqual(findApps(["templates/*/content/*"], { cwd: root }), [crm, rnd]);
  assert.deepEqual(findApps(["skills/kelly-*/content/*"], { cwd: root }), [kelly]);
  assert.deepEqual(findApps([rnd, "templates/busa-rnd/content/busa-rnd-app"], { cwd: root }), [rnd]);
  assert.deepEqual(findApps(["templates/missing/content/*", "nowhere"], { cwd: root }), []);
});

test("installs the way the app commits its lockfile", () => {
  assert.deepEqual(installCommands([]), [["npm", ["install", "--no-package-lock", "--no-audit", "--no-fund"]]]);
  assert.deepEqual(installCommands(["package-lock.json"]), [["npm", ["install", "--no-audit", "--no-fund"]]]);
  assert.deepEqual(installCommands(["pnpm-lock.yaml"]), [
    ["pnpm", ["install", "--no-frozen-lockfile", "--config.confirmModulesPurge=false"]],
  ]);
  assert.deepEqual(installCommands(["pnpm-lock.yaml", "package-lock.json"]), [
    ["npm", ["install", "--no-audit", "--no-fund"]],
    ["pnpm", ["install", "--lockfile-only", "--no-frozen-lockfile"]],
  ]);
});

test("reads committed lockfiles from git, and from disk when git does not track the app", async () => {
  const root = fixture();
  const dir = writeApp(root, "app", app("0.30.1"), { "pnpm-lock.yaml": "", "package-lock.json": "{}" });
  const git = (output, code = 0) => async () => ({ code, output });

  // Tracked app: an untracked lockfile on disk is a leftover, not part of it.
  assert.deepEqual(await committedLockfiles(dir, git("package.json\npnpm-lock.yaml\n")), ["pnpm-lock.yaml"]);
  assert.deepEqual(await committedLockfiles(dir, git("package.json\n")), []);
  // Not a checkout, or an app nobody committed yet: what is on disk.
  assert.deepEqual(await committedLockfiles(dir, git("fatal: not a git repository", 128)), [
    "pnpm-lock.yaml",
    "package-lock.json",
  ]);
  assert.deepEqual(await committedLockfiles(dir, git("")), ["pnpm-lock.yaml", "package-lock.json"]);
});

test("runs check, and test only when check does not already run it", () => {
  assert.deepEqual(verifySteps({ check: "node scripts/check.mjs && node --test", test: "node --test" }), ["check"]);
  assert.deepEqual(verifySteps({ check: "node scripts/check.mjs", test: "node --test" }), ["check", "test"]);
  assert.deepEqual(verifySteps({ test: "node --test" }), ["test"]);
  assert.deepEqual(verifySteps({ dev: "node server.js" }), []);
});

/**
 * A runner that records commands, fakes an install of `installs` into
 * node_modules, and lets a test hook what `npm run build:sdk` does.
 */
const fakeRunner = ({ installs, failOn, onBuild } = {}) => {
  const calls = [];
  const run = async (command, args, { cwd } = {}) => {
    const line = [command, ...args].join(" ");
    if (command === "git") return { code: 128, output: "fatal: not a git repository" };
    calls.push(line);
    if (/^(npm|pnpm) install/.test(line) && !args.includes("--lockfile-only")) {
      const sdk = path.join(cwd, "node_modules", "busabase-sdk");
      fs.mkdirSync(sdk, { recursive: true });
      fs.writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ version: installs }));
    }
    if (line === "npm run build:sdk") onBuild?.(cwd);
    return failOn && line.includes(failOn) ? { code: 1, output: `${failOn} broke\nat line 3` } : { code: 0, output: "" };
  };
  return { calls, run };
};

test("rebuilds the SDK bundles but leaves other vendored libraries as committed", async () => {
  const root = fixture();
  const dir = writeApp(root, "app", app("0.30.1", { "build:sdk": "esbuild ... && pnpm run build:rich-docs" }));
  const vendor = path.join(dir, "app", "vendor");
  fs.mkdirSync(vendor, { recursive: true });
  fs.writeFileSync(path.join(vendor, "busabase-airapp.js"), "publish({ autoMerge: false });\n");
  fs.writeFileSync(path.join(vendor, "mermaid.js"), "var L=1;\n");
  const { run } = fakeRunner({
    installs: "0.98.0",
    onBuild: (cwd) => {
      fs.writeFileSync(path.join(cwd, "app", "vendor", "busabase-airapp.js"), "publish({});\n");
      fs.writeFileSync(path.join(cwd, "app", "vendor", "mermaid.js"), "var I=1;\n");
      // What `pnpm run` does on its own: install first, and write a lockfile.
      fs.writeFileSync(path.join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    },
  });

  const row = await updateApp(dir, "0.98.0", { run });

  assert.equal(row.ok, true);
  assert.equal(fs.readFileSync(path.join(vendor, "busabase-airapp.js"), "utf8"), "publish({});\n");
  assert.equal(fs.readFileSync(path.join(vendor, "mermaid.js"), "utf8"), "var L=1;\n");
  assert.equal(fs.existsSync(path.join(dir, "pnpm-lock.yaml")), false, "no lockfile nobody commits");
  assert.ok(isSdkBundle("busabase-airapp-gate.css") && !isSdkBundle("lucide.js"));
});

test("keeps a committed lockfile the install rewrote", async () => {
  const root = fixture();
  const dir = writeApp(root, "app", app("0.30.1"), { "pnpm-lock.yaml": "old\n" });
  const run = async (command, args, options) => {
    if (command === "git") return { code: 0, output: "package.json\npnpm-lock.yaml\n" };
    if (command === "pnpm") fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "new\n");
    return fakeRunner({ installs: "0.98.0" }).run(command, args, options);
  };
  const row = await updateApp(dir, "0.98.0", { run });
  assert.equal(row.ok, true);
  assert.equal(fs.readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8"), "new\n");
});

test("bumps, installs, rebuilds the bundle, then runs the app's own checks", async () => {
  const root = fixture();
  const dir = writeApp(
    root,
    "app",
    app("0.30.1", { "build:sdk": "esbuild ...", check: "node scripts/check.mjs", test: "node --test" }),
    { "pnpm-workspace.yaml": "minimumReleaseAgeExclude:\n  - busabase-sdk@0.30.1\n" },
  );
  const { calls, run } = fakeRunner({ installs: "0.98.0" });

  const row = await updateApp(dir, "0.98.0", { run });

  assert.equal(row.ok, true);
  assert.deepEqual(
    { from: row.from, to: row.to, install: row.install, build: row.build, check: row.check, test: row.test },
    { from: "0.30.1", to: "0.98.0", install: "ok", build: "ok", check: "ok", test: "ok" },
  );
  assert.deepEqual(calls, [
    "npm install --no-package-lock --no-audit --no-fund",
    "npm run build:sdk",
    "npm run check",
    "npm run test",
  ]);
  assert.match(fs.readFileSync(path.join(dir, "package.json"), "utf8"), /"busabase-sdk": "0\.98\.0"/);
  assert.equal(fs.readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8"), "minimumReleaseAgeExclude:\n  - busabase-sdk@0.98.0\n");
  assert.equal(fs.existsSync(path.join(dir, "node_modules")), false, "removes the node_modules it created");
});

test("reports a step the app does not define as absent, not as a pass", async () => {
  const root = fixture();
  const dir = writeApp(root, "app", app("0.98.0"));
  const { calls, run } = fakeRunner({ installs: "0.98.0" });
  const row = await updateApp(dir, "0.98.0", { run });
  assert.equal(row.ok, true);
  assert.deepEqual([row.build, row.check, row.test], ["-", "-", "-"]);
  assert.deepEqual(calls, ["npm install --no-package-lock --no-audit --no-fund"]);
});

test("stops at the first failing step and says which", async () => {
  const root = fixture();
  const scripts = { "build:sdk": "esbuild ...", check: "node scripts/check.mjs", test: "node --test" };
  const dir = writeApp(root, "app", app("0.30.1", scripts));
  fs.mkdirSync(path.join(dir, "node_modules"));
  const { calls, run } = fakeRunner({ installs: "0.98.0", failOn: "run check" });

  const row = await updateApp(dir, "0.98.0", { run });

  assert.equal(row.ok, false);
  assert.deepEqual([row.install, row.build, row.check, row.test], ["ok", "ok", "FAIL", "-"]);
  assert.equal(row.failure.step, "check");
  assert.match(row.failure.output, /run check broke/);
  assert.equal(calls.includes("npm run test"), false);
  assert.equal(fs.existsSync(path.join(dir, "node_modules")), true, "leaves a node_modules that was already there");
});

test("fails the install when node_modules holds a different SDK than the pin", async () => {
  const root = fixture();
  const dir = writeApp(root, "app", app("0.30.1", { "build:sdk": "esbuild ..." }));
  const { calls, run } = fakeRunner({ installs: "0.30.1" });
  const row = await updateApp(dir, "0.98.0", { run });
  assert.equal(row.ok, false);
  assert.equal(row.failure.step, "install");
  assert.match(row.failure.output, /is 0\.30\.1, expected 0\.98\.0/);
  assert.equal(calls.includes("npm run build:sdk"), false);
});

test("--check lists only apps off the target and exits non-zero", () => {
  const root = fixture();
  const crm = writeApp(root, "templates/busa-crm/content/busa-crm-app", app("0.30.1"));
  writeApp(root, "templates/busa-rnd/content/busa-rnd-app", app("0.98.0"));
  assert.deepEqual(behindApps(findApps(["templates/*/content/*"], { cwd: root }), "0.98.0"), [{ dir: crm, from: "0.30.1" }]);

  const behind = spawnSync(process.execPath, [script, "--check", "--version", "0.98.0", "templates/*/content/*"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(behind.status, 1, behind.stderr);
  assert.match(behind.stdout, /templates\/busa-crm\/content\/busa-crm-app\s+0\.30\.1/);
  assert.doesNotMatch(behind.stdout, /busa-rnd/);
  assert.match(behind.stdout, /1 of 2 app\(s\) are not on busabase-sdk@0\.98\.0/);

  const current = spawnSync(process.execPath, [script, "--check", "--version", "0.98.0", "templates/busa-rnd/content/*"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /All 1 app\(s\) are on busabase-sdk@0\.98\.0/);
  assert.match(fs.readFileSync(path.join(crm, "package.json"), "utf8"), /0\.30\.1/, "--check never writes");
});

test("parses options and paths", () => {
  assert.deepEqual(parseArgs(["--check", "--version=0.98.0", "-j", "2", "skills/kelly-*/content/*"]), {
    version: "0.98.0",
    check: true,
    jobs: 2,
    keepNodeModules: false,
    logDir: null,
    patterns: ["skills/kelly-*/content/*"],
  });
  assert.throws(() => parseArgs(["--jobs", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--frobnicate"]), /unknown option/);
});
