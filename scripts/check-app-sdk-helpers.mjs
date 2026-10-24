// busabase-sdk/airapp already provides the plumbing every AirApp used to carry
// its own copy of. A new app that writes it again brings back the thing that
// cost 49 edits to fix once (a private `isQueued`, a private runtime probe, a
// private "sent for review" sentence), so this fails on it:
//
//   - a local `isQueued` -> import `isAirAppWriteQueued`
//   - a `fetch("__airapp/runtime")` -> call `detectAirAppRuntime()`
//   - the SDK's "Sent for review." sentence written out again -> `airAppWriteMessage`
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

export const checkAppSdkHelpers = ({ root = defaultRoot } = {}) =>
  appSourceFiles(root).flatMap((file) =>
    findPrivateCopies(fs.readFileSync(file, "utf8")).map((finding) => ({ file: path.relative(root, file), ...finding })),
  );

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex === -1 ? defaultRoot : path.resolve(process.argv[rootIndex + 1] ?? "");
  const findings = checkAppSdkHelpers({ root });
  for (const { file, line, rule, text, problem } of findings) console.error(`${file}:${line}: [${rule}] ${text}\n  ${problem}`);
  if (findings.length) {
    const apps = new Set(findings.map(({ file }) => file.split(path.sep)[1]));
    console.error(`\n${findings.length} private cop${findings.length === 1 ? "y" : "ies"} of what busabase-sdk/airapp provides, in ${apps.size} template(s). See scripts/check-app-sdk-helpers.mjs.`);
    process.exit(1);
  }
  console.log("AirApps use busabase-sdk/airapp for the runtime probe, queued writes and the review notice.");
}
