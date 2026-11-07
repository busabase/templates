// A small stand-in for the Busabase REST API, enough for the routes the site
// and busa-product-hub/scripts/import-products.mjs call: GET /api/v1/nodes, GET /api/v1/bases/{id},
// GET /api/v1/records (cursor paging), POST /api/v1/bases/{baseId}/change-requests,
// POST /api/v1/records/{recordId}/change-requests, GET
// /api/v1/file-trees/{nodeId}/files/{path}, POST /api/v1/assets/upload-urls and
// /confirmations with a presigned PUT, GET /api/v1/records/get (one record by an
// exact field value), GET /api/v1/vault/runtime (`state.vault`, the runtime
// values the key would receive), plus a private asset path. It records every
// request so tests can assert what was asked for and which requests carried the key.
import { readFile } from "node:fs/promises";
import http from "node:http";

export const TEST_KEY = "test-key";

/** Parse oRPC's bracket query notation (`types[0]=base`, `sort[fieldSlug]=ref`) into plain values. */
export const parseQuery = (searchParams) => {
  const out = {};
  for (const [rawKey, value] of searchParams) {
    const parts = rawKey.split(/\[|\]/).filter(Boolean);
    let target = out;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (target[part] === undefined) target[part] = value;
        else if (Array.isArray(target[part])) target[part].push(value);
        else target[part] = [target[part], value];
      } else {
        target[part] ??= {};
        target = target[part];
      }
    });
  }
  return out;
};

const asList = (value) => {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
};

/**
 * @param {object} state
 * @param {Array} state.nodes node summaries ({ id, type, slug, parentId, baseId, metadata })
 * @param {Record<string, Array>} state.records baseId → [{ id, fields }]
 * @param {Record<string, Record<string, object>>} [state.files] nodeId → path → readFile response
 * @param {Record<string, {type: string, path?: string, body?: string}>} [state.assets] /assets/<name> → bytes (key required)
 */
export const startFakeBusabase = async (state) => {
  const log = [];
  const idempotency = new Map();
  const uploads = new Map(); // storageKey → { bytes, type }
  const byHash = new Map(); // contentHash → confirmed asset
  const revisions = new Map(); // recordId → head revision
  const head = (id) => `cmt_${id}_${revisions.get(id) ?? 0}`;
  let nextId = 1;
  // `viewerSession`: also accept a request with no Authorization at all, the
  // way Busabase accepts the browser engine's calls on the viewer's session
  // cookie (the browser sends it; nothing here can). A wrong key is still 401.
  const options = { failCreates: false, queueCreates: false, failReads: false, viewerSession: false, ...state.options };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const auth = req.headers.authorization ?? "";
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const body = raw.toString("utf8");
    const entry = { method: req.method, path: url.pathname, query: parseQuery(url.searchParams), auth, space: req.headers["x-busabase-space"] ?? "", body };
    log.push(entry);
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
    };
    const upload = /^\/upload\/(.+)$/.exec(url.pathname);
    if (req.method === "PUT" && upload) {
      // A presigned upload URL: no Busabase key, like a real storage host.
      uploads.set(decodeURIComponent(upload[1]), { bytes: raw, type: req.headers["content-type"] ?? "" });
      res.writeHead(200);
      return res.end();
    }
    if (auth !== `Bearer ${TEST_KEY}` && !(options.viewerSession && auth === "")) {
      return send(401, { code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    const rawAsset = /^\/api\/assets\/([^/]+)\/raw$/.exec(url.pathname);
    if (rawAsset) {
      // Like Busabase: a private asset answers with a redirect to the storage host.
      res.writeHead(302, { location: `/assets/${rawAsset[1]}` });
      return res.end();
    }
    if (url.pathname.startsWith("/assets/")) {
      const asset = state.assets?.[decodeURIComponent(url.pathname.slice("/assets/".length))];
      if (!asset) return send(404, { code: "NOT_FOUND" });
      const bytes = asset.bytes ?? (asset.path ? await readFile(asset.path) : Buffer.from(asset.body ?? ""));
      res.writeHead(200, { "content-type": asset.type, "content-length": String(bytes.length) });
      return res.end(bytes);
    }
    if (options.failReads && req.method === "GET") return send(500, { code: "INTERNAL", message: "boom" });

    if (req.method === "GET" && url.pathname === "/api/v1/nodes") {
      const types = asList(entry.query.types);
      return send(200, state.nodes.filter((node) => !types.length || types.includes(node.type)).map((node) => ({ children: [], description: "", name: node.slug, metadata: {}, ...node })));
    }
    if (req.method === "GET" && url.pathname === "/api/v1/records") {
      const ref = entry.query.baseId;
      const node = state.nodes.find((candidate) => candidate.type === "base" && (candidate.baseId === ref || candidate.slug === ref));
      if (!node) return send(404, { code: "NOT_FOUND", message: "Base not found" });
      // Like Busabase: newest first by default, and a `sort` is applied only
      // when it says the field is a number or a date (`fieldType`). Busabase
      // before 2026-11-05 ignored a sort without one and answered in the
      // default order, so the site must always send it.
      let rows = [...(state.records[node.baseId] ?? [])].reverse();
      const sort = entry.query.sort;
      if (sort?.fieldSlug && (sort.fieldType === "number" || sort.fieldType === "date")) {
        const sign = sort.direction === "desc" ? -1 : 1;
        rows.sort((a, b) => sign * (Number(a.fields[sort.fieldSlug] ?? Infinity) - Number(b.fields[sort.fieldSlug] ?? Infinity)));
      }
      const limit = Number(entry.query.limit ?? 50);
      const offset = Number(entry.query.cursor ?? 0);
      const page = rows.slice(offset, offset + limit).map((row) => ({
        id: row.id,
        baseId: node.baseId,
        headCommitId: head(row.id),
        status: "active",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        headCommit: { id: head(row.id), payload: row.fields },
      }));
      return send(200, { records: page, nextCursor: rows.length > offset + limit ? String(offset + limit) : null });
    }
    if (req.method === "GET" && url.pathname === "/api/v1/vault/runtime") {
      // Like Busabase: the endpoint wants an API key; a session (no key) is refused.
      if (auth === "") return send(401, { code: "UNAUTHORIZED", message: "API key required" });
      return send(200, state.vault ?? {});
    }
    if (req.method === "GET" && url.pathname === "/api/v1/records/get") {
      const { baseId, fieldSlug, valueText } = entry.query;
      const row = (state.records[baseId] ?? []).find((candidate) => String(candidate.fields?.[fieldSlug] ?? "") === valueText);
      if (!row) return send(404, { code: "NOT_FOUND", message: "Record not found" });
      return send(200, {
        id: row.id,
        baseId,
        headCommitId: head(row.id),
        status: "active",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
        headCommit: { id: head(row.id), payload: row.fields },
      });
    }
    const baseGet = /^\/api\/v1\/bases\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && baseGet) {
      const baseId = decodeURIComponent(baseGet[1]);
      const base = state.bases?.[baseId];
      return base ? send(200, { id: baseId, ...base }) : send(404, { code: "NOT_FOUND" });
    }
    const recordChange = /^\/api\/v1\/records\/([^/]+)\/change-requests$/.exec(url.pathname);
    if (req.method === "POST" && recordChange) {
      const recordId = decodeURIComponent(recordChange[1]);
      const input = JSON.parse(body || "{}");
      const row = Object.values(state.records).flat().find((candidate) => candidate.id === recordId);
      if (!row) return send(404, { code: "NOT_FOUND" });
      if (options.conflictOnce?.has(recordId)) {
        // Someone else wrote first: the record moves on, this write is refused.
        options.conflictOnce.delete(recordId);
        Object.assign(row.fields, options.conflictFields ?? {});
        revisions.set(recordId, (revisions.get(recordId) ?? 0) + 1);
      }
      if (input.baseCommitId && input.baseCommitId !== head(recordId)) return send(409, { code: "CONFLICT", message: "stale baseCommitId" });
      if (options.queueUpdates) return send(200, { id: `cr_${recordId}`, status: "in_review", materialized: false });
      Object.assign(row.fields, input.fields);
      revisions.set(recordId, (revisions.get(recordId) ?? 0) + 1);
      return send(200, { id: recordId, materialized: true, headCommitId: head(recordId), headCommit: { payload: row.fields } });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/assets/upload-urls") {
      const input = JSON.parse(body || "{}");
      const known = input.contentHash ? byHash.get(input.contentHash) : undefined;
      if (known) return send(200, { ...known, uploadUrl: "", expiresIn: 900, duplicate: true });
      const storageKey = `k${nextId++}-${input.fileName}`;
      return send(200, { uploadUrl: `${origin}/upload/${encodeURIComponent(storageKey)}`, storageKey, publicUrl: `${origin}/assets/${storageKey}`, expiresIn: 900 });
    }
    if (req.method === "POST" && url.pathname === "/api/v1/assets/confirmations") {
      const input = JSON.parse(body || "{}");
      const uploaded = uploads.get(input.storageKey);
      if (!uploaded) return send(400, { code: "BAD_REQUEST", message: "nothing uploaded" });
      state.assets ??= {};
      state.assets[input.storageKey] = { type: input.mimeType, bytes: uploaded.bytes };
      const confirmed = { success: true, attachmentId: `att_${input.storageKey}`, assetId: `ast_${input.storageKey}`, storageKey: input.storageKey, publicUrl: `${origin}/assets/${input.storageKey}` };
      if (input.contentHash) byHash.set(input.contentHash, confirmed);
      return send(200, confirmed);
    }
    const create = /^\/api\/v1\/bases\/([^/]+)\/change-requests$/.exec(url.pathname);
    if (req.method === "POST" && create) {
      const baseId = decodeURIComponent(create[1]);
      const input = JSON.parse(body || "{}");
      const key = input.idempotencyKey ? `${baseId}|${input.submittedBy}|${input.idempotencyKey}` : "";
      if (key && idempotency.has(key)) return send(200, idempotency.get(key));
      if (options.failCreates === true) return send(503, { code: "SERVICE_UNAVAILABLE", message: "down" });
      const id = `rec_${nextId++}`;
      let response;
      if (options.failCreates === "certificates" && baseId === "bas_certificates") return send(503, { code: "SERVICE_UNAVAILABLE", message: "down" });
      if (options.queueCreates) {
        response = { id: `cr_${id}`, status: "in_review", materialized: false };
      } else {
        (state.records[baseId] ??= []).push({ id, fields: input.fields });
        response = { id, baseId, materialized: true, headCommitId: `cmt_${id}`, headCommit: { payload: input.fields } };
      }
      if (key) idempotency.set(key, response);
      return send(200, response);
    }
    const file = /^\/api\/v1\/file-trees\/([^/]+)\/files\/(.+)$/.exec(url.pathname);
    if (req.method === "GET" && file) {
      const found = state.files?.[decodeURIComponent(file[1])]?.[decodeURIComponent(file[2])];
      return found ? send(200, found) : send(404, { code: "NOT_FOUND" });
    }
    return send(404, { code: "NOT_FOUND", message: `no route ${req.method} ${url.pathname}` });
  });

  let origin = "";
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    log,
    options,
    state,
    /** Forget every idempotency key, as a fresh workspace would. */
    reset: () => {
      idempotency.clear();
      uploads.clear();
      byHash.clear();
      revisions.clear();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
