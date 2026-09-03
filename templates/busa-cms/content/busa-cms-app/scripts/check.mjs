import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const readIfExists = (target) => readFile(target, "utf8").catch(() => undefined);

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
};

const appFiles = await walk(path.join(root, "app"));
const joinFiles = async (files) =>
  (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

const browserLogic = await joinFiles(
  appFiles.filter((file) => file.endsWith(".js") && file.includes(`${path.sep}js${path.sep}`)),
);
const browserDownloads = await joinFiles(appFiles.filter((file) => /\.(?:js|html)$/.test(file)));
const serverFiles = [path.join(root, "server.js"), ...(await walk(path.join(root, "server")))];
const serverSource = (await Promise.all(serverFiles.map(readIfExists)))
  .filter((text) => text !== undefined)
  .join("\n");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const index = await readFile(path.join(root, "app", "index.html"), "utf8");

// ── busabase-sdk/airapp-check: the versioned AirApp runtime contract ──────────
// Added on top of this file's own checks, not in place of them. The rules below
// are specific to this app; the ones there are the shared contract every AirApp
// is held to, versioned with the SDK — so a fix in a later busabase-sdk reaches
// this app by bumping the pin instead of by editing a copy of the rule here.
{
  const { checkAirApp } = await import("busabase-sdk/airapp-check");
  const findings = await checkAirApp({
    packageJson: JSON.stringify(packageJson),
    server: serverSource,
    serverLanguage: "node",
    browserLogic,
    browserDownloads,
    config: await readIfExists(path.join(root, "app", "js", "config.js")),
    shippedSlug: path.basename(root),
  });
  const errors = findings.filter((finding) => finding.severity === "error");
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors
        .map((finding) => `  [${finding.rule}] ${finding.message}`)
        .join("\n")}`,
    );
  }
}

const assertions = [
  {
    ok: packageJson.scripts?.dev === "node server.js",
    message: "Busabase starts an app with its dev script; it must be `node server.js`",
  },
  {
    ok: packageJson.dependencies?.["busabase-sdk"] === "0.30.1",
    message: "busabase-sdk must stay exact-pinned so airapp-check's rules are versioned with it",
  },

  // ── runtime detection ──────────────────────────────────────────────────────
  // Copied from kelly-app-creator's `assets/runtime-detection/check-rules.mjs`.
  // These exist because prose alone did not hold: 65 generated apps had each
  // independently reinvented the same loopback-hostname test, and one app's own
  // check script had gone as far as REQUIRING it. A rule that is only written
  // down gets re-derived; a rule that fails the build does not.
  {
    ok: !/location\s*\.\s*hostname|window\.self\s*!==\s*window\.top/.test(browserLogic),
    message: "Runtime must not be inferred from the hostname or from iframe nesting",
  },
  {
    ok: browserLogic.includes("__airapp/runtime"),
    message: "Browser code must probe the injected runtime at __airapp/runtime",
  },
  {
    // Relative on purpose: a hosted app can be served from a sub-path of
    // Busabase's origin, where a leading slash resolves against the origin root
    // instead and 404s.
    ok: !/["'`]\/__airapp\/runtime/.test(browserLogic),
    message: "Runtime probe must be relative (__airapp/runtime), without a leading slash",
  },
  {
    ok:
      /\bdescribeBusabaseAirAppRuntime\s*\(\s*\)/.test(serverSource) &&
      serverSource.includes('"/__airapp/runtime"'),
    message: "Server must expose describeBusabaseAirAppRuntime() at /__airapp/runtime",
  },

  // ── this app's own contract ────────────────────────────────────────────────
  {
    ok: !/\bhref="\/(?!api\/v1)|\bsrc="\//.test(index),
    message: "AirApp assets must use relative URLs — a hosted app can live under a sub-path",
  },
  {
    // The whole point of the template: the schema an install produces has to be
    // the one `createBusabaseCms({ folderId })` expects to adopt. The comparison
    // itself lives in the template root's `scripts/check-sdk-contract.mjs`, which
    // diffs against the real published package.
    ok: /CMS_SCHEMA_VERSION\s*=\s*1\b/.test(
      await readFile(path.join(root, "app", "js", "schema.js"), "utf8"),
    ),
    message: "schema.js must declare the busabase-cms metadata schema version it mirrors",
  },
  {
    // Matches a passed option (`autoMerge:` / `autoMerge =`), not the word in the
    // comment that explains why it is deliberately absent.
    ok: !/\bautoMerge\s*[:=]/.test(
      await readFile(path.join(root, "lib", "busabase-client.ts"), "utf8"),
    ),
    message:
      "Writes must leave autoMerge unset so Busabase's permission-aware default decides, " +
      "rather than this app forcing or skipping review",
  },
  {
    ok: !/\bapiKey\b|BUSABASE_API_KEY/.test(browserDownloads),
    message: "No credential may appear in anything the browser downloads",
  },
  {
    ok: /const localeEntries/.test(
      await readFile(path.join(root, "app", "js", "list-detail.js"), "utf8"),
    ),
    message: "The editor must offer the locales the schema declares, not a hardcoded list",
  },
];

const failures = assertions.filter((assertion) => !assertion.ok);
if (failures.length) {
  throw new Error(`Busa CMS checks failed:\n${failures.map((f) => `  - ${f.message}`).join("\n")}`);
}

const files = await walk(root);
console.log(`Busa CMS AirApp checks OK (${files.length} files)`);
