// busabase-sdk/airapp already provides the plumbing every AirApp used to carry
// its own copy of. A new app that writes it again brings back the thing that
// cost 49 edits to fix once (a private `isQueued`, a private runtime probe, a
// private "sent for review" sentence), so this fails on it:
//
//   - a local `isQueued` -> import `isAirAppWriteQueued`
//   - a `fetch("__airapp/runtime")` -> call `detectAirAppRuntime()`
//   - the SDK's "Sent for review." sentence written out again -> `airAppWriteMessage`
//
// It also fails when a page loads a script that is not a module (`<script src>` without
// `type="module"`) and that script has an `import` or `export`: a syntax error that
// takes the whole script with it. Moving the i18n table onto the SDK's sentence did
// exactly that to busa-invoice-sheet, and nothing but opening the page showed it.
//
// It reads every AirApp's own source under templates/*/content/ (not vendored
// bundles, tests, or the app's dev scripts), and ignores comments. A copy that
// has to stay, for a reason someone can read, says so on its line or the line
// above:
//
//   // allow-private-copy: <why the SDK's helper does not fit here>
//
//   node scripts/check-app-sdk-helpers.mjs [--root <dir>]
//
// `scripts/adopt-sdk-airapp-helpers.mjs` moves an app off the copies it knows.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appSourceFiles, codeOnly } from "./check-app-writes.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDir);

const ALLOW = /allow-private-copy:\s*(.*)$/;
const MIN_REASON = 20;

// The first sentence of the SDK's "queued" notice, in each language it ships.
const NOTICE_SENTENCES = ["Sent for review.", "已提交审核。", "已提交審核。", "已送出審核。", "レビューに送信しました。"];

const RULES = [
  {
    rule: "private-is-queued",
    find: (_code, text) => [...text.matchAll(/\b(?:(?:const|let|var)\s+isQueued\b|function\s+isQueued\b)/g)],
    problem: "a local isQueued: import isAirAppWriteQueued from the vendored busabase-airapp.js",
  },
  {
    rule: "private-runtime-probe",
    find: (_code, text) => [...text.matchAll(/\bfetch\s*\(\s*(["'`])[^"'`\n]*__airapp\/runtime/g)],
    problem: 'a fetch of "__airapp/runtime": call detectAirAppRuntime() from the vendored busabase-airapp.js',
  },
  {
    rule: "private-review-notice",
    find: (_code, text) => {
      const quoted = NOTICE_SENTENCES.map((sentence) => sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      return [...text.matchAll(new RegExp(`(["'\`])(?:${quoted})`, "g"))];
    },
    problem: "the SDK's \"sent for review\" sentence written out again: use airAppWriteMessage from the vendored busabase-airapp.js",
  },
];

const allowReason = (line) => line?.match(ALLOW)?.[1]?.trim() ?? null;

/** Every private copy in one source file: `{ rule, line, text, problem }`. */
export const findPrivateCopies = (source) => {
  const lines = source.split("\n");
  // Comments blanked, strings kept: a rule reads code and literals, never prose about them.
  const text = codeOnly(source, { keepLiterals: true });
  const findings = [];
  for (const { rule, find, problem } of RULES) {
    for (const match of find(null, text)) {
      const lineIndex = text.slice(0, match.index).split("\n").length - 1;
      const reason = allowReason(lines[lineIndex]) ?? (lineIndex > 0 ? allowReason(lines[lineIndex - 1]) : null);
      if (reason !== null && reason.length >= MIN_REASON) continue;
      findings.push({
        rule,
        line: lineIndex + 1,
        text: lines[lineIndex].trim(),
        problem: reason === null ? problem : `allow-private-copy needs a reason of at least ${MIN_REASON} characters`,
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
};

/**
 * Classic scripts of one page that use `import` / `export`. `readScript(src)` returns a
 * script's text by its `src` (without the query), or null when it is not a local file.
 */
export const findClassicScriptImports = (html, readScript) => {
  const findings = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1];
    if (/\btype\s*=\s*["']?module/i.test(attributes)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!src || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src)) continue;
    const source = readScript(src.split("?")[0]);
    if (source == null) continue;
    const found = /^[ \t]*(?:import\s+(?:[\w*${]|["'`])|export\s)/m.exec(codeOnly(source));
    if (!found) continue;
    const line = source.slice(0, found.index).split("\n").length;
    findings.push({
      src: src.split("?")[0],
      rule: "classic-script-import",
      line,
      text: source.split("\n")[line - 1]?.trim() ?? "",
      problem: `${src} is loaded without type="module", so this import/export is a syntax error: load it as a module, or drop the import`,
    });
  }
  return findings;
};

const classicScriptFindings = (root) =>
  fs.globSync("templates/*/content/*/app/index.html", { cwd: root }).flatMap((relative) => {
    const dir = path.dirname(path.join(root, relative));
    const html = fs.readFileSync(path.join(root, relative), "utf8");
    const readScript = (src) => {
      const file = path.resolve(dir, src);
      return file.startsWith(dir) && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    };
    return findClassicScriptImports(html, readScript).map(({ src, ...finding }) => ({
      file: path.relative(root, path.resolve(dir, src)),
      ...finding,
    }));
  });

export const checkAppSdkHelpers = ({ root = defaultRoot } = {}) => [
  ...appSourceFiles(root).flatMap((file) =>
    findPrivateCopies(fs.readFileSync(file, "utf8")).map((finding) => ({ file: path.relative(root, file), ...finding })),
  ),
  ...classicScriptFindings(root),
];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? defaultRoot : path.resolve(process.argv[rootIndex + 1] ?? "");
  const findings = checkAppSdkHelpers({ root });
  for (const { file, line, rule, text, problem } of findings) console.error(`${file}:${line}: [${rule}] ${text}\n  ${problem}`);
  if (findings.length) {
    const apps = new Set(findings.map(({ file }) => file.split(path.sep)[1]));
    console.error(`\n${findings.length} finding(s) in ${apps.size} template(s): private copies of what busabase-sdk/airapp provides, or a classic script that imports. See scripts/check-app-sdk-helpers.mjs.`);
    process.exit(1);
  }
  console.log("AirApps use busabase-sdk/airapp for the runtime probe, queued writes and the review notice, and no classic script imports.");
}
