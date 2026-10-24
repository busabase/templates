// busabase-sdk 0.99.0 ships the AirApp plumbing every template used to carry its
// own copy of (`busabase-sdk/airapp`): the runtime probe, the record read/write
// helpers, the "did it land or is it waiting" test and the "sent for review"
// sentence. This moves an app onto them, one recognised shape at a time.
//
//   node scripts/adopt-sdk-airapp-helpers.mjs                      # every app of this repository
//   node scripts/adopt-sdk-airapp-helpers.mjs --dry-run            # report only; change nothing
//   node scripts/adopt-sdk-airapp-helpers.mjs --check              # exit 1 if any app still has a recognised copy
//   node scripts/adopt-sdk-airapp-helpers.mjs templates/busa-crm/content/busa-crm-app
//   cd ~/Documents/skills && node <templates>/scripts/adopt-sdk-airapp-helpers.mjs \
//        --dry-run --assume-sdk 'skills/kelly-*/content/*'
//
// Paths and globs are resolved from the current directory, like
// `update-app-sdk.mjs`; with none, every `templates/*/content/*` here.
//
// What it rewrites, in an app's own source (never `app/vendor/`):
//
//   app/js/providers/busabase-provider.js
//     readPage    the `records.list` call and its "array or page" handling -> `readPage`
//     findRecord  the `records.get` + NOT_FOUND-to-null wrapper            -> `findRecord`
//     upsert      find, then create or update                              -> `upsert`
//     isQueued    the local `isQueued` -> the SDK's `isAirAppWriteQueued`
//   app/js/runtime.js         the `__airapp/runtime` probe -> `detectAirAppRuntime`
//                              (only a file that is nothing but the probe is removed)
//   app/i18n/messages.js      `savedForReview` -> the SDK's sentence for that locale
//
// It rewrites a piece only when it recognises the shape exactly, and says why
// when it does not; an app's business rules, row formats, field slugs, sort and
// filter choices and the shape its UI consumes are never touched. Whatever it
// leaves is reported, so a person can finish it by hand. Run twice, it changes
// nothing the second time.
//
// An app is only touched when its vendored `app/vendor/busabase-airapp.js`
// really exports the helpers (`--assume-sdk` waives that for a dry run on apps
// that have not moved to busabase-sdk 0.99.0 yet).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { codeOnly } from "./check-app-writes.mjs";
import { findApps } from "./update-app-sdk.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.dirname(scriptDir);

export const REQUIRED_EXPORTS = [
  "airAppWriteMessage",
  "createAirAppRecords",
  "detectAirAppRuntime",
  "isAirAppWriteQueued",
  "shouldUseLocalAirAppGateway",
];

// ── scanning ───────────────────────────────────────────────────────────────

/** Whitespace-collapsed code with the comments gone; strings stay, so two texts compare by what they do. */
export const squash = (text) => codeOnly(text, { keepLiterals: true }).replace(/\s+/g, " ").trim();

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Index of the bracket that closes the one at `open`, or -1. `mask` is code-only text. */
export const matchClose = (mask, open) => {
  const closer = { "(": ")", "{": "}", "[": "]" };
  const stack = [];
  for (let index = open; index < mask.length; index += 1) {
    const char = mask[index];
    if (closer[char]) stack.push(closer[char]);
    else if (char === ")" || char === "}" || char === "]") {
      if (stack.pop() !== char) return -1;
      if (!stack.length) return index;
    }
  }
  return -1;
};

/** `text` cut at the commas that sit at bracket depth 0 (mask decides what is a comma). */
const splitTopLevel = (text, mask) => {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < mask.length; index += 1) {
    const char = mask[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(from, index));
      from = index + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
};

/**
 * The first `function name() {}` or `const name = async () => {}` with a block
 * body, at any indentation: `{ start, end, text }`, or null when there is none.
 */
export const findFunction = (source, name) => {
  const mask = codeOnly(source);
  const declaration = new RegExp(
    `^[ \\t]*(?:export\\s+)?(?:(?:async\\s+)?function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\()`,
    "m",
  );
  const match = declaration.exec(mask);
  if (!match) return null;
  const isArrow = /^\s*(?:export\s+)?(?:const|let)/.test(match[0]);
  const paramsOpen = match.index + match[0].length - 1;
  const paramsClose = matchClose(mask, paramsOpen);
  if (paramsClose === -1) return null;
  let bodyOpen;
  if (isArrow) {
    const arrow = /^\s*=>\s*\{/.exec(mask.slice(paramsClose + 1));
    if (!arrow) return null;
    bodyOpen = paramsClose + arrow[0].length;
  } else {
    const brace = /^\s*\{/.exec(mask.slice(paramsClose + 1));
    if (!brace) return null;
    bodyOpen = paramsClose + brace[0].length;
  }
  const bodyClose = matchClose(mask, bodyOpen);
  if (bodyClose === -1) return null;
  let end = bodyClose + 1;
  if (isArrow && mask[end] === ";") end += 1;
  return { start: match.index, end, text: source.slice(match.index, end) };
};

const replaceRange = (source, { start, end }, text) => source.slice(0, start) + text + source.slice(end);

/** `(?<![.\w])name\b` matches in `source`, as `{ index }`, over code only. */
const identifierUses = (source, name) => [...codeOnly(source).matchAll(new RegExp(`(?<![.\\w$])${escapeRegExp(name)}(?![\\w$])`, "g"))];

// ── imports ────────────────────────────────────────────────────────────────

const IMPORT_STATEMENT = /^import\b[^;]*?\bfrom\s*["'][^"']+["'];?[ \t]*$|^import\s*["'][^"']+["'];?[ \t]*$/gm;

const lastImportEnd = (source) => {
  let end = 0;
  for (const match of codeOnly(source, { keepLiterals: true }).matchAll(IMPORT_STATEMENT)) end = match.index + match[0].length;
  return end;
};

/** `block` set on its own after the last import, with a blank line either side. */
const afterImports = (source, block) => {
  const at = lastImportEnd(source);
  const rest = source.slice(at);
  return `${source.slice(0, at)}\n\n${block}${/^\n\n/.test(rest) ? "" : "\n"}${rest}`;
};

/** An import, from the vendored bundle `vendorSpecifier` points at, that names what it takes. */
const vendorImport = (vendorSpecifier) =>
  new RegExp(
    String.raw`^import\s*\{([^}]*)\}\s*from\s*(["'])((?:\.\.?\/)+vendor\/${escapeRegExp(vendorSpecifier.split("/").pop())})(\?[^"']*)?\2;?[ \t]*$`,
    "m",
  );

const renderImport = (names, from, quote = '"') => {
  const single = `import { ${names.join(", ")} } from ${quote}${from}${quote};`;
  return single.length <= 120 ? single : `import {\n${names.map((name) => `  ${name},`).join("\n")}\n} from ${quote}${from}${quote};`;
};

/** `source` importing `names` from the app's vendored busabase-airapp.js, merged into an import that is already there. */
export const withVendorImport = (source, names, vendorSpecifier) => {
  const existing = vendorImport(vendorSpecifier).exec(source);
  if (existing) {
    const have = existing[1].split(",").map((name) => name.trim()).filter(Boolean);
    const added = names.filter((name) => !have.some((entry) => entry === name || entry.startsWith(`${name} as `)));
    if (!added.length) return source;
    const merged = [...have, ...added.sort()];
    const from = `${existing[3]}${existing[4] ?? ""}`;
    return source.slice(0, existing.index) + renderImport(merged, from, existing[2]) + source.slice(existing.index + existing[0].length);
  }
  const at = lastImportEnd(source);
  const statement = renderImport([...names].sort(), vendorSpecifier);
  return at === 0 ? `${statement}\n${source}` : `${source.slice(0, at)}\n${statement}${source.slice(at)}`;
};

// ── provider: readPage ─────────────────────────────────────────────────────

const READ_KEYS = new Set(["baseId", "limit", "cursor", "filters", "valueFilters", "sort"]);

/** The binder a client expression reads through, given the app's own client variable. */
const recordsBinder = (clientVar) => (clientVar === "runtimeClient" ? "sdkRecords()" : `createAirAppRecords(${clientVar})`);

/**
 * `readPage`'s argument entries rewritten as `readPage` input, or a reason it
 * cannot be. The SDK drops a falsy cursor/filters/sort itself, so the app's
 * `...(x ? { x } : {})` spreads become the plain value.
 */
const readPageArguments = (entries) => {
  const args = [];
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const spread = /^\.\.\.\(\s*([\s\S]+?)\s*\?\s*\{\s*(\w+)\s*(?::\s*([\s\S]+?))?\s*\}\s*:\s*\{\s*\}\s*\)$/.exec(entry);
    if (spread) {
      const [, condition, key, written] = spread;
      const value = written ?? key;
      if (!READ_KEYS.has(key)) return { reason: `records.list argument ${key} is not one readPage takes` };
      if (squash(condition) === squash(value)) args.push(key === value ? key : `${key}: ${value}`);
      else args.push(`${key}: ${condition} ? ${value} : undefined`);
      continue;
    }
    const keyed = /^(\w+)\s*:/.exec(entry);
    if (keyed && READ_KEYS.has(keyed[1])) {
      args.push(entry);
      continue;
    }
    if (READ_KEYS.has(entry)) {
      args.push(entry);
      continue;
    }
    return { reason: `unrecognised records.list argument: ${entry.split("\n")[0].slice(0, 60)}` };
  }
  const keys = new Set(args.map((arg) => /^(\w+)/.exec(arg)[1]));
  if (!keys.has("baseId")) return { reason: "records.list names no baseId" };
  if (!keys.has("limit")) return { reason: "records.list sets no limit, so readPage's default would change the page size" };
  return { args };
};

/**
 * Replace the `records.list` call in a read-a-page function. Two shapes:
 *   - the call, then `Array.isArray(r) ? r : r.records || []` (a bare array from
 *     an old server is handled by hand), then `r.nextCursor` -- all of it is
 *     what `readPage` does;
 *   - the call alone, its result already read as `{ records, nextCursor }`.
 * Returns `{ text, binds }` or `{ reason }`.
 */
export const adoptReadPage = (fnText) => {
  const mask = codeOnly(fnText);
  const call = /(?:const|let)\s+(\w+)\s*=\s*await\s+(\w+)\.records\.list\(/.exec(mask);
  if (!call) return { reason: "no `records.list` call to replace" };
  const [, resultVar, clientVar] = call;
  const parenOpen = call.index + call[0].length - 1;
  const parenClose = matchClose(mask, parenOpen);
  const braceOpen = mask.indexOf("{", parenOpen);
  const braceClose = braceOpen === -1 ? -1 : matchClose(mask, braceOpen);
  if (parenClose === -1 || braceOpen === -1 || braceClose === -1 || mask.slice(parenOpen + 1, braceOpen).trim() || mask.slice(braceClose + 1, parenClose).trim()) {
    return { reason: "`records.list` is not called with one object literal" };
  }
  const parsed = readPageArguments(
    splitTopLevel(fnText.slice(braceOpen + 1, braceClose), mask.slice(braceOpen + 1, braceClose)),
  );
  if (parsed.reason) return { reason: parsed.reason };

  let end = parenClose + 1;
  if (mask[end] === ";") end += 1;
  const lineStart = fnText.lastIndexOf("\n", call.index) + 1;
  const indent = fnText.slice(lineStart, call.index);
  if (indent.trim()) return { reason: "`records.list` shares its line with other code" };

  const after = fnText.slice(end);
  const quoted = escapeRegExp(resultVar);
  const arrayRead = new RegExp(
    `^\\s*(?:const|let)\\s+(\\w+)\\s*=\\s*Array\\.isArray\\(${quoted}\\)\\s*\\?\\s*${quoted}\\s*:\\s*${quoted}\\.records\\s*\\|\\|\\s*\\[\\];`,
  ).exec(codeOnly(after, { keepLiterals: true }));

  let newVar = resultVar;
  let rest = after;
  let consumed = 0;
  if (arrayRead) {
    const recordsVar = arrayRead[1];
    newVar = ["page", "recordsPage"].find((name) => !identifierUses(fnText, name).length);
    if (!newVar) return { reason: "the function already uses the names `page` and `recordsPage`" };
    consumed = arrayRead[0].length;
    rest = after.slice(consumed);
    rest = rest.replace(new RegExp(`(?<![.\\w$])${escapeRegExp(recordsVar)}\\.map\\(`, "g"), `${newVar}.records.map(`);
    rest = rest.replace(new RegExp(`Array\\.isArray\\(${quoted}\\)\\s*\\?\\s*null\\s*:\\s*${quoted}\\.nextCursor\\s*\\|\\|\\s*null`, "g"), `${newVar}.nextCursor`);
    rest = rest.replace(new RegExp(`Boolean\\(\\s*!Array\\.isArray\\(${quoted}\\)\\s*&&\\s*${quoted}\\.nextCursor\\s*\\)`, "g"), `Boolean(${newVar}.nextCursor)`);
    if (new RegExp(`(?<![.\\w$])${quoted}(?![\\w$])`).test(codeOnly(rest))) return { reason: `the result of records.list is used in a way readPage does not cover (${resultVar})` };
    if (new RegExp(`(?<![.\\w$])${escapeRegExp(recordsVar)}(?![\\w$])(?!\\s*:)`).test(codeOnly(rest))) return { reason: `the records read from the list are used in a way readPage does not cover (${recordsVar})` };
  } else if (new RegExp(`Array\\.isArray\\(${quoted}\\)`).test(codeOnly(after))) {
    return { reason: "the list result is checked for an array in a shape this does not recognise" };
  }

  const statement = `${indent}const ${newVar} = await ${recordsBinder(clientVar)}.readPage({\n${indent}  ${parsed.args.join(`,\n${indent}  `)},\n${indent}});`;
  return { text: fnText.slice(0, lineStart) + statement + rest, binds: clientVar };
};

// ── provider: findRecord / upsert / isQueued ───────────────────────────────

const FIND_RECORD = new RegExp(
  String.raw`^(?<head>(?:async\s+)?function\s+findRecord\s*\((?<params>[^)]*)\)\s*\{)` +
    String.raw`(?<pre>(?:\s*(?:if\s*\([^\n]*\)\s*throw\s[^\n]*;|const\s+\w+\s*=\s*[^\n;]*;))*)` +
    String.raw`\s*try\s*\{\s*return\s+await\s+(?<client>\w+)\.records\.get\(\{\s*baseId:\s*(?<baseId>[^,]+?),\s*(?<field>fieldSlug(?:\s*:\s*\w+)?),\s*(?<value>valueText(?:\s*:\s*\w+)?)\s*\}\);?\s*\}` +
    String.raw`\s*catch\s*\((?<err>\w+)\)\s*\{\s*if\s*\(\k<err>\?\.code\s*===\s*"NOT_FOUND"\s*\|\|\s*\k<err>\?\.status\s*===\s*404\)\s*return\s+null;\s*throw\s+\k<err>;\s*\}\s*\}$`,
);

/** `findRecord` as `records.get` plus "not found is null". Returns `{ text, binds, readCheck }` or `{ reason }`. */
export const adoptFindRecord = (fnText) => {
  const match = FIND_RECORD.exec(fnText);
  if (!match) return { reason: "findRecord is not the `records.get` + NOT_FOUND wrapper" };
  const { head, pre, client, baseId, field, value } = match.groups;
  const readCheck = /^[ \t]*(if\s*\([^\n]*\)\s*throw\s[^\n]*;)/m.exec(pre)?.[1] ?? null;
  const text = `${head}${pre}\n  return ${recordsBinder(client)}.findRecord({ baseId: ${baseId}, ${field}, ${value} });\n}`;
  return { text, binds: client, readCheck };
};

// The upsert 29 templates share, character for character apart from layout.
const UPSERT_SHAPE = squash(`async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);
  const existing = await findRecord(key, idFieldSlug, idValue);
  const normalized = toBusabaseFields(fields);
  if (!existing) {
    return runtimeClient.bases.createChangeRequest({
      baseId: declared.baseId,
      fields: normalized,
      message,
      submittedBy: appConfig.appId,
    });
  }
  return runtimeClient.records.changeRequest({
    recordId: existing.id,
    operation: "update",
    fields: normalized,
    message,
    author: appConfig.appId,
    baseCommitId: existing.headCommitId,
  });
}`);

/**
 * `upsert` as the SDK's `upsert`. The app's own `findRecord` may have checked a
 * read permission the SDK call no longer passes through, so that check moves in.
 */
export const adoptUpsert = (fnText, { readCheck }) => {
  if (squash(fnText) !== UPSERT_SHAPE) return { reason: "upsert is not the find-then-create-or-update shape" };
  const text = `async function upsert(key, idFieldSlug, idValue, fields, message) {
  if (!allowedWrites.has("bases.createChangeRequest") || !allowedWrites.has("records.changeRequest")) {
    throw new Error("PROCEDURE_DENIED: records.changeRequest");
  }
  const declared = base(key);${readCheck ? `\n  ${readCheck}` : ""}
  const { response } = await sdkRecords().upsert({
    baseId: declared.baseId,
    fieldSlug: idFieldSlug,
    valueText: idValue,
    fields: toBusabaseFields(fields),
    message,
  });
  return response;
}`;
  return { text, binds: "runtimeClient" };
};

const IS_QUEUED_DEFINITION = /^const isQueued = \(result\) => result\?\.materialized === false \|\| result\?\.status === "in_review";[ \t]*\n/m;

/** The local `isQueued` removed (with the comment above it when that comment is about autoMerge) and its uses renamed. */
export const adoptIsQueued = (source) => {
  const definition = IS_QUEUED_DEFINITION.exec(source);
  if (!definition) return { reason: "isQueued is not the local one-liner" };
  let start = definition.index;
  const above = source.slice(0, start).split("\n");
  above.pop();
  const comment = [];
  while (above.length && /^\/\//.test(above[above.length - 1])) comment.unshift(above.pop());
  if (comment.length && /autoMerge/.test(comment.join("\n"))) start -= comment.join("\n").length + 1;
  let end = definition.index + definition[0].length;
  if (source[end] === "\n") end += 1;
  const without = source.slice(0, start) + source.slice(end);
  let renamed = without;
  for (const use of [...codeOnly(without).matchAll(/(?<![.\w$])isQueued(?![\w$])/g)].reverse()) {
    renamed = renamed.slice(0, use.index) + "isAirAppWriteQueued" + renamed.slice(use.index + "isQueued".length);
  }
  return { text: renamed };
};

const BINDER_WRITES = `// Record reads and writes go through the SDK's helpers, bound to this app's client.
// A person's write leaves \`autoMerge\` unset, so Busabase decides from their own
// permission: it lands now with write access and becomes a ChangeRequest without
// it. The response says which happened; \`isAirAppWriteQueued\` reads it.`;
const BINDER_READS = "// Record reads go through the SDK's helper, bound to this app's client.";

const FIELDS = String.raw`(\w+)\.headCommit\?\.payload\s*\|\|\s*\1\.headCommit\?\.fields\s*\|\|\s*\1\.fields(?:\s*\|\|\s*\{\})?`;
const FIELDS_SPREAD = new RegExp(String.raw`\.\.\.\(\s*${FIELDS}\s*\)`, "g");
const FIELDS_PLAIN = new RegExp(String.raw`\b${FIELDS}`, "g");
/** The line every copy re-derived (`r.headCommit?.payload || r.headCommit?.fields || r.fields`) as the SDK's `r.fields`. */
const useFieldsProperty = (text) => text.replace(FIELDS_SPREAD, "...$1.fields").replace(FIELDS_PLAIN, "$1.fields");

/** A function that already calls the SDK's helper (this codemod ran before, or someone finished it by hand). */
const ADOPTED = { readPage: /\.readPage\(/, findRecord: /\.findRecord\(/, upsert: /\.upsert\(/ };

/** `index` moved up over the `//` comment lines directly above it, so a block stays with its function. */
const withLeadingComment = (text, index) => {
  let at = text.lastIndexOf("\n", index - 1) + 1;
  while (at > 0) {
    const previous = text.lastIndexOf("\n", at - 2) + 1;
    if (!/^\/\//.test(text.slice(previous, at))) break;
    at = previous;
  }
  return at;
};

/**
 * Move one provider onto the SDK's record helpers. `vendorSpecifier` is how the
 * file reaches `app/vendor/busabase-airapp.js`.
 * Returns `{ source, pieces }`, where each piece is `"migrated"`, `"absent"`,
 * or `{ left: reason }`.
 */
export const adoptProvider = (source, { vendorSpecifier, available = null }) => {
  const pieces = { readPage: "absent", findRecord: "absent", upsert: "absent", isQueued: "absent" };
  const needs = new Set();
  let binds = false;
  let text = source;

  // `readPage` is the usual name for the function that reads a page; some apps call it
  // `listRecords` (busa-cms) or `page` (the office desks, busa-rnd, busa-portrait-retouch).
  const PAGE_READERS = ["readPage", "listRecords", "page"];
  const functionNamed = (name) =>
    name === "readPage"
      ? PAGE_READERS.map((reader) => findFunction(text, reader)).find((found) => found && /\.records\.list\(|\.readPage\(/.test(codeOnly(found.text)))
      : findFunction(text, name);

  const migrate = (name, adopt, extra) => {
    const found = functionNamed(name);
    if (!found) return null;
    if (ADOPTED[name].test(codeOnly(found.text))) {
      pieces[name] = "migrated";
      return { already: true };
    }
    const result = adopt(found.text, extra);
    if (result.reason) {
      pieces[name] = { left: result.reason };
      return null;
    }
    text = replaceRange(text, found, result.text);
    pieces[name] = "migrated";
    needs.add("createAirAppRecords");
    if (result.binds === "runtimeClient") binds = true;
    return result;
  };

  migrate("readPage", adoptReadPage);
  const find = migrate("findRecord", adoptFindRecord);
  const upsert = findFunction(text, "upsert");
  if (upsert) {
    if (find || ADOPTED.upsert.test(codeOnly(upsert.text))) migrate("upsert", adoptUpsert, { readCheck: find?.readCheck });
    else pieces.upsert = { left: "findRecord was not migrated, so the SDK's upsert would skip what it checks" };
  }

  // Nothing calls findRecord once upsert moved: drop it rather than leave dead code.
  const remaining = find && findFunction(text, "findRecord");
  if (remaining && !identifierUses(text.slice(0, remaining.start) + text.slice(remaining.end), "findRecord").length) {
    const start = withLeadingComment(text, remaining.start);
    let end = remaining.end;
    if (text[end] === "\n") end += 1;
    if (text[end] === "\n" && (start === 0 || text[start - 1] === "\n")) end += 1;
    text = text.slice(0, start) + text.slice(end);
  }

  const queued = adoptIsQueued(text);
  if (queued.reason) {
    if (/\b(?:const|function)\s+isQueued\b/.test(codeOnly(text))) pieces.isQueued = { left: queued.reason };
  } else {
    text = queued.text;
    pieces.isQueued = "migrated";
    needs.add("isAirAppWriteQueued");
  }

  if (binds) {
    const first = ["readPage", "findRecord", "upsert"].map((name) => findFunction(text, name)).filter(Boolean);
    const at = withLeadingComment(text, Math.min(...first.map((found) => found.start)));
    const writes = pieces.upsert === "migrated" || pieces.isQueued === "migrated";
    const withAppId = identifierUses(text, "appConfig").length > 0 ? ", { appId: appConfig.appId }" : "";
    const binder = `${writes ? BINDER_WRITES : BINDER_READS}\nconst sdkRecords = () => createAirAppRecords(runtimeClient${withAppId});\n\n`;
    text = text.slice(0, at) + binder + text.slice(at);
  }

  // Inside readPage every record comes from the SDK, with `fields` already pulled out of
  // its head commit, so the line each copy re-derived can go. Elsewhere in the file the
  // same expression may be fed records that did not come from it, and stays.
  if (pieces.readPage === "migrated") {
    const page = functionNamed("readPage");
    if (page) text = replaceRange(text, page, useFieldsProperty(page.text));
  }

  const lacking = [...needs].filter((name) => available && !available.has(name));
  if (lacking.length) {
    const reason = `the vendored bundle does not export ${lacking.join(", ")}`;
    for (const [name, piece] of Object.entries(pieces)) if (piece === "migrated") pieces[name] = { left: reason };
    return { source, pieces };
  }
  if (needs.size) text = withVendorImport(text, [...needs], vendorSpecifier);
  return { source: text, pieces };
};

// ── runtime.js ─────────────────────────────────────────────────────────────

// An app's `runtime.js` that is nothing but the probe: 57 of 64 are this, apart from comments.
const PLAIN_PROBE = squash(`
const UNKNOWN_RUNTIME = { runtime: "unknown", hosted: false, determined: false };
const normalize = (body) => {
  if (!body || typeof body !== "object" || typeof body.runtime !== "string") return UNKNOWN_RUNTIME;
  return { runtime: body.runtime, hosted: body.hosted === true, determined: true };
};
const probe = async () => {
  try {
    const response = await fetch("__airapp/runtime", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("application/json")) return UNKNOWN_RUNTIME;
    return normalize(await response.json());
  } catch {
    return UNKNOWN_RUNTIME;
  }
};
export const runtime = await probe();
export const shouldUseLocalGateway = () => !runtime.hosted;
`).replace(/,\s*}/g, " }");

export const isPlainProbe = (source) => squash(source).replace(/,\s*}/g, " }") === PLAIN_PROBE;

const RUNTIME_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*(["'])((?:\.\/|\.\.\/)+runtime\.js)(?:\?[^"']*)?\2;?[ \t]*\n/m;

/**
 * A module that imported the probe's `runtime` / `shouldUseLocalGateway` now
 * makes the same two values from the SDK, where the import used to be.
 * Returns `{ source }` or `{ reason }`.
 */
export const adoptRuntimeImporter = (source, { vendorSpecifier }) => {
  const match = RUNTIME_IMPORT.exec(source);
  if (!match) return { reason: "no import of ./runtime.js" };
  const specifiers = match[1].split(",").map((entry) => entry.trim()).filter(Boolean);
  const names = {};
  for (const entry of specifiers) {
    const [name, alias] = entry.split(/\s+as\s+/);
    if (name !== "runtime" && name !== "shouldUseLocalGateway") return { reason: `imports ${name} from ./runtime.js` };
    names[name] = alias ?? name;
  }
  const without = source.slice(0, match.index) + source.slice(match.index + match[0].length);
  const taken = identifierUses(without, "runtime").length > 0;
  const runtimeVar = names.runtime ?? (taken ? "airAppRuntime" : "runtime");
  const needs = ["detectAirAppRuntime"];
  const lines = [`const ${runtimeVar} = await detectAirAppRuntime();`];
  if (names.shouldUseLocalGateway) {
    needs.push("shouldUseLocalAirAppGateway");
    lines.push(`const ${names.shouldUseLocalGateway} = () => shouldUseLocalAirAppGateway(${runtimeVar});`);
  }
  // The new import takes the place of the old one when there is no vendor import to join.
  const placeholder = "\u0000";
  let text = vendorImport(vendorSpecifier).test(source)
    ? withVendorImport(without, needs, vendorSpecifier)
    : source.slice(0, match.index) + placeholder + "\n" + source.slice(match.index + match[0].length);
  if (text.includes(placeholder)) text = text.replace(`${placeholder}\n`, `${renderImport([...needs].sort(), vendorSpecifier)}\n`);
  text = afterImports(text, lines.join("\n"));
  text = text.replace(/surfaced by \.\/runtime\.js/g, "surfaced by detectAirAppRuntime()");
  return { source: text };
};

/** A `runtime.js` that is the probe as `getRuntime()` (plus helpers nobody imports). */
const isGetRuntimeProbe = (source) => {
  const code = squash(source);
  return /export async function getRuntime\(\)/.test(code) && code.includes('fetch("__airapp/runtime"');
};

const GET_RUNTIME_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*(["'])((?:\.\/|\.\.\/)+runtime\.js)(?:\?[^"']*)?\2;?[ \t]*\n/m;

/** A module that only ever imported `getRuntime` asks the SDK's `detectAirAppRuntime` instead. */
export const adoptGetRuntimeImporter = (source, { vendorSpecifier }) => {
  const match = GET_RUNTIME_IMPORT.exec(source);
  if (!match) return { reason: "no import of ./runtime.js" };
  const names = match[1].split(",").map((entry) => entry.trim()).filter(Boolean);
  if (names.length !== 1 || names[0] !== "getRuntime") return { reason: `imports ${names.join(", ")} from ./runtime.js` };
  const without = source.slice(0, match.index) + source.slice(match.index + match[0].length);
  if (identifierUses(without, "detectAirAppRuntime").length) return { reason: "already uses detectAirAppRuntime" };
  let text = vendorImport(vendorSpecifier).test(source)
    ? withVendorImport(without, ["detectAirAppRuntime"], vendorSpecifier)
    : `${source.slice(0, match.index)}${renderImport(["detectAirAppRuntime"], vendorSpecifier, match[2])}\n${source.slice(match.index + match[0].length)}`;
  for (const use of [...codeOnly(text).matchAll(/(?<![.\w$])getRuntime(?![\w$])/g)].reverse()) {
    text = text.slice(0, use.index) + "detectAirAppRuntime" + text.slice(use.index + "getRuntime".length);
  }
  return { source: text };
};

// ── messages ───────────────────────────────────────────────────────────────

// A message-table entry: `key: "text"` or `"quoted.key": "text"`, the text on the same line or the next.
const MESSAGE_ENTRY = /((?:"[^"\n]+"|\w+)\s*:\s*)("(?:[^"\\\n]|\\.)*")/g;

/** The first sentence of each of the SDK's "queued" notices. */
const noticeOpenings = (sentences) => Object.values(sentences).map(({ queued }) => queued.split(/(?<=[.。])/)[0]);

/**
 * Message-table entries whose text is the SDK's sentence for some locale become
 * a call that asks the SDK for it. `sentences` is the SDK's table. `others` counts
 * entries that open with the SDK's sentence but word the rest differently.
 */
export const adoptMessages = (source, { vendorSpecifier, sentences }) => {
  const byText = new Map(Object.entries(sentences).map(([locale, { queued }]) => [queued, locale]));
  const openings = noticeOpenings(sentences);
  let count = 0;
  let others = 0;
  let text = source.replace(MESSAGE_ENTRY, (whole, key, literal) => {
    const value = JSON.parse(literal);
    const locale = byText.get(value);
    if (!locale) {
      if (openings.some((opening) => value.startsWith(opening))) others += 1;
      return whole;
    }
    count += 1;
    return `${key.trimEnd()} sdkQueuedNotice(${JSON.stringify(locale)})`;
  });
  if (!count) return { source, count: 0, others };
  text = withVendorImport(text, ["airAppWriteMessage"], vendorSpecifier);
  text = afterImports(text, 'const sdkQueuedNotice = (locale) => airAppWriteMessage({ status: "queued" }, { locale });');
  return { source: text, count, others };
};

// ── one app ────────────────────────────────────────────────────────────────

const VENDOR_BUNDLES = ["busabase-airapp.js", "busabase-sdk.js"];

/**
 * The app's vendored bundle that exports the SDK helpers, with the names it
 * exports from them: `{ file, exports }`, or null when no bundle does. An app
 * that builds its own `busabase-sdk.js` (b2b-crm) can export the helpers from it.
 */
export const loadVendoredSdk = async (appDir) => {
  let first = null;
  for (const name of VENDOR_BUNDLES) {
    const file = path.join(appDir, "app", "vendor", name);
    if (!fs.existsSync(file)) continue;
    let loaded;
    try {
      loaded = await import(pathToFileURL(file).href);
    } catch {
      continue;
    }
    const exports = { file, module: loaded, names: new Set(REQUIRED_EXPORTS.filter((key) => typeof loaded[key] === "function")) };
    if (exports.names.size) return exports;
    first ??= exports;
  }
  return first;
};

const relativeSpecifier = (fromFile, toFile) => {
  const relative = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const walkSource = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "vendor" || entry.name === "node_modules" ? [] : walkSource(path.join(dir, entry.name));
    return /\.[cm]?js$/.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);

/**
 * Adopt the SDK helpers in one app. Writes unless `dryRun`. Returns
 * `{ dir, pieces, files }`: `pieces` says per piece "migrated", "absent"
 * (nothing of that kind here) or `{ left: reason }`; `files` lists the files
 * that changed (or would).
 */
export const adoptApp = async (dir, { dryRun = false, assumeSdk = false } = {}) => {
  const result = { dir, pieces: {}, files: [] };
  const sdk = await loadVendoredSdk(dir);
  const vendorFile = sdk?.file ?? path.join(dir, "app", "vendor", "busabase-airapp.js");
  const available = assumeSdk ? null : (sdk?.names ?? new Set());
  const sentences = sdk?.module.AIRAPP_WRITE_MESSAGES ?? FALLBACK_SENTENCES;
  const lacks = (...names) => (available ? names.filter((name) => !available.has(name)) : []);
  const lacking = (names) => `the vendored bundle does not export ${names.join(", ")} (run scripts/update-app-sdk.mjs, or export them from the app's own bundle entry)`;
  const write = (file, text) => {
    result.files.push(path.relative(dir, file));
    if (!dryRun) fs.writeFileSync(file, text);
  };

  const providerFile = path.join(dir, "app", "js", "providers", "busabase-provider.js");
  const provider = read(providerFile);
  if (provider !== null) {
    const adopted = adoptProvider(provider, { vendorSpecifier: relativeSpecifier(providerFile, vendorFile), available });
    Object.assign(result.pieces, adopted.pieces);
    if (adopted.source !== provider) write(providerFile, adopted.source);
  }

  const runtimeFile = path.join(dir, "app", "js", "runtime.js");
  const runtime = read(runtimeFile);
  if (runtime === null) result.pieces.runtime = "absent";
  else if (!codeOnly(runtime, { keepLiterals: true }).includes("__airapp/runtime")) result.pieces.runtime = "migrated"; // no private probe left
  else {
    const recipe = isPlainProbe(runtime) ? adoptRuntimeImporter : isGetRuntimeProbe(runtime) ? adoptGetRuntimeImporter : null;
    const missing = lacks("detectAirAppRuntime", "shouldUseLocalAirAppGateway");
    if (!recipe) result.pieces.runtime = { left: "runtime.js does more than the probe, or is not a probe this recognises" };
    else if (missing.length) result.pieces.runtime = { left: lacking(missing) };
    else {
      const importers = walkSource(path.join(dir, "app")).filter(
        (file) => file !== runtimeFile && /runtime\.js/.test(read(file) ?? ""),
      );
      const rewritten = [];
      let reason = null;
      for (const file of importers) {
        const adopted = recipe(read(file), { vendorSpecifier: relativeSpecifier(file, vendorFile) });
        if (adopted.reason) {
          reason = `${path.relative(dir, file)}: ${adopted.reason}`;
          break;
        }
        rewritten.push([file, adopted.source]);
      }
      if (reason || !importers.length) result.pieces.runtime = { left: reason ?? "nothing imports runtime.js" };
      else {
        for (const [file, text] of rewritten) write(file, text);
        result.files.push(path.relative(dir, runtimeFile));
        if (!dryRun) fs.rmSync(runtimeFile);
        result.pieces.runtime = "migrated";
      }
    }
  }

  const messagesFile = path.join(dir, "app", "i18n", "messages.js");
  const messages = read(messagesFile);
  if (messages === null) result.pieces.notice = "absent";
  else if (lacks("airAppWriteMessage").length) {
    const copies = adoptMessages(messages, { vendorSpecifier: "", sentences });
    result.pieces.notice = copies.count + copies.others ? { left: lacking(["airAppWriteMessage"]) } : "absent";
  } else {
    const adopted = adoptMessages(messages, { vendorSpecifier: relativeSpecifier(messagesFile, vendorFile), sentences });
    if (adopted.count) write(messagesFile, adopted.source);
    result.pieces.notice = adopted.others
      ? { left: `${adopted.others} entr${adopted.others === 1 ? "y" : "ies"} open with the SDK's sentence but word the rest differently` }
      : adopted.count || /sdkQueuedNotice\(|airAppWriteMessage\(/.test(messages)
        ? "migrated"
        : "absent";
  }
  return result;
};

// The English and Chinese sentences, for a dry run on an app whose bundle predates them.
export const FALLBACK_SENTENCES = {
  en: { queued: "Sent for review. You don't have write access here, so this waits until someone who does approves it." },
  "zh-CN": { queued: "已提交审核。你在这里没有写权限，需要有写权限的人批准后才会生效。" },
  "zh-TW": { queued: "已送出審核。你在這裡沒有寫入權限，需要有寫入權限的人核准後才會生效。" },
  ja: {
    queued: "レビューに送信しました。ここでの書き込み権限がないため、書き込み権限のある人が承認するまで反映されません。",
  },
};

// ── command line ───────────────────────────────────────────────────────────

export const parseArgs = (argv) => {
  const options = { dryRun: false, check: false, assumeSdk: false, json: null, patterns: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--assume-sdk") options.assumeSdk = true;
    else if (arg === "--json") {
      options.json = argv[++index];
      if (!options.json) throw new Error("--json needs a file");
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else options.patterns.push(arg);
  }
  if (options.assumeSdk && !options.dryRun && !options.check) {
    throw new Error("--assume-sdk is for --dry-run or --check: an app whose bundle lacks the helpers would be left calling them");
  }
  return options;
};

const USAGE = `usage: node scripts/adopt-sdk-airapp-helpers.mjs [--dry-run] [--check] [--assume-sdk] [--json <file>] [<path-or-glob>...]`;

const status = (piece) => (typeof piece === "string" ? piece : "left");

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const cwd = options.patterns.length ? process.cwd() : defaultRoot;
  const patterns = options.patterns.length ? options.patterns : ["templates/*/content/*"];
  const dirs = findApps(patterns, { cwd });
  if (!dirs.length) {
    console.error(`No app depending on busabase-sdk under ${patterns.join(", ")}`);
    return 1;
  }
  const dryRun = options.dryRun || options.check;
  const results = [];
  for (const dir of dirs) results.push(await adoptApp(dir, { dryRun, assumeSdk: options.assumeSdk }));

  const pieces = ["readPage", "findRecord", "upsert", "isQueued", "runtime", "notice"];
  const display = (dir) => path.relative(cwd, dir) || ".";
  const width = Math.max(...results.map((row) => display(row.dir).length), 3);
  console.log(`${"app".padEnd(width)}  ${pieces.map((piece) => piece.padEnd(10)).join(" ")}`);
  for (const row of results) {
    const cells = pieces.map((piece) => status(row.pieces[piece] ?? "absent"));
    console.log(`${display(row.dir).padEnd(width)}  ${cells.map((cell) => cell.padEnd(10)).join(" ")}`);
  }
  const left = results.flatMap((row) => Object.entries(row.pieces).filter(([, piece]) => typeof piece === "object").map(([name, piece]) => ({ app: display(row.dir), name, reason: piece.left })));
  if (left.length) {
    console.log("\nLeft on the app's own code:");
    for (const { app, name, reason } of left) console.log(`  ${app}: ${name}: ${reason}`);
  }
  const changed = results.filter((row) => row.files.length);
  console.log(`\n${changed.length} of ${results.length} app(s) ${dryRun ? "would change" : "changed"}.`);
  if (options.json) {
    fs.writeFileSync(options.json, `${JSON.stringify(results.map((row) => ({ ...row, dir: display(row.dir) })), null, 2)}\n`);
  }
  return options.check && changed.length ? 1 : 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
