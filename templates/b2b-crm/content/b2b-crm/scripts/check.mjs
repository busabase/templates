import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "package.json",
  "server.js",
  "app/base-ui.css",
  "app/index.html",
  "app/styles.css",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/messages.js",
  "app/js/pipeline.js",
  "app/js/busabase-client.js",
  "app/js/providers/busabase-provider.js",
  "app/js/providers/demo-provider.js",
  "app/vendor/busabase-sdk.js",
  "scripts/sdk-entry.js",
];

const contents = {};
for (const relative of required)
  contents[relative] = await readFile(path.join(root, relative), "utf8");

const packageJson = JSON.parse(contents["package.json"]);
const configMatch = contents["app/js/config.js"].match(
  /^\s*export const appConfig = ([\s\S]+);\s*$/,
);
if (!configMatch) throw new Error("Generated config must export one JSON appConfig object.");
const appConfig = JSON.parse(configMatch[1]);
const sdkVersion = packageJson.dependencies?.["busabase-sdk"] || "";
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion))
  throw new Error("busabase-sdk must use an exact version.");
if (packageJson.dependencies?.react || packageJson.dependencies?.vite)
  throw new Error("Unsupported frontend dependency.");
if (
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.devDependencies?.["esbuild-wasm"] || "")
) {
  throw new Error("esbuild-wasm must use an exact version.");
}
if (packageJson.scripts?.start !== "node server.js")
  throw new Error("start must not build or spawn subprocesses.");
if (contents["app/vendor/busabase-sdk.js"].length < 10_000)
  throw new Error("Browser SDK bundle is missing or incomplete.");
if (!["cloud", "desktop"].includes(appConfig.deployment))
  throw new Error("Invalid deployment mode.");
if (!Array.isArray(appConfig.schema?.bases) || !appConfig.schema.bases.length)
  throw new Error("Configured Bases are missing.");
if (appConfig.spaceId || appConfig.schema.folder?.nodeId)
  throw new Error("Template source must not pin a Space or Folder node id.");
if (appConfig.schema.bases.some((base) => base.nodeId || base.baseId))
  throw new Error("Template source must resolve Base ids from ownership stamps at runtime.");
if (appConfig.schemaVersion !== 2 || appConfig.schema.bases.length !== 4)
  throw new Error("B2B CRM v0.2 requires schemaVersion 2 and four Bases.");
if (
  appConfig.schema.bases.some(
    (base) => !Number.isInteger(base.readLimit) || base.readLimit < 1 || base.readLimit > 50,
  )
) {
  throw new Error("Every configured Base requires an integer readLimit from 1 to 50.");
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
if (/id="(?:activity|deal|stage)Review"[^>]*type="submit"/.test(contents["app/index.html"]))
  throw new Error("Review actions must not use native form submission inside the sandbox.");
for (const id of ["activityReview", "dealReview", "stageReview"]) {
  if (!contents["app/js/app.js"].includes(`byId("${id}").addEventListener("click"`))
    throw new Error(`Review action ${id} requires a direct click handler.`);
}
if (!contents["app/index.html"].includes('id="detailScrim"') || !contents["app/index.html"].includes('id="detailClose"'))
  throw new Error("Shared record detail drawer controls are missing.");
if (!contents["app/styles.css"].includes("body.detail-drawer-open .detail-panel"))
  throw new Error("Shared record detail drawer open state is missing.");
if (/mobile-detail-open/.test(contents["app/js/app.js"]) || /body\.mobile-detail-open/.test(contents["app/styles.css"]))
  throw new Error("Legacy split-pane mobile detail state found.");
if (!contents["app/js/app.js"].includes("Request submitted") || !contents["app/js/app.js"].includes("Ready for human review"))
  throw new Error("ChangeRequest success state hierarchy is missing.");
if (!contents["app/styles.css"].includes(".result-copy code"))
  throw new Error("ChangeRequest success id styling is missing.");
const stylesSource = contents["app/styles.css"];
const baseUiSource = contents["app/base-ui.css"];
for (const token of [
  "--text-xs: 11px",
  "--text-sm: 12px",
  "--text-base: 13px",
  "--text-md: 14px",
  "--text-lg: 16px",
  "--text-xl: 20px",
  "--text-2xl: 30px",
  "--text-3xl: 38px",
  "--radius-sm: 8px",
  "--radius-md: 10px",
  "--radius-lg: 14px",
]) {
  if (!baseUiSource.includes(token)) throw new Error(`Base UI token missing: ${token}.`);
}
for (const token of [
  "--weight-regular: 400",
  "--weight-medium: 500",
  "--weight-semibold: 600",
  "--weight-bold: 700",
]) {
  if (!stylesSource.includes(token)) throw new Error(`Typography token missing: ${token}.`);
}
if (/font-weight:\s*(?:550|650|750)\b/.test(stylesSource))
  throw new Error("Non-standard synthesized font weight found.");
if ([...stylesSource.matchAll(/letter-spacing:\s*([^;]+)/g)].some((match) => match[1].trim() !== "0"))
  throw new Error("Letter spacing must remain zero.");
if (!/\.nav-item\s*\{[^}]*font-size:\s*var\(--text-md\)[^}]*font-weight:\s*var\(--weight-regular\)/s.test(stylesSource))
  throw new Error("Sidebar navigation must use regular 14px text.");
if (!/\.settings-button\s*\{[^}]*font-size:\s*var\(--text-md\)[^}]*font-weight:\s*var\(--weight-regular\)/s.test(stylesSource))
  throw new Error("Help and Settings must use regular 14px text.");
if (!/\.primary-button,\s*\.secondary-button\s*\{[^}]*font-size:\s*var\(--text-md\)[^}]*font-weight:\s*var\(--weight-regular\)/s.test(stylesSource))
  throw new Error("Command buttons must use regular 14px text.");
if (!contents["app/index.html"].includes('name="color-scheme" content="light dark"'))
  throw new Error("Native controls must advertise light and dark color schemes.");
if (contents["app/index.html"].indexOf("base-ui.css") > contents["app/index.html"].indexOf("styles.css"))
  throw new Error("Base UI must load before app styles.");
if (!contents["app/index.html"].includes('id="sidebarExpand"') || !contents["app/js/app.js"].includes("setDesktopSidebar"))
  throw new Error("Desktop sidebar collapse and expand controls are missing.");

// Everything the browser downloads. `server.js` is deliberately NOT here: it is
// the only file allowed to know about credentials, because its dev proxy reads
// them from the environment and attaches them server-side.
const browserSource = [
  contents["app/js/app.js"],
  contents["app/js/config.js"],
  contents["app/js/busabase-client.js"],
  contents["app/js/providers/busabase-provider.js"],
].join("\n");

if (!browserSource.includes("createBusabaseClient")) throw new Error("SDK client missing.");
if (!browserSource.includes("inspectProvisionedResources"))
  throw new Error("Template runtime must resolve ownership-stamped resources.");
if (!browserSource.includes("records.changeRequest"))
  throw new Error("Pipeline stage changes must use records.changeRequest.");
// One relative path, every environment: same-origin inside Busabase, this app's
// own dev proxy when run standalone. A hard-coded absolute Busabase URL or a
// leftover bridge prefix would work in exactly one of them.
if (!browserSource.includes("window.location.origin"))
  throw new Error("Runtime client must target its own origin.");
if (!browserSource.includes("dashboardSpaceHint"))
  throw new Error("Template runtime must scope reads to its canonical Dashboard Space.");
if (browserSource.includes("__busabase_api__"))
  throw new Error("Obsolete /__busabase_api__ bridge prefix found.");
if (/baseUrl\s*:\s*["'`]https?:\/\//.test(browserSource))
  throw new Error("Hard-coded Busabase URL found in browser source.");
const providerSource = contents["app/js/providers/busabase-provider.js"];
if (!/limit:\s*base\.readLimit/.test(providerSource))
  throw new Error("Busabase provider must consume each configured Base readLimit.");
if (/while\s*\(\s*cursor\s*\)|client\.bases\.list\s*\(/.test(browserSource))
  throw new Error("Unbounded loading or runtime Base discovery found.");
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
if (/BUSABASE_API_KEY/i.test(browserSource))
  throw new Error("API key reference found in browser source.");
if (/Bearer/i.test(browserSource)) throw new Error("Bearer header found in browser source.");
// The dev proxy may reference the env var; it may never carry a literal token.
if (/Bearer\s+(?!\$\{)[A-Za-z0-9_-]{8,}/.test(contents["server.js"]))
  throw new Error("Literal Bearer token found in server.js.");
if (appConfig.readOnly && appConfig.permissions.change_request_procedures.length) {
  throw new Error("Read-only app declares write procedures.");
}
if (/\b(?:org|nod|bse|viw|rec)[a-z0-9]{12,}\b/i.test(browserSource)) {
  throw new Error("Workspace-specific id found in browser source.");
}

console.log(
  `AirApp checks OK. ${appConfig.demoRecords.length} demo records; busabase-sdk ${sdkVersion}; ${appConfig.deployment} deployment.`,
);
