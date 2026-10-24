// A person's own write from an AirApp follows their permission: the app leaves
// `autoMerge` unset, and Busabase merges it for someone with write access and
// opens a ChangeRequest for someone without. An app that passes
// `autoMerge: false`, or works the value out from where it is running, makes
// every owner approve their own click in the inbox. That is what this check
// catches.
//
// It reads every AirApp's own source under templates/*/content/ (not vendored
// bundles, tests, or the app's dev scripts) and fails on any `autoMerge` in code
// other than a literal `autoMerge: true`, which Busabase treats the same as
// leaving it out. Comments and strings are ignored, so prose that explains the
// rule never trips it.
//
// Forcing review is still right when the write itself is something outgoing
// that a second person has to approve before it is sent. Say so on the line,
// or on the line above, and the check lets it through:
//
//   autoMerge: false, // allow-forced-review: <why this write needs a second person>
//
//   node scripts/check-app-writes.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDir);

const SOURCE = /\.(?:[cm]?js|jsx|ts|tsx)$/;
// Not the app's runtime: third-party bundles, the app's own tests and dev checks.
const SKIPPED_DIRS = new Set(["node_modules", "vendor", "test", "tests", "scripts", ".git"]);
const ALLOW = /allow-forced-review:\s*(.*)$/;
const MIN_REASON = 20;

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : walk(path.join(dir, entry.name));
    return SOURCE.test(entry.name) && !/\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });
};

// Every AirApp source file of a template under `root` (vendored bundles, tests and dev scripts left out).
export const appSourceFiles = (root) => {
  const templates = path.join(root, "templates");
  if (!fs.existsSync(templates)) return [];
  return fs
    .readdirSync(templates, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => walk(path.join(templates, entry.name, "content")))
    .sort();
};

// Characters after which a `/` starts a regular expression rather than a division.
const REGEX_PREFIX = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_KEYWORD = /\b(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * The source with every comment, string, template-literal text and regex blanked
 * to spaces, newlines kept, so a match's offset still maps to its line and only
 * real code can match. With `keepLiterals` only comments are blanked: strings,
 * template text and regexes stay readable, for a caller that has to compare them.
 */
export const codeOnly = (source, { keepLiterals = false } = {}) => {
  const out = source.split("");
  const blank = (from, to) => {
    for (let index = from; index < to; index += 1) if (out[index] !== "\n") out[index] = " ";
  };
  const blankLiteral = keepLiterals ? () => {} : blank;
  const templateDepth = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== char && source[cursor] !== "\n") {
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      blankLiteral(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    if (char === "`" || (char === "}" && templateDepth.at(-1) === 0)) {
      if (char === "}") templateDepth.pop();
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== "`") {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === "$" && source[cursor + 1] === "{") break;
        cursor += 1;
      }
      blankLiteral(index + 1, cursor);
      if (source[cursor] === "$") {
        templateDepth.push(0);
        index = cursor + 2;
      } else {
        index = cursor + 1;
      }
      continue;
    }
    if (char === "/") {
      const before = source.slice(Math.max(0, index - 12), index).trimEnd();
      if (!before || REGEX_PREFIX.test(before) || REGEX_KEYWORD.test(before)) {
        let cursor = index + 1;
        let inClass = false;
        while (cursor < source.length && source[cursor] !== "\n") {
          const current = source[cursor];
          if (current === "\\") {
            cursor += 2;
            continue;
          }
          if (current === "[") inClass = true;
          else if (current === "]") inClass = false;
          else if (current === "/" && !inClass) break;
          cursor += 1;
        }
        blankLiteral(index + 1, cursor);
        index = cursor + 1;
        continue;
      }
    }
    if (templateDepth.length) {
      if (char === "{") templateDepth[templateDepth.length - 1] += 1;
      else if (char === "}") templateDepth[templateDepth.length - 1] -= 1;
    }
    index += 1;
  }
  return out.join("");
};

const allowReason = (line) => line.match(ALLOW)?.[1]?.trim() ?? null;

/** Every `autoMerge` in code that is not a literal `true`, with the line it is on. */
export const findForcedReview = (source) => {
  const code = codeOnly(source);
  const lines = source.split("\n");
  const findings = [];
  for (const match of code.matchAll(/\bautoMerge\b/g)) {
    const after = code.slice(match.index + match[0].length);
    if (/^\s*[:=](?!=)\s*true\b/.test(after)) continue;
    const lineIndex = code.slice(0, match.index).split("\n").length - 1;
    const reason = allowReason(lines[lineIndex]) ?? (lineIndex > 0 ? allowReason(lines[lineIndex - 1]) : null);
    if (reason !== null && reason.length >= MIN_REASON) continue;
    findings.push({
      line: lineIndex + 1,
      text: lines[lineIndex].trim(),
      problem:
        reason === null
          ? "forces review on a person's own write (leave autoMerge unset), or says why with an allow-forced-review comment"
          : `allow-forced-review needs a reason of at least ${MIN_REASON} characters`,
    });
  }
  return findings;
};

export const checkAppWrites = ({ root = defaultRoot } = {}) =>
  appSourceFiles(root).flatMap((file) =>
    findForcedReview(fs.readFileSync(file, "utf8")).map((finding) => ({
      file: path.relative(root, file),
      ...finding,
    })),
  );

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkAppWrites();
  for (const { file, line, text, problem } of findings) {
    console.error(`${file}:${line}: ${text}\n  ${problem}`);
  }
  if (findings.length) {
    console.error(`\n${findings.length} AirApp write(s) force review. See scripts/check-app-writes.mjs.`);
    process.exit(1);
  }
  console.log("AirApp writes follow permission: no forced review without a stated reason.");
}
