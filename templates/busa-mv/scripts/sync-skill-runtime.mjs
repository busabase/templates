#!/usr/bin/env node
// Bundle canonical files into the subtree carried by the installed Skill node.
//   node scripts/sync-skill-runtime.mjs [--check]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireRepositorySource } from "./lib/repository-source.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
requireRepositorySource(root);
const check = process.argv.includes("--check");
const stale = [];

const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== contents) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};

// content/ becomes separate nodes; assets/ is catalog data. Neither travels
// inside the root Skill, so runtime dependencies must also live in scripts/.
for (const [source, target] of [
  ["content/busa-mv-app/app/js/config.js", "scripts/lib/config.js"],
  ["content/busa-mv-app/app/js/mv-model.js", "scripts/lib/mv-model.js"],
  ["assets/starter-project.json", "scripts/data/starter-project.json"],
]) {
  await emit(target, await readFile(path.join(root, source), "utf8"));
}
const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await emit("scripts/package.json", `${JSON.stringify({
  name: "busa-mv-skill-runtime",
  private: true,
  type: "module",
  version: sourcePackage.version,
  dependencies: sourcePackage.dependencies,
  engines: sourcePackage.engines,
}, null, 2)}\n`);

if (stale.length) {
  console.error(`Installed Skill runtime is out of date:\n${stale.map((item) => `  ${item}`).join("\n")}\nRun: node scripts/sync-skill-runtime.mjs`);
  process.exit(1);
}
console.log(check ? "Installed Skill runtime is up to date." : "Installed Skill runtime regenerated.");
