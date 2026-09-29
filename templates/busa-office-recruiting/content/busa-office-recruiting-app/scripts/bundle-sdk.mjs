import { build } from "esbuild-wasm";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("app/vendor", { recursive: true });
for (const [entry, name] of [
  ["index", "busabase-sdk"],
  ["airapp", "busabase-airapp"],
  ["airapp-gate", "busabase-airapp-gate"],
])
  await build({
    entryPoints: ["node_modules/busabase-sdk/dist/" + entry + ".js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    banner: { js: "// @ts-nocheck" },
    outfile: "app/vendor/" + name + ".js",
  });
await copyFile(
  "node_modules/busabase-sdk/dist/airapp-gate.css",
  "app/vendor/busabase-airapp-gate.css",
);
await build({ entryPoints: ["app/js/icons.js"], bundle: true, format: "esm", platform: "browser", outfile: "app/vendor/icons.js", banner: { js: "// @ts-nocheck" } });
