#!/usr/bin/env node
// Static checks for the site bundle. Run after `npm install`:
//
//   npm run check
//
// 1. vendor/worker.js is exactly what the documented command builds from src/
//    (so nobody edits the bundle by hand, and nobody forgets to rebuild);
// 2. vendor/worker.js has no import left and only a default export. The one
//    exception is the lazy `import("cloudflare:sockets")` (email): Busabase's
//    site check allows a literal `cloudflare:` specifier and refuses anything
//    else, a computed `import(x)` included. It runs only on the Website engine;
// 3. airapp.json prefers the site engine (entry and assets as deployed) and
//    falls back to the browser preview: `start` runs scripts/browser-preview.mjs,
//    and `install` installs nothing (the bundle carries its dependencies);
// 4. nothing under public/ mentions the site key;
// 5. no file Busabase uploads looks like a leaked secret to its upload check
//    (busabase-core upload-safety: `secret: "<16+ characters>"` and friends),
//    which would refuse the whole install.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

const scratch = mkdtempSync(join(tmpdir(), "busa-shop-check-"));
try {
  const fresh = join(scratch, "worker.js");
  execFileSync(
    join(root, "node_modules", ".bin", "esbuild"),
    ["src/worker.js", "--bundle", "--format=esm", "--platform=neutral", `--outfile=${fresh}`, "--log-level=error"],
    { cwd: root, stdio: "inherit" },
  );
  if (readFileSync(fresh, "utf8") !== readFileSync(join(root, "vendor", "worker.js"), "utf8")) {
    failures.push("vendor/worker.js is stale: run `npx esbuild src/worker.js --bundle --format=esm --platform=neutral --outfile=vendor/worker.js`.");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const bundle = readFileSync(join(root, "vendor", "worker.js"), "utf8");
if (/^\s*import[\s{*"']/m.test(bundle) || /\brequire\(\s*["']/.test(bundle)) failures.push("vendor/worker.js still imports something.");
const dynamicImports = [...bundle.matchAll(/\bimport\(\s*(?:\/\*[^*]*\*\/\s*)?([^)\s]+)\s*\)/g)].map((match) => match[1]);
if (dynamicImports.some((target) => target !== '"cloudflare:sockets"')) {
  failures.push(`vendor/worker.js loads a module Busabase's site check refuses (only a literal "cloudflare:…" is allowed): ${dynamicImports.join(", ")}`);
}
const exportBlock = /^export\s*\{([^}]*)\};?\s*$/m.exec(bundle)?.[1] ?? "";
if (exportBlock.replace(/\s+/g, " ").trim() !== "worker_default as default") {
  failures.push(`vendor/worker.js must export only a default handler, found: export { ${exportBlock.trim()} }`);
}

const manifest = JSON.parse(readFileSync(join(root, "airapp.json"), "utf8"));
// `preferredEngine`, not `requiredEngine`: a space without the Website engine
// (Busabase Cloud Free) then runs the private browser preview instead of
// showing an upgrade wall. Busabase never falls back TO `site`.
if (manifest.requiredEngine !== undefined) failures.push("airapp.json: drop requiredEngine; use preferredEngine \"site\" so a space without the Website engine still gets the browser preview.");
if (manifest.preferredEngine !== "site") failures.push('airapp.json: preferredEngine must be "site".');
if (manifest.start !== "node scripts/browser-preview.mjs") failures.push('airapp.json: start must be "node scripts/browser-preview.mjs" (the browser preview).');
if (typeof manifest.install !== "string" || /\bnpm\b|\bpnpm\b|\byarn\b/.test(manifest.install)) {
  failures.push('airapp.json: install must be a command that installs nothing (vendor/worker.js carries its dependencies; `npm install` would pull the native esbuild into the browser tab).');
}
try {
  statSync(join(root, "scripts", "browser-preview.mjs"));
} catch {
  failures.push("scripts/browser-preview.mjs is missing (airapp.json start).");
}
if (manifest.site?.entry !== "vendor/worker.js") failures.push('airapp.json: site.entry must be "vendor/worker.js".');
if (manifest.site?.assets !== "public") failures.push('airapp.json: site.assets must be "public".');
if (manifest.site?.access !== "write") failures.push('airapp.json: site.access must be "write" (the order form creates records).');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
for (const file of walk(join(root, "public"))) {
  if (/BUSABASE_API_KEY|Bearer\s/i.test(readFileSync(file, "utf8"))) failures.push(`${file} mentions the site key.`);
}

// The same rules Busabase applies to every uploaded file (packages/busabase-core/src/logic/upload-safety.ts).
const UPLOAD_SECRET_RULES = [
  /(AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z\-_]{35}/,
  /sk_(live|test)_[0-9a-zA-Z]{16,}/,
  /(api[_-]?key|secret|token)['"]?\s*[:=]\s*['"][0-9A-Za-z_-]{16,}['"]/i,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN\s?(RSA|EC|OPENSSH|DSA|PGP)?\s?PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
];
for (const dir of ["src", "public", "vendor", "scripts"]) {
  for (const file of walk(join(root, dir))) {
    const content = readFileSync(file, "utf8");
    const rule = UPLOAD_SECRET_RULES.find((pattern) => pattern.test(content));
    if (rule) failures.push(`${file} matches Busabase's upload secret check (${rule}); the install would be refused.`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log("✓ vendor/worker.js is fresh, import-free and default-export only; airapp.json (Website engine, browser preview fallback) and public/ are clean.");
}
