import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Which language this app is written in decides which of the checks below
// apply. Read first, because it also decides which files are required at all.
//
// The browser half of an AirApp — everything under `app/` — is plain HTML, CSS
// and JavaScript and is identical either way; only the process serving it
// differs. So every browser-source rule further down runs for both runtimes,
// and only the host-specific ones branch.
const manifestRaw = await readFile(path.join(root, "airapp.json"), "utf8").catch(() => null);
const manifest = manifestRaw ? JSON.parse(manifestRaw) : {};
const runtime = manifest.runtime ?? "node";
if (!["node", "python"].includes(runtime))
  throw new Error(`airapp.json declares unsupported runtime "${runtime}".`);
const isNode = runtime === "node";
const serverFile = isNode ? "server.js" : "server.py";

const required = [
  ...(isNode ? ["package.json", "server.js"] : ["airapp.json", "server.py"]),
  // The browser half is the same for both runtimes, and it imports all three
  // bundles at load: the client, the AirApp helpers and the connect gate. A
  // Python app has no package.json to run `build:sdk` from, but it still needs
  // the files -- `airapp-kit scaffold --runtime python` builds them. Leaving
  // them out of this list is how a Python app passed its check and then opened
  // as an empty page, with a 404 for the gate bundle as the only clue.
  "app/vendor/busabase-sdk.js",
  "app/vendor/busabase-airapp.js",
  "app/vendor/busabase-airapp-gate.js",
  "airapp-blueprint.json",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/messages.js",
  "app/js/busabase-client.js",
  "app/js/runtime.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
];

const contents = {};
const missingFiles = [];
for (const relative of required) {
  const text = await readFile(path.join(root, relative), "utf8").catch(() => null);
  if (text === null) missingFiles.push(relative);
  else contents[relative] = text;
}
if (missingFiles.length) {
  const vendor = missingFiles.some((relative) => relative.startsWith("app/vendor/"));
  throw new Error(
    `Missing: ${missingFiles.join(", ")}.${
      vendor
        ? " The browser imports the vendored bundles at load, so without them the app opens as an empty page. Build them with `npm run build:sdk` (Node) or scaffold again with `--runtime python`."
        : ""
    }`,
  );
}

const packageJson = isNode ? JSON.parse(contents["package.json"]) : {};
const blueprint = JSON.parse(contents["airapp-blueprint.json"]);
const configMatch = contents["app/js/config.js"].match(
  /^\s*export const appConfig = ([\s\S]+);\s*$/,
);
if (!configMatch) throw new Error("Generated config must export one JSON appConfig object.");
const appConfig = JSON.parse(configMatch[1]);
// Everything from here to the end of this block is about an npm project, so it
// runs only for one.
const sdkVersion = isNode ? packageJson.dependencies?.["busabase-sdk"] || "" : "";
if (isNode && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion))
  throw new Error("busabase-sdk must use an exact version.");
// Scan BOTH dependency maps: a bundler declared under devDependencies is just as unable to
// boot under Nodepod as one under dependencies, and only `dependencies` was being checked.
const declaredDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const unsupportedDep = ["react", "vite", "webpack", "next", "parcel", "react-scripts"].find(
  (name) => declaredDeps[name],
);
if (unsupportedDep) throw new Error(`Unsupported frontend dependency: ${unsupportedDep}.`);
if (
  isNode &&
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.devDependencies?.["esbuild-wasm"] || "")
) {
  throw new Error("esbuild-wasm must use an exact version.");
}
// `dev` is the script that matters: EVERY AirApp engine runs `npm run dev` (nodepod-runner.ts
// in the browser, local-runtime.ts and sandock-runtime.ts on a server). This check only ever asserted `start`, so a project that dropped
// `dev` — the exact shape a Vite scaffold produces — passed here and then died at run time on
// `npm error Missing script: "dev"`. `start` is still checked because deployment uses it.
if (isNode && packageJson.scripts?.dev !== "node server.js")
  throw new Error('dev must be exactly "node server.js" — it is what Busabase runs.');
if (isNode && packageJson.scripts?.start !== "node server.js")
  throw new Error("start must not build or spawn subprocesses.");
// A non-Node app says how it starts in `airapp.json` instead of in npm scripts.
// The commands are what Busabase actually executes, so an app that declares
// neither would install and then have nothing to run.
if (!isNode) {
  if (typeof manifest.start !== "string" || !manifest.start.trim())
    throw new Error("airapp.json must declare a `start` command — it is what Busabase runs.");
  if (!manifest.start.includes(serverFile))
    throw new Error(`airapp.json's start command must run ${serverFile}.`);
}
if (contents["app/vendor/busabase-sdk.js"].length < 10_000)
  throw new Error("Browser SDK bundle is missing or incomplete.");
// The AirApp helpers (runtime probe, record reads/writes, write outcome) come
// from `busabase-sdk/airapp`, vendored the same way as the client. A bundle built
// from an older SDK lacks them, and the app then fails in the browser rather
// than here.
const AIRAPP_HELPERS = [
  "detectAirAppRuntime",
  "shouldUseLocalAirAppGateway",
  "createAirAppRecords",
  "airAppWriteMessage",
];
const MIN_SDK_VERSION = [0, 99, 0];
const olderThan = (version, floor) => {
  const have = version.split("-")[0].split(".").map(Number);
  for (let index = 0; index < floor.length; index += 1) {
    if (have[index] !== floor[index]) return have[index] < floor[index];
  }
  return false;
};
// Only a Node app records which SDK it was built against, in package.json.
if (isNode && olderThan(sdkVersion, MIN_SDK_VERSION))
  throw new Error(
    `busabase-sdk ${sdkVersion} has no AirApp helpers (busabase-sdk/airapp); use ${MIN_SDK_VERSION.join(".")} or newer.`,
  );
const missingHelper = AIRAPP_HELPERS.find(
  (name) => !contents["app/vendor/busabase-airapp.js"].includes(name),
);
if (missingHelper)
  throw new Error(
    `app/vendor/busabase-airapp.js lacks ${missingHelper}; rebuild it against busabase-sdk ${MIN_SDK_VERSION.join(".")} or newer (\`npm run build:sdk\`, or scaffold again with --runtime python).`,
  );
if (!["cloud", "desktop"].includes(appConfig.deployment))
  throw new Error("Invalid deployment mode.");
if (!Array.isArray(appConfig.schema?.bases) || !appConfig.schema.bases.length)
  throw new Error("Configured Bases are missing.");
// How this app reaches its resources — see § "Two Ways To Bind" in SKILL.md.
// Inferred from the config rather than declared, so an app scaffolded before
// the distinction existed still classifies correctly: ids present means
// workspace-first `create`/`maintain`, absent means package-first or an
// installed template, where they cannot exist until someone installs.
//
// Requiring ids unconditionally, as this gate used to, made every package-first
// app fail here — including the ones this skill tells an agent to write.
const binding =
  appConfig.spaceId || appConfig.schema.bases.some((base) => base.nodeId || base.baseId)
    ? "pinned"
    : "runtime";

if (binding === "pinned") {
  if (appConfig.deployment === "cloud" && !appConfig.spaceId)
    throw new Error("Cloud app requires spaceId.");
  if (!appConfig.schema.folder?.nodeId) throw new Error("Configured Folder node id is missing.");
  if (appConfig.schema.bases.some((base) => !base.nodeId || !base.baseId))
    throw new Error("Configured Base node/base ids are missing.");
  if (appConfig.schema.bases.some((base) => (base.views || []).some((view) => !view.viewId)))
    throw new Error("Configured View ids are missing.");
}
if (
  appConfig.schema.bases.some(
    (base) => !Number.isInteger(base.readLimit) || base.readLimit < 1 || base.readLimit > 50,
  )
) {
  throw new Error("Every configured Base requires an integer readLimit from 1 to 50.");
}
for (const [index, base] of appConfig.schema.bases.entries()) {
  const expected = blueprint.workspace?.bases?.[index]?.read_limit ?? 50;
  if (base.readLimit !== expected)
    throw new Error(`Configured Base ${base.key || index} readLimit does not match blueprint.`);
}
const resourceCollections = ["docs", "drives", "whiteboards", "forms", "workflows", "html"];
if (
  resourceCollections.some((collection) =>
    (appConfig.schema[collection] || []).some((resource) => !resource.nodeId),
  )
) {
  throw new Error("Configured resource node ids are missing.");
}
if (
  (appConfig.schema.vaultRequirements || []).some(
    (requirement) => "value" in requirement || "secret_value" in requirement,
  )
) {
  throw new Error("Vault values are forbidden in generated config.");
}
if (
  !Array.isArray(appConfig.demoRecords) ||
  appConfig.demoRecords.length < 3 ||
  appConfig.demoRecords.length > 5
) {
  throw new Error("Demo provider requires 3-5 records.");
}
if (blueprint.app?.slug !== appConfig.appSlug)
  throw new Error("Blueprint/config app slug mismatch.");

// Everything the browser downloads. `server.js` is deliberately NOT here: it is
// the only file allowed to know about credentials, because its dev proxy reads
// them from the environment and attaches them server-side.
const browserSource = [
  contents["app/js/app.js"],
  contents["app/js/config.js"],
  contents["app/js/busabase-client.js"],
  contents["app/js/runtime.js"],
  contents["app/js/providers/busabase-provider.js"],
].join("\n");

if (!browserSource.includes("createBusabaseClient")) throw new Error("SDK client missing.");
// The mirror obligation of a runtime binding: with no ids to use, the app must
// resolve them, and by the stamped resourceKey rather than by listing the Space
// and matching a name. An app that does neither loads nothing.
if (binding === "runtime" && !/inspectProvisionedResources/.test(browserSource)) {
  throw new Error(
    "A runtime-bound app must resolve its resources via inspectProvisionedResources.",
  );
}
// One relative path, every environment: same-origin inside Busabase, this app's
// own dev proxy when run standalone. A hard-coded absolute Busabase URL or a
// leftover bridge prefix would work in exactly one of them.
if (!browserSource.includes("window.location.origin"))
  throw new Error("Runtime client must target its own origin.");
if (browserSource.includes("__busabase_api__"))
  throw new Error("Obsolete /__busabase_api__ bridge prefix found.");
if (/baseUrl\s*:\s*["'`]https?:\/\//.test(browserSource))
  throw new Error("Hard-coded Busabase URL found in browser source.");
// The summary is a band, and it must stay one line. `auto-fit` wraps when space
// runs short, so the summary grows downward with every metric added until the
// record list sits below the fold — while every width-based check still passes,
// because nothing overflowed horizontally. Cap the count rather than let the
// band grow: a fourth number belongs in the nav or a filter.
const stylesSource = contents["app/styles.css"];
const metricsRule = stylesSource.match(/\.metrics\s*\{[^}]*\}/);
if (!metricsRule) throw new Error("No .metrics rule in app/styles.css.");
if (/auto-fit|auto-fill/.test(metricsRule[0]))
  throw new Error(
    ".metrics must not use auto-fit/auto-fill: a wrapping summary pushes the list below the fold.",
  );
const metricsArray = contents["app/js/app.js"].match(/const metrics = \[([\s\S]*?)\n {2}\];/);
if (!metricsArray) throw new Error("No metrics array in app/js/app.js.");
const metricCount = (metricsArray[1].match(/^\s*\[/gm) || []).length;
if (metricCount > 3)
  throw new Error(
    `At most 3 metrics; found ${metricCount}. Move the rest into a nav item or a filter.`,
  );

// Metrics live on the overview, never above a record table. Every row of
// summary over a list is a row of records the reader cannot see, and the
// overview is where "how are we doing" gets asked. The nearest page container
// opened before the band must therefore be the overview page.
const indexSource = contents["app/index.html"];
const metricsAt = indexSource.search(/class="metrics"|id="metrics"/);
if (metricsAt >= 0) {
  const before = indexSource.slice(0, metricsAt);
  if (before.lastIndexOf('id="overviewPage"') <= before.lastIndexOf('id="viewPage"'))
    throw new Error(
      "The metrics band must sit inside #overviewPage, not above a record view. Record views get one toolbar row.",
    );
}

const providerSource = contents["app/js/providers/busabase-provider.js"];
if (!/limit:\s*base\.readLimit/.test(providerSource))
  throw new Error("Busabase provider must consume each configured Base readLimit.");
if (/client\.bases\.list\s*\(/.test(browserSource))
  throw new Error("Runtime Base discovery found.");
// One page per user action. A full scan rarely looks like `while (cursor)`:
// it is a capped loop (`while (cursor && pages < 4)`), a fan-out sized by
// `totalPages`, or "jump to page N" built by loading forward until page N
// arrives. Each of these shipped in a real AirApp with a plausible reason.
// See references/runtime-and-sdk.md § A full scan in disguise.
const FULL_SCAN_SHAPES = [
  // A cursor-walking loop awaits a read each turn; a date "cursor" stepping
  // through a calendar does not, and is not a scan.
  [
    /\bwhile\s*\([^;{}]*\b(?:cursor|nextCursor)\b[^;{}]*\)\s*\{(?:(?!\bwhile\b)[\s\S]){0,400}?\bawait\b/,
    "a loop whose condition walks a cursor",
  ],
  [
    /\bdo\s*\{(?:(?!\bdo\s*\{)[\s\S]){0,600}?\bawait\b(?:(?!\bdo\s*\{)[\s\S]){0,600}?\}\s*while\s*\([^;{}]*\b(?:cursor|nextCursor)\b/,
    "a loop whose condition walks a cursor",
  ],
  [/Array\.from\(\s*\{\s*length\s*:[^}]*\btotalPages\b/, "a fan-out sized by totalPages"],
  [/\bfor\s*\([^)]*<=?\s*[\w.]*\btotalPages\b/, "a loop up to totalPages"],
  [
    /\bwhile\s*\([^;{}]*?\)\s*\{(?:(?!\bwhile\b)[\s\S]){0,400}?\bawait\s+[\w.]*load(?:More|Page|Next)\w*\s*\(/,
    "a loop that awaits load-more until a target is reached",
  ],
];
for (const [pattern, shape] of FULL_SCAN_SHAPES) {
  if (pattern.test(browserSource))
    throw new Error(
      `Unbounded loading: found ${shape}. Read one page per user action — use records.count / records.groupBy for totals and records.listPage for numbered pages.`,
    );
}
// Asset references must be RELATIVE. Under the Local Node engine the app is
// reverse-proxied onto a sub-path of busabase's origin, so `src="/js/app.js"`
// resolves against the origin root (busabase itself) and 404s — the app renders
// under Nodepod but not under Local Node. `/api/v1/...` is deliberately absolute
// and unaffected: it is an API call, not an asset.
const absoluteAssetRef = /(?:src|href)="\/(?!\/)|from\s+["']\/(?!\/)/;
if (absoluteAssetRef.test(browserSource) || absoluteAssetRef.test(contents["app/index.html"]))
  throw new Error(
    "Absolute asset path found; use relative paths so the Local Node sub-path proxy works.",
  );
// --- Runtime detection -----------------------------------------------------
// The app must learn where it runs from `BUSABASE_AIRAPP_RUNTIME`, which
// Busabase injects into the process it spawns and `server.js` re-exposes at
// `__airapp/runtime`. Hostname tests are wrong in BOTH directions: a
// Busabase-hosted AirApp is served from `localhost` on Desktop/OSS, and a
// standalone `npm run dev` is reached over LAN IPs and signed dev tunnels
// (`https://3111-….dev.budaapps.com`). The "not localhost ⇒ hosted" direction
// is the damaging one — the app hides its own connection gate, calls
// `/api/v1` unauthenticated, and reports an error the user cannot act on.
// Comments are stripped first so the reasoning may name `localhost` in prose.
//
// Scanned rather than regex-replaced, and that distinction is load-bearing.
// The previous version ran one greedy `/\*[\s\S]*?\*/` pass over the whole
// source, so an ordinary line comment naming a path — `content/*/base.json`,
// which every generated config.js mentions — opened a block comment that ran
// to the next `*/` anywhere in the file. A single JSDoc block later on was
// enough to close it, and everything in between stopped being inspected. The
// negative rules below then ran against a hole and passed unconditionally:
// a gate bypassed by writing a file path.
//
// A scanner also fixes the mirror-image case the old second pass patched by
// hand: `//` inside a string is a URL, not a comment, and must not blank the
// rest of that line.
const stripComments = (source) => {
  let out = "";
  let state = "code"; // code | line | block | ' | " | `
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const pair = char + source[i + 1];
    if (state === "code") {
      if (pair === "//") {
        state = "line";
        i += 1;
        out += " ";
      } else if (pair === "/*") {
        state = "block";
        i += 1;
        out += " ";
      } else {
        if (char === "'" || char === '"' || char === "`") state = char;
        out += char;
      }
    } else if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += char;
      }
    } else if (state === "block") {
      if (pair === "*/") {
        state = "code";
        i += 1;
      } else if (char === "\n") {
        out += char;
      }
    } else {
      // Inside a string literal: only its own closing quote ends it, and a
      // backslash escapes whatever follows (including that quote).
      if (char === "\\") {
        out += source.slice(i, i + 2);
        i += 1;
      } else {
        if (char === state) state = "code";
        out += char;
      }
    }
  }
  return out;
};
const withoutComments = stripComments(browserSource);
if (/location\s*\.\s*(?:hostname|host)\b/.test(withoutComments))
  throw new Error(
    "Hostname-based runtime detection found; read the runtime from __airapp/runtime instead.",
  );
if (
  /(?:===|!==|==|!=)\s*["'`][^"'`]*(?:localhost|127\.0\.0\.1)|(?:includes|startsWith|endsWith|indexOf|search|match|test)\s*\(\s*\/?["'`]?[^"'`)]*(?:localhost|127\.0\.0\.1)/.test(
    withoutComments,
  )
) {
  throw new Error("Loopback host comparison found; runtime detection must not depend on the URL.");
}
if (!/getRuntime\s*\(/.test(contents["app/js/app.js"]))
  throw new Error("app.js must resolve the runtime via runtime.js's getRuntime().");
// The probe is the SDK's. Its rules (relative path, JSON content-type, timeout,
// `hosted` from the server's own boolean, an `unknown` outcome) used to be
// copied into every app and drifted apart; a hand-written fetch of
// `__airapp/runtime` brings that back.
if (!/\bdetectAirAppRuntime\s*\(/.test(stripComments(contents["app/js/runtime.js"])))
  throw new Error(
    "runtime.js must probe through the SDK's detectAirAppRuntime() (busabase-sdk/airapp), not a probe of its own.",
  );
if (/\bfetch\s*\(\s*["'`][^"'`]*__airapp\/runtime/.test(withoutComments))
  throw new Error(
    "Hand-written __airapp/runtime probe found; call the SDK's detectAirAppRuntime() instead.",
  );
// The gate is told explicitly whether it applies, from the runtime the host
// stated -- never inferred from a status probe, never from the hostname.
if (
  !/createAirAppConnectGate\s*\(\s*\{[\s\S]*?\bshouldGate\s*:\s*(?:async\s*)?\(\s*\)\s*=>[^,\n]*(?:shouldUseLocalGateway|shouldUseLocalAirAppGateway|\bhosted\b)/.test(
    stripComments(contents["app/js/app.js"]),
  )
)
  throw new Error(
    "createAirAppConnectGate() must be given shouldGate, derived from the runtime (shouldUseLocalGateway(runtime) or runtime.hosted).",
  );
// Relative on purpose — under the Local Node engine a leading slash resolves
// against busabase's origin root instead of the app's preview sub-path.
if (/["'`]\/__airapp\/runtime/.test(browserSource))
  throw new Error("Runtime probe must use the relative path __airapp/runtime, without a slash.");
// The host must read the injected variable and re-expose it, whatever language
// it is written in — this is the one contract every AirApp host shares.
// A template must bind `runtime`. Pinned ids name the author's Space, so
// publishing one hands every installer node ids that resolve to nothing —
// after an install that reported success. Worse on a collision: it resolves to
// a stranger's data. Nothing downstream can detect that, because "is this id
// from this Space" is not a question a static check can answer; refusing the
// combination is the only place it can be caught.
//
// The manifest sits two levels up in a template package and is simply absent
// for a standalone app, so its absence is not a failure.
// A relation with no target is a field that exists, is named, and links to
// nothing. Provisioning accepts it and creates `options: {}`, so the failure
// surfaces as "the picker is empty" long after the schema was written — and one
// skill in this repo shipped three of them. Both bindings need a target; only
// the form differs, since a runtime-bound app has no ids yet.
for (const base of appConfig.schema?.bases ?? appConfig.bases ?? []) {
  for (const field of base.fields ?? []) {
    if (field.type !== "relation") continue;
    const { targetBaseId, targetBaseSlug } = field.options ?? {};
    if (!targetBaseId && !targetBaseSlug) {
      throw new Error(
        `Relation ${base.key}.${field.slug} declares no target; set options.targetBaseSlug (or targetBaseId when pinned).`,
      );
    }
    if (
      targetBaseSlug &&
      !(appConfig.schema?.bases ?? appConfig.bases ?? []).some(
        (sibling) => sibling.slug === targetBaseSlug,
      )
    ) {
      throw new Error(
        `Relation ${base.key}.${field.slug} targets ${targetBaseSlug}, which is not a Base in this app.`,
      );
    }
  }
}

const packageManifestRaw = await readFile(
  path.join(root, "..", "..", "busabase.json"),
  "utf8",
).catch(() => null);
if (packageManifestRaw) {
  const packageManifest = JSON.parse(packageManifestRaw);
  const pinnedBases = (appConfig.schema?.bases ?? appConfig.bases ?? [])
    .filter((base) => base.nodeId || base.baseId)
    .map((base) => base.slug || base.key);
  if (packageManifest.template && (pinnedBases.length || appConfig.spaceId)) {
    throw new Error(
      `A template must bind runtime, but this app pins resources: ${
        pinnedBases.join(", ") || "spaceId"
      }. Pin an installed instance instead of publishing pinned ids.`,
    );
  }
}

const serverSource = contents[serverFile];
// Comments are stripped first, and that is load-bearing rather than tidiness:
// the template's own comment *names* the SDK helper while explaining why it is
// not called yet, and matching that mention let a server that had stopped
// reading the variable entirely pass this gate. Prose about a rule must never
// satisfy the rule. (Same technique the browser-source rules below already use.)
const serverCode = stripComments(serverSource);

// A Node host may go through the SDK (one definition of "hosted", shared by
// every app) or read the variable directly; both are correct. A Python host has
// no SDK to call, so it reads it itself.
const readsRuntimeEnv = isNode
  ? /(?:describe|read)BusabaseAirAppRuntime\s*\(|process\.env\.BUSABASE_AIRAPP_RUNTIME\b/.test(
      serverCode,
    )
  : /BUSABASE_AIRAPP_RUNTIME/.test(serverCode);
if (!readsRuntimeEnv)
  throw new Error(`${serverFile} must read BUSABASE_AIRAPP_RUNTIME (directly or via the SDK).`);
// The one shape that must never come back: deciding hosting from a hardcoded
// list of engine names. That is what broke 66 apps when `local-node` became
// `local`, and moving the list into an app would reintroduce it wholesale.
//
// Matched on the LIST, not on what it is called. The previous rule keyed off
// the identifier (`AIRAPP_HOSTED_RUNTIMES`, or a `.has()` on something spelled
// `…RUNTIME…`) and so missed the shape actually shipped in 66 apps, which names
// it `HOSTED`:
//
//     const HOSTED = new Set(["nodepod", "local-node", "srt", "embed"]);
//     hosted: body.hosted === true || HOSTED.has(body.runtime),
//
// A name is a detail the next author picks freely; a collection of engine names
// is the defect itself. Two or more of them in one literal is the signal — one
// alone is an ordinary string like "local" or "browser" that any app may use.
//
// It also runs over the BROWSER source now, not just the host's. Those 66 apps
// were all correct server-side and carried the list on the client, where this
// gate never looked. A rule that only inspects half the app is how a defect it
// was written to prevent ships anyway.
const ENGINE_NAME = /["'`](?:nodepod|local-node|sandock|srt|embed|browser|remote|local)["'`]/g;
// At least one of these makes the intent unmistakable — "local" plus "browser"
// could be innocent vocabulary; "nodepod" or "embed" could not.
const DISTINCTIVE_ENGINE_NAME = /["'`](?:nodepod|local-node|sandock|srt|embed|remote)["'`]/;
const findEngineNameList = (code) =>
  (code.match(/\[[^\]]*\]/g) ?? []).find((literal) => {
    const names = literal.match(ENGINE_NAME) ?? [];
    return names.length >= 2 && DISTINCTIVE_ENGINE_NAME.test(literal);
  });
for (const [label, code] of [
  [serverFile, serverCode],
  ["Browser source (app/js/runtime.js and friends)", stripComments(browserSource)],
]) {
  const found = findEngineNameList(code);
  if (found)
    throw new Error(
      `${label} carries a hardcoded engine list ${found.trim()}; hosting is decided from PRESENCE of BUSABASE_AIRAPP_RUNTIME, never membership. Use the server's own \`hosted\` field (or the SDK's isBusabaseAirAppHosted) and delete the list.`,
    );
}
if (/AIRAPP_HOSTED_RUNTIMES\s*=\s*new Set|hosted:\s*\w*RUNTIMES?\w*\.has\s*\(/.test(serverCode))
  throw new Error(
    `${serverFile} decides hosting from a hardcoded engine list; use the SDK's isBusabaseAirAppHosted (presence, not membership).`,
  );
if (!/["'`]\/__airapp\/runtime["'`]/.test(serverSource))
  throw new Error(`${serverFile} must serve the /__airapp/runtime endpoint.`);

// Credentials are scanned across EVERY file the browser downloads, not just the
// five that carry logic. `browserSource` above deliberately excludes
// `messages.js` and `demo-provider.js` because the structural rules (asset
// paths, hostname detection) would false-positive on UI copy — but a key
// pasted into a string table ships to the browser exactly like one pasted into
// app.js, and used to pass this gate.
const browserDownloads = [
  contents["app/js/app.js"],
  contents["app/js/config.js"],
  contents["app/js/busabase-client.js"],
  contents["app/js/runtime.js"],
  contents["app/js/messages.js"],
  contents["app/js/providers/busabase-provider.js"],
  contents["app/js/providers/demo-provider.js"],
  contents["app/index.html"],
].join("\n");
if (/BUSABASE_API_KEY/i.test(browserDownloads))
  throw new Error("API key reference found in browser source.");
if (/Bearer/i.test(browserDownloads)) throw new Error("Bearer header found in browser source.");
// The dev proxy may reference the env var; it may never carry a literal token.
if (/Bearer\s+(?!\$\{)[A-Za-z0-9_-]{8,}/.test(serverSource))
  throw new Error(`Literal Bearer token found in ${serverFile}.`);
// The OAuth gateway is what lets a STANDALONE app obtain a credential of its
// own. It lives in busabase-sdk and is not reimplemented per language — porting
// an auth flow into a second language is how two implementations drift, and the
// one that drifts is a security boundary. So a Node app must use it, and a
// non-Node app must be honest that it has none rather than 404ing at /auth/*
// and leaving the operator guessing.
if (isNode) {
  if (!serverSource.includes("createBusabaseAirAppLocalGateway"))
    throw new Error("Server must use the SDK local AirApp OAuth/Space gateway.");
  for (const route of [
    "/auth/status",
    "/auth/start",
    "/auth/callback",
    "/auth/space",
    "/auth/logout",
  ]) {
    if (!serverSource.includes(route)) throw new Error(`Server is missing ${route}.`);
  }
} else if (!serverSource.includes("/auth/")) {
  throw new Error(
    `${serverFile} must answer /auth/* with an explanation that this runtime is hosted-only.`,
  );
}
// Space selection now lives in busabase-sdk/airapp-gate's createAirAppConnectGate(),
// not hand-rolled per app — see runtime-and-sdk.md. Assert adoption, not the retired
// literal route string (that now lives only in the vendored SDK bundle).
// Both runtimes mount the gate. For a Node app it walks the user through obtaining
// a credential; a Python app is hosted-only, so run standalone its gate is where
// the user is told so (server.py answers /auth/* with the explanation) instead of
// the app calling /api/v1 with no credential and failing in a way nobody can act on.
if (!contents["app/js/app.js"].includes("createAirAppConnectGate"))
  throw new Error("Browser setup must use busabase-sdk/airapp-gate's createAirAppConnectGate().");
// A Python host has no OAuth gateway, so its app is hosted-only. The gate cannot
// say so on its own (it reads a missing /auth/status as "hosted" and steps aside),
// so the config marks the app and app.js must stop with the explanation, rather
// than the user landing on a bare "Not Found" from /api/v1.
if (
  !isNode &&
  (appConfig.hostedOnly !== true ||
    !/\bhostedOnly\b/.test(stripComments(contents["app/js/app.js"])))
)
  throw new Error(
    "A Python app is hosted-only: set hostedOnly in its config and have app.js stop with an explanation when run standalone.",
  );
if (appConfig.readOnly && appConfig.permissions.change_request_procedures.length) {
  throw new Error("Read-only app declares write procedures.");
}

console.log(
  `AirApp checks OK (${runtime}). ${appConfig.demoRecords.length} demo records;` +
    `${isNode ? ` busabase-sdk ${sdkVersion};` : ""} ${appConfig.deployment} deployment.`,
);
