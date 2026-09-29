import { build } from "esbuild-wasm";
import { copyFile, mkdir } from "node:fs/promises";
await mkdir("app/vendor", { recursive: true });
for (const [entry, name] of [
  ["index", "busabase-sdk"],
  ["airapp", "busabase-airapp"],
  ["airapp-gate", "busabase-airapp-gate"],
])
  await build({
    entryPoints: ["node_modules/busabase-sdk/dist/" + entry + ".js"],
    outfile: "app/vendor/" + name + ".js",
    bundle: true,
    format: "esm",
    platform: "browser",
    minify: true,
    banner: { js: "// @ts-nocheck" },
  });
await build({
  stdin: {
    contents:
      'export { createElement, RefreshCw, Menu, LayoutDashboard, List, TriangleAlert, CircleHelp, Settings, X } from "lucide";',
    resolveDir: process.cwd(),
  },
  outfile: "app/vendor/lucide.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
});
await copyFile(
  "node_modules/busabase-sdk/dist/airapp-gate.css",
  "app/vendor/busabase-airapp-gate.css",
);
