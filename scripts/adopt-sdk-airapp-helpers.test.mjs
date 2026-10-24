import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  adoptApp,
  adoptFindRecord,
  adoptGetRuntimeImporter,
  adoptIsQueued,
  adoptMessages,
  adoptProvider,
  adoptReadPage,
  adoptRuntimeImporter,
  adoptUpsert,
  findFunction,
  isPlainProbe,
  loadVendoredSdk,
  parseArgs,
  withVendorImport,
} from "./adopt-sdk-airapp-helpers.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VENDOR = "../../vendor/busabase-airapp.js";

// ── fixtures: the shapes the templates carry, as they are written there ─────

const READ_PAGE = `async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: declared.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  const rows = records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}`;

const FIND_RECORD = `async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}`;

const UPSERT = `async function upsert(key, idFieldSlug, idValue, fields, message) {
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
}`;

const IS_QUEUED = `// A person's write from this app leaves \`autoMerge\` unset, so Busabase decides
// from that person's own permission: with write access the change lands now;
// without it the same change becomes a ChangeRequest for someone who has it.
// The response says which happened (\`materialized: false\` is the queued one),
// and the caller reports it rather than assuming either.
const isQueued = (result) => result?.materialized === false || result?.status === "in_review";`;

const PROVIDER = `import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";
import { createRuntimeClient } from "../busabase-client.js";
import { appConfig } from "../config.js?v=0.1.0";

const allowedReads = new Set(appConfig.permissions.readProcedures);

let runtimeClient;

// One page per call, never several pages in one function call.
${READ_PAGE}

function recordToRow(record) {
  return { ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields) };
}

${FIND_RECORD}

${IS_QUEUED}

${UPSERT}

export const busabaseProvider = {
  async getRecord(key, id) {
    const record = await findRecord(key, "id", id);
    return record ? recordToRow(record) : null;
  },
  async apply(id) {
    const result = await upsert("followups", "followup-id", id, {}, "msg");
    return { pending: isQueued(result), change_request_id: isQueued(result) ? result?.id || "" : "" };
  },
};
`;

const PLAIN_RUNTIME = `/** the probe */
const UNKNOWN_RUNTIME = { runtime: "unknown", hosted: false, determined: false };

const normalize = (body) => {
  if (!body || typeof body !== "object" || typeof body.runtime !== "string") return UNKNOWN_RUNTIME;
  return {
    runtime: body.runtime,
    // presence, never membership
    hosted: body.hosted === true,
    determined: true,
  };
};

const probe = async () => {
  try {
    const response = await fetch("__airapp/runtime", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !type.includes("application/json")) return UNKNOWN_RUNTIME;
    return normalize(await response.json());
  } catch {
    return UNKNOWN_RUNTIME;
  }
};

export const runtime = await probe();

export const shouldUseLocalGateway = () => !runtime.hosted;
`;

const CONNECT_GATE = `// Connection gate.
// (BUSABASE_AIRAPP_RUNTIME, surfaced by ./runtime.js), never something to guess
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { shouldUseLocalGateway } from "./runtime.js";

export { shouldUseLocalGateway };
`;

const EN = "Sent for review. You don't have write access here, so this waits until someone who does approves it.";
const ZH = "已提交审核。你在这里没有写权限，需要有写权限的人批准后才会生效。";
const SENTENCES = { en: { queued: EN }, "zh-CN": { queued: ZH } };

const lines = (...parts) => parts.join("\n");

// ── scanning ───────────────────────────────────────────────────────────────

test("finds a function or block-bodied arrow at any indentation, but not a quoted one or an expression arrow", () => {
  const source = lines(
    "const note = 'function readPage() {}';",
    "const outer = () => {",
    "  async function page(base) {",
    "    return { a: `${1 + 1}` };",
    "  }",
    "};",
    "const readPage = async (client, base, options = {}) => {",
    "  return { a: `${1 + 1}` };",
    "};",
    "function other() {}",
  );
  const found = findFunction(source, "readPage");
  assert.match(found.text, /^const readPage = async \(client, base, options = \{\}\) => \{/);
  assert.ok(found.text.endsWith("};"));
  const nested = findFunction(source, "page");
  assert.match(nested.text, /^ {2}async function page\(base\) \{/);
  assert.ok(nested.text.endsWith("  }"));
  assert.equal(findFunction(source, "missing"), null);
  assert.equal(findFunction("const readPage = (x) => x + 1;", "readPage"), null);
});

// ── readPage ───────────────────────────────────────────────────────────────

test("readPage: the list call, its array handling and nextCursor become one SDK call", () => {
  const { text, binds } = adoptReadPage(READ_PAGE);
  assert.equal(binds, "runtimeClient");
  assert.equal(
    text,
    `async function readPage(key, cursor) {
  if (!allowedReads.has("records.list")) throw new Error("PROCEDURE_DENIED: records.list");
  const declared = base(key);
  const page = await sdkRecords().readPage({
    baseId: declared.baseId,
    limit: declared.readLimit,
    cursor,
  });
  const rows = page.records.map((record) => ({
    ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
    __recordId: record.id,
    __headCommitId: record.headCommitId || record.headCommit?.id,
  }));
  return { rows, nextCursor: page.nextCursor };
}`,
  );
});

test("readPage: filters, sort and an app-chosen limit keep their meaning", () => {
  const source = `async function readPage(key, cursor, filters, limit) {
  const declared = base(key);
  const result = await runtimeClient.records.list({
    baseId: declared.baseId,
    limit: limit || declared.readLimit,
    ...(cursor ? { cursor } : {}),
    ...(filters?.length ? { filters } : {}),
    ...(SORT_BY_BASE[declared.key] ? { sort: SORT_BY_BASE[declared.key] } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  hasMore.set(key, Boolean(!Array.isArray(result) && result.nextCursor));
  return records.map(recordToRow);
}`;
  const { text } = adoptReadPage(source);
  assert.match(text, /limit: limit \|\| declared\.readLimit,\n {4}cursor,\n {4}filters: filters\?\.length \? filters : undefined,\n {4}sort: SORT_BY_BASE\[declared\.key\],/);
  assert.match(text, /hasMore\.set\(key, Boolean\(page\.nextCursor\)\);\n {2}return page\.records\.map\(recordToRow\);/);
});

test("readPage: a function that already reads its page as { records, nextCursor } only swaps the call", () => {
  const source = `const readPage = async (client, base, cursor) => {
  const page = await client.records.list({
    baseId: base.baseId,
    limit: 100,
    sort: { fieldSlug: "due", fieldType: "date", direction: "asc" },
    ...(cursor ? { cursor } : {}),
  });
  return { records: normalize(page.records), nextCursor: page.nextCursor || null };
};`;
  const { text, binds } = adoptReadPage(source);
  assert.equal(binds, "client");
  assert.equal(
    text,
    `const readPage = async (client, base, cursor) => {
  const page = await createAirAppRecords(client).readPage({
    baseId: base.baseId,
    limit: 100,
    sort: { fieldSlug: "due", fieldType: "date", direction: "asc" },
    cursor,
  });
  return { records: normalize(page.records), nextCursor: page.nextCursor || null };
};`,
  );
});

test("readPage: a function that is itself called page gets another name for the result", () => {
  const source = `async function page(key, cursor) {
  const result = await client.records.list({
    baseId: base.baseId,
    limit: base.readLimit,
    ...(cursor ? { cursor } : {}),
  });
  const records = Array.isArray(result) ? result : result.records || [];
  return { rows: records.map(rowFromRecord), nextCursor: Array.isArray(result) ? null : result.nextCursor || null };
}`;
  const { text } = adoptReadPage(source);
  assert.match(text, /const recordsPage = await createAirAppRecords\(client\)\.readPage\(/);
  assert.match(text, /return \{ rows: recordsPage\.records\.map\(rowFromRecord\), nextCursor: recordsPage\.nextCursor \};/);
});

test("readPage: says why it leaves a shape it does not recognise", () => {
  const reason = (source) => adoptReadPage(source).reason;
  assert.match(reason("async function readPage() { return []; }"), /no `records.list` call/);
  assert.match(
    reason("async function readPage(b) {\n  const r = await c.records.list({ baseId: b.id, limit: 5, prefix: 'x' });\n}"),
    /unrecognised records\.list argument: prefix/,
  );
  assert.match(
    reason("async function readPage(b) {\n  const r = await c.records.list({ baseId: b.id });\n}"),
    /sets no limit/,
  );
  assert.match(
    reason(
      "async function readPage(b) {\n  const r = await c.records.list({ baseId: b.id, limit: 5 });\n  const recs = Array.isArray(r) ? r : r.records || [];\n  return { recs, total: r.total };\n}",
    ),
    /result of records\.list is used in a way/,
  );
  assert.match(
    reason(
      "async function readPage(b) {\n  const page = 1;\n  const recordsPage = 2;\n  const r = await c.records.list({ baseId: b.id, limit: 5 });\n  const recs = Array.isArray(r) ? r : r.records || [];\n  return recs;\n}",
    ),
    /already uses the names/,
  );
});

// ── findRecord / upsert / isQueued ─────────────────────────────────────────

test("findRecord: the records.get + NOT_FOUND wrapper becomes the SDK's findRecord, keeping what it checked", () => {
  assert.equal(
    adoptFindRecord(FIND_RECORD).text,
    `async function findRecord(key, idFieldSlug, idValue) {
  const declared = base(key);
  return sdkRecords().findRecord({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
}`,
  );
  const guarded = adoptFindRecord(`async function findRecord(key, idFieldSlug, idValue) {
  if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");
  const declared = base(key);
  try {
    return await runtimeClient.records.get({ baseId: declared.baseId, fieldSlug: idFieldSlug, valueText: idValue });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}`);
  assert.equal(guarded.readCheck, 'if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");');
  assert.match(guarded.text, /^async function findRecord[^\n]*\n {2}if \(!allowedReads\.has\("records\.get"\)\)/);
  const shorthand = adoptFindRecord(`async function findRecord(key, fieldSlug, valueText) {
  const base = bases.get(key);
  try {
    return await client.records.get({ baseId: base.baseId, fieldSlug, valueText });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}`);
  assert.match(shorthand.text, /createAirAppRecords\(client\)\.findRecord\(\{ baseId: base\.baseId, fieldSlug, valueText \}\);/);
  assert.match(adoptFindRecord("async function findRecord(a) { return a; }").reason, /not the `records.get` \+ NOT_FOUND wrapper/);
  // a handler that does something with the error is not "not found is null"
  assert.ok(adoptFindRecord(FIND_RECORD.replace("return null;", "return undefined;")).reason);
});

test("upsert: the shared find-then-create-or-update becomes the SDK's upsert; a read check that find carried moves in", () => {
  const plain = adoptUpsert(UPSERT, { readCheck: null }).text;
  assert.match(plain, /const \{ response \} = await sdkRecords\(\)\.upsert\(\{\n {4}baseId: declared\.baseId,\n {4}fieldSlug: idFieldSlug,\n {4}valueText: idValue,\n {4}fields: toBusabaseFields\(fields\),\n {4}message,\n {2}\}\);\n {2}return response;/);
  assert.doesNotMatch(plain, /records\.get/);
  const check = 'if (!allowedReads.has("records.get")) throw new Error("PROCEDURE_DENIED: records.get");';
  assert.match(adoptUpsert(UPSERT, { readCheck: check }).text, /const declared = base\(key\);\n {2}if \(!allowedReads\.has\("records\.get"\)\)/);
  assert.match(adoptUpsert(UPSERT.replace('operation: "update"', 'operation: "delete"'), { readCheck: null }).reason, /not the find-then-create-or-update/);
});

test("isQueued: the local definition and its comment go, every use is renamed", () => {
  const source = `import x from "y";

${IS_QUEUED}

const a = isQueued(result) ? 1 : 2;
const b = [r1, r2].find(isQueued);
const c = "isQueued stays in a string"; // and in a comment: isQueued
`;
  const { text } = adoptIsQueued(source);
  assert.equal(
    text,
    `import x from "y";

const a = isAirAppWriteQueued(result) ? 1 : 2;
const b = [r1, r2].find(isAirAppWriteQueued);
const c = "isQueued stays in a string"; // and in a comment: isQueued
`,
  );
  const unrelated = adoptIsQueued(`// Mind the gap.\nconst isQueued = (result) => result?.materialized === false || result?.status === "in_review";\nuse(isQueued);\n`).text;
  assert.match(unrelated, /^\/\/ Mind the gap\.\nuse\(isAirAppWriteQueued\);/);
  assert.match(adoptIsQueued("const isQueued = (r) => r.pending;\n").reason, /not the local one-liner/);
});

// ── the whole provider ─────────────────────────────────────────────────────

test("a provider moves onto the SDK in one pass and a second pass changes nothing", () => {
  const first = adoptProvider(PROVIDER, { vendorSpecifier: VENDOR });
  assert.deepEqual(first.pieces, { readPage: "migrated", findRecord: "migrated", upsert: "migrated", isQueued: "migrated" });
  const text = first.source;

  // imports are merged into the one that was there
  assert.match(
    text,
    /^import \{ inspectProvisionedResources, provisionDeclaredResources, createAirAppRecords, isAirAppWriteQueued \} from "\.\.\/\.\.\/vendor\/busabase-airapp\.js";|^import \{\n {2}inspectProvisionedResources,\n {2}provisionDeclaredResources,\n {2}createAirAppRecords,\n {2}isAirAppWriteQueued,\n\} from/,
  );
  // the binder sits above the comment that belongs to readPage, not between them
  const binder = text.indexOf("const sdkRecords = () => createAirAppRecords(runtimeClient, { appId: appConfig.appId });");
  assert.ok(binder > 0 && binder < text.indexOf("// One page per call"));
  assert.ok(text.indexOf("// One page per call") < text.indexOf("async function readPage"));
  assert.match(text, /Record reads and writes go through the SDK's helpers/);
  // findRecord is still there because getRecord calls it; upsert no longer does
  assert.match(text, /async function findRecord[\s\S]*sdkRecords\(\)\.findRecord/);
  assert.match(text, /pending: isAirAppWriteQueued\(result\), change_request_id: isAirAppWriteQueued\(result\)/);
  assert.doesNotMatch(text, /\bisQueued\b|Array\.isArray|\.records\.(?:get|list)\(/);
  // the line each copy re-derived is dropped inside readPage, and only there
  assert.match(text, /\.\.\.normalizeFields\(record\.fields\),\n {4}__recordId/);
  assert.match(text, /function recordToRow\(record\) \{\n {2}return \{ \.\.\.normalizeFields\(record\.headCommit\?\.payload/);

  const second = adoptProvider(text, { vendorSpecifier: VENDOR });
  assert.equal(second.source, text);
  assert.deepEqual(second.pieces, { readPage: "migrated", findRecord: "migrated", upsert: "migrated", isQueued: "absent" });
});

test("findRecord is dropped once nothing calls it, with the comment above it", () => {
  const source = PROVIDER.replace(
    /export const busabaseProvider[\s\S]*$/,
    `export const busabaseProvider = {
  async apply(id) {
    const result = await upsert("followups", "followup-id", id, {}, "msg");
    return { pending: isQueued(result) };
  },
};
`,
  ).replace("async function findRecord", "// Look one record up by its business id.\nasync function findRecord");
  const { source: text } = adoptProvider(source, { vendorSpecifier: VENDOR });
  assert.doesNotMatch(text, /findRecord|Look one record up/);
  assert.match(text, /\n\}\n\nasync function upsert/);
});

test("a provider is left alone, with the reason, when a piece is not a shape it knows", () => {
  const odd = PROVIDER.replace("limit: declared.readLimit,", "limit: declared.readLimit,\n    prefix: 'x',");
  const { source, pieces } = adoptProvider(odd, { vendorSpecifier: VENDOR });
  assert.match(pieces.readPage.left, /unrecognised records\.list argument: prefix/);
  assert.equal(pieces.findRecord, "migrated");
  assert.doesNotMatch(source, /sdkRecords\(\)\.readPage/);
});

test("nothing is rewritten when the vendored bundle cannot supply what the rewrite imports", () => {
  const { source, pieces } = adoptProvider(PROVIDER, { vendorSpecifier: VENDOR, available: new Set(["createAirAppRecords"]) });
  assert.equal(source, PROVIDER);
  assert.match(pieces.isQueued.left, /does not export isAirAppWriteQueued/);
  assert.match(pieces.readPage.left, /does not export isAirAppWriteQueued/);
});

test("an import of the vendored bundle is created when the file had none, and joined when it had", () => {
  assert.equal(
    withVendorImport('import a from "./a.js";\nconst x = 1;\n', ["createAirAppRecords"], VENDOR),
    'import a from "./a.js";\nimport { createAirAppRecords } from "../../vendor/busabase-airapp.js";\nconst x = 1;\n',
  );
  assert.equal(
    withVendorImport('import { a } from "../../vendor/busabase-airapp.js?v=1";\n', ["b", "a"], VENDOR),
    'import { a, b } from "../../vendor/busabase-airapp.js?v=1";\n',
  );
  const crowded = withVendorImport(
    'import { inspectProvisionedResources, provisionDeclaredResources } from "../../vendor/busabase-airapp.js";\n',
    ["createAirAppRecords", "isAirAppWriteQueued"],
    VENDOR,
  );
  assert.match(crowded, /^import \{\n {2}inspectProvisionedResources,\n {2}provisionDeclaredResources,\n {2}createAirAppRecords,\n {2}isAirAppWriteQueued,\n\} from/);
});

// ── runtime.js ─────────────────────────────────────────────────────────────

test("a runtime.js that is only the probe is recognised whatever its comments say", () => {
  assert.equal(isPlainProbe(PLAIN_RUNTIME), true);
  assert.equal(isPlainProbe(PLAIN_RUNTIME.replace("// presence, never membership", "// a different note\n    // over two lines")), true);
  assert.equal(isPlainProbe(PLAIN_RUNTIME.replace("hosted: body.hosted === true", "hosted: ENGINES.has(body.runtime)")), false);
  assert.equal(isPlainProbe(PLAIN_RUNTIME.replace("AbortSignal.timeout(3000)", "AbortSignal.timeout(500)")), false);
  assert.equal(isPlainProbe(`${PLAIN_RUNTIME}\nexport const runtimeLabel = (r) => r.runtime;\n`), false);
});

test("the module that imported the probe makes the same two values from the SDK, where the import was", () => {
  const { source } = adoptRuntimeImporter(CONNECT_GATE, { vendorSpecifier: "../vendor/busabase-airapp.js" });
  assert.equal(
    source,
    `// Connection gate.
// (BUSABASE_AIRAPP_RUNTIME, surfaced by detectAirAppRuntime()), never something to guess
import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { getProvider } from "./providers/index.js?v=0.1.0";
import { detectAirAppRuntime, shouldUseLocalAirAppGateway } from "../vendor/busabase-airapp.js";

const runtime = await detectAirAppRuntime();
const shouldUseLocalGateway = () => shouldUseLocalAirAppGateway(runtime);

export { shouldUseLocalGateway };
`,
  );

  const aliased = adoptRuntimeImporter(
    `import { toast } from "./api.js";\n// gate\nimport { shouldUseLocalGateway as isStandaloneLocalPreview } from "./runtime.js";\n\nuse(isStandaloneLocalPreview());\n`,
    { vendorSpecifier: "../vendor/busabase-sdk.js" },
  ).source;
  assert.match(aliased, /import \{ detectAirAppRuntime, shouldUseLocalAirAppGateway \} from "\.\.\/vendor\/busabase-sdk\.js";/);
  assert.match(aliased, /const isStandaloneLocalPreview = \(\) => shouldUseLocalAirAppGateway\(runtime\);/);

  const providerOnly = adoptRuntimeImporter(`import { runtime } from "../runtime.js";\nuse(runtime.hosted);\n`, {
    vendorSpecifier: "../../vendor/busabase-airapp.js",
  }).source;
  assert.match(providerOnly, /const runtime = await detectAirAppRuntime\(\);/);
  assert.doesNotMatch(providerOnly, /shouldUseLocalAirAppGateway/);

  // a name already taken in the file is not reused for the probe's answer
  const taken = adoptRuntimeImporter(`import { shouldUseLocalGateway } from "./runtime.js";\nconst runtime = 1;\n`, { vendorSpecifier: "../vendor/busabase-airapp.js" }).source;
  assert.match(taken, /const airAppRuntime = await detectAirAppRuntime\(\);/);
  assert.match(taken, /shouldUseLocalAirAppGateway\(airAppRuntime\)/);

  assert.match(
    adoptRuntimeImporter(`import { runtimeLabel } from "./runtime.js";\n`, { vendorSpecifier: "../vendor/busabase-airapp.js" }).reason,
    /imports runtimeLabel/,
  );
});

test("getRuntime() callers ask detectAirAppRuntime() instead, but only when that is all they imported", () => {
  const app = `import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";\nimport { getRuntime } from "./runtime.js";\n\nconst runtime = await getRuntime();\n`;
  const { source } = adoptGetRuntimeImporter(app, { vendorSpecifier: "../vendor/busabase-airapp.js" });
  assert.equal(
    source,
    `import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";\nimport { detectAirAppRuntime } from "../vendor/busabase-airapp.js";\n\nconst runtime = await detectAirAppRuntime();\n`,
  );
  assert.match(
    adoptGetRuntimeImporter(`import { connectionHintKey, getRuntime } from "./runtime.js";\n`, { vendorSpecifier: "../vendor/busabase-airapp.js" }).reason,
    /imports connectionHintKey, getRuntime/,
  );
});

// ── messages ───────────────────────────────────────────────────────────────

test("an entry holding the SDK's sentence asks the SDK for it, under any key", () => {
  const source = `export const messages = {
  en: {
    saved: "Saved.",
    savedForReview:
      "${EN}",
    "toast.submitted_review": "${EN}",
    decisionPending: "Decision sent for review as change request {id}.",
  },
  "zh-CN": {
    saved: "已保存。",
    savedForReview: "${ZH}",
  },
};
`;
  const { source: text, count, others } = adoptMessages(source, { vendorSpecifier: "../vendor/busabase-airapp.js", sentences: SENTENCES });
  assert.equal(count, 3);
  assert.equal(others, 0);
  assert.equal(
    text,
    `import { airAppWriteMessage } from "../vendor/busabase-airapp.js";

const sdkQueuedNotice = (locale) => airAppWriteMessage({ status: "queued" }, { locale });

export const messages = {
  en: {
    saved: "Saved.",
    savedForReview: sdkQueuedNotice("en"),
    "toast.submitted_review": sdkQueuedNotice("en"),
    decisionPending: "Decision sent for review as change request {id}.",
  },
  "zh-CN": {
    saved: "已保存。",
    savedForReview: sdkQueuedNotice("zh-CN"),
  },
};
`,
  );
  const reworded = adoptMessages(`export const messages = { en: { savedForReview: "Sent for review. Someone will look." } };\n`, {
    vendorSpecifier: "../vendor/busabase-airapp.js",
    sentences: SENTENCES,
  });
  assert.equal(reworded.count, 0);
  assert.equal(reworded.others, 1);
});

// ── an app ─────────────────────────────────────────────────────────────────

const BUNDLE = `export const detectAirAppRuntime = async () => ({ runtime: "local", hosted: false });
export const shouldUseLocalAirAppGateway = (runtime) => !runtime.hosted;
export const createAirAppRecords = () => ({});
export const isAirAppWriteQueued = () => false;
export const airAppWriteMessage = () => "";
export const AIRAPP_WRITE_MESSAGES = { en: { saved: "Saved.", queued: ${JSON.stringify(EN)} }, "zh-CN": { saved: "已保存。", queued: ${JSON.stringify(ZH)} } };
`;

const makeApp = ({ bundle = BUNDLE } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adopt-sdk-"));
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    fs.writeFileSync(path.join(dir, relative), text);
  };
  write("package.json", '{"name":"fixture-airapp","type":"module","dependencies":{"busabase-sdk":"0.99.0"}}\n');
  write("app/vendor/busabase-airapp.js", bundle);
  write("app/js/providers/busabase-provider.js", PROVIDER);
  write("app/js/runtime.js", PLAIN_RUNTIME);
  write("app/js/connect-gate.js", CONNECT_GATE);
  write("app/i18n/messages.js", `export const messages = {\n  en: {\n    savedForReview: ${JSON.stringify(EN)},\n  },\n};\n`);
  return dir;
};

const snapshot = (dir) =>
  Object.fromEntries(
    fs.globSync("**/*.js", { cwd: dir }).map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8")]),
  );

test("an app is moved piece by piece, and a dry run shows the same result without writing", async () => {
  const dir = makeApp();
  const before = snapshot(dir);
  const dry = await adoptApp(dir, { dryRun: true });
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(dry.pieces, { readPage: "migrated", findRecord: "migrated", upsert: "migrated", isQueued: "migrated", runtime: "migrated", notice: "migrated" });

  const done = await adoptApp(dir);
  assert.deepEqual(done.files.sort(), ["app/i18n/messages.js", "app/js/connect-gate.js", "app/js/providers/busabase-provider.js", "app/js/runtime.js"]);
  assert.equal(fs.existsSync(path.join(dir, "app/js/runtime.js")), false);
  assert.match(fs.readFileSync(path.join(dir, "app/js/connect-gate.js"), "utf8"), /await detectAirAppRuntime\(\)/);

  const again = await adoptApp(dir);
  assert.deepEqual(again.files, []);
});

test("an app whose bundle lacks the helpers is left as it is, unless a dry run assumes them", async () => {
  const dir = makeApp({ bundle: "export const createBusabaseClient = () => ({});\n" });
  const before = snapshot(dir);
  const result = await adoptApp(dir);
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(result.files, []);
  assert.match(result.pieces.readPage.left, /does not export createAirAppRecords/);
  assert.match(result.pieces.runtime.left, /does not export detectAirAppRuntime/);

  const assumed = await adoptApp(dir, { dryRun: true, assumeSdk: true });
  assert.equal(assumed.pieces.readPage, "migrated");
  assert.equal(assumed.pieces.runtime, "migrated");
  assert.deepEqual(snapshot(dir), before);
  assert.throws(() => parseArgs(["--assume-sdk"]), /--assume-sdk is for --dry-run/);
  assert.equal(parseArgs(["--assume-sdk", "--dry-run"]).assumeSdk, true);
});

test("a bundle that cannot be imported counts as having no helpers", async () => {
  const dir = makeApp({ bundle: "export const = ;" });
  assert.equal(await loadVendoredSdk(dir), null);
});

test("the sentences it falls back on are the SDK's own", async () => {
  const sdk = await import(pathToFileURL(path.join(repoRoot, "templates/busa-crm/content/busa-crm-app/app/vendor/busabase-airapp.js")).href);
  const messages = await import("./adopt-sdk-airapp-helpers.mjs");
  assert.ok(sdk.AIRAPP_WRITE_MESSAGES.en.queued.startsWith("Sent for review."));
  assert.equal(messages.FALLBACK_SENTENCES.en.queued, sdk.AIRAPP_WRITE_MESSAGES.en.queued);
  assert.equal(messages.FALLBACK_SENTENCES["zh-CN"].queued, sdk.AIRAPP_WRITE_MESSAGES["zh-CN"].queued);
  assert.equal(messages.FALLBACK_SENTENCES["zh-TW"].queued, sdk.AIRAPP_WRITE_MESSAGES["zh-TW"].queued);
  assert.equal(messages.FALLBACK_SENTENCES.ja.queued, sdk.AIRAPP_WRITE_MESSAGES.ja.queued);
});
