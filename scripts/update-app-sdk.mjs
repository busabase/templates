// Every AirApp carries its own copy of busabase-sdk: package.json pins a
// version, and the app's `build:sdk` script bundles the SDK's browser entry
// points into `app/vendor/`. An SDK fix reaches an app only when both happen —
// the pin moves AND the bundle is rebuilt — so apps drift apart one forgotten
// re-vendor at a time. This does both for every app, then runs the app's own
// `check` and `test`, and prints one row per app.
//
//   node scripts/update-app-sdk.mjs                       # every app -> npm latest
//   node scripts/update-app-sdk.mjs --version 0.98.0      # a specific version
//   node scripts/update-app-sdk.mjs --check               # only report apps not on it; exit 1 if any
//   node scripts/update-app-sdk.mjs templates/busa-crm/content/busa-crm-app
//   cd ~/Documents/skills && node <templates>/scripts/update-app-sdk.mjs 'skills/kelly-*/content/*'
//
// Paths and globs are resolved from the current directory; with none, every
// `templates/*/content/*` of this repository. A directory counts as an app when
// its package.json depends on busabase-sdk.
//
// Per app: set the pin (and the matching `minimumReleaseAgeExclude` entry in
// the app's own pnpm-workspace.yaml) -> install -> `build:sdk` -> `check` ->
// `test`. A step the app does not define is reported as "-", not as a pass.
//
// Lockfiles follow what is committed. A tracked package-lock.json is rewritten
// by `npm install` (and a tracked pnpm-lock.yaml beside it by
// `pnpm install --lockfile-only`); a tracked pnpm-lock.yaml alone by
// `pnpm install`; an app with neither is installed with
// `npm install --no-package-lock`, and a lockfile the run leaves behind that
// nobody commits is removed. node_modules is never committed: the ones this run
// created are removed afterwards (`--keep-node-modules` keeps them).
//
// Only the SDK's own bundles (`app/vendor/busabase-*`) change. If an app's
// `build:sdk` also rebuilds another vendored library, that file is put back as
// it was — see `isSdkBundle`.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDir);

export const SDK = "busabase-sdk";
export const DEFAULT_PATTERNS = ["templates/*/content/*"];
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json"];
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

// ── pure helpers ───────────────────────────────────────────────────────────

/** The busabase-sdk spec a package.json pins, or null when it does not depend on it. */
export const sdkSpec = (packageJson) => {
  for (const field of DEPENDENCY_FIELDS) {
    const spec = packageJson?.[field]?.[SDK];
    if (typeof spec === "string") return spec;
  }
  return null;
};

/**
 * package.json text with every busabase-sdk pin set to `version`. Edits the
 * text rather than re-serialising it, so a file written on one line, with tabs,
 * or with its keys in a particular order comes back exactly as it was apart
 * from the version.
 */
export const setSdkVersion = (text, version) =>
  text.replace(/("busabase-sdk"\s*:\s*")[^"]*(")/g, (_, open, close) => `${open}${version}${close}`);

/**
 * pnpm-workspace.yaml text with its `busabase-sdk@<version>` entries (the
 * `minimumReleaseAgeExclude` that lets a just-published SDK install) moved to
 * `version`. Quoted and unquoted entries both keep their quoting.
 */
export const setReleaseAgeExclude = (text, version) =>
  text.replace(/(busabase-sdk@)[^\s"',\]]+/g, (_, prefix) => `${prefix}${version}`);

const GLOB = /[*?[\]{}]/;

/** Every app directory the patterns name, sorted and deduplicated. */
export const findApps = (patterns, { cwd = process.cwd() } = {}) => {
  const dirs = new Set();
  for (const pattern of patterns) {
    const matches = GLOB.test(pattern) ? fs.globSync(pattern, { cwd }) : [pattern];
    for (const match of matches) {
      const dir = path.resolve(cwd, match);
      const manifest = path.join(dir, "package.json");
      if (!fs.existsSync(manifest)) continue;
      if (sdkSpec(JSON.parse(fs.readFileSync(manifest, "utf8"))) !== null) dirs.add(dir);
    }
  }
  return [...dirs].sort();
};

/**
 * The lockfiles this app commits. For an app git already tracks, that is what
 * git tracks — an untracked lockfile on disk is someone's leftover, not part of
 * the app. Outside a checkout, or for an app not committed yet, what is on disk.
 */
export const committedLockfiles = async (dir, run = runCommand) => {
  const result = await run("git", ["ls-files", "--", "package.json", ...LOCKFILES], { cwd: dir, quiet: true });
  const tracked = new Set(result.output.split("\n").map((line) => line.trim()));
  if (result.code === 0 && tracked.has("package.json")) return LOCKFILES.filter((name) => tracked.has(name));
  return LOCKFILES.filter((name) => fs.existsSync(path.join(dir, name)));
};

/**
 * The install commands for an app that commits `lockfiles`, in order. An app
 * that commits a package-lock.json was built with npm, so npm lays out
 * node_modules and a pnpm-lock.yaml beside it is only refreshed.
 */
export const installCommands = (lockfiles) => {
  const pnpmLock = lockfiles.includes("pnpm-lock.yaml");
  const npmLock = lockfiles.includes("package-lock.json");
  if (npmLock) {
    return [
      ["npm", ["install", "--no-audit", "--no-fund"]],
      ...(pnpmLock ? [["pnpm", ["install", "--lockfile-only", "--no-frozen-lockfile"]]] : []),
    ];
  }
  if (pnpmLock) return [["pnpm", ["install", "--no-frozen-lockfile", "--config.confirmModulesPurge=false"]]];
  return [["npm", ["install", "--no-package-lock", "--no-audit", "--no-fund"]]];
};

/**
 * The SDK's own bundles in `app/vendor/` are the ones named `busabase-*`. A
 * `build:sdk` that also rebuilds another vendored library (icons, mermaid)
 * would re-resolve that library's unlocked dependencies and ship an unrelated
 * diff, so those files are put back exactly as they were. Re-vendor them on
 * purpose, not as a side effect of an SDK bump.
 */
export const isSdkBundle = (name) => name.startsWith("busabase-");

const snapshotOtherVendorFiles = (dir) => {
  const vendor = path.join(dir, "app", "vendor");
  if (!fs.existsSync(vendor)) return [];
  return fs
    .readdirSync(vendor, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !isSdkBundle(entry.name))
    .map((entry) => ({ file: path.join(vendor, entry.name), bytes: fs.readFileSync(path.join(vendor, entry.name)) }));
};

/** Put the snapshot back; returns the names of files the build had changed. */
const restoreFiles = (snapshot) =>
  snapshot
    .filter(({ file, bytes }) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes))
    .map(({ file, bytes }) => {
      fs.writeFileSync(file, bytes);
      return path.basename(file);
    });

/** The scripts to run after the build: `check`, and `test` unless `check` already runs it. */
export const verifySteps = (scripts = {}) => {
  const steps = [];
  if (scripts.check) steps.push("check");
  if (scripts.test && !(scripts.check && scripts.check.includes(scripts.test))) steps.push("test");
  return steps;
};

// ── running ────────────────────────────────────────────────────────────────

/** Spawn a command; resolve with its exit code and combined output. Never rejects. */
export const runCommand = (command, args, { cwd, log, quiet = false, timeout = STEP_TIMEOUT_MS } = {}) =>
  new Promise((resolve) => {
    if (log && !quiet) log.write(`\n$ ${[command, ...args].join(" ")}\n`);
    let output = "";
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, npm_config_update_notifier: "false", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: 127, output: String(error) });
      return;
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    const collect = (chunk) => {
      output += chunk;
      if (log && !quiet) log.write(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, output: `${output}${error.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? (signal ? 124 : 1), output });
    });
  });

const tail = (text, lines = 12) => text.trimEnd().split("\n").slice(-lines).join("\n");

/**
 * Bring one app to `version` and verify it. Returns one result row:
 * `{ dir, from, to, install, build, check, test, ok, failure? }`, where each
 * step is "ok", "FAIL", or "-" when the app does not define it.
 */
export const updateApp = async (dir, version, { run = runCommand, log, keepNodeModules = false } = {}) => {
  const manifestPath = path.join(dir, "package.json");
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const from = sdkSpec(JSON.parse(manifestText));
  const row = { dir, from, to: version, install: "-", build: "-", check: "-", test: "-", ok: false };
  const hadNodeModules = fs.existsSync(path.join(dir, "node_modules"));
  const lockfilesBefore = new Set(LOCKFILES.filter((name) => fs.existsSync(path.join(dir, name))));
  let committed = [];

  let step = "install";
  const fail = (output) => {
    row[step] = "FAIL";
    row.failure = { step: step === "build" ? "build:sdk" : step, output: tail(output) };
    return row;
  };

  try {
    if (from !== version) fs.writeFileSync(manifestPath, setSdkVersion(manifestText, version));
    const workspacePath = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(workspacePath)) {
      const before = fs.readFileSync(workspacePath, "utf8");
      const after = setReleaseAgeExclude(before, version);
      if (after !== before) fs.writeFileSync(workspacePath, after);
    }

    committed = await committedLockfiles(dir, run);
    for (const [command, args] of installCommands(committed)) {
      const result = await run(command, args, { cwd: dir, log });
      if (result.code !== 0) return fail(result.output);
    }
    // The pin is not proof: a stale lockfile or a parent workspace can install
    // something else, and then every later step tests the wrong SDK.
    const installed = path.join(dir, "node_modules", SDK, "package.json");
    const installedVersion = fs.existsSync(installed) ? JSON.parse(fs.readFileSync(installed, "utf8")).version : null;
    if (installedVersion !== version) {
      return fail(`node_modules/${SDK} is ${installedVersion ?? "missing"}, expected ${version}`);
    }
    row.install = "ok";

    const { scripts = {} } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (scripts["build:sdk"]) {
      step = "build";
      const others = snapshotOtherVendorFiles(dir);
      const result = await run("npm", ["run", "build:sdk"], { cwd: dir, log });
      const restored = restoreFiles(others);
      if (restored.length && log) log.write(`\nkept as committed (not SDK bundles): ${restored.join(", ")}\n`);
      if (result.code !== 0) return fail(result.output);
      row.build = "ok";
    }
    for (const script of verifySteps(scripts)) {
      step = script;
      const result = await run("npm", ["run", script], { cwd: dir, log });
      if (result.code !== 0) return fail(result.output);
      row[script] = "ok";
    }
    row.ok = true;
    return row;
  } catch (error) {
    return fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
  } finally {
    if (!hadNodeModules && !keepNodeModules) fs.rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
    // A `pnpm run` inside an app's own script installs first and writes a
    // lockfile; one that was not here before and is not committed goes.
    for (const name of LOCKFILES) {
      if (!lockfilesBefore.has(name) && !committed.includes(name)) fs.rmSync(path.join(dir, name), { force: true });
    }
  }
};

/** Run `task` over `items` with at most `jobs` in flight; results keep input order. */
export const pool = async (items, jobs, task) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
  return results;
};

/** `--check`: every app whose pin is not exactly `version`. Reads files only. */
export const behindApps = (dirs, version) =>
  dirs
    .map((dir) => ({ dir, from: sdkSpec(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))) }))
    .filter(({ from }) => from !== version);

export const formatTable = (rows, columns) => {
  const widths = columns.map(([key, title]) => Math.max(title.length, ...rows.map((row) => String(row[key]).length)));
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ").trimEnd();
  return [
    line(columns.map(([, title]) => title)),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map((row) => line(columns.map(([key]) => row[key]))),
  ].join("\n");
};

const latestVersion = async (run = runCommand) => {
  const result = await run("npm", ["view", SDK, "version"], { quiet: true });
  const version = result.output.trim().split("\n").at(-1)?.trim();
  if (result.code !== 0 || !/^\d+\.\d+\.\d+/.test(version ?? "")) {
    throw new Error(`could not read the latest ${SDK} from npm:\n${result.output}`);
  }
  return version;
};

export const parseArgs = (argv) => {
  const options = { version: null, check: false, jobs: 4, keepNodeModules: false, logDir: null, patterns: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--check") options.check = true;
    else if (arg === "--version") options.version = value();
    else if (arg.startsWith("--version=")) options.version = arg.slice("--version=".length);
    else if (arg === "--jobs" || arg === "-j") options.jobs = Number.parseInt(value(), 10);
    else if (arg === "--keep-node-modules") options.keepNodeModules = true;
    else if (arg === "--log-dir") options.logDir = value();
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else options.patterns.push(arg);
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1) throw new Error("--jobs needs a positive integer");
  return options;
};

const USAGE = `usage: node scripts/update-app-sdk.mjs [--version <x.y.z>] [--check] [--jobs <n>]
                                     [--keep-node-modules] [--log-dir <dir>] [<path-or-glob>...]`;

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const cwd = options.patterns.length ? process.cwd() : defaultRoot;
  const dirs = findApps(options.patterns.length ? options.patterns : DEFAULT_PATTERNS, { cwd });
  if (!dirs.length) {
    console.error(`No app depending on ${SDK} under ${(options.patterns.length ? options.patterns : DEFAULT_PATTERNS).join(", ")}`);
    return 1;
  }
  const version = options.version ?? (await latestVersion());
  const display = (dir) => path.relative(cwd, dir) || ".";

  if (options.check) {
    const behind = behindApps(dirs, version);
    if (behind.length) {
      console.log(formatTable(behind.map((row) => ({ ...row, dir: display(row.dir) })), [["dir", "app"], ["from", SDK]]));
      console.log(`\n${behind.length} of ${dirs.length} app(s) are not on ${SDK}@${version}.`);
      return 1;
    }
    console.log(`All ${dirs.length} app(s) are on ${SDK}@${version}.`);
    return 0;
  }

  const logDir = options.logDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "update-app-sdk-"));
  fs.mkdirSync(logDir, { recursive: true });
  console.log(`Updating ${dirs.length} app(s) to ${SDK}@${version} (${options.jobs} at a time). Logs: ${logDir}`);

  const rows = await pool(dirs, options.jobs, async (dir) => {
    const logPath = path.join(logDir, `${display(dir).replaceAll(path.sep, "__")}.log`);
    const log = fs.createWriteStream(logPath);
    const row = await updateApp(dir, version, { log, keepNodeModules: options.keepNodeModules });
    await new Promise((resolve) => log.end(resolve));
    console.log(`${row.ok ? "ok  " : "FAIL"} ${display(dir)}`);
    return { ...row, log: logPath };
  });

  const table = rows.map((row) => ({ ...row, dir: display(row.dir), result: row.ok ? "ok" : "FAIL" }));
  console.log(
    `\n${formatTable(table, [
      ["dir", "app"],
      ["from", "from"],
      ["to", "to"],
      ["install", "install"],
      ["build", "build:sdk"],
      ["check", "check"],
      ["test", "test"],
      ["result", "result"],
    ])}`,
  );
  const failed = rows.filter((row) => !row.ok);
  for (const row of failed) {
    console.log(`\n── ${display(row.dir)}: ${row.failure.step} failed (full log: ${row.log})\n${row.failure.output}`);
  }
  console.log(`\n${rows.length - failed.length} of ${rows.length} app(s) on ${SDK}@${version} and passing.`);
  return failed.length ? 1 : 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
