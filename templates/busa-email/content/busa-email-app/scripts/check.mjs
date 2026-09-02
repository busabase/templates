import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");
const baseUiText = await readFile(path.join(root, "app", "styles", "base-ui.css"), "utf8");
const layersText = await readFile(path.join(root, "app", "styles", "layers.css"), "utf8");
const setupText = await readFile(path.join(root, "app", "js", "setup.js"), "utf8");
const localAuthText = await readFile(path.join(root, "server", "local-auth.js"), "utf8");
const providerText = await readFile(path.join(root, "lib", "data-provider", "busabase-client.ts"), "utf8");
const providerModelText = await readFile(path.join(root, "lib", "data-provider", "busabase-provider.ts"), "utf8");
const listText = await readFile(path.join(root, "app", "js", "list-detail.js"), "utf8");
const serverText = await readFile(path.join(root, "server", "hono.ts"), "utf8");

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (packageJson.dependencies["busabase-sdk"] !== "0.30.1") throw new Error("busabase-sdk must be exact-pinned");
if (!configText.includes('deployment: "cloud"')) throw new Error("Busa Email must be Cloud-only");
if (!configText.includes('resourceKey: "busa-email-files"')) {
  throw new Error("Drive ownership must match the slug installed by the template");
}
if (!configText.includes('"records.count"')) throw new Error("Busa Email must allow exact record counts");
if (!providerText.includes("sdk.records.count") || !providerText.includes("nextCursor")) {
  throw new Error("Busa Email provider must return one cursor page plus an exact count");
}
if (!providerText.includes("record?.headCommit?.payload")) {
  throw new Error("Busa Email provider must read the current SDK record payload shape");
}
if (!providerModelText.includes("batchFromEmailRecords(page.rows")) {
  throw new Error("Every review page must use the shared record normalizer");
}
if (!listText.includes("export async function loadMore()") || !listText.includes("appendStatePage")) {
  throw new Error("Busa Email list/detail UI must append one page per Load more action");
}
if (!serverText.includes("describeBusabaseAirAppRuntime")) {
  throw new Error("AirApp runtime reporting must use busabase-sdk/airapp-node");
}
if (/BUSA_EMAIL_DATA_PROVIDER|local-file-provider|folders\.get/.test(configText)) {
  throw new Error("Retired provider/runtime contract remains in app config");
}
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");
if (!index.includes('name="color-scheme" content="light dark"')) {
  throw new Error("Native controls must advertise light and dark color schemes");
}
if (index.indexOf("styles/base-ui.css") > index.indexOf("styles/layers.css")) {
  throw new Error("Base UI must load before app styles");
}
if (!layersText.includes("@layer base-ui, base, components, shell")) {
  throw new Error("Base UI must be the first cascade layer");
}
for (const token of ["--text-xs: 11px", "--text-3xl: 38px", "--radius-lg: 14px", "--surface-blur:"]) {
  if (!baseUiText.includes(token)) throw new Error(`Base UI token missing: ${token}`);
}
if (
  configText.includes("orglnl02ONE36pXGXTs") ||
  !setupText.includes('name="space_id"') ||
  !setupText.includes("status.requiresSpace") ||
  !localAuthText.includes('app.post("/auth/space"') ||
  !localAuthText.includes('new URL("/api/v1/auth"')
) {
  throw new Error("Local OAuth must select a runtime Space before resource initialization");
}

const forbidden = ["local-file-provider.ts", "local-reply-store.ts", "launcher.ts", "start.sh"];
const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".data") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(target)));
    else paths.push(target);
  }
  return paths;
};
const files = await walk(root);
for (const name of forbidden) {
  if (files.some((file) => path.basename(file) === name)) throw new Error(`Retired local file remains: ${name}`);
}

console.log(`Busa Email AirApp checks OK (${files.length} files)`);
