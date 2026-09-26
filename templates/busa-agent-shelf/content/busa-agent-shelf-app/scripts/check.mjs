import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// ── busabase-sdk/airapp-check: the versioned AirApp runtime contract ────────
// Added on top of this file's own checks, not in place of them: the rules
// above/below this block are specific to this app; the ones here are the
// shared contract every AirApp is held to, versioned with the SDK so a fix
// like busabase-sdk@0.30.1's runtime-detection rule reaches every app that
// bumps its pin instead of staying stuck in whatever copy this file had.
{
  const { checkAirApp } = await import("busabase-sdk/airapp-check");
  const { readFile: gateReadFile, readdir: gateReaddir } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const readFile = gateReadFile;
  const readdir = gateReaddir;
  const readIfExists = (p) => readFile(p, "utf8").catch(() => undefined);
  const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(full)));
      else out.push(full);
    }
    return out;
  };
  const appFiles = (await walk(path.join(root, "app"))).filter((f) => !f.split(path.sep).includes("vendor"));
  const LOGIC_BASENAMES = new Set(["app.js", "config.js", "busabase-client.js", "runtime.js"]);
  const isLogic = (f) =>
    LOGIC_BASENAMES.has(path.basename(f)) || f.endsWith(path.join("providers", "busabase-provider.js"));
  const isDownload = (f) => /\.(?:js|html)$/.test(f);
  const joinFiles = async (files) => (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("\n");
  const serverCandidates = [path.join(root, "server.js"), ...(await walk(path.join(root, "server")).catch(() => []))];
  const serverParts = (await Promise.all(serverCandidates.map((f) => readIfExists(f)))).filter(
    (text) => text !== undefined,
  );
  const findings = await checkAirApp({
    packageJson: await readIfExists(path.join(root, "package.json")),
    server: serverParts.length ? serverParts.join("\n") : undefined,
    serverLanguage: "node",
    browserLogic: await joinFiles(appFiles.filter(isLogic)),
    browserDownloads: await joinFiles(appFiles.filter(isDownload)),
    config:
      (await readIfExists(path.join(root, "app", "js", "config.js"))) ??
      (await readIfExists(path.join(root, "app", "config.js"))),
    shippedSlug: path.basename(root),
  });
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length) {
    throw new Error(
      `busabase-sdk/airapp-check found ${errors.length} contract violation(s):\n${errors.map((f) => `  [${f.rule}] ${f.message}`).join("\n")}`,
    );
  }
}
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const configText = await readFile(path.join(root, "app", "js", "config.js"), "utf8");
const index = await readFile(path.join(root, "app", "index.html"), "utf8");
const { appConfig } = await import(path.join(root, "app", "js", "config.js"));

if (packageJson.scripts.start !== "node server.js") throw new Error("AirApp start must be node server.js");
if (!/^\d+\.\d+\.\d+$/.test(packageJson.dependencies["busabase-sdk"])) throw new Error("busabase-sdk must be pinned exactly");
if (!configText.includes('deployment: "cloud"')) throw new Error("Busa Agent Shelf must be Cloud-only");
if (/\b(?:href|src)="\/(?!api\/v1)/.test(index)) throw new Error("AirApp assets must use relative URLs");

// Runtime binding: a template never carries a Space or resource ids.
if (appConfig.spaceId) throw new Error("Template config must not carry a spaceId");
for (const base of appConfig.bases) {
  if (base.nodeId || base.baseId) throw new Error(`Template config must not pin ${base.key} to an id`);
  if (base.slug !== `busa-agent-shelf-${base.key}`) throw new Error(`${base.key}: slug must be busa-agent-shelf-${base.key}`);
  if (!Number.isInteger(base.readLimit) || base.readLimit < 1 || base.readLimit > 50) {
    throw new Error(`${base.key}: readLimit must be an integer 1-50`);
  }
}

// The only write is a decision on a fix, through a ChangeRequest.
const writes = appConfig.permissions.writeProcedures;
if (writes.length !== 1 || writes[0] !== "records.changeRequest") {
  throw new Error("The only write procedure may be records.changeRequest");
}
const provider = await readFile(path.join(root, "app", "js", "providers", "busabase-provider.js"), "utf8");
if (/records\.(?:create|update|delete)\(|changeRequests\.(?:review|merge)|autoMerge:\s*true/.test(provider)) {
  throw new Error("Busabase provider must not mutate, review or merge records directly");
}

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

// No credential, no bridge prefix, no framework in shipped browser code.
for (const file of files.filter((f) => f.includes(`${path.sep}app${path.sep}`) && !f.includes(`${path.sep}vendor${path.sep}`))) {
  const text = await readFile(file, "utf8");
  if (/__busabase_api__|Bearer\s|api[_-]?key\s*[:=]|from\s+["']react["']|from\s+["']vite["']/i.test(text)) {
    throw new Error(`Forbidden credential/bridge/framework reference in ${path.relative(root, file)}`);
  }
}

console.log(`Busa Agent Shelf AirApp checks OK (${files.length} files)`);
