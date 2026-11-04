#!/usr/bin/env node
// Static checks for the site bundle. Run after `npm install`:
//
//   npm run check
//
// 1. vendor/worker.js is exactly what the documented command builds from src/
//    (so nobody edits the bundle by hand, and nobody forgets to rebuild);
// 2. vendor/worker.js has no import left and only a default export;
// 3. airapp.json asks for the site engine, with the entry and assets that exist;
// 4. nothing under public/ mentions the site key.
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
const exportBlock = /^export\s*\{([^}]*)\};?\s*$/m.exec(bundle)?.[1] ?? "";
if (exportBlock.replace(/\s+/g, " ").trim() !== "worker_default as default") {
  failures.push(`vendor/worker.js must export only a default handler, found: export { ${exportBlock.trim()} }`);
}

const manifest = JSON.parse(readFileSync(join(root, "airapp.json"), "utf8"));
if (manifest.requiredEngine !== "site") failures.push('airapp.json: requiredEngine must be "site".');
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

if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log("✓ vendor/worker.js is fresh, import-free and default-export only; airapp.json and public/ are clean.");
}
