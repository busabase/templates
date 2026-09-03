import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDir);

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
};

const airAppDirs = (root) =>
  walk(path.join(root, "templates"))
    .filter((filePath) => filePath.endsWith(`${path.sep}app${path.sep}index.html`))
    .map((filePath) => path.dirname(filePath))
    .sort();

const ensureColorScheme = (html) => {
  const colorScheme = /<meta\s+name=["']color-scheme["'][^>]*>/i;
  if (colorScheme.test(html)) {
    return html.replace(colorScheme, (tag) =>
      /content=["'][^"']*["']/i.test(tag)
        ? tag.replace(/content=["'][^"']*["']/i, 'content="light dark"')
        : tag.replace(/\s*\/?\s*>$/, ' content="light dark">'),
    );
  }

  const lines = html.split("\n");
  const viewportLine = lines.findIndex((line) => /<meta\s+name=["']viewport["']/i.test(line));
  if (viewportLine < 0) throw new Error("index.html has no viewport meta tag");
  const indent = lines[viewportLine].match(/^[ \t]*/)?.[0] ?? "";
  const selfClosing = lines[viewportLine].trimEnd().endsWith("/>");
  lines.splice(
    viewportLine + 1,
    0,
    `${indent}<meta name="color-scheme" content="light dark"${selfClosing ? " /" : ""}>`,
  );
  return lines.join("\n");
};

const ensureStylesheetOrder = (html, baseUiHref = "./base-ui.css") => {
  const lines = html.split("\n");
  const stylesheet = /<link\s+rel=["']stylesheet["'][^>]*>/i;
  const firstLine = lines.find((line) => stylesheet.test(line));
  if (!firstLine) throw new Error("index.html has no app stylesheet link");

  const indent = firstLine.match(/^[ \t]*/)?.[0] ?? "";
  const selfClosing = firstLine.trimEnd().endsWith("/>");
  const close = selfClosing ? " />" : ">";
  const hadAccent = lines.some((line) => line.includes("accent-theme.css"));
  const filtered = lines.filter((line) => !line.includes("base-ui.css") && !line.includes("accent-theme.css"));
  const firstStylesheet = filtered.findIndex((line) => stylesheet.test(line));
  filtered.splice(firstStylesheet, 0, `${indent}<link rel="stylesheet" href="${baseUiHref}"${close}`);

  if (hadAccent) {
    const lastStylesheet = filtered.findLastIndex((line) => stylesheet.test(line));
    filtered.splice(lastStylesheet + 1, 0, `${indent}<link rel="stylesheet" href="./accent-theme.css"${close}`);
  }

  return filtered.join("\n");
};

const ensureBaseUiLayer = (css) => {
  const orderPattern = /@layer\s+([^;]+);/;
  const match = css.match(orderPattern);
  if (!match) throw new Error("styles/layers.css has no @layer order declaration");
  const layers = match[1]
    .split(",")
    .map((layer) => layer.trim())
    .filter((layer) => layer && layer !== "base-ui");
  return css.replace(orderPattern, `@layer base-ui, ${layers.join(", ")};`);
};

export const applyRollout = ({ root = defaultRoot, check = false } = {}) => {
  const sourcePath = path.join(root, "scripts", "base-ui.css");
  const source = fs.readFileSync(sourcePath, "utf8");
  const drift = [];

  for (const appDir of airAppDirs(root)) {
    const relativeAppDir = path.relative(root, appDir);
    const layersPath = path.join(appDir, "styles", "layers.css");
    const layered = fs.existsSync(layersPath);
    const baseUiPath = layered ? path.join(appDir, "styles", "base-ui.css") : path.join(appDir, "base-ui.css");
    const indexPath = path.join(appDir, "index.html");
    const originalHtml = fs.readFileSync(indexPath, "utf8");
    const updatedHtml = ensureStylesheetOrder(
      ensureColorScheme(originalHtml),
      layered ? "./styles/base-ui.css" : "./base-ui.css",
    );

    const updates = [
      { filePath: baseUiPath, content: source },
      { filePath: indexPath, content: updatedHtml },
    ];

    if (layered) {
      updates.push({
        filePath: layersPath,
        content: ensureBaseUiLayer(fs.readFileSync(layersPath, "utf8")),
      });
    }

    for (const { filePath, content } of updates) {
      const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
      if (original === content) continue;
      drift.push(path.relative(root, filePath));
      if (!check) fs.writeFileSync(filePath, content);
    }

    if (!check) console.log(`Updated ${relativeAppDir}`);
  }

  if (check && drift.length > 0) {
    throw new Error(`Base UI rollout drift:\n${drift.join("\n")}`);
  }

  return drift;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : defaultRoot;
  const drift = applyRollout({ root, check });
  console.log(check ? "Base UI rollout is current." : `Changed ${drift.length} files.`);
}
